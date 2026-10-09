import { test } from "node:test";
import assert from "node:assert/strict";
import { playBotGame, botRound, sendIn, GROUP_SIZE } from "./attackBot.js";
import { attackMapOf, nearestRoadPoint } from "./roadGraph.js";
import { ROUNDS, createAttackState } from "./attack.js";
import { LEVELS } from "./levels.js";

test("whole attack games play out on every map: the army keeps to the roads and the game ends with a winner", () => {
  for (const level of [1, 2, 3, 4]) {
    const { graph } = attackMapOf(LEVELS[level]);
    let ticks = 0;
    let worst = 0;
    const s = playBotGame(level, "normal", {
      onTick(state) {
        if (++ticks % 20) return;
        for (const u of state.enemies) {
          assert.ok(Number.isFinite(u.x) && Number.isFinite(u.y));
          assert.ok(u.x >= 0 && u.y >= 0 && u.x <= LEVELS[level].worldWidth && u.y <= LEVELS[level].worldHeight);
          worst = Math.max(worst, nearestRoadPoint(graph, u.x, u.y).dist);
        }
      },
    });
    assert.equal(s.gameOver, true);
    assert.ok(["attacker", "defense"].includes(s.attack.winner));
    assert.ok(s.attack.round <= ROUNDS);
    // Within the driving model's reach of the road: a stop or lane up to
    // ~20 px to one side, plus up to 40 px swerving round other units
    // (enemy.js's MAX_SHIFT), plus crowd shoves.
    assert.ok(worst < 75, `level ${level}: a unit ${Math.round(worst)}px off the road`);
    assert.ok(s.attack.stats.moneySpent > 0 && s.stats.towersBuilt > 0);
  }
});

test("the bot gathers its army at one entry and sends it in together", () => {
  const s = createAttackState(2, "normal", { aiSetup: false });
  s.economy.money = 0;
  s.attack.money = 1000;
  botRound(s);
  assert.ok(s.enemies.length >= GROUP_SIZE);
  sendIn(s);
  const going = s.enemies.filter((u) => u.order?.kind === "enter").length;
  assert.equal(going, s.enemies.length);
  const t = createAttackState(2, "normal", { aiSetup: false });
  t.attack.money = 60; // a few soldiers: not a group yet
  botRound(t);
  sendIn(t);
  assert.ok(t.enemies.length > 0 && t.enemies.every((u) => !u.order));
});
