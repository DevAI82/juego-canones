import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createGameState,
  startNextLevel,
  stepSimulation,
  canPlaceTower,
  placeTower,
  upgradeTower,
  repairTower,
  sellTower,
  skipWave,
  togglePause,
} from "./simulate.js";
import { PATH } from "./map.js";
import { MAX_LEVEL, LEVELS } from "./levels.js";
import { WAVES } from "./waves.js";

const SLOTS_1 = LEVELS[1].buildSlots;

test("createGameState starts with the expected shape", () => {
  const s = createGameState();
  assert.equal(s.level, 1);
  assert.equal(s.economy.money, 150);
  assert.equal(s.economy.lives, 20);
  assert.equal(s.waveIndex, 0);
  assert.equal(s.totalWavesCleared, 0);
  assert.deepEqual(s.enemies, []);
  assert.deepEqual(s.towers, []);
  assert.equal(s.gameOver, false);
  assert.equal(s.win, false);
  assert.equal(s.levelComplete, false);
});

test("createGameState(2) starts directly on level 2", () => {
  const s = createGameState(2);
  assert.equal(s.level, 2);
});

test("clearing the final wave sets levelComplete (not win) when another level remains", () => {
  const s = createGameState(1);
  assert.ok(MAX_LEVEL > 1, "this test assumes a level 2 exists");
  s.waveIndex = WAVES.length - 1;
  s.spawnQueue = [];
  s.enemies = [];
  stepSimulation(s, 0.016);
  assert.equal(s.levelComplete, true);
  assert.equal(s.win, false);
  assert.equal(s.totalWavesCleared, 1); // the final wave counted too
});

test("clearing the final wave of the FINAL level sets win, not levelComplete", () => {
  const s = createGameState(MAX_LEVEL);
  s.waveIndex = WAVES.length - 1;
  s.spawnQueue = [];
  s.enemies = [];
  stepSimulation(s, 0.016);
  assert.equal(s.win, true);
  assert.equal(s.levelComplete, false);
});

test("stepSimulation no-ops while levelComplete, same as gameOver/win", () => {
  const s = createGameState();
  s.levelComplete = true;
  const clockBefore = s.waveClock;
  stepSimulation(s, 1);
  assert.equal(s.waveClock, clockBefore);
});

test("startNextLevel returns null unless levelComplete is true, or past MAX_LEVEL", () => {
  const notComplete = createGameState();
  assert.equal(startNextLevel(notComplete), null);

  const atMax = createGameState(MAX_LEVEL);
  atMax.levelComplete = true;
  assert.equal(startNextLevel(atMax), null);
});

test("startNextLevel advances the level and carries stats/totalWavesCleared forward, resetting everything else", () => {
  const s = createGameState(1);
  s.levelComplete = true;
  s.totalWavesCleared = 40;
  s.stats.kills.tank = 12;
  s.stats.moneySpent = 999;
  s.economy.money = 5;
  s.towers.push({ id: 1, hp: 1 });

  const fresh = startNextLevel(s);
  assert.ok(fresh);
  assert.equal(fresh.level, 2);
  assert.equal(fresh.levelComplete, false);
  assert.equal(fresh.totalWavesCleared, 40); // carried forward
  assert.equal(fresh.stats.kills.tank, 12); // carried forward
  assert.equal(fresh.stats.moneySpent, 999); // carried forward
  assert.equal(fresh.economy.money, 150); // reset to the starting amount
  assert.deepEqual(fresh.towers, []); // reset
  assert.equal(fresh.waveIndex, 0); // reset
});

test("stepSimulation spawns the first wave's enemies over time", () => {
  const s = createGameState();
  for (let i = 0; i < 200; i++) stepSimulation(s, 0.05);
  // wave 1 is 5 soldiers 1s apart; 10s of simulated time is enough for all
  // of them to have spawned and, at soldier speed, not yet reached the end
  assert.ok(s.enemies.length > 0 || s.economy.wave > 1);
});

test("placeTower succeeds at a build slot and deducts cost", () => {
  const s = createGameState();
  const slot = SLOTS_1[0];
  const result = placeTower(s, "basic", slot.x, slot.y);
  assert.equal(result.ok, true);
  assert.equal(s.towers.length, 1);
  assert.equal(s.economy.money, 100); // 150 - 50
});

test("placeTower on level 2 (fixed build slots) snaps a nearby click to the slot's exact position", () => {
  const s = createGameState(2);
  s.economy.money = 10000;
  const slot = LEVELS[2].buildSlots[0];
  const result = placeTower(s, "basic", slot.x + 10, slot.y - 8); // close but not exact
  assert.equal(result.ok, true);
  const tower = s.towers.find((t) => t.id === result.towerId);
  assert.equal(tower.x, slot.x);
  assert.equal(tower.y, slot.y);
});

test("placeTower on level 2 rejects a point with no build slot nearby (e.g. on the road)", () => {
  const s = createGameState(2);
  s.economy.money = 10000;
  const onLeftBranch = LEVELS[2].paths[0][2];
  const result = placeTower(s, "basic", onLeftBranch.x, onLeftBranch.y);
  assert.equal(result.ok, false);
  assert.equal(result.reason, "no-slot");
  assert.equal(s.towers.length, 0);
});

test("placeTower on level 2 rejects a slot that's already occupied", () => {
  const s = createGameState(2);
  s.economy.money = 10000;
  const slot = LEVELS[2].buildSlots[0];
  const first = placeTower(s, "basic", slot.x, slot.y);
  assert.equal(first.ok, true);
  const second = placeTower(s, "double", slot.x, slot.y);
  assert.equal(second.ok, false);
  assert.equal(second.reason, "slot-occupied");
  assert.equal(s.towers.length, 1);
});

test("placeTower rejects a point with no build slot nearby (e.g. on the road)", () => {
  const s = createGameState();
  const onRoad = PATH[5];
  const result = placeTower(s, "basic", onRoad.x, onRoad.y);
  assert.equal(result.ok, false);
  assert.equal(result.reason, "no-slot");
  assert.equal(s.towers.length, 0);
  assert.equal(s.economy.money, 150); // unchanged
});

test("placeTower rejects a slot that's already occupied", () => {
  const s = createGameState();
  const slot = SLOTS_1[0];
  const first = placeTower(s, "basic", slot.x, slot.y);
  assert.equal(first.ok, true);
  const second = placeTower(s, "basic", slot.x, slot.y);
  assert.equal(second.ok, false);
  assert.equal(second.reason, "slot-occupied");
  assert.equal(s.towers.length, 1);
});

test("placeTower allows a second tower at a different slot", () => {
  const s = createGameState();
  placeTower(s, "basic", SLOTS_1[0].x, SLOTS_1[0].y);
  const second = placeTower(s, "basic", SLOTS_1[1].x, SLOTS_1[1].y);
  assert.equal(second.ok, true);
  assert.equal(s.towers.length, 2);
});

test("placeTower rejects when unaffordable", () => {
  const s = createGameState();
  s.economy.money = 10;
  const slot = SLOTS_1[0];
  const result = placeTower(s, "laser", slot.x, slot.y);
  assert.equal(result.ok, false);
  assert.equal(result.reason, "cant-afford");
});

test("placeTower rejects past a type's max count", () => {
  const s = createGameState();
  s.economy.money = 10000;
  for (let i = 0; i < 6; i++) {
    const r = placeTower(s, "basic", SLOTS_1[i].x, SLOTS_1[i].y);
    assert.equal(r.ok, true);
  }
  const seventh = placeTower(s, "basic", SLOTS_1[6].x, SLOTS_1[6].y);
  assert.equal(seventh.ok, false);
  assert.equal(seventh.reason, "max-count");
});

test("canPlaceTower predicts the same result as placeTower without mutating state", () => {
  const s = createGameState();
  const slot = SLOTS_1[0];
  const check = canPlaceTower(s, "basic", slot.x + 5, slot.y - 3);
  assert.equal(check.ok, true);
  assert.equal(check.x, slot.x);
  assert.equal(check.y, slot.y);
  assert.deepEqual(s.towers, []); // unchanged -- canPlaceTower never mutates
  assert.equal(s.economy.money, 150); // unchanged
});

test("upgradeTower/repairTower/sellTower operate on the tower by id", () => {
  const s = createGameState();
  s.economy.money = 10000;
  const slot = SLOTS_1[0];
  const { towerId } = placeTower(s, "basic", slot.x, slot.y);

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
  const slot = SLOTS_1[0];
  const { towerId } = placeTower(s, "basic", slot.x, slot.y);
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
