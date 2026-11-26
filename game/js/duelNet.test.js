import { test } from "node:test";
import assert from "node:assert/strict";
import { STEP, buyUnit, setReady, duelView } from "./duel.js";
import { fightChart } from "./duelSongs.js";
import { TRACKS } from "./duelTracks.js";
import { HIT_WINDOW, MARK, createMusicalDuel, stepMusicalDuel, pressKey, songClock, questionOf } from "./duelRhythm.js";
import { QUIZ_LANES } from "./duelQuiz.js";
import { ARENA } from "./duelArenas.js";
import { RESYNC, serverClock, createOnce, createNetFight, mirrored } from "./duelNet.js";

// (As the musical duel's other tests: on the song written as notes.)
for (const id of Object.keys(TRACKS)) delete TRACKS[id];

const SLACK = 0.4;
// The server's duel, both sides people, the fight on.
function served() {
  const s = createMusicalDuel({ arena: 1, seed: 7, slack: SLACK, left: { money: 5000 }, right: { money: 5000 } });
  for (const side of ["left", "right"]) {
    for (let i = 0; i < 4; i++) assert.ok(buyUnit(s, side, "tank").ok);
    setReady(s, side);
  }
  stepMusicalDuel(s, STEP);
  return s;
}
const runTo = (s, t) => {
  for (let i = 0; songClock(s) < t - STEP / 2; i++) {
    assert.ok(i < 1e5 && s.phase === "combat", `the fight never got to ${t} s`);
    stepMusicalDuel(s, STEP);
  }
};
// What the server tells a browser of it (it travels as JSON).
const news = (s, side) => duelView(s, side);
const notes = () => fightChart(1).notes;

test("the server's clock, a moment after its news: on by that moment, unless nothing is moving", () => {
  const s = served();
  runTo(s, 3);
  const told = news(s, "left");
  assert.ok(Math.abs(serverClock(told, 0) - songClock(s)) < 1e-9);
  assert.ok(Math.abs(serverClock(told, 0.1) - (songClock(s) + 0.1)) < 1e-9);
  assert.ok(Math.abs(serverClock({ ...told, paused: true }, 0.1) - songClock(s)) < 1e-9, "a pause");
  const shopping = createMusicalDuel({ arena: 1, seed: 7 });
  assert.equal(serverClock(news(shopping, "left"), 5), songClock(shopping));
});

test("a browser's song clock starts at the server's, runs with its own music, and jumps back to the server's when they come apart", () => {
  const s = served();
  runTo(s, 3);
  const net = createNetFight();
  assert.equal(net.clock(), null);
  const first = net.keep(news(s, "left"), 0.05, 0.016);
  assert.equal(first.jumped, true);
  assert.ok(Math.abs(first.clock - (songClock(s) + 0.05)) < 1e-9);
  // Its music moves on a little slower than the server's time: it keeps its own.
  let kept = first;
  for (let i = 1; i <= 5; i++) kept = net.keep(news(s, "left"), 0.05 + i * 0.016, 0.014);
  assert.equal(kept.jumped, false);
  assert.ok(Math.abs(kept.clock - (first.clock + 5 * 0.014)) < 1e-9);
  // The page hangs for a while (no music moved): it is put right.
  const late = net.keep(news(s, "left"), 0.05 + RESYNC + 0.2, 0);
  assert.equal(late.jumped, true);
  assert.ok(Math.abs(late.clock - serverClock(news(s, "left"), 0.05 + RESYNC + 0.2)) < 1e-9);
  // In a pause it stands still, whatever the music did.
  const paused = { ...news(s, "left"), paused: true };
  const at = net.keep(paused, 0, 0).clock;
  assert.deepEqual(net.keep(paused, 3, 0.5), { clock: at, jumped: false });
  // Out of the fight there is no clock; the next fight starts afresh.
  assert.equal(net.keep({ ...news(s, "left"), phase: "roundEnd" }, 0, 0.016), null);
  assert.equal(net.clock(), null);
  assert.equal(net.keep(news(s, "left"), 0, 0.016).jumped, true);
});

test("a key pressed shows at once as the server will judge it, and the server judges it so", () => {
  const s = served();
  const [first, second] = notes();
  runTo(s, first.t);
  const net = createNetFight();
  const told = news(s, "left");
  net.keep(told, 0, 0);
  const clock = net.clock();
  const pressed = net.press(told, "left", first.lane);
  assert.equal(pressed.hit, true);
  assert.equal(pressed.at, clock);
  // Drawn before the server has said a word: the key is played.
  const drawn = net.view(told, "left", 0);
  assert.equal(told.musical.marks.left[0], MARK.WAITING);
  assert.equal(drawn.musical.marks.left[0], first.hold > 0 ? MARK.HOLDING : MARK.HIT);
  assert.equal(drawn.musical.marks.right[0], MARK.WAITING, "the rival's are the server's");
  assert.equal(songClock(drawn), clock, "the keys are drawn by this browser's clock");
  // The server hears of it 0.3 s on -- too late, were it not told when it was.
  runTo(s, first.t + 0.3);
  assert.ok(0.3 > HIT_WINDOW);
  assert.equal(pressKey(s, "left", first.lane, pressed.at).hit, true);
  // A wrong key: guessed a mistake, and the key it was for is lost.
  const wrongLane = ["left", "down", "up", "right", "1", "2", "3"].find((lane) => lane !== second.lane);
  runTo(s, second.t);
  const later = news(s, "left");
  net.keep(later, RESYNC + 1, 0); // (set by the server's)
  net.keep(later, 0, 0);
  const wrong = net.press(later, "left", wrongLane);
  assert.equal(wrong.hit, false);
  assert.equal(net.view(later, "left", 0).musical.marks.left[1], MARK.MISSED);
});

test("the server's word stands over a guess, and a new round forgets them all", () => {
  const s = served();
  const [first] = notes();
  runTo(s, first.t);
  const net = createNetFight();
  const told = news(s, "left");
  net.keep(told, 0, 0);
  assert.equal(net.press(told, "left", first.lane).hit, true);
  // The key never got there: the server calls it missed.
  runTo(s, first.t + HIT_WINDOW + SLACK + 3 * STEP);
  const after = news(s, "left");
  assert.equal(after.musical.marks.left[0], MARK.MISSED);
  net.keep(after, 0, 0);
  assert.equal(net.view(after, "left", 0).musical.marks.left[0], MARK.MISSED);
  // Another round of the same song: nothing is left of the guesses.
  const next = { ...told, round: told.round + 1, musical: { ...told.musical, round: told.round + 1 } };
  net.keep(next, 0, 0);
  assert.equal(net.view(next, "left", 0).musical.marks.left[0], MARK.WAITING);
});

test("a long key held and let go: shown held, then kept or lost by when it was let go", () => {
  const index = notes().findIndex((n) => n.hold > 0.6);
  assert.ok(index >= 0);
  const note = notes()[index];
  for (const [early, held] of [[0.5, false], [0.1, true]]) {
    const s = served();
    runTo(s, note.t);
    const net = createNetFight();
    let told = news(s, "left");
    net.keep(told, 0, 0);
    assert.equal(net.press(told, "left", note.lane).hit, true);
    let drawn = net.view(told, "left", 0);
    assert.equal(drawn.musical.marks.left[index], MARK.HOLDING);
    assert.deepEqual(drawn.musical.held.left, [index]);
    assert.equal(pressKey(s, "left", note.lane, net.clock()).hit, true);
    runTo(s, note.t + note.hold - early);
    told = news(s, "left");
    net.keep(told, RESYNC + 1, 0);
    net.keep(told, 0, 0);
    const let_go = net.release(told, "left", note.lane);
    assert.equal(let_go.held, held);
    drawn = net.view(told, "left", 0);
    assert.equal(drawn.musical.marks.left[index], held ? MARK.HIT : MARK.MISSED);
    assert.deepEqual(drawn.musical.held.left, []);
    assert.equal(net.release(told, "left", note.lane).held, null, "it is holding nothing now");
  }
});

test("what the server said happened is drawn as long ago as it was, and somebody watching sees the server's keys", () => {
  const s = served();
  const [first] = notes();
  runTo(s, first.t + HIT_WINDOW + SLACK + 3 * STEP); // both let it go by
  const told = news(s, null);
  assert.ok(told.musical.events.length > 0);
  const net = createNetFight();
  net.keep(told, 0, 0);
  const drawn = net.view(told, null, 0.1);
  drawn.musical.events.forEach((event, i) => assert.ok(Math.abs(event.age - (told.musical.events[i].age + 0.1)) < 1e-9));
  assert.deepEqual(drawn.musical.marks, told.musical.marks);
  assert.equal(net.press(told, null, "up"), null, "and has no keys");
});

test("something told again and again is fresh once", () => {
  const once = createOnce(0.25);
  assert.equal(once.fresh("shot:4", 10), true);
  assert.equal(once.fresh("shot:4", 10.06), false, "the same shot, in the next news");
  assert.equal(once.fresh("shot:5", 10.06), true);
  assert.equal(once.fresh("shot:4", 10.6), true, "its next shot");
  once.reset();
  assert.equal(once.fresh("shot:4", 10.6), true);
});

test("the player of the right-hand side sees the duel the other way round: their army on the left, as the rival sees theirs", () => {
  const s = served();
  assert.ok(buyUnit(createMusicalDuel({ arena: 1 }), "left", "tank").ok);
  const [first] = notes();
  runTo(s, first.t);
  assert.equal(pressKey(s, "right", first.lane, first.t).hit, true);
  runTo(s, first.t + HIT_WINDOW + SLACK + 3 * STEP); // the left let it go by: the right fires
  s.wins.right = 2;
  s.lastRound = { round: 1, winner: "right", reason: "wipe", income: { left: 40, right: 60 } };
  s.sides.right.money = 77;
  const told = news(s, "right");
  const seen = mirrored(told);
  // The sides, and everything kept by side, change places.
  assert.deepEqual(seen.wins, { left: 2, right: 0 });
  assert.equal(seen.sides.left.money, 77);
  assert.deepEqual(seen.lastRound, { round: 1, winner: "left", reason: "wipe", income: { left: 60, right: 40 } });
  assert.deepEqual(seen.musical.tally.left, told.musical.tally.right);
  assert.deepEqual(seen.musical.marks.left, told.musical.marks.right);
  assert.deepEqual(seen.musical.marks.right, told.musical.marks.left);
  assert.deepEqual(seen.musical.from, { left: told.musical.from.right, right: told.musical.from.left });
  assert.ok(told.musical.events.length > 0 && told.shots.length > 0);
  seen.musical.events.forEach((event, i) => assert.notEqual(event.side, told.musical.events[i].side));
  // The units stand across the arena's middle, facing the other way, each still itself.
  seen.units.forEach((u, i) => {
    const was = told.units[i];
    assert.equal(u.id, was.id);
    assert.notEqual(u.side, was.side);
    assert.ok(Math.abs(u.x + was.x - ARENA.width) < 1e-9);
    assert.equal(u.y, was.y);
    assert.ok(Math.abs(Math.cos(u.angle) + Math.cos(was.angle)) < 1e-9);
    assert.ok(Math.abs(Math.sin(u.angle) - Math.sin(was.angle)) < 1e-9);
  });
  assert.ok(seen.units.filter((u) => u.side === "left").every((u) => u.x < ARENA.width / 2));
  assert.equal(seen.sides.left.army[0].x, ARENA.width - told.sides.right.army[0].x);
  seen.shots.forEach((shot, i) => {
    assert.notEqual(shot.side, told.shots[i].side);
    assert.ok(Math.abs(shot.from.x + told.shots[i].from.x - ARENA.width) < 1e-9);
    assert.equal(shot.fromId, told.shots[i].fromId);
  });
  // Nothing of the server's news is touched, and twice round is as it was.
  assert.deepEqual(told, news(s, "right"));
  const back = mirrored(seen);
  assert.deepEqual([back.wins, back.lastRound, back.musical.tally, back.musical.marks], [told.wins, told.lastRound, told.musical.tally, told.musical.marks]);
  assert.deepEqual(back.units.map((u) => [u.id, u.side, Math.round(u.x)]), told.units.map((u) => [u.id, u.side, Math.round(u.x)]));
  // The winner of the duel too.
  assert.equal(mirrored({ ...told, winner: "right" }).winner, "left");
  assert.equal(mirrored({ ...told, winner: null }).winner, null);
});

test("a key pressed between two frames is timed to the moment, not to the frame before", () => {
  const s = served();
  const [first] = notes();
  // The last frame drawn was 0.3 s before the key's moment: a slow phone.
  runTo(s, first.t - 0.3);
  const net = createNetFight();
  const told = news(s, "left");
  net.keep(told, 0, 0);
  const frame = net.clock();
  assert.equal(net.press(told, "left", first.lane).hit, false, "by the frame's time it is too soon");
  const other = createNetFight();
  other.keep(told, 0, 0);
  const pressed = other.press(told, "left", first.lane, 0.3);
  assert.equal(pressed.hit, true);
  assert.ok(Math.abs(pressed.at - (frame + 0.3)) < 1e-9);
  // And letting go of a long key likewise.
  const long = notes().find((n) => n.hold > 0.6);
  const twin = served();
  runTo(twin, long.t);
  const mine = createNetFight();
  const now = news(twin, "left");
  mine.keep(now, 0, 0);
  assert.equal(mine.press(now, "left", long.lane).hit, true);
  assert.equal(mine.release(now, "left", long.lane, long.hold - 0.05).held, true, "kept to its end, by the moment");
});

// ------------------------------------------------------------ the Duelo Matemático
// (Questions instead of keys: duelQuiz.js. Each side has its own.)

function servedQuiz() {
  const s = createMusicalDuel({ arena: 1, seed: 7, slack: SLACK, quiz: true, left: { money: 5000 }, right: { money: 5000 } });
  for (const side of ["left", "right"]) {
    for (let i = 0; i < 4; i++) assert.ok(buyUnit(s, side, "tank").ok);
    setReady(s, side);
  }
  stepMusicalDuel(s, STEP);
  return s;
}

test("an answer shows at once as the server will judge it, and the server judges it so", () => {
  const s = servedQuiz();
  const asked = s.musical.asks.left[0];
  const question = questionOf(s.musical, asked);
  const net = createNetFight();
  // Before the question comes there is nothing to answer: no guess, nothing to send.
  let told = news(s, "left");
  net.keep(told, 0, 0);
  assert.deepEqual(net.press(told, "left", question.lane), { hit: false, idle: true, at: net.clock() });
  assert.equal(net.view(told, "left", 0).musical.marks.left[0], MARK.WAITING);
  // It is on its way down: the right answer.
  runTo(s, asked.open + 2);
  told = news(s, "left");
  net.keep(told, RESYNC + 1, 0);
  net.keep(told, 0, 0);
  const pressed = net.press(told, "left", question.lane);
  assert.equal(pressed.hit, true);
  assert.equal(net.view(told, "left", 0).musical.marks.left[0], MARK.HIT, "shown before the server's word");
  assert.equal(told.musical.marks.left[0], MARK.WAITING);
  // Answered already: the same key again is nothing, until the next question is told.
  assert.equal(net.press(told, "left", question.lane).idle, true);
  runTo(s, asked.open + 2.3);
  assert.equal(pressKey(s, "left", question.lane, pressed.at).hit, true);
  // A wrong answer, guessed a mistake.
  runTo(s, s.musical.asks.left[1].open + 1);
  told = news(s, "left");
  net.keep(told, RESYNC + 1, 0);
  net.keep(told, 0, 0);
  const next = questionOf(told.musical, told.musical.asks.left[1]);
  const wrong = net.press(told, "left", QUIZ_LANES.find((lane) => lane !== next.lane));
  assert.equal(wrong.hit, false);
  assert.equal(wrong.idle, undefined);
  assert.equal(net.view(told, "left", 0).musical.marks.left[1], MARK.MISSED);
});

test("the right-hand player's questions change sides with everything else", () => {
  const s = servedQuiz();
  runTo(s, s.musical.asks.right[0].open + 1);
  pressKey(s, "right", questionOf(s.musical, s.musical.asks.right[0]).lane);
  const told = news(s, "right");
  const seen = mirrored(told);
  assert.deepEqual(seen.musical.asks.left, told.musical.asks.right);
  assert.deepEqual(seen.musical.asks.right, told.musical.asks.left);
  assert.equal(seen.musical.asks.left.length, 2);
  assert.deepEqual(seen.musical.quiz, told.musical.quiz);
  // What each did, and whose the round's prize was.
  assert.deepEqual(seen.musical.stats.left, told.musical.stats.right);
  assert.deepEqual(seen.musical.totals.right, told.musical.totals.left);
  const ended = { ...told, lastRound: { round: 1, winner: "right", reason: "time", income: { left: 50, right: 75 }, speed: { side: "right", prize: 15, spare: { left: 0.2, right: 0.7 } } } };
  assert.deepEqual(mirrored(ended).lastRound.speed, { side: "left", prize: 15, spare: { left: 0.7, right: 0.2 } });
  assert.equal(mirrored({ ...ended, lastRound: { ...ended.lastRound, speed: { side: null, prize: 15, spare: { left: 0, right: 0 } } } }).lastRound.speed.side, null);
});
