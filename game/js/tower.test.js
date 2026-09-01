import { test } from "node:test";
import assert from "node:assert/strict";
import { TOWER_TYPES, BUILD_DURATION, createTower, findTarget, stepTower, damageTower } from "./tower.js";

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

test("findTarget always prefers a tank in range over a closer non-tank, so the tank draws fire away from its escorts", () => {
  const t = createTower("basic", 0, 0);
  const closeBuggy = { ...fakeEnemy(10, 0), type: "buggy" };
  const fartherTank = { ...fakeEnemy(60, 0), type: "tank" };
  const target = findTarget(t, [closeBuggy, fartherTank]);
  assert.equal(target, fartherTank);
});

test("findTarget still picks the nearest enemy among non-tanks, and among multiple tanks", () => {
  const t = createTower("basic", 0, 0);
  const nearTank = { ...fakeEnemy(20, 0), type: "tank" };
  const farTank = { ...fakeEnemy(80, 0), type: "tank" };
  assert.equal(findTarget(t, [farTank, nearTank]), nearTank);
});

test("stepTower fires when a target is in range and cooldown is ready", () => {
  const t = createTower("basic", 0, 0);
  t.buildTimeRemaining = 0; // finished construction -- not what this test is about
  t.fireTimer = 0;
  const enemy = fakeEnemy(10, 0);
  const shot = stepTower(t, [enemy], 0.016);
  assert.ok(shot);
  assert.equal(shot.target, enemy);
  assert.equal(t.ammo, TOWER_TYPES.basic.maxAmmo - 1);
});

test("stepTower enters reload after maxAmmo shots", () => {
  const t = createTower("basic", 0, 0);
  t.buildTimeRemaining = 0;
  const enemy = fakeEnemy(10, 0);
  for (let i = 0; i < TOWER_TYPES.basic.maxAmmo; i++) {
    t.fireTimer = 0;
    stepTower(t, [enemy], 0.016);
  }
  assert.equal(t.reloading, true);
  assert.equal(t.ammo, 0);
});

// --- Build delay ---------------------------------------------------------
// Per user request: placing a tower shouldn't make it combat-ready
// instantly -- it spends BUILD_DURATION "under construction" first (see
// main.js for the matching visual: a build-animation sprite plays over
// this same window).
test("createTower starts under construction for BUILD_DURATION", () => {
  const t = createTower("basic", 0, 0);
  assert.equal(t.buildTimeRemaining, BUILD_DURATION);
});

test("stepTower doesn't target or fire while under construction, even with an enemy in range and ready to fire", () => {
  const t = createTower("basic", 0, 0);
  t.fireTimer = 0;
  const enemy = fakeEnemy(10, 0);
  const shot = stepTower(t, [enemy], 0.016);
  assert.equal(shot, null);
  assert.equal(t.target, null);
  assert.equal(t.ammo, TOWER_TYPES.basic.maxAmmo); // untouched
});

test("stepTower counts down buildTimeRemaining and starts firing normally once it hits 0", () => {
  const t = createTower("basic", 0, 0);
  const enemy = fakeEnemy(10, 0);
  // Step past the whole build window in one dt larger than BUILD_DURATION --
  // buildTimeRemaining should clamp to exactly 0, not go negative, and
  // this same tick should NOT fire yet (construction only just finished).
  const duringBuild = stepTower(t, [enemy], BUILD_DURATION + 1);
  assert.equal(t.buildTimeRemaining, 0);
  assert.equal(duringBuild, null);
  // The next tick, it's a fully normal tower.
  t.fireTimer = 0;
  const afterBuild = stepTower(t, [enemy], 0.016);
  assert.ok(afterBuild);
  assert.equal(afterBuild.target, enemy);
});

test("a tower under construction can still be damaged/destroyed", () => {
  const t = createTower("basic", 0, 0);
  assert.ok(t.buildTimeRemaining > 0);
  assert.equal(damageTower(t, t.hp - 1), true);
  assert.equal(damageTower(t, 999), false);
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
