import { test } from "node:test";
import assert from "node:assert/strict";
import { STEP, buyUnit, setReady } from "./duel.js";
import { TRACKS } from "./duelTracks.js";
import { QUIZ_LANES, QUIZ_BREAK, QUIZ_FIRST, quizLevel, quizTime, quizQuestion, quizSpan } from "./duelQuiz.js";
import { MARK, QUIZ_VOLLEY, createMusicalDuel, stepMusicalDuel, pressKey, releaseKey, songClock, questionOf } from "./duelRhythm.js";

// (As the musical duel's tests: on the song written as notes.)
for (const id of Object.keys(TRACKS)) delete TRACKS[id];

// A Duelo Matemático with these armies, both sides ready: the fight is on.
function quiz({ left = ["tank"], right = ["tank"], bots = {}, slack = 0, seed = 7, math = true } = {}) {
  const s = createMusicalDuel({ arena: 1, seed, bots, slack, quiz: math, left: { money: 5000 }, right: { money: 5000 } });
  for (const type of left) assert.ok(buyUnit(s, "left", type).ok);
  for (const type of right) assert.ok(buyUnit(s, "right", type).ok);
  setReady(s, "left");
  setReady(s, "right");
  stepMusicalDuel(s, STEP);
  return s;
}
const runTo = (s, t) => {
  for (let i = 0; songClock(s) < t - STEP / 2; i++) {
    assert.ok(i < 1e5 && s.phase === "combat", `the fight never got to ${t} s`);
    stepMusicalDuel(s, STEP);
  }
};
const run = (s, seconds) => runTo(s, songClock(s) + seconds);
const health = (s, side) => s.units.filter((u) => u.side === side).reduce((sum, u) => sum + u.hp, 0);
const whole = (s, side) => s.units.filter((u) => u.side === side).reduce((sum, u) => sum + u.maxHp, 0);
// The question a side has to answer now, and its right and a wrong key.
const current = (s, side) => s.musical.asks[side][s.musical.from[side]];
const right = (s, side) => questionOf(s.musical, current(s, side)).lane;
const wrong = (s, side) => QUIZ_LANES.find((lane) => lane !== right(s, side));
const STURDY = ["tank", "tank", "tank", "tank", "tank", "tank"];

test("a Duelo Matemático is a musical duel with questions instead of keys: each side's first one comes a moment into the round", () => {
  const s = quiz();
  const m = s.musical;
  assert.equal(s.mode, "duel");
  assert.equal(typeof m.quiz.seed, "number");
  const span = quizSpan(m.song, 1);
  for (const side of ["left", "right"]) {
    assert.equal(m.asks[side].length, 1);
    const ask = m.asks[side][0];
    assert.deepEqual({ n: ask.n, level: ask.level }, { n: 0, level: 0 });
    assert.ok(Math.abs(ask.open - (span.start + QUIZ_FIRST)) < 1e-9);
    assert.ok(Math.abs(ask.t - (ask.open + quizTime(0))) < 1e-9);
    assert.deepEqual(m.marks[side], [MARK.WAITING]);
  }
  assert.deepEqual(questionOf(m, m.asks.left[0]), quizQuestion(m.quiz.seed, 1, 0, 0));
  // Nothing to answer yet: a press is neither a hit nor a mistake.
  assert.deepEqual(pressKey(s, "left", "1"), { ok: false, reason: "nothing" });
  assert.deepEqual(pressKey(s, "left", "up"), { ok: false, reason: "lane" }, "the keys are the four answers'");
  assert.deepEqual(releaseKey(s, "left", "1"), { ok: true, held: null });
  assert.equal(m.tally.left.misses, 0);
  // A musical duel has none of it.
  assert.equal(quiz({ math: false }).musical.quiz, undefined);
});

test("the right answer is a hit, and the next question comes after a moment", () => {
  const s = quiz();
  const m = s.musical;
  runTo(s, m.asks.left[0].open + 2);
  const now = songClock(s);
  const lane = right(s, "left");
  const pressed = pressKey(s, "left", lane);
  assert.equal(pressed.ok && pressed.hit, true);
  assert.deepEqual({ ...m.tally.left }, { hits: 1, misses: 0, streak: 1 });
  assert.equal(m.marks.left[0], MARK.HIT);
  assert.equal(m.events.at(-1).kind, "hit");
  assert.equal(m.asks.left.length, 2);
  const next = m.asks.left[1];
  assert.equal(next.n, 1);
  assert.ok(Math.abs(next.open - (now + QUIZ_BREAK)) < 1e-9);
  assert.ok(Math.abs(next.t - (next.open + quizTime(next.level))) < 1e-9);
  // In the pause between two questions there is nothing to answer.
  assert.deepEqual(pressKey(s, "left", "2"), { ok: false, reason: "nothing" });
  run(s, 0.5);
  assert.equal(health(s, "left"), whole(s, "left"));
  assert.equal(health(s, "right"), whole(s, "right"));
  // The rival's question is still its own, unanswered.
  assert.equal(m.asks.right.length, 1);
  assert.equal(m.marks.right[0], MARK.WAITING);
});

test("a wrong answer is a mistake: the rival's volley, heavier than one for a key of a song", () => {
  const s = quiz();
  const m = s.musical;
  runTo(s, m.asks.left[0].open + 1);
  const pressed = pressKey(s, "left", wrong(s, "left"));
  assert.equal(pressed.ok, true);
  assert.equal(pressed.hit, false);
  assert.deepEqual({ ...m.tally.left }, { hits: 0, misses: 1, streak: 0 });
  assert.equal(m.marks.left[0], MARK.MISSED);
  assert.equal(m.events.at(-1).kind, "wrong");
  assert.equal(m.asks.left.length, 2, "and on to the next");
  run(s, 3 * STEP);
  const lost = whole(s, "left") - health(s, "left");
  assert.ok(lost > 0);
  assert.equal(health(s, "right"), whole(s, "right"));
  // (A tank's shot at a tank, in a musical duel: the same armies, one key let go by.)
  const song = quiz({ math: false, bots: { right: 1 } });
  for (let i = 0; i < 1e5 && song.musical.tally.left.misses === 0; i++) stepMusicalDuel(song, STEP);
  for (let i = 0; i < 3; i++) stepMusicalDuel(song, STEP);
  const one = whole(song, "left") - health(song, "left");
  assert.ok(one > 0);
  assert.ok(Math.abs(lost - QUIZ_VOLLEY * one) < 1e-6, `${lost} is ${QUIZ_VOLLEY} times ${one}`);
});

test("a question that reaches the line unanswered is a mistake too", () => {
  const s = quiz();
  const m = s.musical;
  const ask = m.asks.left[0];
  runTo(s, ask.t - 2 * STEP);
  assert.equal(m.tally.left.misses, 0);
  runTo(s, ask.t + 3 * STEP);
  assert.deepEqual({ ...m.tally.left }, { hits: 0, misses: 1, streak: 0 });
  assert.equal(m.marks.left[0], MARK.MISSED);
  assert.ok(m.events.some((e) => e.side === "left" && e.kind === "miss"));
  assert.ok(health(s, "left") < whole(s, "left"));
  assert.equal(m.asks.left.length, 2);
  assert.ok(m.asks.left[1].open > ask.t + QUIZ_BREAK - 0.1);
});

test("the questions get harder as the streak goes on, and easy again after a mistake", () => {
  const s = quiz({ left: STURDY, right: STURDY, bots: { right: 1 } });
  const m = s.musical;
  for (let k = 0; k < 10; k++) {
    const ask = current(s, "left");
    assert.equal(ask.level, quizLevel(k), `after ${k} right answers`);
    runTo(s, ask.open + 0.5);
    assert.equal(pressKey(s, "left", right(s, "left")).hit, true);
  }
  assert.ok(current(s, "left").level >= 3);
  assert.ok(quizTime(current(s, "left").level) < quizTime(0), "and come down faster");
  runTo(s, current(s, "left").open + 0.5);
  pressKey(s, "left", wrong(s, "left"));
  assert.equal(current(s, "left").level, 0);
  // Each question is its place's and its level's.
  m.asks.left.forEach((ask) => assert.deepEqual(questionOf(m, ask), quizQuestion(m.quiz.seed, 1, ask.n, ask.level)));
});

test("each player has their own questions, at their own pace", () => {
  const s = quiz({ left: STURDY, right: STURDY });
  const m = s.musical;
  // The left answers at once, three times; the right is still thinking.
  for (let k = 0; k < 3; k++) {
    runTo(s, current(s, "left").open + 0.2);
    assert.equal(pressKey(s, "left", right(s, "left")).hit, true);
  }
  assert.equal(m.asks.left.length, 4);
  assert.equal(m.asks.right.length, 1);
  assert.equal(m.tally.right.misses, 0);
  // The first one was the same for both: the same place, the same level.
  assert.deepEqual(questionOf(m, m.asks.left[0]), questionOf(m, m.asks.right[0]));
});

test("the computer answers in its own time, right as often as its league says", () => {
  const always = quiz({ left: STURDY, right: STURDY, bots: { left: 1, right: 1 } });
  run(always, 40);
  for (const side of ["left", "right"]) {
    const tally = always.musical.tally[side];
    assert.ok(tally.hits >= 3, `${side}: ${tally.hits} answers in 40 s`);
    assert.equal(tally.misses, 0);
    // Not at once, and not at the last moment.
    for (const ask of always.musical.asks[side]) assert.ok(ask.answer > ask.open + 1 && ask.answer < ask.t - 1);
  }
  assert.equal(health(always, "left"), whole(always, "left"));
  const never = quiz({ left: STURDY, right: STURDY, bots: { left: 1, right: 0 } });
  run(never, 25);
  assert.ok(never.musical.tally.right.misses >= 2);
  assert.equal(never.musical.tally.right.hits, 0);
  assert.ok(health(never, "right") < whole(never, "right"));
  // And a player can't answer for it.
  assert.deepEqual(pressKey(never, "right", "1"), { ok: false, reason: "bot" });
});

test("a round is over when an army is destroyed or its time is up, and the next has other questions", () => {
  const s = quiz({ bots: { left: 1, right: 1 } });
  const m = s.musical;
  const span = quizSpan(m.song, 1);
  run(s, 10);
  assert.ok(Math.abs(s.clock - (span.end - songClock(s))) < 2 * STEP, "the clock is what is left of the round");
  for (let i = 0; i < 1e5 && s.phase === "combat"; i++) stepMusicalDuel(s, STEP);
  assert.equal(s.phase, "roundEnd");
  assert.ok(m.time >= span.end - 2 * STEP, "nobody made a mistake: it went to its time");
  assert.ok(m.asks.left.every((ask) => ask.open < span.end));
  const first = questionOf(m, m.asks.left[0]).text;
  // On to the second round.
  for (let i = 0; i < 1e5 && s.phase !== "buy"; i++) stepMusicalDuel(s, STEP);
  setReady(s, "left");
  setReady(s, "right");
  stepMusicalDuel(s, STEP);
  assert.equal(m.round, 2);
  assert.deepEqual({ ...m.tally.left }, { hits: 0, misses: 0, streak: 0 });
  assert.equal(m.asks.left.length, 1);
  assert.equal(m.asks.left[0].level, 0);
  const texts = (round) => Array.from({ length: 6 }, (_, n) => quizQuestion(m.quiz.seed, round, n, 0).text).join();
  assert.notEqual(texts(1), texts(2));
  assert.equal(typeof first, "string");
  // A wiped army ends it at once.
  const quick = quiz({ left: ["soldier"], right: STURDY, bots: { right: 1 } });
  runTo(quick, quick.musical.asks.left[0].open + 0.5);
  pressKey(quick, "left", wrong(quick, "left"));
  for (let i = 0; i < 3; i++) stepMusicalDuel(quick, STEP);
  assert.equal(quick.phase === "roundEnd" || quick.phase === "over", true);
  assert.equal(quick.lastRound.winner, "right");
});

test("on the home network an answer says when it was given, and has time to arrive", () => {
  const s = quiz({ slack: 0.4 });
  const m = s.musical;
  const ask = m.asks.left[0];
  const lane = right(s, "left");
  // Given just before the line, it arrives 0.3 s after it.
  runTo(s, ask.t + 0.3);
  assert.equal(m.tally.left.misses, 0, "not a mistake yet: it may be on its way");
  assert.equal(pressKey(s, "left", lane, ask.t - 0.05).hit, true);
  assert.ok(Math.abs(m.asks.left[1].open - (ask.t - 0.05 + QUIZ_BREAK)) < 1e-9, "the next one, a moment after it was given");
  // Given after the line, it is too late whatever it is.
  const late = quiz({ slack: 0.4 });
  const other = late.musical.asks.left[0];
  runTo(late, other.t + 0.3);
  const pressed = pressKey(late, "left", right(late, "left"), other.t + 0.2);
  assert.equal(pressed.hit, false);
  assert.equal(late.musical.events.at(-1).kind, "miss");
  // Nobody says anything: the mistake comes when no answer can be on its way.
  const silent = quiz({ slack: 0.4 });
  runTo(silent, silent.musical.asks.right[0].t + 0.4 + 3 * STEP);
  assert.equal(silent.musical.tally.right.misses, 1);
});
