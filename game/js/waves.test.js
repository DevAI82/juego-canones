import { test } from "node:test";
import assert from "node:assert/strict";
import { WAVES, buildSpawnQueue } from "./waves.js";
import { ENEMY_TYPES } from "./enemy.js";

test("WAVES has at least 8 waves", () => {
  assert.ok(WAVES.length >= 8);
});

test("buildSpawnQueue returns entries sorted by time", () => {
  const queue = buildSpawnQueue(0);
  for (let i = 1; i < queue.length; i++) {
    assert.ok(queue[i].time >= queue[i - 1].time);
  }
});

test("buildSpawnQueue total count matches the wave definition", () => {
  const queue = buildSpawnQueue(1);
  const expected = WAVES[1].enemies.reduce((sum, g) => sum + g.count, 0);
  assert.equal(queue.length, expected);
});

test("buggies/motorcycles spawn shortly after a tank when the wave has one, not on their own independent schedule", () => {
  // Wave index 4 (5th wave): buggy count 4 + tank count 2, per waves.js.
  const waveIndex = WAVES.findIndex((w) => w.enemies.some((g) => g.type === "tank") && w.enemies.some((g) => g.type === "buggy"));
  assert.ok(waveIndex >= 0, "expected at least one wave with both a tank and a buggy group");
  const queue = buildSpawnQueue(waveIndex);
  const tankTimes = queue.filter((e) => e.type === "tank").map((e) => e.time);
  const buggyTimes = queue.filter((e) => e.type === "buggy").map((e) => e.time);
  assert.ok(buggyTimes.length > 0 && tankTimes.length > 0);
  for (const bt of buggyTimes) {
    const nearestTank = Math.min(...tankTimes.map((tt) => Math.abs(bt - tt)));
    assert.ok(nearestTank < 1.0, `buggy spawn at t=${bt} isn't close to any tank spawn (${tankTimes})`);
  }
});

test("every enemy type referenced in WAVES is a known ENEMY_TYPES key", () => {
  for (const wave of WAVES) {
    for (const group of wave.enemies) {
      assert.ok(
        Object.prototype.hasOwnProperty.call(ENEMY_TYPES, group.type),
        `unknown enemy type "${group.type}" in wave definition`
      );
    }
  }
});
