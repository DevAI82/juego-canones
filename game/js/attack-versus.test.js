import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createAttackState,
  stepAttack,
  startAttack,
  buyUnits,
  createAttackSave,
  restoreAttackSave,
  attackSaveSummary,
  ROUND_TIME,
} from "./attack.js";
import { DIFFICULTIES } from "./defenseAI.js";
import { placeTower } from "./simulate.js";
import { knownStructure } from "./fog.js";
import { reachesEntryRoad } from "./entryRoads.js";
import { LEVELS } from "./levels.js";
import { TOWER_TYPES } from "./tower.js";

function run(s, seconds, dt = 0.05) {
  for (let t = 0; t < seconds - 1e-9; t += dt) stepAttack(s, dt);
}

// A build slot of level 2 where a basic tower may go up in an attack.
function freeSlot(level = 2) {
  const L = LEVELS[level];
  return L.buildSlots.find((sl) => !reachesEntryRoad(L, sl.x, sl.y, TOWER_TYPES.basic.range));
}

test("a person defending: no computer towers, the money of the level chosen", () => {
  for (const [level, money] of [["easy", 250], ["normal", 350], ["hard", 450]]) {
    const s = createAttackState(2, level, { defender: "player" });
    assert.equal(s.attack.defender, "player");
    assert.equal(s.towers.length, 0);
    assert.equal(s.economy.money, money);
    assert.equal(DIFFICULTIES[level].startMoney, money);
  }
  assert.equal(createAttackState(2, "normal").attack.defender, "computer");
});

test("with a person defending, each round pays their money and the computer never builds", () => {
  const s = createAttackState(2, "hard", { defender: "player" });
  startAttack(s);
  run(s, ROUND_TIME * 2 + 1);
  assert.equal(s.attack.round, 3);
  assert.equal(s.towers.length, 0);
  assert.equal(s.economy.money, 450 + 2 * 120);
});

test("a tower built during the preparation is ready at once: no clock runs then", () => {
  const s = createAttackState(2, "normal", { defender: "player" });
  const slot = freeSlot();
  const { towerId } = placeTower(s, "basic", slot.x, slot.y);
  const t = s.towers.find((x) => x.id === towerId);
  assert.ok(t.buildTimeRemaining > 0);
  run(s, 0.05);
  assert.equal(t.buildTimeRemaining, 0);
  // during a round it takes its time, as always
  startAttack(s);
  const other = s.economy.money >= 50 && LEVELS[2].buildSlots.find((sl) => sl !== slot && !reachesEntryRoad(LEVELS[2], sl.x, sl.y, TOWER_TYPES.basic.range));
  const second = placeTower(s, "basic", other.x, other.y);
  run(s, 0.05);
  assert.ok(s.towers.find((x) => x.id === second.towerId).buildTimeRemaining > 0);
});

test("the attacker's fog sees towers built during the preparation", () => {
  const s = createAttackState(2, "normal", { defender: "player" });
  buyUnits(s, "motorcycle");
  const slot = freeSlot();
  placeTower(s, "basic", slot.x, slot.y);
  const t = s.towers[0];
  assert.equal(knownStructure(s.attack.fog, t), false);
  const [u] = s.enemies;
  u.x = t.x + 60; // (put there by hand: a unit in sight of it)
  u.y = t.y;
  run(s, 0.05);
  assert.equal(knownStructure(s.attack.fog, t), true);
});

test("a game with a person defending saves and loads as one, and the save list says so", () => {
  const s = createAttackState(3, "hard", { defender: "player" });
  const save = JSON.parse(JSON.stringify(createAttackSave(s)));
  assert.equal(save.defender, "player");
  const back = restoreAttackSave(save);
  assert.equal(back.attack.defender, "player");
  assert.equal(back.attack.difficulty, "hard");
  assert.equal(attackSaveSummary(save).defender, "player");
  // saves from before: the computer defends
  delete save.defender;
  assert.equal(restoreAttackSave(save).attack.defender, "computer");
  assert.equal(attackSaveSummary(save).defender, "computer");
});
