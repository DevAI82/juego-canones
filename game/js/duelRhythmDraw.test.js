import { test } from "node:test";
import assert from "node:assert/strict";
import { ARENA } from "./duelArenas.js";
import { STEP, buyUnit, setReady, duelView } from "./duel.js";
import { LANES } from "./duelSongs.js";
import { fightChart } from "./duelSongs.js";
import { TRACKS } from "./duelTracks.js";
import { HIT_WINDOW, createMusicalDuel, stepMusicalDuel, pressKey, songClock } from "./duelRhythm.js";
import { duelHud, duelHint } from "./duelUI.js";
import { TRACK, APPROACH, laneX, keyY, laneAt, cheer, shakeOf, approachOf } from "./duelRhythmDraw.js";

// (As the musical duel's other tests: on the song written as notes.)
for (const id of Object.keys(TRACKS)) delete TRACKS[id];

test("the track takes the middle of the arena, the arrows on one side and the numbers on the other", () => {
  assert.equal((TRACK.x0 + TRACK.x1) / 2, 600);
  // Twice as wide as the first one was (300 px), and nearly as tall as the arena.
  assert.ok(TRACK.x1 - TRACK.x0 >= 600, `${TRACK.x1 - TRACK.x0} px wide`);
  assert.ok(TRACK.bottom - TRACK.top >= 0.8 * ARENA.height);
  assert.ok(TRACK.top >= 70, "under the duel's score and clock");
  const xs = LANES.map((_, i) => laneX(i));
  for (let i = 1; i < xs.length; i++) assert.ok(xs[i] > xs[i - 1]);
  assert.ok(xs[4] - xs[3] > xs[1] - xs[0], "a gap between the two hands");
  assert.ok(xs[0] > TRACK.x0 && xs[xs.length - 1] < TRACK.x1);
});

test("a key comes in at the top and is on the line at its moment", () => {
  assert.equal(keyY(10, 10), TRACK.line);
  assert.ok(Math.abs(keyY(10, 10 - APPROACH) - TRACK.top) < 1e-9);
  assert.ok(keyY(10, 10.1) > TRACK.line, "and goes on down once past it");
});

test("a finger on a lane presses its key", () => {
  LANES.forEach((lane, i) => {
    assert.equal(laneAt({ x: laneX(i), y: TRACK.line }), lane);
    assert.equal(laneAt({ x: laneX(i) + 12, y: TRACK.top + 5 }), lane);
  });
  assert.equal(laneAt({ x: TRACK.x0 - 30, y: TRACK.line }), null);
  assert.equal(laneAt({ x: (laneX(3) + laneX(4)) / 2, y: TRACK.line }), null, "between the two hands");
  assert.equal(laneAt({ x: laneX(0), y: TRACK.top - 20 }), null);
});

test("the HUD and the hint say it is a musical duel", () => {
  const s = createMusicalDuel({ arena: 1, seed: 1 });
  assert.equal(duelHud(duelView(s, "left"), "left").head, "Duelo musical · Liga Arena · Asalto 1");
  assert.equal(duelHint(duelView(s, "left"), "left"), "Compra tu ejército en la tienda");
  buyUnit(s, "left", "soldier");
  assert.match(duelHint(duelView(s, "left"), "left"), /empieza la música/);
});

test("a hit is cheered by how many in a row it makes", () => {
  for (const streak of [1, 2, 4]) assert.deepEqual(cheer(streak), { text: "¡BIEN!", big: false });
  for (const streak of [5, 7, 9]) assert.deepEqual(cheer(streak), { text: "¡MUY BIEN!", big: false });
  for (const streak of [11, 14]) assert.equal(cheer(streak).text, "SUPER!");
  for (const streak of [15, 24]) assert.equal(cheer(streak).text, "EXCELLENT!");
  for (const streak of [26, 40, 300]) assert.equal(cheer(streak).text, "¡QUÉ PASADA!");
  // The streaks that make the volleys heavier are told apart.
  assert.deepEqual(cheer(10), { text: "GREAT!", big: true });
  assert.deepEqual(cheer(25), { text: "WELL DONE!", big: true });
  // (A long key kept to its end says nothing of a streak: as a first hit.)
  assert.deepEqual(cheer(undefined), { text: "¡BIEN!", big: false });
});

test("the player's own mistake shakes the screen, in red, for a moment", () => {
  const s = createMusicalDuel({ arena: 1, seed: 7, bots: { right: 1 }, left: { money: 500 }, right: { money: 500 } });
  buyUnit(s, "left", "tank");
  buyUnit(s, "right", "tank");
  setReady(s, "left");
  setReady(s, "right");
  const first = fightChart(1).notes[0];
  while (songClock(s) < first.t) stepMusicalDuel(s, STEP);
  assert.deepEqual(shakeOf(s, "left"), { x: 0, y: 0, red: 0 }, "nothing yet");
  while (songClock(s) < first.t + HIT_WINDOW + 2 * STEP) stepMusicalDuel(s, STEP); // the key goes by
  const shaken = shakeOf(s, "left");
  assert.ok(shaken.red > 0.2 && shaken.red <= 1);
  assert.ok(Math.hypot(shaken.x, shaken.y) > 2 && Math.hypot(shaken.x, shaken.y) <= 14);
  assert.deepEqual(shakeOf(s, "right"), { x: 0, y: 0, red: 0 }, "not the rival's screen");
  // (Before the song's next key goes by too.)
  for (let i = 0; i < 13; i++) stepMusicalDuel(s, STEP);
  assert.deepEqual(shakeOf(s, "left"), { x: 0, y: 0, red: 0 }, "and it is over");
  // A wrong key does too.
  pressKey(s, "left", "up");
  pressKey(s, "left", "up");
  assert.ok(shakeOf(s, "left").red > 0);
});

test("the keys come down faster as the player's streak grows, little by little", () => {
  assert.equal(approachOf(0), APPROACH);
  for (let streak = 1; streak <= 60; streak++) assert.ok(approachOf(streak) <= approachOf(streak - 1), `at ${streak}`);
  assert.ok(approachOf(1) > 0.95 * APPROACH, "little by little");
  assert.ok(approachOf(10) < 0.9 * APPROACH);
  assert.ok(approachOf(25) < approachOf(10));
  assert.ok(approachOf(1000) >= 1, "never too fast to read");
  // A key is on the line at its moment at any pace; before that, a faster
  // one is further up.
  assert.equal(keyY(10, 10, approachOf(25)), TRACK.line);
  assert.ok(keyY(10, 9.5, approachOf(25)) < keyY(10, 9.5, approachOf(0)));
  assert.equal(keyY(10, 9.5), keyY(10, 9.5, APPROACH));
});
