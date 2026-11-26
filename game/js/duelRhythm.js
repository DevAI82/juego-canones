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
// The Duelo Matemático (duelQuiz.js) is the same duel with questions for
// keys: a duel whose `musical` part has a `quiz`. A song plays under it,
// but each side has its own questions at its own pace -- one comes down
// the track, four answers under it; the right one is a hit, a wrong one or
// none in time a mistake -- harder as its player's streak goes on.
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
import { QUIZ_LANES, QUIZ_BREAK, QUIZ_FIRST, quizLevel, quizTime, quizQuestion, quizSpan } from "./duelQuiz.js";

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
// A Duelo Matemático's volleys (the user's, 2026-11-27: "if you are on a
// streak it should fire, and if you fail you get shot at; set the damage
// so that a round lasts two or three minutes -- shorter for somebody who
// fails a lot -- and no shot kills the army at once"). Times a unit's shot:
//   - a mistake's, the rival's army's: an army stands some nine from one
//     like it, and three or four from one that is its match (rocket
//     trucks on tanks: the worst there is). What the units are counts, as
//     in any duel -- the user's, 2026-11-27: "choosing one vehicle or
//     another should be rewarded" --, so there is no one size of volley:
//     these are the sizes that leave room for the choice to matter;
//   - a right answer's, one's own army's, once its player has so many in
//     a row: much lighter, and no more often than the army reloads,
//     however fast its player answers -- so a grown-up's army fires
//     hardly more often than a child's; what a grown-up has over a child
//     is not failing.
// Set with simulated rounds (tools/duel/quiz_rounds.mjs, which prints
// them), twice: the first figures (1.6 and 0.9, a streak's bonus on a
// mistake's volley too) gave the user, who answers in 1.4 s and doesn't
// fail, a round of 45 s against the computer ("perhaps it is over too
// soon?"). With these, somebody like him takes the first league's computer
// in a minute and a half (it fails one answer in four, and buys a frail
// army one time in three); a child against the computer, 2 min 40 s; two
// children go to the round's three minutes with their armies near level.
export const QUIZ_VOLLEY = 1.4;
export const QUIZ_STREAK_FROM = 3;
export const QUIZ_STREAK_VOLLEY = 0.35;
export const QUIZ_STREAK_RELOAD = 8;
// Quickness (the user's, 2026-11-27: "not only getting it right before it
// comes down: reward getting it right and being quick"). A right answer
// with this share of its time still to go is a quick one -- a share, not
// seconds: a child's easy question has more time than a grown-up's hard
// one, so each is quick by their own measure -- and the volley it fires is
// so many times heavier.
export const QUIZ_FAST = 0.5;
export const QUIZ_FAST_POWER = 1.5;
// What a streak (STREAK_POWER) and a quick answer make of a volley
// together, at most: somebody quick who never fails has both all the time,
// and one on top of the other took the computer's army in 45 s (the
// user's own round, 2026-11-27: "perhaps it is over too soon?").
export const QUIZ_BONUS_MOST = 2;
// At a round's end, whoever had more of their time to spare on their right
// answers, on average, takes this much money for the next purchase: at
// least so many right answers to be in it.
export const QUIZ_SPEED_PRIZE = 15;
export const QUIZ_SPEED_LEAST = 3;
// s a round's result stays on screen: longer than a duel's, for there are
// the round's statistics to read.
export const QUIZ_ROUND_END = 9;
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
// (For the screen of a player on the home network, which guesses what the
// server will make of a key: duelNet.js.)
export const MARK = { WAITING, HIT, MISSED, HOLDING };

// A duel between two devices (the home server holds it, host.js): a key
// says when it was pressed -- s into the song, by its player's own music --
// and is judged by that moment, so the wifi costs nobody a hit. `slack` (of
// the duel: musical.slack) is how long a key may take to arrive: nothing is
// a mistake until that long after it. A key can't say it was pressed
// further ahead of the server's clock than this.
export const KEY_AHEAD = 0.1;

// So many hits in a row make an army's volleys so many times heavier, the
// longest streak first: playing well is how an army hits hard. (The user's,
// 2026-11-26: "at 10 in a row, or 25, the volley should take more life";
// the figures are mine.)
export const STREAK_POWER = [
  [25, 2],
  [10, 1.5],
];
export function streakPower(streak) {
  const reached = STREAK_POWER.find(([from]) => streak >= from);
  return reached ? reached[1] : 1;
}

const refuse = (reason) => ({ ok: false, reason });
const both = (value) => ({ left: value(), right: value() });

// A duel (duel.js's createDuelState, with its options) that is fought to
// music. `song`: which one (its arena's, unless told). `bots`: the sides
// the computer plays in the fight -- { right: 0.8 } hits four keys of five.
// `slack`: s a key may take to arrive (a duel between two devices; 0 when
// its players are at this very keyboard). `quiz`: a Duelo Matemático --
// questions (duelQuiz.js) instead of the song's keys.
export function createMusicalDuel({ song, bots = {}, slack = 0, quiz = false, ...options } = {}) {
  const state = createDuelState(options);
  const played = {};
  for (const side of SIDES) {
    if (typeof bots[side] === "number") played[side] = Math.max(0, Math.min(1, bots[side]));
  }
  state.musical = {
    song: songOf(song ?? state.arena).id,
    bots: played,
    slack: Math.max(0, Number(slack) || 0),
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
  if (quiz) {
    // seed: what its questions are made from. asks: for each side, the
    // questions it has been asked this round, the last one the one to
    // answer -- { n, level, open (s into the song it starts coming down),
    // t (s it reaches the line) }; marks[side] says what became of each.
    // shoots: a side's right answer on a streak, since the last tick: its
    // army fires. loaded: s until that army can fire so again.
    state.musical.quiz = { seed: state.rng };
    state.musical.asks = both(() => []);
    state.musical.shoots = both(() => 0); // (times a volley: 1, or more for a quick answer)
    state.musical.loaded = both(() => 0);
    // What each side has done: this round (stats) and in the whole duel
    // (totals) -- see freshStats.
    state.musical.stats = both(freshStats);
    state.musical.totals = both(freshStats);
  }
  return state;
}

// A side's count of what it has done with its questions: how many it was
// asked, got right, got wrong, or let go by (late); how many of the right
// ones were quick; the s it took over the right ones and the shares of
// their time it had left, added up; its longest streak; the highest level
// it was asked at.
function freshStats() {
  return { asked: 0, right: 0, wrong: 0, late: 0, fast: 0, time: 0, spare: 0, best: 0, level: 0 };
}

// The question a side was asked (one of musical.asks): duelQuiz.js's
// { text, answer, options, lane }.
export function questionOf(m, ask) {
  return quizQuestion(m.quiz.seed, m.round, ask.n, ask.level);
}

// s into its song a musical duel's fight is, to the frame. (A fight about
// to start is where its round starts.)
export function songClock(state) {
  const m = state.musical;
  if (state.phase === "combat" && m.round !== state.round) {
    return m.quiz ? quizSpan(m.song, state.round).start : roundStart(fightChart(m.song), state.round);
  }
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
  if (m.quiz) return beginQuiz(state);
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
  // (streak: how many in a row this one makes -- the screen cheers by it.)
  m.events.push({ side, kind: "hit", lane, age: 0, streak: m.tally[side].streak });
}

function mistake(m, side, lane, kind) {
  m.tally[side].misses += 1;
  m.tally[side].streak = 0;
  m.owed[side] = true;
  m.events.push({ side, kind, lane, age: 0 });
}

// ------------------------------------------------------------ the questions

function beginQuiz(state) {
  const m = state.musical;
  const span = quizSpan(m.song, state.round);
  m.round = state.round;
  m.time = span.start;
  m.marks = both(() => []);
  m.from = both(() => 0);
  m.held = both(() => []);
  m.owed = both(() => false);
  m.reload = both(() => 0);
  m.tally = both(() => ({ hits: 0, misses: 0, streak: 0 }));
  m.events = [];
  m.asks = both(() => []);
  m.shoots = both(() => 0);
  m.loaded = both(() => 0);
  m.stats = both(freshStats);
  for (const side of SIDES) ask(state, side, span.start + QUIZ_FIRST);
}

// This side's next question, to start coming down at `open`: as hard as
// its streak says. (None with the round about to end.) The computer makes
// up its mind as it is asked: whether it will get it right, and when.
function ask(state, side, open) {
  const m = state.musical;
  if (open >= quizSpan(m.song, m.round).end - 1) return;
  const level = quizLevel(m.tally[side].streak);
  const next = { n: m.asks[side].length, level, open, t: open + quizTime(level) };
  const accuracy = m.bots[side];
  if (accuracy !== undefined) {
    next.right = duelRandom(state) < accuracy;
    next.answer = open + (0.3 + 0.4 * duelRandom(state)) * quizTime(level);
  }
  m.asks[side].push(next);
  m.marks[side].push(WAITING);
}

// What became of the question this side had to answer, at `now`: "hit",
// or a mistake -- "wrong" (not the right answer) or "miss" (none in time)
// -- and its next one is on its way.
function settleAsk(state, side, kind, lane, now) {
  const m = state.musical;
  const index = m.from[side];
  const asked = m.asks[side][index];
  const whole = asked.t - asked.open;
  const took = Math.max(0, Math.min(whole, now - asked.open));
  const spare = 1 - took / whole;
  const fast = kind === "hit" && spare >= QUIZ_FAST - 1e-9;
  if (kind === "hit") {
    m.marks[side][index] = HIT;
    hit(m, side, lane);
    m.events.at(-1).fast = fast; // (for the screen's cheer)
    // On a streak, its army fires: harder for a quick answer.
    if (m.tally[side].streak >= QUIZ_STREAK_FROM) m.shoots[side] = fast ? QUIZ_FAST_POWER : 1;
  } else {
    m.marks[side][index] = MISSED;
    mistake(m, side, lane, kind);
  }
  for (const count of [m.stats[side], m.totals[side]]) {
    count.asked += 1;
    count.level = Math.max(count.level, asked.level);
    if (kind === "hit") {
      count.right += 1;
      count.time += took;
      count.spare += spare;
      if (fast) count.fast += 1;
      count.best = Math.max(count.best, m.tally[side].streak);
    } else if (kind === "wrong") {
      count.wrong += 1;
    } else {
      count.late += 1;
    }
  }
  m.from[side] = index + 1;
  ask(state, side, now + QUIZ_BREAK);
}

// This side answers its question with the key of one of the four answers.
function answerKey(state, side, lane, at) {
  const m = state.musical;
  if (!QUIZ_LANES.includes(lane)) return refuse("lane");
  if (m.bots[side] !== undefined) return refuse("bot");
  const now = momentOf(state, at);
  const index = m.from[side];
  const asked = m.asks[side][index];
  // (Between two questions, or before the first: nothing to answer, and
  // no harm done.)
  if (!asked || m.marks[side][index] !== WAITING || now < asked.open - 1e-9) return refuse("nothing");
  const question = questionOf(m, asked);
  if (now > asked.t + 1e-9) {
    settleAsk(state, side, "miss", question.lane, now);
    return { ok: true, hit: false };
  }
  const right = lane === question.lane;
  settleAsk(state, side, right ? "hit" : "wrong", lane, now);
  return { ok: true, hit: right };
}

// A tick's questions: the computer answers its own when it has made up
// its mind; a player's that has reached the line unanswered is a mistake
// (once no answer can still be on its way). Returns when the round ends.
function quizKeys(state) {
  const m = state.musical;
  for (const side of SIDES) {
    const index = m.from[side];
    const asked = m.asks[side][index];
    if (!asked || m.marks[side][index] !== WAITING) continue;
    const question = questionOf(m, asked);
    if (m.bots[side] !== undefined) {
      if (m.time < asked.answer) continue;
      const lane = asked.right ? question.lane : QUIZ_LANES.find((other) => other !== question.lane);
      settleAsk(state, side, asked.right ? "hit" : "wrong", lane, m.time);
    } else if (m.time > asked.t + m.slack + 1e-9) {
      settleAsk(state, side, "miss", question.lane, m.time);
    }
  }
  return quizSpan(m.song, m.round).end;
}

// A Duelo Matemático's round is over: the quickest of the two takes the
// prize -- whoever had more of their time to spare, on average, on their
// right answers -- and the result stays up for the statistics to be read.
// lastRound.speed: { side (null: nobody), prize, spare: each side's
// average share, 0 to 1 }.
function closeQuizRound(state) {
  const m = state.musical;
  const spare = {};
  for (const side of SIDES) {
    const done = m.stats[side];
    spare[side] = done.right >= QUIZ_SPEED_LEAST ? done.spare / done.right : 0;
  }
  const [a, b] = SIDES;
  const side = Math.abs(spare[a] - spare[b]) < 1e-9 ? null : spare[a] > spare[b] ? a : b;
  if (side) state.sides[side].money += QUIZ_SPEED_PRIZE;
  state.lastRound.speed = { side, prize: QUIZ_SPEED_PRIZE, spare };
  if (state.phase === "roundEnd") state.clock = QUIZ_ROUND_END;
}

// ------------------------------------------------------------ the action

// Which key of a song a press of `lane` at `now` is for, among those not
// played yet (`marks`, from the index `from` on): the first key of that
// lane within reach is the one pressed ({ index, hit: true }); failing
// that, the first key of any lane within reach is the one got wrong
// ({ index, hit: false }; index -1 with no key within reach at all).
export function keyAt(notes, marks, from, lane, now) {
  let wrong = -1;
  for (let i = from; i < notes.length && notes[i].t <= now + HIT_WINDOW; i++) {
    if (marks[i] !== WAITING || notes[i].t < now - HIT_WINDOW) continue;
    if (notes[i].lane === lane) return { index: i, hit: true };
    if (wrong < 0) wrong = i;
  }
  return { index: wrong, hit: false };
}

// The moment something a player did is judged by: the fight's own, unless
// the duel allows keys time to arrive and this one says when it was (`at`).
function momentOf(state, at) {
  const now = songClock(state);
  const { slack } = state.musical;
  if (!(slack > 0) || !Number.isFinite(at)) return now;
  return Math.max(now - slack, Math.min(at, now + KEY_AHEAD));
}

// This side presses a key (one of duelSongs.js's LANES). { ok: true, hit }
// -- hit: it was a key of the song, on time; otherwise it was a mistake --
// or { ok: false, reason } when there was nothing to play. `at`: when it
// was pressed, in a duel between two devices (see KEY_AHEAD).
export function pressKey(state, side, lane, at) {
  if (!fighting(state)) return refuse("phase");
  if (!SIDES.includes(side)) return refuse("side");
  if (state.musical.quiz) return answerKey(state, side, lane, at);
  if (!LANES.includes(lane)) return refuse("lane");
  const m = state.musical;
  if (m.bots[side] !== undefined) return refuse("bot");
  const notes = fightChart(m.song).notes;
  const marks = m.marks[side];
  const now = momentOf(state, at);
  const found = keyAt(notes, marks, m.from[side], lane, now);
  if (found.hit) {
    const note = notes[found.index];
    hit(m, side, lane);
    if (note.hold > 0) {
      // A long key: it is to stay down until its end (releaseKey).
      marks[found.index] = HOLDING;
      m.held[side].push(found.index);
    } else {
      marks[found.index] = HIT;
    }
    return { ok: true, hit: true, off: now - note.t, hold: note.hold };
  }
  if (found.index >= 0) marks[found.index] = MISSED;
  mistake(m, side, lane, "wrong");
  return { ok: true, hit: false };
}

// This side lets go of a key. { ok: true, held } -- held: true, a long key
// was kept to its end (or near enough); false, it was let go too soon, a
// mistake; null, the key was holding nothing. `at`: as pressKey's.
export function releaseKey(state, side, lane, at) {
  if (!fighting(state)) return refuse("phase");
  if (!SIDES.includes(side)) return refuse("side");
  if (state.musical.quiz) return { ok: true, held: null }; // (an answer isn't held)
  if (!LANES.includes(lane)) return refuse("lane");
  const m = state.musical;
  const notes = fightChart(m.song).notes;
  const held = m.held[side].findIndex((i) => notes[i].lane === lane);
  if (held < 0) return { ok: true, held: null };
  const [index] = m.held[side].splice(held, 1);
  const note = notes[index];
  if (momentOf(state, at) >= note.t + note.hold - RELEASE_SLACK) {
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
// tick's others. `power`: times a unit's shot; `streaked`: and as many
// times again as its player's streak says (STREAK_POWER) -- a Duelo
// Matemático counts its streak in `power` itself.
function volley(state, side, hits, power = VOLLEY_POWER, streaked = true) {
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
    // A gun that shoots faster puts more into a volley, and so does an
    // army whose player is on a streak.
    const amount = u.damage * (DUEL_UNITS[u.type].cooldown / u.cooldown) * power * (streaked ? streakPower(state.musical.tally[side].streak) : 1);
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
    // (fromId, toId: the screen shows the armies elsewhere than they stand.)
    state.shots.push({ from: { x: u.x, y: u.y }, to: { x: target.x, y: target.y }, type: u.type, side, age: 0, fromId: u.id, toId: target.id });
  }
}

// A tick's keys of the song: the ones whose moment has come. The computer
// plays its own as they reach the line (a long one as any other); a
// player's are missed once out of reach, and the long ones still down at
// their end are done. Returns when the fight's music ends.
function songKeys(state) {
  const m = state.musical;
  const chart = fightChart(m.song);
  const notes = chart.notes;
  for (const side of SIDES) {
    m.held[side] = m.held[side].filter((i) => {
      if (m.time < notes[i].t + notes[i].hold - 1e-9) return true;
      m.marks[side][i] = HIT;
      m.events.push({ side, kind: "held", lane: notes[i].lane, age: 0 });
      return false;
    });
    const marks = m.marks[side];
    const accuracy = m.bots[side];
    // (A player's key may still be on its way, between two devices.)
    const due = accuracy === undefined ? m.time - HIT_WINDOW - m.slack : m.time + 1e-9;
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
  return chart.length;
}

function tick(state) {
  const m = state.musical;
  if (m.round !== state.round) begin(state);

  for (const shot of state.shots) shot.age += STEP;
  state.shots = state.shots.filter((shot) => shot.age < SHOT_SHOWN);
  for (const event of m.events) event.age += STEP;
  m.events = m.events.filter((event) => event.age < EVENT_SHOWN);

  m.time += STEP;

  // 1. What each side had to play at this moment: a song's keys, or a
  // Duelo Matemático's questions.
  const end = m.quiz ? quizKeys(state) : songKeys(state);

  // 2. A side that made a mistake takes the other army's volley, if that
  // army is loaded; and in a Duelo Matemático an army whose player gave a
  // right answer on a streak fires too, if it has loaded again since its
  // last such volley. All volleys are worked out before any lands.
  const hits = [];
  for (const side of SIDES) {
    m.reload[side] = Math.max(0, m.reload[side] - STEP);
    if (m.quiz) m.loaded[side] = Math.max(0, m.loaded[side] - STEP);
  }
  for (const side of SIDES) {
    const rival = otherSide(side);
    const punishes = m.owed[rival] && m.reload[side] <= 1e-9;
    const rewards = Boolean(m.quiz) && m.shoots[side] > 0 && m.loaded[side] <= 1e-9;
    if ((punishes || rewards) && m.quiz) {
      // A mistake's volley is what it is. A right answer's is heavier for
      // the army's streak and for a quick answer -- so far, the two
      // together. (The streak isn't counted in a mistake's too: the
      // computer's own mistakes, at twice their size against somebody on
      // a long streak, were most of what ended a round early.)
      const bonus = Math.min(QUIZ_BONUS_MOST, streakPower(m.tally[side].streak) * m.shoots[side]);
      volley(state, side, hits, VOLLEY_POWER * (punishes ? QUIZ_VOLLEY : QUIZ_STREAK_VOLLEY * bonus), false);
      if (punishes) m.reload[side] = VOLLEY_RELOAD;
      if (rewards) m.loaded[side] = QUIZ_STREAK_RELOAD;
    } else if (punishes) {
      volley(state, side, hits);
      m.reload[side] = VOLLEY_RELOAD;
    }
    m.owed[rival] = false;
    if (m.quiz) m.shoots[side] = 0;
  }
  for (const landed of hits) landHit(state, landed);

  // 3. The end of the fight: an army destroyed, or the music over.
  state.clock = Math.max(0, end - m.time);
  settleFight(state, m.time >= end - 1e-9);
  if (m.quiz && state.phase !== "combat") closeQuizRound(state);
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
