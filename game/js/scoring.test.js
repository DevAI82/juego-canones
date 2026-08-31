import { test } from "node:test";
import assert from "node:assert/strict";
import { computeScore, computeScoreBreakdown, wavesCleared, KILL_POINTS } from "./scoring.js";
import { createGameState } from "./simulate.js";
import { WAVES } from "./waves.js";

function stateWithKills(kills) {
  const s = createGameState();
  Object.assign(s.stats.kills, kills);
  return s;
}

test("wavesCleared is waveIndex on a loss, WAVES.length on a win", () => {
  const loss = createGameState();
  loss.waveIndex = 7;
  assert.equal(wavesCleared(loss), 7);

  const win = createGameState();
  win.win = true;
  assert.equal(wavesCleared(win), WAVES.length);
});

test("computeScore applies the per-type kill points from the user's request", () => {
  const s = stateWithKills({ soldier: 10, motorcycle: 5, buggy: 3, tank: 2, rocket: 1 });
  const expectedKillPoints = 10 * KILL_POINTS.soldier + 5 * KILL_POINTS.motorcycle + 3 * KILL_POINTS.buggy + 2 * KILL_POINTS.tank + 1 * KILL_POINTS.rocket;
  const breakdown = computeScoreBreakdown(s);
  const killSubtotal = breakdown.rows.slice(0, 5).reduce((sum, r) => sum + r.subtotal, 0);
  assert.equal(killSubtotal, expectedKillPoints);
});

test("computeScore subtracts a penalty for towers lost and never goes negative", () => {
  const s = createGameState();
  s.stats.towersLost = 50; // way more than any wave/life/kill bonus could offset
  assert.equal(computeScore(s), 0);
});

test("computeScoreBreakdown rows sum to the same total computeScore returns", () => {
  const s = stateWithKills({ soldier: 4, buggy: 2 });
  s.waveIndex = 3;
  s.economy.lives = 15;
  s.stats.towersLost = 1;
  const { rows, total } = computeScoreBreakdown(s);
  const sum = rows.reduce((acc, r) => acc + r.subtotal, 0);
  assert.equal(total, sum);
  assert.equal(total, computeScore(s));
});
