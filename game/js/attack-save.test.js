import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createAttackState,
  stepAttack,
  startAttack,
  buyUnits,
  upgradeUnitType,
  setEntry,
  canSaveAttack,
  createAttackSave,
  restoreAttackSave,
  attackSaveSummary,
  ROUND_TIME,
} from "./attack.js";
import { createGameState, createSave, restoreSave, saveSummary } from "./simulate.js";
import { stepGame, canSaveGame, gameSaveMoment, createGameSave, restoreGameSave, gameSaveSummary } from "./modes.js";
import { createSaveScheduler } from "./autosave.js";
import { slotListing } from "./saves.js";
import { describeSave } from "./menu.js";

function empty(level = 2) {
  const s = createAttackState(level, "normal", { aiSetup: false });
  s.economy.money = 0;
  return s;
}

function run(s, seconds, dt = 0.05) {
  for (let t = 0; t < seconds - 1e-9; t += dt) stepAttack(s, dt);
}

const roundTrip = (save) => JSON.parse(JSON.stringify(save));

// An attack on level 3 against a Difficult defence, in round 3: towers, an
// upgraded army out on the map (one tank hurt), two buggies still to come
// in, some lives already taken.
function attackInProgress() {
  const s = createAttackState(3, "hard");
  s.attack.money = 2000;
  setEntry(s, 2);
  buyUnits(s, "tank", 2);
  buyUnits(s, "soldier", 4);
  upgradeUnitType(s, "tank", "armor");
  upgradeUnitType(s, "soldier", "speed");
  upgradeUnitType(s, "soldier", "speed");
  startAttack(s);
  buyUnits(s, "buggy", 2);
  s.enemies[0].hp -= 50;
  s.attack.round = 3;
  s.economy.lives = 17;
  s.economy.money = 123;
  s.attack.stats.livesTaken = 3;
  s.stats.kills.soldier = 5;
  s.towers[0].hp = 30;
  return s;
}

test("an attack saved as a round starts loads back the same: map, difficulty, round, money, upgrades, army, defence, fog", () => {
  const s = attackInProgress();
  const save = roundTrip(createAttackSave(s, new Date("2026-10-09T20:00:00Z")));
  assert.equal(save.mode, "attack");
  const loaded = restoreAttackSave(save);
  assert.equal(loaded.mode, "attack");
  assert.equal(loaded.level, 3);
  assert.equal(loaded.attack.difficulty, "hard");
  assert.equal(loaded.attack.phase, "battle");
  assert.equal(loaded.attack.round, 3);
  assert.equal(loaded.attack.roundLeft, ROUND_TIME);
  assert.equal(loaded.attack.money, s.attack.money);
  assert.deepEqual(loaded.attack.upgrades, s.attack.upgrades);
  assert.equal(loaded.attack.entry, 2);
  assert.deepEqual(loaded.attack.queue, ["buggy", "buggy"]);
  const unit = (u) => [u.type, Math.round(u.x), Math.round(u.y), u.hp, u.maxHp];
  assert.deepEqual(loaded.enemies.map(unit), s.enemies.map(unit));
  assert.ok(loaded.enemies.every((u) => u.order === null));
  assert.equal(loaded.enemies[0].maxHp, Math.round(120 / 0.85));
  assert.equal(loaded.economy.lives, 17);
  assert.equal(loaded.economy.money, 123);
  const tower = (t) => [t.type, t.x, t.y, t.hp, JSON.stringify(t.level)];
  assert.deepEqual(loaded.towers.map(tower), s.towers.map(tower));
  assert.deepEqual(loaded.stats, s.stats);
  assert.deepEqual(loaded.attack.stats, s.attack.stats);
  assert.deepEqual([...loaded.attack.fog.explored], [...s.attack.fog.explored]);
  assert.equal(loaded.paused, true);
  const ids = new Set([...loaded.enemies, ...loaded.towers].map((o) => o.id));
  assert.equal(ids.size, loaded.enemies.length + loaded.towers.length);
});

test("a loaded attack waits paused at its round's start, and its army stands still until it's given orders", () => {
  const loaded = restoreAttackSave(roundTrip(createAttackSave(attackInProgress())));
  const at = loaded.enemies.map((u) => ({ x: u.x, y: u.y }));
  run(loaded, 1);
  assert.equal(loaded.attack.roundLeft, ROUND_TIME);
  loaded.paused = false;
  run(loaded, 1);
  loaded.enemies.slice(0, at.length).forEach((u, i) => assert.ok(Math.hypot(u.x - at[i].x, u.y - at[i].y) < 3));
});

test("an attack saved in preparation loads back in preparation", () => {
  const s = empty(2);
  buyUnits(s, "soldier", 3);
  const loaded = restoreAttackSave(roundTrip(createAttackSave(s)));
  assert.equal(loaded.attack.phase, "prep");
  assert.equal(loaded.enemies.length, 3);
  assert.deepEqual(startAttack(loaded), { ok: true });
  assert.equal(loaded.paused, false);
});

test("defence saves and attack saves each load only as what they are; saves from before the attack mode still load", () => {
  const attack = roundTrip(createAttackSave(empty(2)));
  const defence = roundTrip(createSave(createGameState(2)));
  assert.equal(defence.mode, "defense");
  assert.equal(restoreSave(attack), null);
  assert.equal(saveSummary(attack), null);
  assert.equal(restoreAttackSave(defence), null);
  assert.equal(restoreGameSave(attack).mode, "attack");
  assert.equal(restoreGameSave(defence).level, 2);
  const old = { ...defence };
  delete old.mode;
  assert.equal(restoreGameSave(old).level, 2);
});

test("damaged attack saves are refused, or mended field by field", () => {
  const good = roundTrip(createAttackSave(attackInProgress()));
  for (const bad of [null, 7, "x", {}, { ...good, version: 99 }, { ...good, level: 9 }, { ...good, level: "3" }]) {
    assert.equal(restoreAttackSave(bad), null);
    assert.equal(attackSaveSummary(bad), null);
  }
  const s = restoreAttackSave({
    ...good,
    difficulty: "insane",
    phase: "lunch",
    round: 99,
    money: -5,
    entry: 42,
    queue: ["buggy", "dragon"],
    upgrades: { tank: { armor: 99, damage: "lots" } },
    units: [null, { type: "ufo", x: 1, y: 1 }, { type: "tank", x: "a" }, { type: "soldier", x: 600, y: 300, hp: 9999 }],
    defense: { lives: -3 },
    fog: "nope",
  });
  assert.equal(s.attack.difficulty, "normal");
  assert.equal(s.attack.phase, "prep");
  assert.equal(s.attack.round, 15);
  assert.equal(s.attack.money, 0);
  assert.equal(s.attack.entry, 0);
  assert.deepEqual(s.attack.queue, ["buggy"]);
  assert.equal(s.attack.upgrades.tank.armor, 5);
  assert.equal(s.attack.upgrades.tank.damage, 0);
  assert.equal(s.enemies.length, 1);
  assert.equal(s.enemies[0].hp, s.enemies[0].maxHp);
  assert.equal(s.economy.lives, 1);
});

test("the save list tells a defence game from an attack", () => {
  const attack = createAttackSave(attackInProgress(), new Date("2026-10-09T18:30:00.000Z"));
  assert.deepEqual(attackSaveSummary(attack), {
    mode: "attack",
    level: 3,
    round: 3,
    difficulty: "hard",
    defender: "computer",
    lives: 17,
    money: Math.floor(attack.money),
    savedAt: "2026-10-09T18:30:00.000Z",
  });
  const defence = createSave(createGameState(1), new Date("2026-10-09T18:30:00.000Z"));
  assert.equal(gameSaveSummary(attack).mode, "attack");
  assert.equal(gameSaveSummary(defence).mode, "defense");
  assert.equal(slotListing(1, attack).summary.mode, "attack");
  assert.match(describeSave(attackSaveSummary(attack)), /^Ataque · Nivel 3 · Ronda 3 · Difícil · ❤ 17 · \$\d+ · \d\d\/\d\d \d\d:\d\d$/);
  assert.match(describeSave(gameSaveSummary(defence)), /^Defensa · Nivel 1 · Oleada 1 · ❤ 20 · \$150 · /);
  // one against the other at home (docs/2026-10-09-uno-contra-otro-design.md §10)
  const versus = { ...attack, defender: "player" };
  assert.match(describeSave(gameSaveSummary(versus)), /^Uno contra otro · Nivel 3 · Ronda 3 · ❤ 17 · \d\d\/\d\d \d\d:\d\d$/);
});

test("the game loop and saving go the defence way or the attack way, by the game's mode", () => {
  const d = createGameState(1);
  stepGame(d, 1);
  assert.equal(d.waveClock, 1);
  const a = empty(2);
  assert.equal(canSaveGame(a), true);
  startAttack(a);
  stepGame(a, 1);
  assert.equal(a.attack.roundLeft, ROUND_TIME - 1);
  assert.equal(canSaveGame(createGameState(1)), true);
  assert.equal(canSaveGame(a), false);
  assert.equal(canSaveAttack(a), false);
  assert.equal(gameSaveMoment(a), "attack:2:1:battle");
  assert.equal(createGameSave(a).mode, "attack");
  assert.equal(createGameSave(createGameState(1)).mode, "defense");
});

test("in attack mode the autosave is made in preparation, at «¡Al ataque!» and as each round starts; a save asked for mid-round is made when the next one starts", () => {
  const writes = [];
  const scheduler = createSaveScheduler((slot, save) => {
    writes.push([slot, save.phase, save.round]);
    return true;
  });
  const s = empty(2);
  scheduler.reset(s);
  scheduler.tick(s);
  scheduler.tick(s);
  assert.deepEqual(writes, [["auto", "prep", 1]]);
  startAttack(s);
  scheduler.tick(s);
  stepAttack(s, 0.5);
  scheduler.tick(s);
  assert.deepEqual(writes.slice(1), [["auto", "battle", 1]]);
  assert.deepEqual(scheduler.request(2, s), { done: false });
  for (let t = 0; t < 61; t += 0.5) {
    scheduler.tick(s);
    stepAttack(s, 0.5);
  }
  scheduler.tick(s);
  assert.deepEqual(writes.slice(2), [
    ["auto", "battle", 2],
    [2, "battle", 2],
  ]);
});

test("paused right as a round starts: the autosave is made once", () => {
  const writes = [];
  const scheduler = createSaveScheduler((slot) => {
    writes.push(slot);
    return true;
  });
  const s = empty(2);
  startAttack(s);
  scheduler.reset(s);
  s.paused = true;
  for (let i = 0; i < 5; i++) {
    scheduler.tick(s);
    stepAttack(s, 0.1);
  }
  assert.deepEqual(writes, ["auto"]);
});

test("a loaded attack stands at its round's start: it can be saved at once, and the autosave follows the loaded game", () => {
  const loaded = restoreAttackSave(roundTrip(createAttackSave(attackInProgress())));
  assert.equal(canSaveAttack(loaded), true);
  const writes = [];
  const scheduler = createSaveScheduler((slot, save) => {
    writes.push([slot, save.round]);
    return true;
  });
  scheduler.reset(loaded);
  scheduler.tick(loaded);
  assert.deepEqual(writes, [["auto", 3]]);
  assert.equal(scheduler.request(2, loaded).done, true);
  loaded.paused = false;
  stepAttack(loaded, 0.1);
  assert.equal(canSaveAttack(loaded), false);
});
