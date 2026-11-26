import { test } from "node:test";
import assert from "node:assert/strict";
import { fightChart, songList } from "./duelSongs.js";
import { QUIZ_LANES, QUIZ_LEVELS, QUIZ_ROUND_TIME, quizLevel, quizTime, quizQuestion, quizSpan } from "./duelQuiz.js";

// A question's sum worked out again from its text.
function worked(text) {
  const [, a, sign, b] = text.match(/^(\d+) ([×+−]) (\d+)$/);
  const x = Number(a);
  const y = Number(b);
  return { a: x, b: y, sign, answer: sign === "×" ? x * y : sign === "+" ? x + y : x - y };
}
const many = (level, count = 300) => Array.from({ length: count }, (_, n) => quizQuestion(1234 + level, 1 + (n % 5), n, level));

test("the level goes up with the streak, from the easiest, and a mistake brings it back there", () => {
  assert.equal(quizLevel(0), 0);
  assert.equal(quizLevel(1), 0);
  let last = 0;
  for (let streak = 0; streak <= 60; streak++) {
    const level = quizLevel(streak);
    assert.ok(level === last || level === last + 1, `streak ${streak}: level ${level} after ${last}`);
    last = level;
  }
  assert.equal(last, QUIZ_LEVELS - 1, "a long streak reaches the top");
  assert.equal(quizLevel(1000), QUIZ_LEVELS - 1);
  assert.equal(quizLevel(-3), 0);
});

test("a question falls slowly, slowest at the start: time to work it out", () => {
  assert.ok(quizTime(0) >= 12, "an eight-year-old's time for the easiest ones");
  for (let level = 1; level < QUIZ_LEVELS; level++) {
    assert.ok(quizTime(level) <= quizTime(level - 1), `level ${level} is no slower than the one before`);
    assert.ok(quizTime(level) >= 5);
  }
  assert.ok(quizTime(QUIZ_LEVELS - 1) < quizTime(0));
});

test("a question is a times table from 1 to 10, or a sum or a subtraction of numbers of two figures at most", () => {
  for (let level = 0; level < QUIZ_LEVELS; level++) {
    const kinds = { "×": 0, "+": 0, "−": 0 };
    for (const q of many(level)) {
      const sum = worked(q.text);
      kinds[sum.sign] += 1;
      assert.equal(q.answer, sum.answer, q.text);
      assert.ok(sum.a >= 1 && sum.a <= 99 && sum.b >= 1 && sum.b <= 99, q.text);
      if (sum.sign === "×") assert.ok(sum.a <= 10 && sum.b <= 10, `${q.text} is of the tables`);
      if (sum.sign === "+") assert.ok(sum.answer <= 99, `${q.text} stays in two figures`);
      if (sum.sign === "−") assert.ok(sum.answer >= 0, `${q.text} isn't below nothing`);
    }
    assert.ok(kinds["×"] >= 100, `level ${level}: tables are the most of it (${kinds["×"]} of 300)`);
    assert.ok(kinds["+"] >= 40 && kinds["−"] >= 40, `level ${level}: sums and subtractions too`);
  }
});

test("under it, four answers to choose from: the right one among them, all different, in order", () => {
  for (let level = 0; level < QUIZ_LEVELS; level++) {
    for (const q of many(level, 200)) {
      assert.equal(q.options.length, QUIZ_LANES.length);
      assert.equal(new Set(q.options).size, 4, `${q.text}: ${q.options}`);
      assert.ok(q.options.every((o) => Number.isInteger(o) && o >= 0), `${q.text}: ${q.options}`);
      assert.deepEqual([...q.options].sort((a, b) => a - b), q.options);
      assert.equal(q.options[QUIZ_LANES.indexOf(q.lane)], q.answer, `${q.text}: the key of the right one`);
    }
  }
  // The right answer isn't always in the same place.
  const places = new Set(many(2, 200).map((q) => q.lane));
  assert.equal(places.size, 4);
});

test("the same question for the same place in the same duel, and others elsewhere", () => {
  assert.deepEqual(quizQuestion(77, 2, 5, 1), quizQuestion(77, 2, 5, 1));
  const texts = new Set();
  for (let n = 0; n < 40; n++) texts.add(quizQuestion(77, 1, n, 3).text);
  assert.ok(texts.size >= 25, `40 questions, ${texts.size} different`);
  assert.notEqual(
    Array.from({ length: 10 }, (_, n) => quizQuestion(77, 1, n, 3).text).join(),
    Array.from({ length: 10 }, (_, n) => quizQuestion(78, 1, n, 3).text).join(),
    "another duel, other questions",
  );
  // Never the same one twice running.
  for (let n = 1; n < 200; n++) assert.notEqual(quizQuestion(5, 1, n, 0).text, quizQuestion(5, 1, n - 1, 0).text, `question ${n}`);
});

test("it starts easy and gets harder: the first level has no carrying, the last has the hard tables", () => {
  const carries = (s) => (s.sign === "+" ? (s.a % 10) + (s.b % 10) >= 10 : s.sign === "−" ? s.a % 10 < s.b % 10 : false);
  for (const q of many(0)) {
    const sum = worked(q.text);
    if (sum.sign === "×") assert.ok([1, 2, 5, 10].includes(sum.a) || [1, 2, 5, 10].includes(sum.b), `${q.text} is an easy table`);
    else assert.ok(!carries(sum), `${q.text}: nothing to carry`);
  }
  const top = many(QUIZ_LEVELS - 1).map((q) => worked(q.text));
  assert.ok(top.filter((s) => s.sign === "×").every((s) => s.a >= 3 && s.b >= 3), "no easy tables at the top");
  assert.ok(top.some((s) => s.sign === "×" && s.a >= 7 && s.b >= 7));
  assert.ok(top.some((s) => s.sign === "+" && carries(s)), "sums that carry");
  assert.ok(top.some((s) => s.sign === "−" && carries(s)), "subtractions that borrow");
  // In between, harder little by little: the answers grow.
  const mean = (level) => many(level).reduce((sum, q) => sum + q.answer, 0) / 300;
  assert.ok(mean(0) < mean(2) && mean(2) < mean(QUIZ_LEVELS - 1));
});

test("a round lasts three minutes at most, from one of its song's starts -- a different one each round", () => {
  assert.equal(QUIZ_ROUND_TIME, 180, "the user's: up to three minutes");
  for (const song of songList()) {
    const chart = fightChart(song);
    const starts = new Set();
    for (let round = 1; round <= 5; round++) {
      const span = quizSpan(song, round);
      assert.ok(chart.starts.includes(span.start), `song ${song}, round ${round}: starts at ${span.start}`);
      // (The song is shorter than that as often as not: it plays round again under the round.)
      assert.ok(Math.abs(span.end - span.start - QUIZ_ROUND_TIME) < 1e-9);
      starts.add(span.start);
    }
    assert.equal(starts.size, Math.min(5, chart.starts.length));
  }
});
