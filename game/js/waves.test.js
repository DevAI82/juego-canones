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
