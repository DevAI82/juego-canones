// The Duelo Matemático's questions (the user's, 2026-11-26: the musical
// duel as it is -- its armies, rounds, streaks, volleys and cheers -- but
// instead of keys to a song, sums to work out: times tables from 1 to 10
// and easy sums and subtractions of numbers of two figures at most, each
// with four answers to choose from. For his eight-year-old son: a question
// comes down the track slowly, and they start easy and get harder as the
// streak goes on).
//
// Here, without a screen or a duel: which question, how hard, how long it
// takes to come down, and how long a round lasts. The rules are
// duelRhythm.js's (a duel whose `musical` part has a `quiz`).
import { fightChart } from "./duelSongs.js";

// The four answers' keys, left to right.
export const QUIZ_LANES = ["1", "2", "3", "4"];

// How hard a question is, by its player's streak: the level goes up at
// these streaks, and a mistake (streak 0) brings it back to the first.
// (First figures: nobody has played yet.)
const LEVEL_AT = [0, 2, 5, 9, 14, 20, 28];
export const QUIZ_LEVELS = LEVEL_AT.length;
export function quizLevel(streak) {
  let level = 0;
  for (let i = 1; i < LEVEL_AT.length; i++) if (streak >= LEVEL_AT[i]) level = i;
  return level;
}

// s a question of each level takes to come down the track: what its
// player has to answer it. Slow, and slowest at the start ("much more
// slowly, so that he has time to work out the result"); from the fifth
// level on the questions are as hard as they get, and only come faster.
const TIME = [14, 13, 12, 11, 10, 8, 6];
export const quizTime = (level) => TIME[Math.max(0, Math.min(TIME.length - 1, level))];

// s between a question answered (or let go by) and the next one coming:
// the right answer shows meanwhile.
export const QUIZ_BREAK = 1.4;
// s into a round before its first question.
export const QUIZ_FIRST = 3;
// s a round lasts at most (or its song's end, if that comes first).
export const QUIZ_ROUND_TIME = 90;
const ROUND_LEAST = 60; // s of song a round wants ahead of where it starts

// A small generator of numbers from a seed (mulberry32), so a question is
// the same wherever it is worked out: the server and both browsers.
function dice(seed) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const mix = (...numbers) => numbers.reduce((h, n) => Math.imul(h ^ (n | 0), 0x9e3779b1) + 0x7f4a7c15, 0x2545f491);

const whole = (roll, from, to) => from + Math.floor(roll() * (to - from + 1));
const pick = (roll, list) => list[Math.floor(roll() * list.length)];

// The tables asked at each level -- the easy ones first (1, 2, 5, 10) --
// and what they are multiplied by.
const TABLES = [
  { of: [1, 2, 5, 10], by: [1, 10] },
  { of: [2, 3, 4, 5, 10], by: [1, 10] },
  { of: [2, 3, 4, 5, 6], by: [2, 10] },
  { of: [3, 4, 5, 6, 7, 8, 9], by: [2, 10] },
  { of: [6, 7, 8, 9], by: [3, 9] },
];

function times(roll, level) {
  const table = TABLES[Math.min(level, TABLES.length - 1)];
  const a = pick(roll, table.of);
  const b = whole(roll, table.by[0], table.by[1]);
  // (From the third level on, either way round: 7 x 3 as well as 3 x 7.)
  const [x, y] = level >= 2 && roll() < 0.5 ? [b, a] : [a, b];
  return { text: `${x} × ${y}`, answer: x * y, near: [x * (y + 1), x * (y - 1), (x + 1) * y, (x - 1) * y, x * y + 1, x * y - 1, x * y + 2, x * y + 10, x * y - 10] };
}

// Two numbers, by their tens and units: `carry` says whether the units are
// to go over ten (a sum) or the first's to be fewer than the second's (a
// subtraction).
function plus(roll, level) {
  let a;
  let b;
  if (level === 0) {
    // Two figures and one, nothing carried: 23 + 4.
    const units = whole(roll, 0, 7);
    a = whole(roll, 1, 5) * 10 + units;
    b = whole(roll, 1, 9 - units);
  } else if (level === 1) {
    // Two figures and two, nothing carried: 23 + 14.
    const ua = whole(roll, 0, 8);
    const ub = whole(roll, 0, 9 - ua);
    a = whole(roll, 1, 4) * 10 + ua;
    b = whole(roll, 1, 3) * 10 + ub;
  } else if (level === 2) {
    // Two figures and one, carried: 27 + 6.
    const ua = whole(roll, 2, 9);
    a = whole(roll, 1, 7) * 10 + ua;
    b = whole(roll, 10 - ua, 9);
  } else {
    // Two figures and two, carried, up to 99: 27 + 45.
    const ua = whole(roll, 2, 9);
    const ub = whole(roll, 10 - ua, 9);
    const ta = whole(roll, 1, level === 3 ? 4 : 7);
    const tb = whole(roll, 1, Math.max(1, 8 - ta));
    a = ta * 10 + ua;
    b = tb * 10 + ub;
  }
  const answer = a + b;
  return { text: `${a} + ${b}`, answer, near: [answer + 1, answer - 1, answer + 10, answer - 10, answer + 2, answer - 2, answer + 11, answer - 9] };
}

function minus(roll, level) {
  let a;
  let b;
  if (level === 0) {
    // Two figures less one, nothing borrowed: 27 - 4.
    const units = whole(roll, 2, 9);
    a = whole(roll, 1, 5) * 10 + units;
    b = whole(roll, 1, units);
  } else if (level === 1) {
    // Two figures less two, nothing borrowed: 47 - 12.
    const ua = whole(roll, 1, 9);
    const ta = whole(roll, 2, 6);
    a = ta * 10 + ua;
    b = whole(roll, 1, ta - 1) * 10 + whole(roll, 0, ua);
  } else if (level === 2) {
    // Two figures less one, borrowed: 32 - 5.
    const ua = whole(roll, 0, 7);
    a = whole(roll, 2, 8) * 10 + ua;
    b = whole(roll, ua + 1, 9);
  } else {
    // Two figures less two, borrowed: 52 - 27.
    const ua = whole(roll, 0, 7);
    const ta = whole(roll, 3, level === 3 ? 6 : 9);
    a = ta * 10 + ua;
    b = whole(roll, 1, ta - 2) * 10 + whole(roll, ua + 1, 9);
  }
  const answer = a - b;
  return { text: `${a} − ${b}`, answer, near: [answer + 1, answer - 1, answer + 10, answer - 10, answer + 2, answer - 2, answer + 9, answer + 11] };
}

function make(seed, round, n, level, again) {
  const roll = dice(mix(seed, round, n, level, again));
  // Half of them tables, the rest sums and subtractions in equal parts.
  const kind = roll();
  const sum = kind < 0.5 ? times(roll, level) : kind < 0.75 ? plus(roll, level) : minus(roll, level);
  // Three wrong answers near the right one -- the mistakes somebody would
  // make -- taken as they come from a shuffle of them.
  const wrong = [...new Set(sum.near.filter((value) => value >= 0 && value !== sum.answer))];
  for (let i = wrong.length - 1; i > 0; i--) {
    const j = Math.floor(roll() * (i + 1));
    [wrong[i], wrong[j]] = [wrong[j], wrong[i]];
  }
  for (let extra = sum.answer + 3; wrong.length < QUIZ_LANES.length - 1; extra++) {
    if (!wrong.includes(extra)) wrong.push(extra);
  }
  const options = [sum.answer, ...wrong.slice(0, QUIZ_LANES.length - 1)].sort((a, b) => a - b);
  return { text: sum.text, answer: sum.answer, options, lane: QUIZ_LANES[options.indexOf(sum.answer)] };
}

// The question that is the `n`th (from 0) of a round of a duel, at a
// level: { text ("7 × 8"), answer, options (four numbers, in order),
// lane (the right one's key) }. The same for both players when they are
// at the same level, and never the one just before it.
const MADE = new Map();
export function quizQuestion(seed, round, n, level) {
  const key = `${seed}:${round}:${n}:${level}`;
  if (!MADE.has(key)) {
    if (MADE.size > 4000) MADE.clear();
    let question = make(seed, round, n, level, 0);
    if (n > 0) {
      const before = quizQuestion(seed, round, n - 1, level).text;
      for (let again = 1; question.text === before && again < 20; again++) question = make(seed, round, n, level, again);
    }
    MADE.set(key, question);
  }
  return MADE.get(key);
}

// When a round is played, by its song's time (the song plays under it):
// { start, end } -- from one of the song's own starts, a different one
// each round among those with enough song ahead, for QUIZ_ROUND_TIME at
// most.
export function quizSpan(songId, round) {
  const chart = fightChart(songId);
  const roomy = chart.starts.filter((start) => chart.length - start >= ROUND_LEAST);
  const from = roomy.length ? roomy : [chart.starts[0]];
  const start = from[(Math.max(1, round) - 1) % from.length];
  return { start, end: Math.min(chart.length, start + QUIZ_ROUND_TIME) };
}
