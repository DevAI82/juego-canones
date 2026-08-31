import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createGameState,
  stepSimulation,
  placeTower,
  upgradeTower,
  repairTower,
  sellTower,
  skipWave,
  togglePause,
  MIN_PLACEMENT_DIST_FROM_PATH,
} from "./simulate.js";
import { PATH } from "./map.js";

test("createGameState starts with the expected shape", () => {
  const s = createGameState();
  assert.equal(s.economy.money, 150);
  assert.equal(s.economy.lives, 20);
  assert.equal(s.waveIndex, 0);
  assert.deepEqual(s.enemies, []);
  assert.deepEqual(s.towers, []);
  assert.equal(s.gameOver, false);
  assert.equal(s.win, false);
});

test("stepSimulation spawns the first wave's enemies over time", () => {
  const s = createGameState();
  for (let i = 0; i < 200; i++) stepSimulation(s, 0.05);
  // wave 1 is 5 soldiers 1s apart; 10s of simulated time is enough for all
  // of them to have spawned and, at soldier speed, not yet reached the end
  assert.ok(s.enemies.length > 0 || s.economy.wave > 1);
});

test("placeTower succeeds off-road and deducts cost", () => {
  const s = createGameState();
  // pick a point far from every PATH segment
  const result = placeTower(s, "basic", 100, 700);
  assert.equal(result.ok, true);
  assert.equal(s.towers.length, 1);
  assert.equal(s.economy.money, 100); // 150 - 50
});

test("placeTower rejects a point too close to the road", () => {
  const s = createGameState();
  const onRoad = PATH[5];
  const result = placeTower(s, "basic", onRoad.x, onRoad.y);
  assert.equal(result.ok, false);
  assert.equal(result.reason, "on-road");
  assert.equal(s.towers.length, 0);
  assert.equal(s.economy.money, 150); // unchanged
});

test("placeTower rejects a point too close to an existing tower", () => {
  const s = createGameState();
  const first = placeTower(s, "basic", 100, 700);
  assert.equal(first.ok, true);
  const second = placeTower(s, "basic", 130, 700); // 30px away, under MIN_TOWER_SPACING
  assert.equal(second.ok, false);
  assert.equal(second.reason, "too-close-to-tower");
  assert.equal(s.towers.length, 1);
});

test("placeTower allows a second tower once it's far enough from the first", () => {
  const s = createGameState();
  placeTower(s, "basic", 100, 700);
  const second = placeTower(s, "basic", 300, 700); // well clear of MIN_TOWER_SPACING
  assert.equal(second.ok, true);
  assert.equal(s.towers.length, 2);
});

test("placeTower rejects when unaffordable", () => {
  const s = createGameState();
  s.economy.money = 10;
  const result = placeTower(s, "laser", 100, 700);
  assert.equal(result.ok, false);
  assert.equal(result.reason, "cant-afford");
});

test("placeTower rejects past a type's max count", () => {
  const s = createGameState();
  s.economy.money = 10000;
  for (let i = 0; i < 6; i++) {
    const r = placeTower(s, "basic", 100 + i * 90, 700); // > MIN_TOWER_SPACING apart
    assert.equal(r.ok, true);
  }
  const seventh = placeTower(s, "basic", 100 + 6 * 90, 700);
  assert.equal(seventh.ok, false);
  assert.equal(seventh.reason, "max-count");
});

test("upgradeTower/repairTower/sellTower operate on the tower by id", () => {
  const s = createGameState();
  s.economy.money = 10000;
  const { towerId } = placeTower(s, "basic", 100, 700);

  const up = upgradeTower(s, towerId, "damage");
  assert.equal(up.ok, true);
  const tower = s.towers.find((t) => t.id === towerId);
  assert.equal(tower.level.damage, 1);

  tower.hp = 1;
  const rep = repairTower(s, towerId);
  assert.equal(rep.ok, true);
  assert.equal(tower.hp, tower.maxHp);

  const moneyBefore = s.economy.money;
  const sell = sellTower(s, towerId);
  assert.equal(sell.ok, true);
  assert.equal(s.towers.length, 0);
  assert.ok(s.economy.money > moneyBefore);
});

test("stats.towersBuilt/moneySpent track placeTower/upgradeTower/repairTower, but selling doesn't touch either", () => {
  const s = createGameState();
  s.economy.money = 10000;
  const { towerId } = placeTower(s, "basic", 100, 700);
  assert.equal(s.stats.towersBuilt, 1);
  assert.equal(s.stats.moneySpent, 50);

  upgradeTower(s, towerId, "damage");
  assert.equal(s.stats.moneySpent, 50 + 75);

  const tower = s.towers.find((t) => t.id === towerId);
  tower.hp = 1;
  repairTower(s, towerId);
  assert.ok(s.stats.moneySpent > 50 + 75);

  const spentBeforeSell = s.stats.moneySpent;
  sellTower(s, towerId);
  assert.equal(s.stats.moneySpent, spentBeforeSell);
  assert.equal(s.stats.towersBuilt, 1);
  assert.equal(s.stats.towersLost, 0); // a voluntary sale is not a "destroyed" tower
});

test("stats.kills increments by enemy type on a kill, stats.towersLost increments on a tower dying in combat", () => {
  const s = createGameState();
  // A minimal enemy that a same-tick projectile (positioned exactly on top
  // of it, so stepProjectile's distance check hits immediately) kills
  // during this tick -- exercises the real killedEnemies path in
  // stepSimulation, not just a pre-set alive:false object (which would be
  // swept by the earlier reachedEnd filter before ever being counted).
  const enemy = { type: "tank", alive: true, hp: 1, x: 500, y: 500, bounty: 20, path: [{ x: 500, y: 500 }, { x: 500, y: 500 }], waypointIndex: 0, speed: 50 };
  s.enemies.push(enemy);
  s.projectiles.push({ x: 500, y: 500, target: enemy, damage: 999, speed: 400, alive: true });
  s.towers.push({ id: 1, hp: 0, maxHp: 80 });
  stepSimulation(s, 0.016);
  assert.equal(s.stats.kills.tank, 1);
  assert.equal(s.stats.towersLost, 1);
});

test("stepSimulation pushes apart two enemies that end up on the exact same spot", () => {
  const s = createGameState();
  const path = [{ x: 500, y: 500 }, { x: 500, y: 500 }]; // stays put, so overlap persists
  const a = { type: "buggy", alive: true, hp: 25, x: 500, y: 500, path, waypointIndex: 0, speed: 0, fireTimer: 999, fireRange: 0 };
  const b = { type: "buggy", alive: true, hp: 25, x: 500, y: 500, path, waypointIndex: 0, speed: 0, fireTimer: 999, fireRange: 0 };
  s.enemies.push(a, b);
  stepSimulation(s, 0.016);
  const dist = Math.hypot(a.x - b.x, a.y - b.y);
  assert.ok(dist > 0, "two enemies spawned on the same point should no longer be exactly overlapping");
});

test("skipWave zeroes the inter-wave timer", () => {
  const s = createGameState();
  s.interWaveTimer = 4;
  const r = skipWave(s);
  assert.equal(r.ok, true);
  assert.equal(s.interWaveTimer, 0);
});

test("MIN_PLACEMENT_DIST_FROM_PATH matches main.js's constant (38px)", () => {
  assert.equal(MIN_PLACEMENT_DIST_FROM_PATH, 38);
});

test("togglePause flips state.paused and stepSimulation no-ops while paused", () => {
  const s = createGameState();
  assert.equal(s.paused, false);

  const r1 = togglePause(s);
  assert.equal(r1.ok, true);
  assert.equal(r1.paused, true);
  assert.equal(s.paused, true);

  const clockBefore = s.waveClock;
  stepSimulation(s, 1);
  assert.equal(s.waveClock, clockBefore); // nothing advanced while paused

  togglePause(s);
  assert.equal(s.paused, false);
  stepSimulation(s, 1);
  assert.ok(s.waveClock > clockBefore); // resumes normally
});
