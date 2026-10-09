import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createAttackState,
  stepAttack,
  startAttack,
  buyUnits,
  upgradeUnitType,
  setEntry,
  roundIncome,
  unitUpgradeCost,
  UNIT_PRICES,
  UNIT_ORDER,
  UNIT_CAP,
  ROUNDS,
  ROUND_TIME,
  SPAWN_INTERVAL,
} from "./attack.js";
import { DIFFICULTIES } from "./defenseAI.js";
import { attackMapOf, nearestRoadPoint } from "./roadGraph.js";
import { isVisible, isExplored } from "./fog.js";
import { LEVELS } from "./levels.js";

// An attack against a defence with no towers and no money: nothing shoots.
function empty(level = 2) {
  const s = createAttackState(level, "normal", { aiSetup: false });
  s.economy.money = 0;
  return s;
}

function run(s, seconds, dt = 0.05) {
  for (let t = 0; t < seconds - 1e-9; t += dt) stepAttack(s, dt);
}

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

test("the design's numbers: 15 rounds of a minute, the round's pay, the shop, the cap, the arrivals", () => {
  assert.equal(ROUNDS, 15);
  assert.equal(ROUND_TIME, 60);
  assert.equal(roundIncome(1), 150);
  assert.equal(roundIncome(4), 225);
  assert.deepEqual(UNIT_ORDER, ["soldier", "motorcycle", "buggy", "tank", "rocket"]);
  assert.deepEqual(UNIT_PRICES, { soldier: 15, motorcycle: 25, buggy: 35, tank: 90, rocket: 120 });
  assert.equal(UNIT_CAP, 60);
  assert.equal(SPAWN_INTERVAL, 0.5);
  assert.deepEqual(
    ["damage", "range", "armor", "rate", "speed"].map((skill) => [unitUpgradeCost(skill, 0), unitUpgradeCost(skill, 4)]),
    [
      [60, 300],
      [40, 200],
      [60, 300],
      [60, 300],
      [40, 200],
    ],
  );
});

test("an attack begins in preparation: round 1, that round's money already paid, no clock running", () => {
  const s = empty();
  assert.equal(s.mode, "attack");
  assert.equal(s.attack.phase, "prep");
  assert.equal(s.attack.round, 1);
  assert.equal(s.attack.money, 150);
  assert.equal(s.enemies.length, 0);
  run(s, 5);
  assert.equal(s.attack.roundLeft, ROUND_TIME);
  assert.deepEqual(startAttack(s), { ok: true });
  assert.equal(s.attack.phase, "battle");
  run(s, 5);
  assert.ok(Math.abs(s.attack.roundLeft - (ROUND_TIME - 5)) < 1e-6);
  assert.deepEqual(startAttack(s), { ok: false, reason: "already-started" });
});

test("the defence sets up its first towers before the attack, spending its difficulty's money", () => {
  const easy = createAttackState(3, "easy");
  const hard = createAttackState(3, "hard");
  for (const [s, difficulty] of [
    [easy, "easy"],
    [hard, "hard"],
  ]) {
    assert.ok(s.towers.length >= 2);
    assert.ok(s.towers.every((t) => t.buildTimeRemaining === 0));
    assert.ok(s.stats.moneySpent >= DIFFICULTIES[difficulty].startMoney * 0.8);
  }
  assert.ok(hard.stats.moneySpent > easy.stats.moneySpent);
  assert.equal(createAttackState(2, "nonsense", { aiSetup: false }).attack.difficulty, "normal");
});

test("buying in preparation: the price is paid and the units stand along the active entry's road, waiting for orders", () => {
  const s = empty(2);
  assert.deepEqual(buyUnits(s, "soldier", 3), { ok: true, bought: 3 });
  assert.equal(s.attack.money, 150 - 3 * 15);
  assert.equal(s.attack.stats.moneySpent, 45);
  const { entries, graph } = attackMapOf(LEVELS[2]);
  assert.equal(s.enemies.length, 3);
  for (const u of s.enemies) {
    assert.equal(u.type, "soldier");
    assert.equal(u.order, null);
    assert.ok(dist(u, entries[0]) < 150);
    assert.ok(nearestRoadPoint(graph, u.x, u.y).dist < 40); // on the road or its verges
  }
  for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) assert.ok(dist(s.enemies[i], s.enemies[j]) > 15);
});

test("buying more than the money allows buys what it can; with too little, nothing", () => {
  const s = empty(2);
  assert.deepEqual(buyUnits(s, "tank", 5), { ok: true, bought: 1 });
  assert.equal(s.attack.money, 60);
  assert.deepEqual(buyUnits(s, "rocket"), { ok: false, reason: "cant-afford" });
  assert.deepEqual(buyUnits(s, "dragon"), { ok: false, reason: "unknown-type" });
});

test("no more than 60 units, counting the ones still waiting to come in", () => {
  const s = empty(2);
  s.attack.money = 10000;
  assert.equal(buyUnits(s, "soldier", 50).bought, 50);
  startAttack(s);
  assert.equal(buyUnits(s, "soldier", 20).bought, 10);
  assert.equal(s.attack.queue.length, 10);
  assert.deepEqual(buyUnits(s, "soldier"), { ok: false, reason: "cap" });
});

test("a crowded entry: sixty units bought at once in preparation each get their own place on the road", () => {
  const s = empty(2);
  s.attack.money = 10000;
  assert.equal(buyUnits(s, "soldier", 60).bought, 60);
  const { graph } = attackMapOf(LEVELS[2]);
  for (const u of s.enemies) assert.ok(nearestRoadPoint(graph, u.x, u.y).dist < 40);
  for (let i = 0; i < 60; i++) {
    for (let j = i + 1; j < 60; j++) assert.ok(dist(s.enemies[i], s.enemies[j]) > 15, `units ${i} and ${j} on top of each other`);
  }
});

test("units bought during a round come in one by one, half a second apart, at the active entry", () => {
  const s = empty(2);
  startAttack(s);
  assert.deepEqual(setEntry(s, 1), { ok: true });
  buyUnits(s, "buggy", 3);
  stepAttack(s, 0.05);
  assert.equal(s.enemies.length, 1);
  run(s, 0.6);
  assert.equal(s.enemies.length, 2);
  run(s, 0.6);
  assert.equal(s.enemies.length, 3);
  const last = s.enemies[2];
  assert.ok(dist(last, attackMapOf(LEVELS[2]).entries[1]) < 40);
  assert.equal(last.order.kind, "move"); // on its way to its place along the road
});

test("an upgrade costs $60, then $120..., and strengthens every unit of the type, out there or still to come", () => {
  const s = empty();
  s.attack.money = 1000;
  buyUnits(s, "tank", 2);
  const [a] = s.enemies;
  a.hp -= 30;
  assert.deepEqual(upgradeUnitType(s, "tank", "armor"), { ok: true });
  assert.equal(s.attack.money, 1000 - 2 * 90 - 60);
  assert.equal(a.maxHp, Math.round(120 / 0.85));
  assert.equal(a.hp, 90 + Math.round(120 / 0.85) - 120);
  assert.deepEqual(upgradeUnitType(s, "tank", "damage"), { ok: true });
  assert.equal(s.attack.money, 1000 - 2 * 90 - 60 - 60);
  buyUnits(s, "tank");
  const fresh = s.enemies.at(-1);
  assert.equal(fresh.fireDamage, 5 * 1.25);
  assert.equal(fresh.maxHp, Math.round(120 / 0.85));
  assert.equal(fresh.hp, fresh.maxHp);
  assert.equal(a.fireDamage, 5 * 1.25);
  assert.equal(s.attack.stats.moneySpent, 3 * 90 + 60 + 60);
});

test("range, rate and speed upgrades; five levels at most", () => {
  const s = empty();
  s.attack.money = 100000;
  buyUnits(s, "soldier");
  const [u] = s.enemies;
  const speed0 = u.speed;
  for (const skill of ["range", "rate", "speed"]) assert.equal(upgradeUnitType(s, "soldier", skill).ok, true);
  assert.equal(u.fireRange, 90 * 1.15);
  assert.equal(u.fireCooldown, 1.2 * 0.85);
  assert.ok(Math.abs(u.speed - speed0 * 1.06) < 1e-9);
  for (let i = 1; i < 5; i++) upgradeUnitType(s, "soldier", "range");
  assert.deepEqual(upgradeUnitType(s, "soldier", "range"), { ok: false, reason: "maxed" });
  assert.equal(s.attack.upgrades.soldier.range, 5);
  assert.deepEqual(upgradeUnitType(s, "soldier", "flying"), { ok: false, reason: "unknown" });
  s.attack.money = 0;
  assert.deepEqual(upgradeUnitType(s, "soldier", "damage"), { ok: false, reason: "cant-afford" });
});

test("the active entry can be any of the map's entries", () => {
  const s = empty(4);
  assert.deepEqual(setEntry(s, 6), { ok: true });
  assert.equal(s.attack.entry, 6);
  for (const bad of [7, -1, 1.5, "2"]) assert.equal(setEntry(s, bad).ok, false);
});

test("the map's entries are always in sight, the rest starts unexplored, and units see around them", () => {
  const s = empty(3);
  const { entries } = attackMapOf(LEVELS[3]);
  for (const e of entries) assert.ok(isVisible(s.attack.fog, e.x, e.y));
  assert.ok(!isExplored(s.attack.fog, 1024, 1024));
  buyUnits(s, "motorcycle");
  const [u] = s.enemies;
  assert.ok(isVisible(s.attack.fog, u.x + 200, u.y));
});

test("a big purchase parks close to the entry: three abreast along its road", () => {
  const s = empty(2);
  s.attack.money = 10000;
  assert.equal(buyUnits(s, "soldier", 25).bought, 25);
  const [entry] = attackMapOf(LEVELS[2]).entries;
  for (const u of s.enemies) assert.ok(dist(u, entry) < 300, `a soldier parked ${Math.round(dist(u, entry))}px from the entry`);
});
