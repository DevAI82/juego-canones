import { test } from "node:test";
import assert from "node:assert/strict";
import { assignId } from "./ids.js";
import { createGameState, placeTower } from "./simulate.js";
import { LEVELS } from "./levels.js";

test("everything in a game gets its id from one counter, whichever module makes it", () => {
  const before = assignId({});
  const s = createGameState(1);
  const slot = LEVELS[1].buildSlots[0];
  const { towerId } = placeTower(s, "basic", slot.x, slot.y);
  const after = assignId({});
  assert.ok(before.id < towerId && towerId < after.id);
});

test("assignId stamps the object and hands it back", () => {
  const obj = {};
  assert.equal(assignId(obj), obj);
  assert.equal(typeof obj.id, "number");
});
