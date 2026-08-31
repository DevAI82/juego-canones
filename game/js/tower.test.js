import { test } from "node:test";
import assert from "node:assert/strict";
import { TOWER_TYPES, createTower, findTarget, stepTower, damageTower } from "./tower.js";

function fakeEnemy(x, y, alive = true) {
  return { x, y, alive, hp: 10 };
}

test("createTower sets base stats from TOWER_TYPES", () => {
  const t = createTower("basic", 100, 100);
  assert.equal(t.hp, TOWER_TYPES.basic.hp);
  assert.equal(t.range, TOWER_TYPES.basic.range);
  assert.equal(t.ammo, TOWER_TYPES.basic.maxAmmo);
});

test("findTarget picks the closest enemy within range, ignores dead ones", () => {
  const t = createTower("basic", 0, 0);
  const near = fakeEnemy(10, 0);
  const far = fakeEnemy(t.range + 50, 0);
  const dead = fakeEnemy(5, 0, false);
  const target = findTarget(t, [far, dead, near]);
  assert.equal(target, near);
});

test("findTarget returns null when nothing is in range", () => {
  const t = createTower("basic", 0, 0);
  const target = findTarget(t, [fakeEnemy(t.range + 100, 0)]);
  assert.equal(target, null);
});

test("stepTower fires when a target is in range and cooldown is ready", () => {
  const t = createTower("basic", 0, 0);
  t.fireTimer = 0;
  const enemy = fakeEnemy(10, 0);
  const shot = stepTower(t, [enemy], 0.016);
  assert.ok(shot);
  assert.equal(shot.target, enemy);
  assert.equal(t.ammo, TOWER_TYPES.basic.maxAmmo - 1);
});

test("stepTower enters reload after maxAmmo shots", () => {
  const t = createTower("basic", 0, 0);
  const enemy = fakeEnemy(10, 0);
  for (let i = 0; i < TOWER_TYPES.basic.maxAmmo; i++) {
    t.fireTimer = 0;
    stepTower(t, [enemy], 0.016);
  }
  assert.equal(t.reloading, true);
  assert.equal(t.ammo, 0);
});

test("damageTower reduces hp and reports death at 0", () => {
  const t = createTower("basic", 0, 0);
  assert.equal(damageTower(t, t.hp - 1), true);
  assert.equal(damageTower(t, 999), false);
});

test("damageTower scales incoming damage by armorMult", () => {
  const t = createTower("basic", 0, 0);
  t.armorMult = 0.5;
  damageTower(t, 20);
  assert.equal(t.hp, TOWER_TYPES.basic.hp - 10);
});
