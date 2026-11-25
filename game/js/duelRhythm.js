// The musical duel (docs/2026-11-25-duelo-musical-prueba.md): a duel whose
// fight is played on the keyboard. Both sides shop and place their armies
// as in any duel (duel.js); then the league's song plays (duelSongs.js) and
// its keys -- arrows and numbers -- come down the screen for both players
// at once. A key pressed as it crosses the line is a hit; a long one is
// kept down until its end. A mistake -- a key let go by, the wrong key, a
// key with nothing to press, a long one let go too soon -- brings a volley
// of the rival's army: one shot of each unit it has left. The round is
// over when an army is destroyed, or the music ends.
//
// Like duel.js this is the game without a screen: the duel's own state
// with a `musical` part, actions on it, and a step that moves it on. The
// armies stand where they were placed; everything else of a duel (the
// shop, the rounds, what a hit pays) is duel.js's.
import { ARENA } from "./duelArenas.js";
import {
  SIDES,
  otherSide,
  STEP,
  DUEL_UNITS,
  SPLASH_SHARE,
  createDuelState,
  stepDuel,
  duelRandom,
  landHit,
  damageOn,
  settleFight,
} from "./duel.js";
import { LANES, fightChart, songOf } from "./duelSongs.js";

// s before or after its moment that a key still counts. (A first figure,
// wide on purpose for the first league: to be set from how people play.)
export const HIT_WINDOW = 0.18;
// s before its end that a long key may be let go.
export const RELEASE_SLACK = 0.2;
// A round that starts part-way into its song (a recorded one: each round
// starts further in) asks for no key in its first seconds.
export const LEAD_IN = 2;
// s an army takes to load again after a volley: somebody hammering the
// keys, or pressing the right one just after the wrong one, pays once.
export const VOLLEY_RELOAD = 0.5;
// Times a unit's shot, in a volley. (A first figure: with 1, an army of
// the first round stands some ten volleys of one like it.)
export const VOLLEY_POWER = 1;
// How often the computer hits a key, by its league's grade (the first one
// first). First figures: nobody has played against them yet.
export const BOT_ACCURACY = [0.72, 0.8, 0.86, 0.91, 0.95, 0.98];

const SHOT_SHOWN = 0.4; // s a shot stays in state.shots for the screen (as duel.js's)
const EVENT_SHOWN = 0.8; // s a hit or a mistake stays in musical.events for the screen
const MAX_TICKS = 8; // a call (as duel.js's)

const WAITING = 0;
const HIT = 1; // (or, in a round that starts part-way, before its start)
const MISSED = 2;
const HOLDING = 3; // a long key, down

const refuse = (reason) => ({ ok: false, reason });
const both = (value) => ({ left: value(), right: value() });

// A duel (duel.js's createDuelState, with its options) that is fought to
// music. `song`: which one (its arena's, unless told). `bots`: the sides
// the computer plays in the fight -- { right: 0.8 } hits four keys of five.
export function createMusicalDuel({ song, bots = {}, ...options } = {}) {
  const state = createDuelState(options);
  const played = {};
  for (const side of SIDES) {
    if (typeof bots[side] === "number") played[side] = Math.max(0, Math.min(1, bots[side]));
  }
  state.musical = {
    song: songOf(song ?? state.arena).id,
    bots: played,
    round: 0, // the round whose fight the rest is of
    time: 0, // s of music played in it
    // For each side, each key of the fight (duelSongs.js's fightChart): 0
    // still to come, 1 hit, 2 missed, 3 a long one being held. `from`: the
    // first one still to come. `held`: the ones being held.
    marks: both(() => []),
    from: both(() => 0),
    held: both(() => []),
    owed: both(() => false), // a mistake made since the last tick
    reload: both(() => 0), // s until this side's army can fire again
    tally: both(() => ({ hits: 0, misses: 0, streak: 0 })),
    // For the screen: { side, kind, lane, age } -- kind: "hit", "held" (a
    // long key kept to its end), or a mistake: "miss" (let go by), "wrong"
    // (not the key asked for), "drop" (a long key let go too soon).
    events: [],
  };
  return state;
}

// s into its song a musical duel's fight is, to the frame. (A fight about
// to start is where its round starts.)
export function songClock(state) {
  const m = state.musical;
  if (state.phase === "combat" && m.round !== state.round) return roundStart(fightChart(m.song), state.round);
  return m.time + state.acc;
}

const fighting = (state) => Boolean(state.musical) && state.phase === "combat" && state.musical.round === state.round;

// Where in its song this round's fight starts: each round at the song's
// next start, round again when they run out.
export function roundStart(chart, round) {
  return chart.starts[(Math.max(1, round) - 1) % chart.starts.length];
}

function begin(state) {
  const m = state.musical;
  const chart = fightChart(m.song);
  const start = roundStart(chart, state.round);
  // From the top every key is asked for; part-way in, the ones from a
  // moment after the start on.
  const first = start > 0 ? chart.notes.findIndex((note) => note.t >= start + LEAD_IN) : 0;
  const asked = first < 0 ? chart.notes.length : first;
  m.round = state.round;
  m.time = start;
  m.marks = both(() => chart.notes.map((_, i) => (i < asked ? HIT : WAITING)));
  m.from = both(() => asked);
  m.held = both(() => []);
  m.owed = both(() => false);
  m.reload = both(() => 0);
  m.tally = both(() => ({ hits: 0, misses: 0, streak: 0 }));
  m.events = [];
}

// Sets up the fight of a round that has just started, if it isn't yet (the
// first tick does it too): the screen wants it before any time passes.
export function beginFight(state) {
  if (state.musical && state.phase === "combat" && state.musical.round !== state.round) begin(state);
}

function hit(m, side, lane) {
  m.tally[side].hits += 1;
  m.tally[side].streak += 1;
  m.events.push({ side, kind: "hit", lane, age: 0 });
}

function mistake(m, side, lane, kind) {
  m.tally[side].misses += 1;
  m.tally[side].streak = 0;
  m.owed[side] = true;
  m.events.push({ side, kind, lane, age: 0 });
}

// ------------------------------------------------------------ the action

// This side presses a key (one of duelSongs.js's LANES). { ok: true, hit }
// -- hit: it was a key of the song, on time; otherwise it was a mistake --
// or { ok: false, reason } when there was nothing to play.
export function pressKey(state, side, lane) {
  if (!fighting(state)) return refuse("phase");
  if (!SIDES.includes(side)) return refuse("side");
  if (!LANES.includes(lane)) return refuse("lane");
  const m = state.musical;
  if (m.bots[side] !== undefined) return refuse("bot");
  const notes = fightChart(m.song).notes;
  const marks = m.marks[side];
  const now = songClock(state);
  // The first key of this lane within reach is the one pressed; failing
  // that, the first key of any lane within reach is the one got wrong.
  let wrong = -1;
  for (let i = m.from[side]; i < notes.length && notes[i].t <= now + HIT_WINDOW; i++) {
    if (marks[i] !== WAITING || notes[i].t < now - HIT_WINDOW) continue;
    if (notes[i].lane === lane) {
      hit(m, side, lane);
      if (notes[i].hold > 0) {
        // A long key: it is to stay down until its end (releaseKey).
        marks[i] = HOLDING;
        m.held[side].push(i);
      } else {
        marks[i] = HIT;
      }
      return { ok: true, hit: true, off: now - notes[i].t, hold: notes[i].hold };
    }
    if (wrong < 0) wrong = i;
  }
  if (wrong >= 0) marks[wrong] = MISSED;
  mistake(m, side, lane, "wrong");
  return { ok: true, hit: false };
}

// This side lets go of a key. { ok: true, held } -- held: true, a long key
// was kept to its end (or near enough); false, it was let go too soon, a
// mistake; null, the key was holding nothing.
export function releaseKey(state, side, lane) {
  if (!fighting(state)) return refuse("phase");
  if (!SIDES.includes(side)) return refuse("side");
  if (!LANES.includes(lane)) return refuse("lane");
  const m = state.musical;
  const notes = fightChart(m.song).notes;
  const at = m.held[side].findIndex((i) => notes[i].lane === lane);
  if (at < 0) return { ok: true, held: null };
  const [index] = m.held[side].splice(at, 1);
  const note = notes[index];
  if (songClock(state) >= note.t + note.hold - RELEASE_SLACK) {
    m.marks[side][index] = HIT;
    m.events.push({ side, kind: "held", lane, age: 0 });
    return { ok: true, held: true };
  }
  m.marks[side][index] = MISSED;
  mistake(m, side, lane, "drop");
  return { ok: true, held: false };
}

// ------------------------------------------------------------ the fight

// The enemies a volley goes for, the ones in front first: nearest the
// middle of the arena. What is placed in front shields what is behind.
function inFront(a, b) {
  const mid = ARENA.width / 2;
  return Math.abs(a.x - mid) - Math.abs(b.x - mid) || a.y - b.y || a.id - b.id;
}

// This side's army fires: each unit it has left, one shot. Every shot goes
// to the first enemy in front that the shots before it won't have
// destroyed already. The hits are added to `hits`, to land with the
// tick's others.
function volley(state, side, hits) {
  const shooters = state.units.filter((u) => u.alive && u.side === side).sort((a, b) => a.slot - b.slot);
  const targets = state.units.filter((u) => u.alive && u.side !== side).sort(inFront);
  if (shooters.length === 0 || targets.length === 0) return;
  const left = new Map(targets.map((v) => [v, v.hp]));
  const take = (u, victim, amount) => {
    hits.push({ side, type: u.type, victim, amount });
    left.set(victim, left.get(victim) - damageOn(u.type, victim.type, amount));
  };
  for (const u of shooters) {
    const target = targets.find((v) => left.get(v) > 1e-9) || targets[0];
    // A gun that shoots faster puts more into a volley.
    const amount = u.damage * (DUEL_UNITS[u.type].cooldown / u.cooldown) * VOLLEY_POWER;
    take(u, target, amount);
    const splash = DUEL_UNITS[u.type].splash;
    if (splash) {
      for (const v of targets) {
        if (v !== target && Math.hypot(v.x - target.x, v.y - target.y) <= splash) take(u, v, amount * SPLASH_SHARE);
      }
    }
    u.targetId = target.id;
    u.aim = Math.atan2(target.y - u.y, target.x - u.x);
    u.angle = u.aim;
    state.shots.push({ from: { x: u.x, y: u.y }, to: { x: target.x, y: target.y }, type: u.type, side, age: 0 });
  }
}

function tick(state) {
  const m = state.musical;
  if (m.round !== state.round) begin(state);
  const chart = fightChart(m.song);
  const notes = chart.notes;

  for (const shot of state.shots) shot.age += STEP;
  state.shots = state.shots.filter((shot) => shot.age < SHOT_SHOWN);
  for (const event of m.events) event.age += STEP;
  m.events = m.events.filter((event) => event.age < EVENT_SHOWN);

  m.time += STEP;

  // 1. The keys whose moment has come: the computer plays its own as they
  // reach the line (a long one as any other); a player's are missed once
  // out of reach, and the long ones still down at their end are done.
  for (const side of SIDES) {
    m.held[side] = m.held[side].filter((i) => {
      if (m.time < notes[i].t + notes[i].hold - 1e-9) return true;
      m.marks[side][i] = HIT;
      m.events.push({ side, kind: "held", lane: notes[i].lane, age: 0 });
      return false;
    });
    const marks = m.marks[side];
    const accuracy = m.bots[side];
    const due = accuracy === undefined ? m.time - HIT_WINDOW : m.time + 1e-9;
    for (let i = m.from[side]; i < notes.length && notes[i].t < due; i++) {
      if (marks[i] !== WAITING) continue;
      if (accuracy !== undefined && duelRandom(state) < accuracy) {
        marks[i] = HIT;
        hit(m, side, notes[i].lane);
      } else {
        marks[i] = MISSED;
        mistake(m, side, notes[i].lane, "miss");
      }
    }
    while (m.from[side] < notes.length && marks[m.from[side]] !== WAITING) m.from[side] += 1;
  }

  // 2. A side that made a mistake takes the other army's volley, if that
  // army is loaded. Both volleys are worked out before either lands.
  const hits = [];
  for (const side of SIDES) {
    m.reload[side] = Math.max(0, m.reload[side] - STEP);
  }
  for (const side of SIDES) {
    const rival = otherSide(side);
    if (m.owed[side] && m.reload[rival] <= 1e-9) {
      volley(state, rival, hits);
      m.reload[rival] = VOLLEY_RELOAD;
    }
    m.owed[side] = false;
  }
  for (const landed of hits) landHit(state, landed);

  // 3. The end of the fight: an army destroyed, or the music over.
  state.clock = Math.max(0, chart.length - m.time);
  settleFight(state, m.time >= chart.length - 1e-9);
}

// Moves a duel `dt` seconds on: a musical duel's fight here, in duel.js's
// ticks; everything else -- its shopping, the pause between rounds, a duel
// that isn't musical -- as duel.js does.
export function stepMusicalDuel(state, dt) {
  if (!state.musical || state.phase !== "combat") return stepDuel(state, dt);
  state.acc += dt;
  let ticks = 0;
  while (state.acc >= STEP - 1e-9 && ticks < MAX_TICKS && state.phase === "combat") {
    state.acc -= STEP;
    tick(state);
    ticks++;
  }
  if (state.acc >= STEP - 1e-9) state.acc = 0;
  if (state.acc < 0) state.acc = 0;
}
