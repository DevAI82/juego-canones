import { test } from "node:test";
import assert from "node:assert/strict";
import { statsBoardRows, formatCount } from "./statsBoard.js";
import { createGameState } from "./simulate.js";
import { createAttackState } from "./attack.js";

test("big numbers read the Spanish way", () => {
  assert.equal(formatCount(328643), "328.643");
  assert.equal(formatCount(57), "57");
  assert.equal(formatCount(1234.6), "1.235");
});

test("a defence game's board: towers built, enemies down, money spent, lives left, wave reached", () => {
  const s = createGameState(3);
  s.stats.towersBuilt = 7;
  s.stats.kills.soldier = 120;
  s.stats.kills.tank = 8;
  s.stats.moneySpent = 2450;
  s.economy.lives = 14;
  s.economy.wave = 12;
  assert.deepEqual(statsBoardRows(s), [
    { label: "Torres construidas", value: "7" },
    { label: "Enemigos abatidos", value: "128" },
    { label: "Dinero gastado", value: "$2.450" },
    { label: "Vidas restantes", value: "14" },
    { label: "Oleada · nivel 3", value: "12/40" },
  ]);
});

test("an attack's board: towers destroyed, units lost, money spent, the base's lives, round reached", () => {
  const s = createAttackState(2, "normal", { aiSetup: false });
  s.stats.towersLost = 3;
  s.stats.kills.buggy = 5;
  s.attack.stats.moneySpent = 870.4;
  s.economy.lives = 9;
  s.attack.round = 6;
  assert.deepEqual(statsBoardRows(s), [
    { label: "Torres destruidas", value: "3" },
    { label: "Unidades perdidas", value: "5" },
    { label: "Dinero gastado", value: "$870" },
    { label: "Vidas de la base", value: "9" },
    { label: "Ronda · nivel 2", value: "6/15" },
  ]);
});
