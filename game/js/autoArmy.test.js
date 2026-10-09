import { test } from "node:test";
import assert from "node:assert/strict";
import { createAttackState, buyUnits, startAttack, stepAttack, setEntry, ROUND_TIME } from "./attack.js";
import { botRound, safestEntry } from "./attackBot.js";
import { createAutoArmy } from "./autoArmy.js";

test("the automatic army gathers at the least defended entry and goes in when the round starts", () => {
  const s = createAttackState(2, "normal");
  const auto = createAutoArmy();
  setEntry(s, safestEntry(s) === 0 ? 1 : 0); // start at the other entry (level 2 has two)
  auto.step(s);
  assert.equal(s.attack.entry, safestEntry(s));
  buyUnits(s, "soldier", 5);
  auto.step(s);
  assert.ok(s.enemies.every((u) => !u.order), "nobody moves during the preparation");
  startAttack(s);
  stepAttack(s, 0.1);
  auto.step(s);
  assert.ok(s.enemies.filter((u) => u.alive).every((u) => u.order?.kind === "enter"));
});

test("units bought during a round wait for the next one, unless the group is already big", () => {
  const s = createAttackState(2, "easy");
  const auto = createAutoArmy();
  startAttack(s);
  stepAttack(s, 0.1);
  auto.step(s);
  s.attack.money = 30;
  buyUnits(s, "soldier", 3);
  for (let t = 0; t < 5; t += 0.1) {
    stepAttack(s, 0.1);
    auto.step(s);
  }
  const fresh = s.enemies.filter((u) => u.alive);
  assert.ok(fresh.length > 0 && fresh.every((u) => !u.order), "they wait at the entry");
  for (let t = 0; t < ROUND_TIME; t += 0.1) {
    stepAttack(s, 0.1);
    auto.step(s);
  }
  assert.ok(s.attack.round >= 2);
  assert.ok(s.enemies.filter((u) => u.alive).every((u) => u.order?.kind === "enter"), "and go in with the next round");
});

test("with the bot's shopping, the automatic army wins most games on Easy", () => {
  let wins = 0;
  const games = 6;
  for (let i = 0; i < games; i++) {
    const s = createAttackState(2, "easy");
    const auto = createAutoArmy();
    botRound(s);
    auto.step(s);
    startAttack(s);
    while (!s.gameOver) {
      stepAttack(s, 0.1);
      if (s.attack.roundJustStarted) botRound(s);
      auto.step(s);
    }
    if (s.attack.winner === "attacker") wins++;
  }
  assert.ok(wins >= games / 2, `won ${wins}/${games}`);
});
