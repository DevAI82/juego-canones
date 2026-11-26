import { test } from "node:test";
import assert from "node:assert/strict";
import { ARENA } from "./duelArenas.js";
import { STEP, buyUnit, setReady } from "./duel.js";
import { TRACKS } from "./duelTracks.js";
import { QUIZ_LANES, QUIZ_BREAK } from "./duelQuiz.js";
import { createMusicalDuel, stepMusicalDuel, pressKey, songClock, questionOf } from "./duelRhythm.js";
import { TRACK } from "./duelRhythmDraw.js";
import { QUIZ_CARD, quizBox, quizLaneAt, quizCardAt, quizShown } from "./duelQuizDraw.js";

for (const id of Object.keys(TRACKS)) delete TRACKS[id];

function quiz() {
  const s = createMusicalDuel({ arena: 1, seed: 7, quiz: true, left: { money: 5000 }, right: { money: 5000 } });
  for (const side of ["left", "right"]) {
    for (let i = 0; i < 4; i++) assert.ok(buyUnit(s, side, "tank").ok);
    setReady(s, side);
  }
  stepMusicalDuel(s, STEP);
  return s;
}
const runTo = (s, t) => {
  for (let i = 0; songClock(s) < t - STEP / 2 && i < 1e5; i++) stepMusicalDuel(s, STEP);
};

test("the four answers have a box each where the song's keys had their dock: big, apart, inside the screen", () => {
  const boxes = QUIZ_LANES.map((_, i) => quizBox(i));
  boxes.forEach((box, i) => {
    assert.ok(box.x >= 0 && box.x + box.w <= ARENA.width && box.y + box.h <= ARENA.height, `box ${i}`);
    assert.ok(box.w >= 130 && box.h >= 90, "a child's finger on a phone");
    assert.ok(box.y >= TRACK.line - 60, "at the foot of the track");
    if (i > 0) assert.ok(box.x >= boxes[i - 1].x + boxes[i - 1].w, "one beside the other");
  });
  // Together they are as wide as the track, and in its middle.
  assert.ok(Math.abs(boxes[0].x + (boxes[3].x + boxes[3].w) - ARENA.width) < 1e-9);
  assert.ok(boxes[3].x + boxes[3].w - boxes[0].x >= TRACK.x1 - TRACK.x0);
});

test("a press on an answer's box is its key; anywhere else is none", () => {
  QUIZ_LANES.forEach((lane, i) => {
    const box = quizBox(i);
    assert.equal(quizLaneAt({ x: box.x + box.w / 2, y: box.y + box.h / 2 }), lane);
    assert.equal(quizLaneAt({ x: box.x + 3, y: box.y + 3 }), lane);
    assert.equal(quizLaneAt({ x: box.x + box.w - 3, y: box.y + box.h - 3 }), lane);
  });
  const first = quizBox(0);
  assert.equal(quizLaneAt({ x: first.x + 20, y: first.y - 80 }), null, "up the track");
  assert.equal(quizLaneAt({ x: 40, y: first.y + 20 }), null, "beside the dock");
  assert.equal(quizLaneAt({ x: ARENA.width / 2, y: 100 }), null);
});

test("a question comes down the track from when it is asked to its time, steadily", () => {
  const asked = { open: 10, t: 22 };
  const at = (now) => quizCardAt(asked, now);
  assert.equal(at(10).y, QUIZ_CARD.top);
  assert.equal(at(22).y, QUIZ_CARD.bottom);
  assert.ok(QUIZ_CARD.top > TRACK.top && QUIZ_CARD.bottom < quizBox(0).y, "between the horizon and the answers");
  assert.ok(Math.abs(at(16).y - (QUIZ_CARD.top + QUIZ_CARD.bottom) / 2) < 1e-9);
  assert.ok(at(12).y < at(13).y && at(12).scale < at(13).scale, "nearer and bigger");
  assert.ok(at(10).scale >= 0.6, "readable from the start");
  assert.equal(at(22).scale, 1);
  assert.equal(at(10).left, 1);
  assert.equal(at(22).left, 0);
  assert.deepEqual(at(30), at(22), "it stops at the line");
  assert.deepEqual(at(5), at(10));
});

test("what a player's track shows: nothing yet, the question to answer, then what became of it until the next comes", () => {
  const s = quiz();
  const m = s.musical;
  assert.equal(quizShown(m, "left", songClock(s)), null, "before the first question");
  const asked = m.asks.left[0];
  runTo(s, asked.open + 1);
  let shown = quizShown(m, "left", songClock(s));
  assert.equal(shown.state, "answering");
  assert.equal(shown.asked, asked);
  assert.deepEqual(shown.question, questionOf(m, asked));
  // Answered right: it shows so, where it was, until the next one is asked.
  const answeredAt = songClock(s);
  pressKey(s, "left", shown.question.lane);
  shown = quizShown(m, "left", songClock(s));
  assert.equal(shown.state, "hit");
  assert.equal(shown.asked, asked);
  assert.ok(Math.abs(shown.at - answeredAt) < 1e-9, "the moment it was answered");
  runTo(s, answeredAt + QUIZ_BREAK - 0.1);
  assert.equal(quizShown(m, "left", songClock(s)).state, "hit");
  runTo(s, answeredAt + QUIZ_BREAK + 0.1);
  shown = quizShown(m, "left", songClock(s));
  assert.equal(shown.state, "answering");
  assert.equal(shown.asked, m.asks.left[1]);
  // A wrong answer shows as one.
  pressKey(s, "left", QUIZ_LANES.find((lane) => lane !== shown.question.lane));
  assert.equal(quizShown(m, "left", songClock(s)).state, "missed");
  // The other side's track is its own.
  assert.equal(quizShown(m, "right", songClock(s)).state, "answering");
  assert.equal(quizShown(m, "right", songClock(s)).asked, m.asks.right[0]);
});

test("a guess of this browser's shows before the server's next question is known", () => {
  const s = quiz();
  const m = s.musical;
  runTo(s, m.asks.left[0].open + 2);
  const now = songClock(s);
  // (duelNet.js: the mark is guessed, the next question hasn't been told yet.)
  const guessed = { ...m, marks: { ...m.marks, left: [1] } };
  const shown = quizShown(guessed, "left", now);
  assert.equal(shown.state, "hit");
  assert.equal(shown.at, now, "answered just now, as far as this browser knows");
});
