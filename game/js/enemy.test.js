import { test } from "node:test";
import assert from "node:assert/strict";
import { ENEMY_TYPES, createEnemy, stepEnemy, damageEnemy } from "./enemy.js";

const PATH = [{ x: 0, y: 0 }, { x: 100, y: 0 }];

test("createEnemy starts at the first waypoint with full hp", () => {
  const e = createEnemy("soldier", PATH);
  assert.equal(e.x, 0);
  assert.equal(e.y, 0);
  assert.equal(e.hp, ENEMY_TYPES.soldier.hp);
  assert.equal(e.alive, true);
});

test("stepEnemy moves toward the next waypoint", () => {
  const e = createEnemy("buggy", PATH);
  const before = e.x;
  stepEnemy(e, 0.1);
  assert.ok(e.x > before);
  assert.ok(e.x <= 100);
});

test("stepEnemy reports reachedEnd once past the last waypoint", () => {
  const e = createEnemy("buggy", PATH);
  let result;
  for (let i = 0; i < 200; i++) {
    result = stepEnemy(e, 0.1);
    if (result.reachedEnd) break;
  }
  assert.equal(result.reachedEnd, true);
});

test("damageEnemy reduces hp and reports death at 0", () => {
  const e = createEnemy("soldier", PATH);
  const stillAlive = damageEnemy(e, e.hp - 1);
  assert.equal(stillAlive, true);
  assert.equal(e.alive, true);
  const dead = damageEnemy(e, 999);
  assert.equal(dead, false);
  assert.equal(e.alive, false);
});
