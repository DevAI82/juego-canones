import { test } from "node:test";
import assert from "node:assert/strict";
import { createTower, TOWER_TYPES } from "./tower.js";
import { UPGRADE_DEFS, upgradeCost, canUpgrade, applyUpgrade, topValue } from "./upgrades.js";

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

test("armor raises a tower's maximum health, and its current health by as much", () => {
  const t = createTower("basic", 0, 0);
  t.hp = 50; // a bit knocked about
  applyUpgrade(t, "armor", TOWER_TYPES.basic);
  assert.equal(t.level.armor, 1);
  assert.ok(t.maxHp > TOWER_TYPES.basic.hp);
  assert.equal(t.hp, 50 + (t.maxHp - TOWER_TYPES.basic.hp));
});

test("fully armored, a tower has as much health as the old armor's damage cut was worth (x2.25)", () => {
  const t = createTower("basic", 0, 0);
  for (let i = 0; i < UPGRADE_DEFS.armor.levels; i++) applyUpgrade(t, "armor", TOWER_TYPES.basic);
  assert.equal(t.maxHp, Math.round(TOWER_TYPES.basic.hp / 0.85 ** 5));
  assert.equal(t.maxHp, topValue("armor", TOWER_TYPES.basic));
});

test("ammo capacity grows the magazine from 20 to 40 rounds over its 5 levels", () => {
  const t = createTower("basic", 0, 0);
  assert.equal(t.maxAmmo, 20);
  const seen = [];
  for (let i = 0; i < UPGRADE_DEFS.ammo.levels; i++) {
    applyUpgrade(t, "ammo", TOWER_TYPES.basic);
    seen.push(t.maxAmmo);
  }
  assert.deepEqual(seen, [24, 28, 32, 36, 40]);
  assert.equal(topValue("ammo", TOWER_TYPES.basic), 40);
  assert.equal(canUpgrade(t, "ammo"), false);
});

test("upgrading ammo capacity tops up the magazine by the extra rounds", () => {
  const t = createTower("double", 0, 0);
  t.ammo = 5;
  applyUpgrade(t, "ammo", TOWER_TYPES.double);
  assert.equal(t.ammo, 9);
});

test("applyUpgrade returns false past max level", () => {
  const t = createTower("basic", 0, 0);
  for (let i = 0; i < UPGRADE_DEFS.damage.levels; i++) applyUpgrade(t, "damage", TOWER_TYPES.basic);
  const ok = applyUpgrade(t, "damage", TOWER_TYPES.basic);
  assert.equal(ok, false);
});
