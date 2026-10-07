import { test } from "node:test";
import assert from "node:assert/strict";
import { routeThreat, chooseRoute, pickTowerTarget, holdsForSiege, ROCKET_SIEGE_TIME } from "./ai.js";
import { createTower } from "./tower.js";
import { createEnemy, damageEnemy, stepEnemy } from "./enemy.js";

// Small deterministic PRNG so the statistical tests below never flake.
function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

function builtTower(type, x, y) {
  const t = createTower(type, x, y);
  t.buildTimeRemaining = 0;
  return t;
}

const ROAD_A = [{ x: 0, y: 0 }, { x: 1000, y: 0 }];
const ROAD_B = [{ x: 0, y: 500 }, { x: 1000, y: 500 }];

test("routeThreat is zero for an undefended road and grows with the firepower covering it", () => {
  assert.equal(routeThreat(ROAD_A, []), 0);
  assert.equal(routeThreat(ROAD_A, [builtTower("basic", 500, 400)]), 0); // out of range of the road
  const one = routeThreat(ROAD_A, [builtTower("basic", 500, 50)]);
  assert.ok(one > 0);
  assert.ok(routeThreat(ROAD_A, [builtTower("basic", 500, 50), builtTower("laser", 500, 50)]) > one);
});

test("chooseRoute sends most vehicles down the less defended road, but not all of them", () => {
  const towers = [builtTower("double", 300, 40), builtTower("double", 600, 40), builtTower("basic", 800, 40)];
  const rand = seeded(1);
  const picks = [0, 0];
  for (let i = 0; i < 2000; i++) picks[chooseRoute([ROAD_A, ROAD_B], towers, rand)]++;
  assert.ok(picks[1] > picks[0] * 2, `expected the open road to be clearly favoured, got ${picks}`);
  assert.ok(picks[0] > 200, `the defended road should still see real traffic, got ${picks}`);
});

test("chooseRoute splits evenly between equally defended roads", () => {
  const rand = seeded(2);
  const picks = [0, 0];
  for (let i = 0; i < 2000; i++) picks[chooseRoute([ROAD_A, ROAD_B], [], rand)]++;
  assert.ok(Math.abs(picks[0] - picks[1]) < 200, `${picks}`);
});

test("pickTowerTarget focuses the most damaged tower in range over a closer healthy one", () => {
  const e = createEnemy("tank", ROAD_A);
  const healthyNear = builtTower("basic", 30, 0);
  const damagedFar = builtTower("basic", 120, 0);
  damagedFar.hp = 20;
  const outOfRange = builtTower("basic", 500, 0);
  outOfRange.hp = 1;
  assert.equal(pickTowerTarget(e, [healthyNear, damagedFar, outOfRange]), damagedFar);
});

test("pickTowerTarget goes after a tower still under construction before a finished one", () => {
  const e = createEnemy("tank", ROAD_A);
  const finished = builtTower("basic", 30, 0);
  const building = createTower("basic", 100, 0);
  assert.equal(pickTowerTarget(e, [finished, building]), building);
});

test("a rocket truck stops to shell a tower it out-ranges, for ROCKET_SIEGE_TIME in total", () => {
  const rocket = createEnemy("rocket", ROAD_A);
  rocket.x = 300;
  rocket.y = 300;
  const tower = builtTower("basic", 300, 500); // 200px: inside the rocket's 220, outside the basic's 140
  let held = 0;
  for (let i = 0; i < 100; i++) if (holdsForSiege(rocket, [tower], 0.1, 2000, 2000)) held += 0.1;
  assert.ok(Math.abs(held - ROCKET_SIEGE_TIME) < 0.15, `held ${held}s`);
  assert.equal(rocket.holding, false);
});

test("a rocket truck doesn't stop where a tower can hit back, near the map edge, and only rockets siege", () => {
  const rocket = createEnemy("rocket", ROAD_A);
  rocket.x = 300;
  rocket.y = 300;
  assert.equal(holdsForSiege(rocket, [builtTower("laser", 300, 500)], 0.1, 2000, 2000), false); // laser reaches 220

  rocket.x = 10; // at the edge -- the player couldn't see it
  assert.equal(holdsForSiege(rocket, [builtTower("basic", 210, 300)], 0.1, 2000, 2000), false);

  const tank = createEnemy("tank", ROAD_A);
  tank.x = 300;
  tank.y = 300;
  assert.equal(holdsForSiege(tank, [builtTower("basic", 300, 420)], 0.1, 2000, 2000), false);
});

test("a soldier that gets shot sprints for a moment, then has to recover before sprinting again", () => {
  const calm = createEnemy("soldier", ROAD_A);
  const hit = createEnemy("soldier", ROAD_A);
  calm.speed = hit.speed = 50;
  damageEnemy(hit, 1);
  stepEnemy(calm, 0.1);
  stepEnemy(hit, 0.1);
  assert.ok(hit.x > calm.x * 1.2, `hit soldier moved ${hit.x}, calm one ${calm.x}`);

  for (let i = 0; i < 10; i++) stepEnemy(hit, 0.1); // sprint over, still recovering
  assert.equal(hit.sprint, 0);
  damageEnemy(hit, 1);
  assert.equal(hit.sprint, 0);
});
