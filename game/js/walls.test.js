import { test } from "node:test";
import assert from "node:assert/strict";
import {
  WALL,
  createGameState,
  stepSimulation,
  canPlaceWall,
  placeWall,
  placeTower,
  repairStructure,
  sellStructure,
} from "./simulate.js";
import { createEnemy, stepEnemy, stepEnemyFire } from "./enemy.js";
import { chooseRoute } from "./ai.js";
import { LEVELS } from "./levels.js";

const block = (id, x, y, hp = WALL.hp) => ({ id, kind: "wall", x, y, hp, maxHp: WALL.hp });

function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

// --- Placing walls ----------------------------------------------------------

test("a wall snaps to its grid cell and costs WALL.cost", () => {
  const s = createGameState(1);
  s.economy.money = 100;
  const r = placeWall(s, 405, 610);
  assert.equal(r.ok, true);
  assert.equal(s.walls.length, 1);
  const w = s.walls[0];
  assert.equal((w.x - WALL.size / 2) % WALL.size, 0);
  assert.equal((w.y - WALL.size / 2) % WALL.size, 0);
  assert.ok(Math.abs(w.x - 405) <= WALL.size / 2 && Math.abs(w.y - 610) <= WALL.size / 2);
  assert.equal(w.hp, WALL.hp);
  assert.equal(s.economy.money, 100 - WALL.cost);
});

test("walls can't go on top of another wall, a tower or a build slot, nor past the cap or without money", () => {
  const s = createGameState(1);
  s.economy.money = 100000;
  assert.equal(placeWall(s, 405, 610).ok, true);
  assert.equal(canPlaceWall(s, 405, 610).reason, "occupied");

  const slot = LEVELS[1].buildSlots[0];
  assert.equal(canPlaceWall(s, slot.x, slot.y).reason, "build-slot");
  placeTower(s, "basic", slot.x, slot.y);
  assert.equal(canPlaceWall(s, slot.x + 30, slot.y).ok, false);

  s.economy.money = 0;
  assert.equal(canPlaceWall(s, 600, 700).reason, "cant-afford");

  s.economy.money = 100000;
  s.walls = Array.from({ length: WALL.max }, (_, i) => block(1000 + i, 16 + i * 32, 720));
  assert.equal(canPlaceWall(s, 600, 600).reason, "max-count");
});

test("a wall can't be dropped right on top of an enemy", () => {
  const s = createGameState(1);
  s.economy.money = 1000;
  const e = createEnemy("tank", LEVELS[1].paths[0]);
  e.x = 400;
  e.y = 600;
  s.enemies.push(e);
  assert.equal(canPlaceWall(s, 400, 600).reason, "enemy-in-the-way");
});

test("a wall can't straddle level 3's fortress wall", () => {
  const s = createGameState(3);
  s.economy.money = 1000;
  // A point right on the fortress's top edge (y = 1245), away from any gate.
  assert.equal(canPlaceWall(s, 300, 1245).reason, "fortress-wall");
});

// --- Enemies and walls ------------------------------------------------------

const ROAD = [{ x: 0, y: 0 }, { x: 900, y: 0 }];

test("a vehicle driving into a wall across its road stops short of it and says what's blocking it", () => {
  const tank = createEnemy("tank", ROAD);
  const wall = [block(1, 304, -16), block(2, 304, 16)]; // two blocks: the whole road
  let res;
  for (let t = 0; t < 20; t += 0.05) res = stepEnemy(tank, 0.05, { others: [tank], barriers: wall });
  assert.ok([1, 2].includes(res.blockedBy), `blockedBy: ${res.blockedBy}`);
  assert.equal(tank.v, 0);
  // Its nose (half its length ahead of its centre) is up against the wall's face, not through it.
  assert.ok(tank.x + 36 <= 304 - 16 + 1 && tank.x + 36 > 304 - 16 - 8, `tank centre at x=${tank.x.toFixed(1)}`);
});

test("a vehicle slips past a single block at the edge of the road without touching it", () => {
  const buggy = createEnemy("buggy", ROAD);
  const wall = [block(1, 304, 24)]; // one block, off to one side
  let closest = Infinity;
  let res;
  for (let t = 0; t < 20; t += 0.05) {
    res = stepEnemy(buggy, 0.05, { others: [buggy], barriers: wall });
    if (Math.abs(buggy.x - 304) < 40) closest = Math.min(closest, 24 - 16 - buggy.y); // gap to the block's near face
  }
  assert.equal(res.blockedBy, undefined);
  assert.ok(buggy.x > 600, `got to x=${buggy.x.toFixed(0)}`);
  assert.ok(closest >= 15 - 1, `body came within ${closest.toFixed(1)}px of the block's face`);
});

test("an enemy held up by a wall shoots the wall, not the tower it could otherwise hit", () => {
  const e = createEnemy("tank", ROAD);
  e.x = 250;
  e.fireTimer = 0;
  e.blockedBy = 7;
  const wall = block(7, 304, 0);
  const tower = { id: 3, x: 300, y: 90, hp: 80, maxHp: 80, range: 140 };
  const shot = stepEnemyFire(e, [tower], 0.016, [wall]);
  assert.equal(shot.target, wall);
});

test("enemies stopped by a wall shoot it down, it blows up, and they carry on", () => {
  const s = createGameState(1);
  s.economy.lives = 1e9;
  s.spawnQueue = [];
  const tank = createEnemy("tank", ROAD);
  tank.id = 500;
  s.enemies.push(tank);
  s.walls = [block(601, 304, -16), block(602, 304, 16)];
  let sawBlast = false;
  // A lone tank (2.5 damage/s) takes about a minute per 150-hp block.
  for (let i = 0; i < 6000 && tank.x < 600; i++) {
    stepSimulation(s, 0.05);
    sawBlast ||= s.explosions.some((ex) => ex.kind === "wall");
  }
  // Shooting one block out is enough to squeeze through the gap.
  assert.ok(s.walls.length < 2, "it shot its way through");
  assert.ok(sawBlast, "a destroyed block blows up");
  assert.ok(tank.x >= 600, `and the tank drove on (x=${tank.x.toFixed(0)})`);
});

test("vehicles prefer a road that isn't walled off", () => {
  const a = [{ x: 0, y: 0 }, { x: 1000, y: 0 }];
  const b = [{ x: 0, y: 500 }, { x: 1000, y: 500 }];
  const walls = [block(1, 400, -16), block(2, 400, 16)];
  const rand = seeded(4);
  const picks = [0, 0];
  for (let i = 0; i < 2000; i++) picks[chooseRoute([a, b], [], rand, walls)]++;
  assert.ok(picks[1] > picks[0] * 1.5, `${picks}`);
});

// --- Repairing and selling --------------------------------------------------

test("a damaged wall can be repaired for part of its price, and sold back", () => {
  const s = createGameState(1);
  s.economy.money = 100;
  placeWall(s, 405, 610);
  const w = s.walls[0];
  w.hp = WALL.hp / 2;
  const before = s.economy.money;
  assert.equal(repairStructure(s, w.id).ok, true);
  assert.equal(w.hp, WALL.hp);
  assert.ok(before - s.economy.money > 0 && before - s.economy.money <= WALL.cost);

  const beforeSale = s.economy.money;
  assert.equal(sellStructure(s, w.id).ok, true);
  assert.equal(s.walls.length, 0);
  assert.ok(s.economy.money > beforeSale);
});
