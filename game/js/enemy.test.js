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

const CORNER = [{ x: 0, y: 0 }, { x: 300, y: 0 }, { x: 300, y: 300 }];

function drive(e, seconds, dt = 0.05, others = [e], hold = false) {
  const trace = [];
  for (let t = 0; t < seconds; t += dt) {
    const prevAngle = e.angle;
    if (stepEnemy(e, dt, others, hold).reachedEnd) break;
    trace.push({ x: e.x, y: e.y, v: e.v, turn: Math.abs(e.angle - prevAngle) });
  }
  return trace;
}

test("a vehicle rounds a corner in an arc, turning no faster than its handling allows", () => {
  const e = createEnemy("buggy", CORNER);
  const trace = drive(e, 30);
  const maxTurnPerStep = Math.max(...trace.map((s) => s.turn));
  assert.ok(maxTurnPerStep <= 3.4 * 0.05 + 1e-9, `turned ${maxTurnPerStep} rad in one 0.05s step`);
  // It cuts inside the corner a little instead of touching its very tip...
  const closest = Math.min(...trace.map((s) => Math.hypot(s.x - 300, s.y)));
  assert.ok(closest > 3 && closest < 20, `closest approach to the corner tip: ${closest}`);
  // ...and still finishes the route.
  assert.equal(stepEnemy(e, 0.05, [e]).reachedEnd, true);
});

test("a vehicle brakes into a sharp corner and picks its speed back up after it", () => {
  const e = createEnemy("tank", CORNER);
  const cruise = e.speed;
  const trace = drive(e, 30);
  const nearCorner = trace.filter((s) => Math.hypot(s.x - 300, s.y) < 40);
  assert.ok(Math.min(...nearCorner.map((s) => s.v)) < cruise * 0.85, "should slow down for the corner");
  const lateStraight = trace.filter((s) => s.y > 220);
  assert.ok(Math.abs(lateStraight.at(-1).v - cruise) < 0.5, "should be back to cruising speed on the straight");
});

test("a unit told to hold brakes to a stop instead of halting instantly", () => {
  const e = createEnemy("rocket", PATH);
  const trace = drive(e, 3, 0.05, [e], true);
  assert.ok(trace[0].v > 0, "still rolling right after the order");
  assert.equal(trace.at(-1).v, 0);
  assert.ok(e.x > 5 && e.x < 30, `rolled ${e.x}px while braking`);
});

test("a faster vehicle catching up with a slower one overtakes it with room to spare", () => {
  const road = [{ x: 0, y: 0 }, { x: 2000, y: 0 }];
  const tank = createEnemy("tank", road);
  const buggy = createEnemy("buggy", road);
  tank.x = 80;
  const units = [tank, buggy];
  let closest = Infinity;
  let tankSwerve = 0;
  for (let t = 0; t < 20; t += 0.05) {
    for (const u of units) stepEnemy(u, 0.05, units);
    closest = Math.min(closest, Math.hypot(tank.x - buggy.x, tank.y - buggy.y));
    tankSwerve = Math.max(tankSwerve, Math.abs(tank.y));
  }
  // Side by side, their centres are half a tank's plus half a buggy's
  // width apart (33px) -- closer and the sprites overlap.
  assert.ok(closest > 33, `got within ${closest.toFixed(1)}px`);
  assert.ok(buggy.x > tank.x + 100, "the buggy should have pulled out and overtaken");
  assert.ok(Math.abs(buggy.y) < 2, "and pulled back into its lane afterwards");
  assert.ok(tankSwerve < 10, `the tank shouldn't be pushed off its line (${tankSwerve.toFixed(1)}px)`);
});

test("a vehicle doesn't overtake near one of the level's narrow points (a bridge), it waits behind", () => {
  const road = [{ x: 0, y: 0 }, { x: 2000, y: 0 }];
  const bridge = { x: 300, y: 0 };
  const tank = createEnemy("tank", road);
  const buggy = createEnemy("buggy", road);
  tank.x = 150;
  buggy.x = 60;
  const units = [tank, buggy];
  for (let t = 0; t < 4; t += 0.05) for (const u of units) stepEnemy(u, 0.05, units, false, [bridge]);
  assert.ok(buggy.x < tank.x - 50, "still behind the tank, at a safe distance");
  assert.ok(Math.abs(buggy.y) < 7, `and in its lane (${buggy.y.toFixed(1)}px off)`);
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
  assert.ok(Math.abs(maxRocket.fireRange - ENEMY_TYPES.rocket.fireRange * 1.09 ** 5) < 1e-6);

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

test("stepEnemyFire shoots the most damaged tower in range, not just the nearest", () => {
  const e = createEnemy("tank", PATH);
  e.fireTimer = 0;
  const near = { x: 20, y: 0, hp: 80, maxHp: 80 };
  const damaged = { x: 100, y: 0, hp: 15, maxHp: 80 };
  const shot = stepEnemyFire(e, [near, damaged], 0.016);
  assert.equal(shot.target, damaged);
});

test("stepEnemyFire returns null when no tower in range", () => {
  const e = createEnemy("soldier", PATH);
  e.x = 0; e.y = 0;
  e.fireTimer = 0;
  const shot = stepEnemyFire(e, [{ x: 9999, y: 0, hp: 10 }], 0.016);
  assert.equal(shot, null);
});
