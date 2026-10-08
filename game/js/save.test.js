import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createGameState,
  stepSimulation,
  placeTower,
  placeWall,
  upgradeTower,
  canSaveNow,
  saveMoment,
  createSave,
  restoreSave,
  saveSummary,
  SAVE_VERSION,
  INTER_WAVE_DELAY,
} from "./simulate.js";
import { createTower, TOWER_TYPES } from "./tower.js";
import { applyUpgrade } from "./upgrades.js";
import { LEVELS } from "./levels.js";

// A level 1 game between waves: wave 3 just cleared, the countdown to wave
// 4 running, two towers (one upgraded and damaged, one half out of ammo),
// a wall and some campaign stats.
function gameBetweenWaves() {
  const s = createGameState(1);
  s.economy.money = 5000;
  const [a, b] = LEVELS[1].buildSlots;
  const id = placeTower(s, "basic", a.x, a.y).towerId;
  placeTower(s, "laser", b.x, b.y);
  for (const skill of ["damage", "damage", "armor", "ammo", "range"]) assert.equal(upgradeTower(s, id, skill).ok, true);
  assert.equal(placeWall(s, 405, 610).ok, true);
  s.towers[0].hp = 30;
  s.towers[1].ammo = 7;
  s.towers[1].buildTimeRemaining = 0;
  // As nextWaveIfDone leaves things when wave 3 has just been cleared.
  s.waveIndex = 3;
  s.economy.wave = 4;
  s.waveClock = 0;
  s.interWaveTimer = INTER_WAVE_DELAY;
  s.totalWavesCleared = 3;
  s.economy.money = 777;
  s.economy.lives = 14;
  s.stats.kills.tank = 4;
  return s;
}

test("a game saved between waves loads back the same: level, wave, money, lives, towers, walls and stats", () => {
  const s = gameBetweenWaves();
  const loaded = restoreSave(JSON.parse(JSON.stringify(createSave(s))));
  assert.equal(loaded.level, 1);
  assert.equal(loaded.waveIndex, 3);
  assert.equal(loaded.economy.wave, 4);
  assert.equal(loaded.totalWavesCleared, 3);
  assert.equal(loaded.economy.money, 777);
  assert.equal(loaded.economy.lives, 14);
  assert.deepEqual(loaded.stats, s.stats);
  const pick = (t) => ({
    type: t.type, x: t.x, y: t.y, level: t.level, hp: t.hp, maxHp: t.maxHp, ammo: t.ammo, maxAmmo: t.maxAmmo,
    damage: t.damage, range: t.range, fireRate: t.fireRate, buildTimeRemaining: t.buildTimeRemaining,
  });
  assert.deepEqual(loaded.towers.map(pick), s.towers.map(pick));
  const wall = (w) => [w.x, w.y, w.hp, w.maxHp];
  assert.deepEqual(loaded.walls.map(wall), s.walls.map(wall));
});

test("loading rebuilds each tower from its type and applies its upgrades again, at the spot it stood", () => {
  const save = createSave(gameBetweenWaves());
  // Only what was bought, as an older save would have it -- and not on
  // any of today's build slots.
  save.towers[0] = { type: "basic", x: 500, y: 300, level: { damage: 2, armor: 1 } };
  const tower = restoreSave(save).towers[0];
  const expected = createTower("basic", 500, 300);
  for (const skill of ["damage", "damage", "armor"]) applyUpgrade(expected, skill, TOWER_TYPES.basic);
  assert.equal(tower.damage, expected.damage);
  assert.equal(tower.maxHp, expected.maxHp);
  assert.equal(tower.hp, expected.maxHp, "no saved health: full");
  assert.deepEqual([tower.x, tower.y], [500, 300]);
});

test("a loaded game waits, paused, in the countdown before its next wave -- which then comes as normal", () => {
  const loaded = restoreSave(createSave(gameBetweenWaves()));
  assert.equal(loaded.paused, true);
  assert.equal(loaded.interWaveTimer, INTER_WAVE_DELAY);
  assert.equal(loaded.enemies.length, 0);
  loaded.paused = false;
  for (let i = 0; i < 200 && loaded.enemies.length === 0; i++) stepSimulation(loaded, 0.05);
  assert.ok(loaded.enemies.length > 0, "wave 4 arrives");
});

test("everything loaded gets a fresh id, and nothing placed afterwards repeats one", () => {
  const loaded = restoreSave(createSave(gameBetweenWaves()));
  loaded.economy.money = 1000;
  const slot = LEVELS[1].buildSlots[5];
  const id = placeTower(loaded, "basic", slot.x, slot.y).towerId;
  const ids = [...loaded.towers, ...loaded.walls].map((o) => o.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.includes(id));
});

test("a game can only be saved between waves", () => {
  const s = createGameState(1);
  assert.equal(canSaveNow(s), true, "a level just begun");
  for (let i = 0; i < 40; i++) stepSimulation(s, 0.05);
  assert.equal(canSaveNow(s), false, "mid-wave");
  assert.equal(canSaveNow(gameBetweenWaves()), true, "the countdown after a wave");
  const lost = gameBetweenWaves();
  lost.gameOver = true;
  assert.equal(canSaveNow(lost), false);
});

test("each between-waves moment has its own saveMoment", () => {
  const a = gameBetweenWaves();
  const b = gameBetweenWaves();
  assert.equal(saveMoment(a), saveMoment(b));
  b.waveIndex = 4;
  assert.notEqual(saveMoment(a), saveMoment(b));
});

test("a save with fields to spare or missing still loads; garbage or another version's doesn't", () => {
  const save = createSave(gameBetweenWaves());
  assert.ok(restoreSave({ ...save, futureFeature: { x: 1 } }));
  const sparse = restoreSave({ version: SAVE_VERSION, level: 3 });
  assert.equal(sparse.level, 3);
  assert.equal(sparse.waveIndex, 0);
  assert.equal(sparse.economy.money, 150);
  assert.equal(sparse.towers.length, 0);
  const odd = restoreSave({ ...save, towers: [{ type: "catapult", x: 1, y: 2 }, { type: "basic" }, ...save.towers] });
  assert.equal(odd.towers.length, save.towers.length, "unknown types and towers with no position are left out");
  for (const bad of [null, undefined, "save", 42, [], {}, { ...save, version: 999 }, { ...save, level: 99 }, { ...save, level: "2" }]) {
    assert.equal(restoreSave(bad), null, JSON.stringify(bad));
  }
});

test("a tower saved with an empty magazine is reloading when the game is loaded", () => {
  const save = createSave(gameBetweenWaves());
  save.towers[1].ammo = 0;
  const tower = restoreSave(save).towers[1];
  assert.equal(tower.ammo, 0);
  assert.equal(tower.reloading, true);
});

test("saveSummary is what the menu shows for a save -- and null for one that can't be loaded", () => {
  const save = createSave(gameBetweenWaves(), new Date("2026-10-08T18:30:00Z"));
  assert.deepEqual(saveSummary(save), { level: 1, wave: 4, lives: 14, money: 777, savedAt: "2026-10-08T18:30:00.000Z" });
  assert.equal(saveSummary({ version: 999, level: 1 }), null);
  assert.equal(saveSummary("nope"), null);
});
