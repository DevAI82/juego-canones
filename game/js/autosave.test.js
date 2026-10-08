import { test } from "node:test";
import assert from "node:assert/strict";
import { createSaveScheduler } from "./autosave.js";
import { createGameState, stepSimulation } from "./simulate.js";

function recorder() {
  const writes = [];
  const write = (slot, save) => {
    writes.push({ slot, level: save.level, waveIndex: save.waveIndex });
    return true;
  };
  return { writes, write };
}

// Plays level 1 on, ticking the scheduler before each step as main.js and
// server.js do, wiping out every enemy as soon as it appears so waves end
// quickly, until `until(state)` holds.
function play(s, scheduler, until) {
  for (let i = 0; i < 20000 && !until(s); i++) {
    scheduler.tick(s);
    for (const e of s.enemies) e.alive = false;
    stepSimulation(s, 0.05);
  }
}
const countdownTo = (wave) => (s) => s.waveIndex === wave - 1 && s.interWaveTimer > 0;

test("the autosave is written when a level begins and once when each wave ends -- not on every tick of the countdown", () => {
  const { writes, write } = recorder();
  const saves = createSaveScheduler(write);
  const s = createGameState(1);
  play(s, saves, countdownTo(3));
  for (let i = 0; i < 20; i++) saves.tick(s); // the countdown ticking on
  assert.deepEqual(writes.map((w) => [w.slot, w.waveIndex]), [["auto", 0], ["auto", 1], ["auto", 2]]);
});

test("a save asked for mid-wave is written as soon as the wave is over", () => {
  const { writes, write } = recorder();
  const saves = createSaveScheduler(write);
  const s = createGameState(1);
  saves.tick(s);
  stepSimulation(s, 0.05); // wave 1 under way
  assert.deepEqual(saves.request(2, s), { done: false });
  const written = [];
  for (let i = 0; i < 20000 && !written.length; i++) {
    saves.tick(s, (slot, result) => written.push([slot, result]));
    for (const e of s.enemies) e.alive = false;
    stepSimulation(s, 0.05);
  }
  assert.deepEqual(written, [[2, true]]);
  assert.ok(writes.some((w) => w.slot === 2 && w.waveIndex === 1));
});

test("a save asked for between waves is written at once", () => {
  const { writes, write } = recorder();
  const saves = createSaveScheduler(write);
  const s = createGameState(1);
  assert.deepEqual(saves.request(1, s), { done: true, result: true });
  assert.deepEqual(writes, [{ slot: 1, level: 1, waveIndex: 0 }]);
});

test("losing doesn't touch the autosave: «Continuar» goes back to the last wave won", () => {
  const { writes, write } = recorder();
  const saves = createSaveScheduler(write);
  const s = createGameState(1);
  play(s, saves, countdownTo(2));
  const before = writes.length;
  s.gameOver = true;
  s.enemies = [];
  for (let i = 0; i < 10; i++) saves.tick(s);
  assert.equal(writes.length, before);
});

test("a game just loaded is autosaved straight away unless it's said to be saved already", () => {
  const { writes, write } = recorder();
  const saves = createSaveScheduler(write);
  const s = createGameState(2);
  saves.reset(s, { saved: true });
  saves.tick(s);
  assert.equal(writes.length, 0);
  saves.reset(s);
  saves.tick(s);
  assert.deepEqual(writes, [{ slot: "auto", level: 2, waveIndex: 0 }]);
});
