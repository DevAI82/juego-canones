import { test } from "node:test";
import assert from "node:assert/strict";
import { createProjectile, stepProjectile } from "./projectile.js";

test("createProjectile starts at the given position", () => {
  const target = { x: 100, y: 0, alive: true };
  const p = createProjectile(0, 0, target, 10);
  assert.equal(p.x, 0);
  assert.equal(p.y, 0);
  assert.equal(p.alive, true);
});

test("stepProjectile moves toward the target without hitting immediately", () => {
  const target = { x: 100, y: 0, alive: true };
  const p = createProjectile(0, 0, target, 10, 50);
  const hit = stepProjectile(p, 0.1);
  assert.equal(hit, false);
  assert.ok(p.x > 0 && p.x < 100);
});

test("stepProjectile reports a hit once it reaches the target", () => {
  const target = { x: 10, y: 0, alive: true };
  const p = createProjectile(0, 0, target, 10, 1000);
  const hit = stepProjectile(p, 1);
  assert.equal(hit, true);
  assert.equal(p.alive, false);
});

test("stepProjectile fizzles if the target died first", () => {
  const target = { x: 100, y: 0, alive: false };
  const p = createProjectile(0, 0, target, 10);
  const hit = stepProjectile(p, 0.1);
  assert.equal(hit, false);
  assert.equal(p.alive, false);
});
