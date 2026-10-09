import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { RTS_UNIT_TYPES, RTS_UNIT_ORDER } from "./rtsUnits.js";
import { ENEMY_TYPES } from "./enemy.js";
import { UNIT_ORDER } from "./attack.js";

test("the harvester: the RTS mode's vehicle, with its picture from above and its portrait", () => {
  assert.deepEqual(RTS_UNIT_ORDER, ["harvester"]);
  const h = RTS_UNIT_TYPES.harvester;
  assert.equal(h.name, "Cosechadora");
  assert.ok(existsSync(new URL(`../${h.sprite}`, import.meta.url)), h.sprite);
  assert.ok(existsSync(new URL(`../${h.portrait}`, import.meta.url)), h.portrait);
  // bigger than a tank (72 x 36), and as long for its width as its picture
  const [len, wid] = h.footprint;
  assert.ok(len > 72 && wid > 36);
  assert.ok(Math.abs(len / wid - 512 / 220) < 0.1);
});

test("only the RTS mode has it: it's neither an enemy of the defence nor in the attack's shop", () => {
  assert.equal(ENEMY_TYPES.harvester, undefined);
  assert.equal(UNIT_ORDER.includes("harvester"), false);
});
