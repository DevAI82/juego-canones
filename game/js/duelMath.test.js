import { test } from "node:test";
import assert from "node:assert/strict";
import { STEP, buyUnit, setReady } from "./duel.js";
import { TRACKS } from "./duelTracks.js";
import { QUIZ_LANES, QUIZ_BREAK, QUIZ_FIRST, quizLevel, quizTime, quizQuestion, quizSpan } from "./duelQuiz.js";
import {
  MARK,
  QUIZ_VOLLEY,
  QUIZ_STREAK_FROM,
  QUIZ_STREAK_VOLLEY,
  QUIZ_STREAK_RELOAD,
  QUIZ_FAST,
  QUIZ_FAST_POWER,
  QUIZ_SPEED_PRIZE,
  QUIZ_ROUND_END,
  createMusicalDuel,
  stepMusicalDuel,
  pressKey,
  releaseKey,
  songClock,
  questionOf,
} from "./duelRhythm.js";

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

test("a wrong answer is a mistake: the rival's volley, a measured one", () => {
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
  // (Neither made a mistake; each one's streak fired at the other all the same.)
  assert.ok(health(always, "left") < whole(always, "left") && health(always, "right") < whole(always, "right"));
  const never = quiz({ left: STURDY, right: STURDY, bots: { left: 1, right: 0 } });
  run(never, 25);
  assert.ok(never.musical.tally.right.misses >= 2);
  assert.equal(never.musical.tally.right.hits, 0);
  assert.ok(health(never, "right") < whole(never, "right"));
  // And a player can't answer for it.
  assert.deepEqual(pressKey(never, "right", "1"), { ok: false, reason: "bot" });
});

test("a round is over when an army is destroyed or its time is up, and the next has other questions", () => {
  const s = quiz({ left: STURDY, right: ["tank"], bots: { left: 1, right: 1 } });
  const m = s.musical;
  const span = quizSpan(m.song, 1);
  run(s, 10);
  assert.ok(Math.abs(s.clock - (span.end - songClock(s))) < 2 * STEP, "the clock is what is left of the round");
  // (On to the round's last seconds.)
  m.time = span.end - 1;
  for (let i = 0; i < 1e4 && s.phase === "combat"; i++) stepMusicalDuel(s, STEP);
  assert.equal(s.phase, "roundEnd");
  assert.equal(s.lastRound.reason, "time");
  assert.equal(s.lastRound.winner, "left", "the army with more left");
  assert.ok(m.asks.left.every((ask) => ask.open < span.end));
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
  // A wiped army ends it at once.
  const quick = quiz({ left: ["soldier"], right: STURDY, bots: { right: 1 } });
  runTo(quick, quick.musical.asks.left[0].open + 0.5);
  pressKey(quick, "left", wrong(quick, "left"));
  for (let i = 0; i < 3; i++) stepMusicalDuel(quick, STEP);
  assert.equal(quick.phase === "roundEnd" || quick.phase === "over", true);
  assert.equal(quick.lastRound.winner, "right");
});

// (The user's, 2026-11-27: "if you are on a streak I think it should fire,
// and if you fail you get shot at -- but set the damage so that a round can
// last two or three minutes, and no shot kills the army at once".)
test("on a streak a right answer fires one's own army: from the third in a row, a lighter volley than a mistake's", () => {
  const s = quiz({ left: STURDY, right: STURDY, bots: { right: 1 } });
  const m = s.musical;
  // (The computer's own streak fires too: its volleys are left out of the
  // count by looking at the right-hand army only.)
  const answer = () => {
    runTo(s, current(s, "left").open + 0.3);
    const before = health(s, "right");
    assert.equal(pressKey(s, "left", right(s, "left")).hit, true);
    for (let i = 0; i < 3; i++) stepMusicalDuel(s, STEP);
    return before - health(s, "right");
  };
  for (let k = 1; k < QUIZ_STREAK_FROM; k++) assert.equal(answer(), 0, `the ${k}th in a row: no shot yet`);
  const streak = answer();
  assert.ok(streak > 0, `the ${QUIZ_STREAK_FROM}rd in a row fires`);
  // What a mistake's volley of the same army takes, to compare.
  const twin = quiz({ left: STURDY, right: STURDY, bots: { left: 1 } });
  runTo(twin, current(twin, "right").open + 0.3);
  pressKey(twin, "right", wrong(twin, "right"));
  for (let i = 0; i < 3; i++) stepMusicalDuel(twin, STEP);
  const mistake = whole(twin, "right") - health(twin, "right");
  // (Answered at once: a quick answer's volley, the heaviest a right answer fires.)
  assert.ok(Math.abs(streak / mistake - (QUIZ_STREAK_VOLLEY * QUIZ_FAST_POWER) / QUIZ_VOLLEY) < 1e-6, `${streak} against a mistake's ${mistake}`);
  assert.ok(QUIZ_STREAK_VOLLEY * QUIZ_FAST_POWER < QUIZ_VOLLEY, "a mistake costs more than a right answer takes");
});

test("an army on a streak fires no more often than it reloads, however fast its player answers", () => {
  const s = quiz({ left: STURDY, right: STURDY, bots: { right: 1 } });
  const shots = [];
  let last = health(s, "right");
  const from = songClock(s);
  // Twenty right answers, each as soon as its question comes.
  for (let k = 0; k < 20; k++) {
    runTo(s, current(s, "left").open + 0.1);
    assert.equal(pressKey(s, "left", right(s, "left")).hit, true);
    for (let i = 0; i < 3; i++) stepMusicalDuel(s, STEP);
    if (health(s, "right") < last - 1e-9) shots.push(songClock(s));
    last = health(s, "right");
  }
  assert.ok(shots.length >= 3, `${shots.length} volleys in ${songClock(s) - from} s`);
  for (let i = 1; i < shots.length; i++) assert.ok(shots[i] - shots[i - 1] >= QUIZ_STREAK_RELOAD - 0.2, `volleys ${shots[i] - shots[i - 1]} s apart`);
  assert.ok(shots.length < 10, "not one a right answer");
});

test("no volley takes an army at once, and a round between two who play alike lasts minutes", () => {
  // An army and its match (rocket trucks against tanks): one mistake.
  const s = quiz({ left: ["tank", "tank"], right: ["rocket", "soldier", "soldier", "soldier"], bots: { right: 1 } });
  runTo(s, current(s, "left").open + 0.3);
  pressKey(s, "left", wrong(s, "left"));
  for (let i = 0; i < 3; i++) stepMusicalDuel(s, STEP);
  const left = health(s, "left") / whole(s, "left");
  assert.ok(left > 0.6 && left < 1, `${Math.round(left * 100)} % left after one mistake`);
  // Two computers of the first league, the same army each: most rounds go past two minutes.
  let long = 0;
  for (let seed = 1; seed <= 12; seed++) {
    const duel = quiz({ left: ["tank", "tank"], right: ["tank", "tank"], bots: { left: 0.72, right: 0.72 }, seed });
    const start = songClock(duel);
    let end = start;
    for (let i = 0; i < 1e5 && duel.phase === "combat"; i++) {
      end = songClock(duel);
      stepMusicalDuel(duel, STEP);
    }
    if (end - start >= 100) long += 1;
    assert.ok(end - start >= 45, `seed ${seed}: over in ${Math.round(end - start)} s`);
  }
  assert.ok(long >= 8, `${long} of 12 rounds lasted 100 s or more`);
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

// ------------------------------------------------------------ quickness, and what was done
// (The user's, 2026-11-27: "the one who gets it right faster should have
// some reward, and statistics afterwards: not only getting it right before
// it comes down, but rewarding getting it right and being quick".)

test("a right answer with half its time still to go is a quick one, and its volley is heavier", () => {
  assert.ok(QUIZ_FAST >= 0.4 && QUIZ_FAST <= 0.6 && QUIZ_FAST_POWER > 1);
  // On a streak, answered at once and answered late: what each takes of the rival's army.
  const taken = (wait) => {
    const s = quiz({ left: STURDY, right: STURDY, bots: { right: 1 } });
    for (let k = 1; k < QUIZ_STREAK_FROM; k++) {
      runTo(s, current(s, "left").open + 0.3);
      pressKey(s, "left", right(s, "left"));
    }
    const asked = current(s, "left");
    runTo(s, asked.open + wait * (asked.t - asked.open));
    const before = health(s, "right");
    assert.equal(pressKey(s, "left", right(s, "left")).hit, true);
    const event = s.musical.events.at(-1);
    for (let i = 0; i < 3; i++) stepMusicalDuel(s, STEP);
    return { lost: before - health(s, "right"), fast: event.fast };
  };
  const quick = taken(0.2);
  const slow = taken(0.8);
  assert.equal(quick.fast, true);
  assert.equal(slow.fast, false);
  assert.ok(slow.lost > 0);
  assert.ok(Math.abs(quick.lost / slow.lost - QUIZ_FAST_POWER) < 1e-6, `${quick.lost} against ${slow.lost}`);
  // Just inside and just outside the half.
  assert.equal(taken(1 - QUIZ_FAST - 0.03).fast, true);
  assert.equal(taken(1 - QUIZ_FAST + 0.03).fast, false);
});

test("what each player did is kept: of the round, and of the whole duel", () => {
  const s = quiz({ left: STURDY, right: STURDY, bots: { right: 1 } });
  const m = s.musical;
  const none = { asked: 0, right: 0, wrong: 0, late: 0, fast: 0, time: 0, spare: 0, best: 0, level: 0 };
  assert.deepEqual(m.stats.left, none);
  assert.deepEqual(m.totals.left, none);
  // A quick right answer, a slow one, a wrong one, and one let go by.
  let asked = current(s, "left");
  runTo(s, asked.open + 2);
  pressKey(s, "left", right(s, "left"));
  asked = current(s, "left");
  runTo(s, asked.open + 10);
  pressKey(s, "left", right(s, "left"));
  asked = current(s, "left");
  runTo(s, asked.open + 1);
  pressKey(s, "left", wrong(s, "left"));
  asked = current(s, "left");
  runTo(s, asked.t + 3 * STEP);
  const done = m.stats.left;
  assert.deepEqual({ asked: done.asked, right: done.right, wrong: done.wrong, late: done.late, fast: done.fast, best: done.best }, { asked: 4, right: 2, wrong: 1, late: 1, fast: 1, best: 2 });
  assert.ok(Math.abs(done.time - 12) < 0.1, `${done.time} s on the two right answers`);
  assert.ok(Math.abs(done.spare - ((14 - 2) / 14 + (14 - 10) / 14)) < 0.02, "the share of its time each had left");
  assert.equal(done.level, 1, "the highest level it was asked at");
  assert.deepEqual(m.totals.left, done);
  assert.ok(m.stats.right.asked >= 3 && m.stats.right.right === m.stats.right.asked, "the computer's too");
  // The next round starts its own count; the duel's goes on.
  m.time = quizSpan(m.song, 1).end - 0.2;
  for (let i = 0; i < 1e5 && s.phase !== "buy"; i++) stepMusicalDuel(s, STEP);
  const after = { ...m.totals.left };
  setReady(s, "left");
  setReady(s, "right");
  stepMusicalDuel(s, STEP);
  assert.deepEqual(m.stats.left, none);
  assert.deepEqual(m.totals.left, after);
  runTo(s, current(s, "left").open + 1);
  pressKey(s, "left", right(s, "left"));
  assert.equal(m.stats.left.right, 1);
  assert.equal(m.totals.left.right, after.right + 1);
});

test("the round's quickest player takes a prize in money, and the round's result stays up long enough to read", () => {
  const s = quiz({ left: STURDY, right: STURDY, bots: { right: 1 } });
  const m = s.musical;
  // Four answers at once: nobody thinks that fast (the computer takes a third of its time at least).
  for (let k = 0; k < 4; k++) {
    runTo(s, current(s, "left").open + 0.3);
    pressKey(s, "left", right(s, "left"));
  }
  run(s, 35);
  assert.ok(m.stats.right.right >= 3);
  m.time = quizSpan(m.song, 1).end - 0.3;
  let before = { left: s.sides.left.money, right: s.sides.right.money };
  for (let i = 0; i < 1e4 && s.phase === "combat"; i++) {
    before = { left: s.sides.left.money, right: s.sides.right.money };
    stepMusicalDuel(s, STEP);
  }
  assert.equal(s.phase, "roundEnd");
  const { speed, income } = s.lastRound;
  assert.equal(speed.side, "left");
  assert.equal(speed.prize, QUIZ_SPEED_PRIZE);
  assert.ok(speed.spare.left > speed.spare.right && speed.spare.left > 0.9);
  assert.ok(Math.abs(s.sides.left.money - before.left - (income.left + QUIZ_SPEED_PRIZE)) < 1e-6);
  assert.ok(Math.abs(s.sides.right.money - before.right - income.right) < 1e-6);
  assert.equal(s.clock, QUIZ_ROUND_END);
  assert.ok(QUIZ_ROUND_END >= 7);

  // Nobody with three right answers: no prize.
  const dull = quiz({ left: STURDY, right: STURDY });
  runTo(dull, current(dull, "left").open + 0.3);
  pressKey(dull, "left", right(dull, "left"));
  dull.musical.time = quizSpan(dull.musical.song, 1).end - 0.3;
  for (let i = 0; i < 1e4 && dull.phase === "combat"; i++) stepMusicalDuel(dull, STEP);
  assert.equal(dull.lastRound.speed.side, null);
  // And a musical duel's round has none of it.
  const song = quiz({ math: false, left: ["soldier"], right: STURDY, bots: { right: 1 } });
  for (let i = 0; i < 1e5 && song.phase === "combat"; i++) stepMusicalDuel(song, STEP);
  assert.equal(song.lastRound.speed, undefined);
});
