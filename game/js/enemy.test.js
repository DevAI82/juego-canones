import { test } from "node:test";
import assert from "node:assert/strict";
import { ENEMY_TYPES, createEnemy, stepEnemy, damageEnemy, stepEnemyFire } from "./enemy.js";

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

test("stepEnemyFire targets the nearest tower in range and respects cooldown", () => {
  const e = createEnemy("tank", PATH);
  e.x = 0; e.y = 0;
  e.fireTimer = 0;
  const near = { x: 20, y: 0, hp: 10 };
  const far = { x: e.fireRange + 50, y: 0, hp: 10 };
  const shot = stepEnemyFire(e, [far, near], 0.016);
  assert.ok(shot);
  assert.equal(shot.target, near);
  assert.ok(e.fireTimer > 0);
});

test("createEnemy scales tank armorMult and rocket fireRange with waveIndex, capping at level 5", () => {
  const earlyTank = createEnemy("tank", PATH, 0);
  const midTank = createEnemy("tank", PATH, 14); // level 2
  const maxTank = createEnemy("tank", PATH, 999); // way past the cap
  assert.equal(earlyTank.armorMult, 1);
  assert.ok(midTank.armorMult < 1 && midTank.armorMult > maxTank.armorMult);
  assert.ok(Math.abs(maxTank.armorMult - 0.85 ** 5) < 1e-9);

  const earlyRocket = createEnemy("rocket", PATH, 0);
  const maxRocket = createEnemy("rocket", PATH, 999);
  assert.equal(earlyRocket.fireRange, ENEMY_TYPES.rocket.fireRange);
  assert.ok(Math.abs(maxRocket.fireRange - ENEMY_TYPES.rocket.fireRange * 1.2 ** 5) < 1e-6);

  // Non-tank/rocket types are untouched by waveIndex.
  const lateSoldier = createEnemy("soldier", PATH, 999);
  assert.equal(lateSoldier.armorMult, 1);
});

test("damageEnemy scales incoming damage by armorMult", () => {
  const e = createEnemy("tank", PATH, 999); // max level, armorMult = 0.85^5
  const before = e.hp;
  damageEnemy(e, 100);
  assert.ok(Math.abs(before - e.hp - 100 * 0.85 ** 5) < 1e-6);
});

test("stepEnemyFire returns null when no tower in range", () => {
  const e = createEnemy("soldier", PATH);
  e.x = 0; e.y = 0;
  e.fireTimer = 0;
  const shot = stepEnemyFire(e, [{ x: 9999, y: 0, hp: 10 }], 0.016);
  assert.equal(shot, null);
});
