import { test } from "node:test";
import assert from "node:assert/strict";
import { ZONES } from "./duelArenas.js";
import { buyUnit, duelView } from "./duel.js";
import { LANES } from "./duelSongs.js";
import { createMusicalDuel } from "./duelRhythm.js";
import { duelHud, duelHint } from "./duelUI.js";
import { TRACK, APPROACH, laneX, keyY, laneAt } from "./duelRhythmDraw.js";

test("the track stands in the middle, the arrows on one side and the numbers on the other", () => {
  assert.equal((TRACK.x0 + TRACK.x1) / 2, 600);
  const xs = LANES.map((_, i) => laneX(i));
  for (let i = 1; i < xs.length; i++) assert.ok(xs[i] > xs[i - 1]);
  assert.ok(xs[4] - xs[3] > xs[1] - xs[0], "a gap between the two hands");
  assert.ok(xs[0] > TRACK.x0 && xs[xs.length - 1] < TRACK.x1);
  // It leaves most of each side's zone in sight.
  assert.ok(TRACK.x0 > ZONES.left.x1 - 60 && TRACK.x1 < ZONES.right.x0 + 60);
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
