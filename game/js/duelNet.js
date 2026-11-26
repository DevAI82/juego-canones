// A musical duel between two devices (the user's, 2026-11-26: one on the
// PC, the other on a phone), as one player's browser keeps up with it. The
// home server holds the duel (host.js) and tells each browser of it several
// times a second; a fight to music can't be drawn from that alone:
//
//   - the keys come down by the browser's own song clock, which runs with
//     the music heard there and sets itself by the server's when the two
//     have come apart (`keep`);
//   - a key says when it was pressed by that clock, and the server judges
//     it by that moment (duelRhythm.js's `slack`) -- and the browser shows
//     at once what the server will make of it (`press`, `release`), rather
//     than a moment later with the server's next news;
//   - what the server says is shown as it comes, a little older each frame
//     (`view`);
//   - and whoever plays the right-hand side sees the duel the other way
//     round (`mirrored`): the musical duel's screen is made for a player
//     whose army is on the left, and an arena is the same from both ends.
//
// No page here: duelScreen.js runs it.
import { ARENA } from "./duelArenas.js";
import { fightChart } from "./duelSongs.js";
import { MARK, RELEASE_SLACK, keyAt, songClock } from "./duelRhythm.js";

// s the browser's song may be from the server's before it jumps to it.
// (host.js's KEY_SLACK allows for this and the wifi.)
export const RESYNC = 0.2;

// s into its song the server's fight is by now, `since` s after its news
// `view` came. (Nothing moves in a pause, nor before the fight is set up.)
export function serverClock(view, since = 0) {
  const going = view.phase === "combat" && !view.paused && view.musical.round === view.round;
  return songClock(view) + (going ? Math.max(0, since) : 0);
}

// Things told again and again (a shot is in the server's news for as long
// as it shows; each piece of news is made anew) that are to be heard or
// drawn once: `fresh(key, born)` is true the first time something with that
// key, born at about that moment (s, by the caller's clock), is asked about.
export function createOnce(apart = 0.25) {
  const seen = new Map();
  return {
    fresh(key, born) {
      const last = seen.get(key);
      if (last !== undefined && Math.abs(born - last) < apart) return false;
      seen.set(key, born);
      return true;
    },
    reset: () => seen.clear(),
  };
}

// A duel's view with its two sides changed over, left for right: each
// side's things under the other's name, and everything that stands in the
// arena across its middle, facing the other way. (A copy: the view it is
// made from stays as it was. Who is who on the server doesn't change: this
// is for drawing.)
const OTHER = { left: "right", right: "left" };
const across = (o) => (o && typeof o === "object" ? { ...o, left: o.right, right: o.left } : o);
const renamed = (o) => Object.fromEntries(Object.entries(o).map(([side, value]) => [OTHER[side] || side, value]));
const over = (p) => ({ ...p, x: ARENA.width - p.x });
const turned = (u) => {
  const there = over(u);
  if (typeof u.side === "string") there.side = OTHER[u.side] || u.side;
  for (const field of ["angle", "aim"]) if (typeof u[field] === "number") there[field] = Math.PI - u[field];
  return there;
};
const sideOver = (mine) => ({
  ...mine,
  army: mine.army.map(turned),
  shown: mine.shown ? { ...mine.shown, army: mine.shown.army.map(turned) } : mine.shown,
});
export function mirrored(view) {
  const m = view.musical;
  const last = view.lastRound;
  return {
    ...view,
    wins: across(view.wins),
    winner: OTHER[view.winner] || view.winner,
    sides: { left: sideOver(view.sides.right), right: sideOver(view.sides.left) },
    units: view.units.map(turned),
    shots: view.shots.map((shot) => ({ ...shot, side: OTHER[shot.side] || shot.side, from: over(shot.from), to: over(shot.to) })),
    lastRound: last ? { ...last, winner: OTHER[last.winner] || last.winner, income: across(last.income) } : last,
    musical: m
      ? {
          ...m,
          bots: renamed(m.bots),
          marks: across(m.marks),
          from: across(m.from),
          held: across(m.held),
          owed: across(m.owed),
          reload: across(m.reload),
          tally: across(m.tally),
          events: m.events.map((event) => ({ ...event, side: OTHER[event.side] || event.side })),
        }
      : m,
  };
}

export function createNetFight() {
  let fight = null; // which fight the rest is of: its song and round
  let clock = null; // s into the song, here
  let guesses = new Map(); // key's index -> what this player's own press made of it (a MARK)

  function reset() {
    fight = null;
    clock = null;
    guesses = new Map();
  }

  // Every frame, with the server's latest news (`since` s old) and how far
  // the music heard here has moved since the last frame (`step`; the
  // frame's own time with no music). { clock, jumped }: jumped, the clock
  // was set by the server's -- the music is to start again from there.
  // null when there is no fight on.
  function keep(view, since, step) {
    if (!view.musical || view.phase !== "combat") {
      reset();
      return null;
    }
    const server = serverClock(view, since);
    const key = `${view.musical.song}:${view.round}`;
    if (fight !== key || clock === null) {
      fight = key;
      guesses = new Map();
      clock = server;
      return { clock, jumped: true };
    }
    if (view.paused) return { clock, jumped: false };
    clock += Math.max(0, step);
    if (Math.abs(server - clock) > RESYNC) {
      clock = server;
      return { clock, jumped: true };
    }
    return { clock, jumped: false };
  }

  // This player's keys as they are to be shown: the server's word where it
  // has one, the browser's own guess meanwhile.
  function marksOf(view, side) {
    const told = view.musical.marks[side] || [];
    if (guesses.size === 0) return told;
    return told.map((mark, i) => {
      const guess = guesses.get(i);
      if (guess === undefined) return mark;
      // (A long key the server has down, let go since: the guess is newer.)
      return mark === MARK.WAITING || (mark === MARK.HOLDING && guess !== MARK.HOLDING) ? guess : mark;
    });
  }

  // This player presses a key, now: `ahead` s after the clock was last
  // kept (a finger doesn't wait for a frame). { hit, at } -- hit: what the
  // server will make of it; at: the moment to tell the server. null with
  // no fight.
  function press(view, side, lane, ahead = 0) {
    if (clock === null || !view.musical || !view.musical.marks[side]) return null;
    const at = clock + Math.max(0, ahead);
    const notes = fightChart(view.musical.song).notes;
    const found = keyAt(notes, marksOf(view, side), view.musical.from[side] || 0, lane, at);
    if (found.index >= 0) {
      guesses.set(found.index, !found.hit ? MARK.MISSED : notes[found.index].hold > 0 ? MARK.HOLDING : MARK.HIT);
    }
    return { hit: found.hit, at };
  }

  // This player lets go of a key, now (`ahead`: as press's). { held, at }
  // -- held: as duelRhythm.js's releaseKey says (null: it was holding
  // nothing).
  function release(view, side, lane, ahead = 0) {
    if (clock === null || !view.musical || !view.musical.marks[side]) return null;
    const at = clock + Math.max(0, ahead);
    const notes = fightChart(view.musical.song).notes;
    const index = marksOf(view, side).findIndex((mark, i) => mark === MARK.HOLDING && notes[i].lane === lane);
    if (index < 0) return { held: null, at };
    const note = notes[index];
    const held = at >= note.t + note.hold - RELEASE_SLACK;
    guesses.set(index, held ? MARK.HIT : MARK.MISSED);
    return { held, at };
  }

  // The server's news as it is to be drawn `since` s after it came, for the
  // player of `side` (null: somebody only watching): the song where this
  // browser's clock has it, this player's keys with what they just did, and
  // what happened that much longer ago.
  function shown(view, side, since = 0) {
    const m = view.musical;
    if (!m || clock === null || view.phase !== "combat" || m.round !== view.round) return view;
    const mine = side && m.marks[side] ? marksOf(view, side) : null;
    const holding = mine ? mine.flatMap((mark, i) => (mark === MARK.HOLDING ? [i] : [])) : null;
    return {
      ...view,
      acc: 0,
      musical: {
        ...m,
        time: clock,
        marks: mine ? { ...m.marks, [side]: mine } : m.marks,
        held: mine ? { ...m.held, [side]: holding } : m.held,
        events: m.events.map((event) => ({ ...event, age: event.age + Math.max(0, since) })),
      },
    };
  }

  return { keep, press, release, view: shown, reset, clock: () => clock };
}
