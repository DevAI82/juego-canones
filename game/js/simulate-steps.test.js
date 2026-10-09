import { test } from "node:test";
import assert from "node:assert/strict";
import { createGameState, stepShots, fireUnits } from "./simulate.js";
import { createTower } from "./tower.js";
import { createProjectile } from "./projectile.js";
import { createEnemy } from "./enemy.js";

test("a shot landing on a tower or a wall block reports the damage it actually did", () => {
  const s = createGameState(1);
  const tower = Object.assign(createTower("basic", 100, 100), { id: 9001, hp: 4 });
  const wall = { id: 9002, kind: "wall", x: 300, y: 300, hp: 150, maxHp: 150 };
  s.towers.push(tower);
  s.walls.push(wall);
  s.projectiles.push(createProjectile(100, 100, tower, 10, 400), createProjectile(300, 300, wall, 10, 400));
  const hits = [];
  stepShots(s, 0.1, (target, damage) => hits.push([target.id, damage]));
  assert.deepEqual(hits, [
    [9001, 4],
    [9002, 10],
  ]);
  assert.equal(tower.hp, 0);
  assert.equal(wall.hp, 140);
});

test("units fire only at what targetsFor allows them", () => {
  const s = createGameState(1);
  // Left to itself the tank would pick `weak` (the weakest tower in range).
  const weak = Object.assign(createTower("basic", 130, 100), { id: 9101, hp: 10, buildTimeRemaining: 0 });
  const other = Object.assign(createTower("basic", 100, 160), { id: 9102, buildTimeRemaining: 0 });
  s.towers.push(weak, other);
  const tank = createEnemy("tank", [{ x: 100, y: 100 }]);
  tank.fireTimer = 0;
  s.enemies.push(tank);
  fireUnits(s, 0.1, () => [other]);
  assert.equal(s.projectiles.length, 1);
  assert.equal(s.projectiles[0].target, other);
});
