import { test } from "node:test";
import assert from "node:assert/strict";
import { createTower, TOWER_TYPES } from "./tower.js";
import { UPGRADE_DEFS, upgradeCost, canUpgrade, applyUpgrade } from "./upgrades.js";

test("upgradeCost grows with level", () => {
  const c0 = upgradeCost("damage", 0);
  const c1 = upgradeCost("damage", 1);
  assert.ok(c1 > c0);
});

test("canUpgrade is false once max level reached", () => {
  const t = createTower("basic", 0, 0);
  t.level.range = UPGRADE_DEFS.range.levels;
  assert.equal(canUpgrade(t, "range"), false);
});

test("applyUpgrade increases damage and increments level", () => {
  const t = createTower("basic", 0, 0);
  const before = t.damage;
  const ok = applyUpgrade(t, "damage", TOWER_TYPES.basic);
  assert.equal(ok, true);
  assert.ok(t.damage > before);
  assert.equal(t.level.damage, 1);
});

test("applyUpgrade decreases fireRate (faster shooting) as level rises", () => {
  const t = createTower("basic", 0, 0);
  const before = t.fireRate;
  applyUpgrade(t, "fireRate", TOWER_TYPES.basic);
  assert.ok(t.fireRate < before);
});

test("applyUpgrade increases range as level rises", () => {
  const t = createTower("basic", 0, 0);
  const before = t.range;
  applyUpgrade(t, "range", TOWER_TYPES.basic);
  assert.ok(t.range > before);
});

test("applyUpgrade decreases armorMult (less damage taken) as level rises", () => {
  const t = createTower("basic", 0, 0);
  const before = t.armorMult;
  applyUpgrade(t, "armor", TOWER_TYPES.basic);
  assert.ok(t.armorMult < before);
  assert.equal(t.level.armor, 1);
});

test("applyUpgrade returns false past max level", () => {
  const t = createTower("basic", 0, 0);
  for (let i = 0; i < UPGRADE_DEFS.damage.levels; i++) applyUpgrade(t, "damage", TOWER_TYPES.basic);
  const ok = applyUpgrade(t, "damage", TOWER_TYPES.basic);
  assert.equal(ok, false);
});
