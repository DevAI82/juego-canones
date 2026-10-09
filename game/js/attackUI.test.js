import { test } from "node:test";
import assert from "node:assert/strict";
import { shopEntry, upgradeRows, attackHudLines, defenderHudLines, attackSummary, UNIT_NAMES, SKILL_NAMES } from "./attackUI.js";
import { createAttackState, buyUnits, upgradeUnitType, startAttack } from "./attack.js";

function empty(level = 2) {
  const s = createAttackState(level, "normal", { aiSetup: false });
  s.economy.money = 0;
  return s;
}

test("the units' and upgrades' names", () => {
  assert.deepEqual(Object.values(UNIT_NAMES), ["Soldado", "Moto", "Buggy", "Tanque", "Lanzacohetes"]);
  assert.deepEqual(Object.values(SKILL_NAMES), ["Daño", "Alcance", "Blindaje", "Cadencia", "Velocidad"]);
});

test("a shop card shows the price and the type's upgrades, greyed out without the money or at the cap", () => {
  const s = empty();
  assert.deepEqual(shopEntry(s, "tank"), { label: "Tanque $50", stars: 0, disabled: false, title: "Clic: comprar 1 · Mayús + clic: comprar 5" });
  s.attack.money = 40;
  assert.equal(shopEntry(s, "tank").disabled, true);
  assert.equal(shopEntry(s, "tank").title, "No hay dinero suficiente");
  s.attack.money = 10000;
  upgradeUnitType(s, "tank", "armor");
  upgradeUnitType(s, "tank", "damage");
  assert.equal(shopEntry(s, "tank").stars, 2);
  buyUnits(s, "soldier", 60);
  assert.equal(shopEntry(s, "soldier").disabled, true);
  assert.equal(shopEntry(s, "soldier").title, "Tope de 60 unidades");
});

test("the upgrade rows: level, next level's price, maxed and affordable", () => {
  const s = empty();
  s.attack.money = 100;
  const rows = upgradeRows(s, "buggy");
  assert.deepEqual(rows.map((r) => r.skill), ["damage", "range", "armor", "rate", "speed"]);
  assert.deepEqual(rows[0], { skill: "damage", name: "Daño", level: 0, levels: 5, cost: 60, maxed: false, affordable: true });
  s.attack.upgrades.buggy.range = 5;
  s.attack.upgrades.buggy.armor = 2;
  const later = upgradeRows(s, "buggy");
  assert.equal(later[1].maxed, true);
  assert.equal(later[1].cost, null);
  assert.equal(later[1].affordable, false);
  assert.equal(later[2].cost, 180);
  assert.equal(later[2].affordable, false);
});

test("the HUD: the round and its clock (or the preparation), the base's lives, the money, the army", () => {
  const s = empty(3);
  buyUnits(s, "soldier", 2);
  assert.deepEqual(attackHudLines(s), ["Nivel 3 · Preparación", "Base: ❤ 20", "$230", "Unidades 2/60"]);
  startAttack(s);
  buyUnits(s, "soldier");
  s.attack.round = 4;
  s.attack.roundLeft = 42.3;
  s.attack.money = 87.5;
  assert.deepEqual(attackHudLines(s), ["Nivel 3 · Ronda 4/15 · 0:43", "Base: ❤ 20", "$87", "Unidades 3/60"]);
});

test("the end screen says who won and how it went", () => {
  const s = empty();
  s.attack.winner = "attacker";
  s.attack.round = 9;
  s.attack.stats.livesTaken = 20;
  s.attack.stats.moneySpent = 1234.5;
  s.stats.towersLost = 7;
  s.stats.kills.soldier = 30;
  s.stats.kills.tank = 2;
  assert.deepEqual(attackSummary(s), {
    title: "¡BASE DESTRUIDA!",
    subtitle: "Has ganado",
    rows: [
      ["Ronda alcanzada", "9/15"],
      ["Vidas quitadas a la base", "20"],
      ["Torres destruidas", "7"],
      ["Unidades perdidas", "32"],
      ["Dinero gastado", "$1235"],
      ["Dificultad", "Normal"],
    ],
  });
  s.attack.winner = "defense";
  assert.equal(attackSummary(s).title, "LA BASE HA RESISTIDO");
  assert.equal(attackSummary(s).subtitle, "Has perdido");
});

// One against the other (docs/2026-10-09-uno-contra-otro-design.md).
test("the defender's HUD: the round and its clock, the base's lives, the defence's money, the enemy army", () => {
  const s = createAttackState(3, "hard", { defender: "player" });
  buyUnits(s, "soldier", 2);
  assert.deepEqual(defenderHudLines(s), ["Nivel 3 · Preparación", "Base: ❤ 20", "$450", "Ejército enemigo 2/60"]);
  startAttack(s);
  s.attack.round = 4;
  s.attack.roundLeft = 42.2;
  s.economy.money = 87.6;
  assert.deepEqual(defenderHudLines(s), ["Nivel 3 · Ronda 4/15 · 0:43", "Base: ❤ 20", "$87", "Ejército enemigo 2/60"]);
});

test("the end screen of a game one against the other: each player reads their own result", () => {
  const s = createAttackState(2, "easy", { defender: "player" });
  s.attack.winner = "defense";
  const attacker = attackSummary(s, "attack");
  const defender = attackSummary(s, "defense");
  assert.equal(attacker.title, "LA BASE HA RESISTIDO");
  assert.equal(attacker.subtitle, "Has perdido");
  assert.equal(defender.title, "LA BASE HA RESISTIDO");
  assert.equal(defender.subtitle, "Has ganado");
  assert.deepEqual(defender.rows.at(-1), ["Dinero de la defensa", "Poco"]);
  s.attack.winner = "attacker";
  assert.equal(attackSummary(s, "defense").subtitle, "Has perdido");
  assert.equal(attackSummary(s, "attack").subtitle, "Has ganado");
});
