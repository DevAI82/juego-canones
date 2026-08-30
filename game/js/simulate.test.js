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
    const r = placeTower(s, "basic", 100 + i * 60, 700);
    assert.equal(r.ok, true);
  }
  const seventh = placeTower(s, "basic", 100 + 6 * 60, 700);
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
