import { test } from "node:test";
import assert from "node:assert/strict";
import { playBotGame } from "./attackBot.js";
import { attackMapOf, nearestRoadPoint } from "./roadGraph.js";
import { ROUNDS } from "./attack.js";
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
