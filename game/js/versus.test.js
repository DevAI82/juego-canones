import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createSeats,
  sit,
  seen,
  sideOf,
  isConnected,
  freeSides,
  checkGone,
  ready,
  pause,
  resume,
  mayChangeGame,
  swapSides,
  GONE_AFTER,
  otherSide,
} from "./versus.js";
import { createAttackState, stepAttack } from "./attack.js";

// A one-against-the-other game on level 2 with A defending and B attacking,
// both seated at time `t`.
function game(t = 1000) {
  const state = createAttackState(2, "normal", { defender: "player" });
  const seats = createSeats();
  sit(seats, "defense", "A", t);
  sit(seats, "attack", "B", t);
  return { state, seats };
}

test("a tab takes a free side and keeps it; a side taken by a tab still there can't be taken", () => {
  const seats = createSeats();
  assert.deepEqual(freeSides(seats, 0), ["defense", "attack"]);
  assert.deepEqual(sit(seats, "attack", "A", 0), { ok: true });
  assert.equal(sideOf(seats, "A"), "attack");
  assert.deepEqual(freeSides(seats, 0), ["defense"]);
  assert.deepEqual(sit(seats, "attack", "B", 100), { ok: false, reason: "taken" });
  assert.deepEqual(sit(seats, "defense", "A", 100), { ok: false, reason: "already-seated" });
  assert.deepEqual(sit(seats, "attack", "A", 200), { ok: true }); // (its own side again: fine)
  assert.equal(sit(seats, "both", "B", 0).reason, "no-such-side");
  assert.equal(otherSide("attack"), "defense");
  assert.equal(otherSide("defense"), "attack");
});

test("a tab that stops asking for news loses its side after a few seconds; reloaded in time, it keeps it", () => {
  const { seats } = game(0);
  seen(seats, "A", GONE_AFTER - 10);
  assert.equal(isConnected(seats, "defense", GONE_AFTER), true);
  assert.equal(isConnected(seats, "attack", GONE_AFTER + 1), false);
  assert.deepEqual(freeSides(seats, GONE_AFTER + 1), ["attack"]);
  // B's tab comes back (a reload keeps its id): its side again, connected
  seen(seats, "B", GONE_AFTER + 50);
  assert.equal(sideOf(seats, "B"), "attack");
  assert.equal(isConnected(seats, "attack", GONE_AFTER + 60), true);
  // ...or another tab takes the free side once B is gone
  assert.deepEqual(sit(seats, "attack", "C", 3 * GONE_AFTER), { ok: true });
  assert.equal(sideOf(seats, "B"), null);
  assert.equal(sideOf(seats, "C"), "attack");
});

test("the round starts when both sides are ready, not before", () => {
  const { state, seats } = game();
  assert.deepEqual(ready(seats, state, "defense", 1000), { ok: true, started: false });
  assert.equal(state.attack.phase, "prep");
  assert.equal(seats.defense.ready, true);
  assert.deepEqual(ready(seats, state, "attack", 1000), { ok: true, started: true });
  assert.equal(state.attack.phase, "battle");
  assert.equal(seats.defense.ready, false);
  assert.equal(ready(seats, state, "attack", 1000).reason, "already-started");
});

test("ready with nobody on the other side: it waits for them", () => {
  const state = createAttackState(2, "normal", { defender: "player" });
  const seats = createSeats();
  sit(seats, "attack", "A", 0);
  ready(seats, state, "attack", 0);
  assert.equal(ready(seats, state, "attack", 0).started, false);
  sit(seats, "defense", "B", 10);
  assert.equal(ready(seats, state, "defense", 10).started, true);
});

test("either side pauses; only the one who paused resumes -- or the other, once that one has gone", () => {
  const { state, seats } = game(0);
  ready(seats, state, "defense", 0);
  ready(seats, state, "attack", 0);
  assert.deepEqual(pause(seats, state, "attack"), { ok: true });
  assert.equal(state.paused, true);
  assert.equal(seats.pausedBy, "attack");
  assert.deepEqual(pause(seats, state, "defense"), { ok: true }); // already paused: still the attacker's
  assert.equal(seats.pausedBy, "attack");
  assert.deepEqual(resume(seats, state, "defense", 100), { ok: false, reason: "not-yours" });
  assert.equal(state.paused, true);
  assert.deepEqual(resume(seats, state, "attack", 100), { ok: true });
  assert.equal(state.paused, false);
  assert.equal(seats.pausedBy, null);
  pause(seats, state, "attack");
  seen(seats, "A", GONE_AFTER + 500);
  assert.deepEqual(resume(seats, state, "defense", GONE_AFTER + 500), { ok: true });
});

test("a side gone in the middle of a round pauses the game, and the pause is that side's", () => {
  const { state, seats } = game(0);
  ready(seats, state, "defense", 0);
  ready(seats, state, "attack", 0);
  stepAttack(state, 0.5);
  seen(seats, "A", GONE_AFTER);
  assert.deepEqual(checkGone(seats, state, GONE_AFTER), []);
  seen(seats, "A", GONE_AFTER + 100);
  assert.deepEqual(checkGone(seats, state, GONE_AFTER + 100), ["attack"]);
  assert.equal(state.paused, true);
  assert.equal(seats.pausedBy, "attack");
  assert.equal(seats.gone, "attack");
  // B comes back (its tab reloaded): the game waits for B to carry on
  seen(seats, "B", GONE_AFTER + 200);
  assert.deepEqual(checkGone(seats, state, GONE_AFTER + 200), []);
  assert.equal(state.paused, true);
  assert.deepEqual(resume(seats, state, "defense", GONE_AFTER + 200), { ok: false, reason: "not-yours" });
  assert.deepEqual(resume(seats, state, "attack", GONE_AFTER + 200), { ok: true });
  assert.equal(seats.gone, null);
});

test("nothing pauses in the preparation, which has no clock", () => {
  const { state, seats } = game(0);
  assert.deepEqual(checkGone(seats, state, 10 * GONE_AFTER), []);
  assert.equal(state.paused, false);
});

test("while both players are there, only they may change the game; with nobody there, anyone", () => {
  const { seats } = game(0);
  assert.equal(mayChangeGame(seats, "A", 100), true);
  assert.equal(mayChangeGame(seats, "B", 100), true);
  assert.equal(mayChangeGame(seats, "C", 100), false);
  seen(seats, "A", GONE_AFTER + 100);
  assert.equal(mayChangeGame(seats, "C", GONE_AFTER + 100), false); // A is still there
  assert.equal(mayChangeGame(seats, "C", 3 * GONE_AFTER), true);
  assert.equal(mayChangeGame(createSeats(), "C", 0), true);
});

test("a rematch swaps the sides", () => {
  const { seats } = game(0);
  seats.defense.ready = true;
  seats.pausedBy = "defense";
  swapSides(seats);
  assert.equal(sideOf(seats, "A"), "attack");
  assert.equal(sideOf(seats, "B"), "defense");
  assert.equal(seats.defense.ready, false);
  assert.equal(seats.pausedBy, null);
});
