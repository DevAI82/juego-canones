// The musical duel (docs/2026-11-25-duelo-musical-prueba.md): a duel whose
// fight is played on the keyboard. Both sides shop and place their armies
// as in any duel (duel.js); then the league's song plays (duelSongs.js) and
// its keys -- arrows and numbers -- come down the screen for both players
// at once. A key pressed as it crosses the line is a hit. A mistake -- a
// key let go by, the wrong key, a key with nothing to press -- brings a
// volley of the rival's army: one shot of each unit it has left. The round
// is over when an army is destroyed, or the music ends.
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
const HIT = 1;
const MISSED = 2;

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
    // still to come, 1 hit, 2 missed. `from`: the first one still to come.
    marks: both(() => []),
    from: both(() => 0),
    owed: both(() => false), // a mistake made since the last tick
    reload: both(() => 0), // s until this side's army can fire again
    tally: both(() => ({ hits: 0, misses: 0, streak: 0 })),
    events: [], // for the screen: { side, kind: "hit" | "miss" | "wrong", lane, age }
  };
  return state;
}

// s into its fight's music a musical duel is, to the frame.
export function songClock(state) {
  return state.musical.time + state.acc;
}

const fighting = (state) => Boolean(state.musical) && state.phase === "combat" && state.musical.round === state.round;

function begin(state) {
  const m = state.musical;
  const keys = fightChart(m.song).notes.length;
  m.round = state.round;
  m.time = 0;
  m.marks = both(() => new Array(keys).fill(WAITING));
  m.from = both(() => 0);
  m.owed = both(() => false);
  m.reload = both(() => 0);
  m.tally = both(() => ({ hits: 0, misses: 0, streak: 0 }));
  m.events = [];
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
      marks[i] = HIT;
      hit(m, side, lane);
      return { ok: true, hit: true, off: now - notes[i].t };
    }
    if (wrong < 0) wrong = i;
  }
  if (wrong >= 0) marks[wrong] = MISSED;
  mistake(m, side, lane, "wrong");
  return { ok: true, hit: false };
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
  // reach the line; a player's are missed once out of reach.
  for (const side of SIDES) {
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
