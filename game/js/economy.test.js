import { test } from "node:test";
import assert from "node:assert/strict";
import { createEconomy, canAfford, spend, earn, loseLife } from "./economy.js";

test("createEconomy sets starting values", () => {
  const eco = createEconomy(150, 20);
  assert.equal(eco.money, 150);
  assert.equal(eco.lives, 20);
  assert.equal(eco.wave, 1);
});

test("spend fails and leaves money unchanged when unaffordable", () => {
  const eco = createEconomy(10, 20);
  const ok = spend(eco, 50);
  assert.equal(ok, false);
  assert.equal(eco.money, 10);
});

test("spend succeeds and deducts money when affordable", () => {
  const eco = createEconomy(100, 20);
  const ok = spend(eco, 40);
  assert.equal(ok, true);
  assert.equal(eco.money, 60);
});

test("earn adds money", () => {
  const eco = createEconomy(0, 20);
  earn(eco, 15);
  assert.equal(eco.money, 15);
});

test("loseLife returns true (game over) once lives hit 0", () => {
  const eco = createEconomy(0, 2);
  assert.equal(loseLife(eco, 1), false);
  assert.equal(loseLife(eco, 1), true);
  assert.equal(eco.lives, 0);
});
