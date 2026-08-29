import { test } from "node:test";
import assert from "node:assert/strict";
import { WAVES, buildSpawnQueue } from "./waves.js";

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
