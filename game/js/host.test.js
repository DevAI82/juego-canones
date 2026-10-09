import { test } from "node:test";
import assert from "node:assert/strict";
import { createHost } from "./host.js";
import { fogFromWire, isVisible } from "./fog.js";
import { GONE_AFTER } from "./versus.js";
import { reachesEntryRoad } from "./entryRoads.js";
import { LEVELS } from "./levels.js";
import { TOWER_TYPES } from "./tower.js";
import { createGameState, createSave } from "./simulate.js";
import { ROUND_TIME } from "./attack.js";

// A host with its saves in memory and a clock the test moves.
function setup(initial = null) {
  const saved = {};
  const writes = [];
  const store = {
    read: async () => JSON.parse(JSON.stringify(saved)),
    write: async (slot, save) => {
      saved[slot] = JSON.parse(JSON.stringify(save));
      writes.push(slot);
    },
  };
  let t = 1000;
  const host = createHost({ store, now: () => t, initial });
  const view = (player, info) => JSON.parse(host.viewJson(player, info));
  const run = (seconds, dt = 0.05) => {
    for (let s = 0; s < seconds - 1e-9; s += dt) {
      t += dt * 1000;
      host.tick(dt);
    }
  };
  return { host, view, run, saved, writes, clock: { get: () => t, set: (v) => (t = v), add: (ms) => (t += ms) } };
}

// A one-against-the-other game on level 2: A defends, B attacks.
async function versus() {
  const s = setup();
  assert.deepEqual(await s.host.act("A", { type: "newVersus", level: 2, side: "defense", money: "normal" }), { ok: true });
  assert.deepEqual(await s.host.act("B", { type: "join", side: "attack" }), { ok: true });
  return s;
}

const freeSlot = (level = 2) => LEVELS[level].buildSlots.find((sl) => !reachesEntryRoad(LEVELS[level], sl.x, sl.y, TOWER_TYPES.basic.range));

test("co-op at home, as before: a defence game anyone can play", async () => {
  const { host, view } = setup();
  const v = view("anyone");
  assert.equal(v.net.kind, "coop");
  assert.equal(v.state.mode, undefined);
  const slot = LEVELS[1].buildSlots[0];
  assert.equal((await host.act("X", { type: "place", towerType: "basic", x: slot.x, y: slot.y })).ok, true);
  assert.equal(view("Z").state.towers.length, 1);
  assert.deepEqual(await host.act("Y", { type: "restart", level: 3 }), { ok: true });
  assert.equal(view("Y").state.level, 3);
  assert.equal((await host.act("Y", { type: "buy", unitType: "soldier" })).reason, "not-your-side");
});

test("one against the other: the creator takes their side, the other tab joins the free one", async () => {
  const { host, view } = setup();
  await host.act("A", { type: "newVersus", level: 2, side: "attack", money: "hard" });
  let a = view("A");
  assert.equal(a.net.kind, "versus");
  assert.equal(a.net.you, "attack");
  assert.equal(a.net.sides.defense.taken, false);
  assert.equal(a.state.attack.defender, "player");
  assert.equal(a.state.economy.money, 450);
  assert.equal(a.state.towers.length, 0);
  const b = view("B");
  assert.equal(b.net.you, null);
  assert.equal(b.net.mayChange, false); // A is playing
  assert.deepEqual(await host.act("B", { type: "join", side: "attack" }), { ok: false, reason: "taken" });
  assert.deepEqual(await host.act("B", { type: "join", side: "defense" }), { ok: true });
  assert.equal(view("B").net.you, "defense");
  a = view("A");
  assert.deepEqual(a.net.sides.defense, { taken: true, connected: true, ready: false });
  assert.equal((await host.act("C", { type: "join", side: "defense" })).reason, "taken");
});

test("each tab acts only for its own side", async () => {
  const { host } = await versus();
  const slot = freeSlot();
  assert.equal((await host.act("B", { type: "place", towerType: "basic", x: slot.x, y: slot.y })).reason, "not-your-side");
  assert.equal((await host.act("A", { type: "buy", unitType: "soldier" })).reason, "not-your-side");
  assert.equal((await host.act("C", { type: "buy", unitType: "soldier" })).reason, "not-your-side");
  assert.equal((await host.act("A", { type: "place", towerType: "basic", x: slot.x, y: slot.y })).ok, true);
  assert.equal((await host.act("A", { type: "skip" })).reason, "wrong-game");
});

test("the attacker buys, upgrades, picks an entry and gives orders", async () => {
  const { host, view } = await versus();
  assert.equal((await host.act("B", { type: "buy", unitType: "soldier", count: 3 })).bought, 3);
  assert.equal((await host.act("B", { type: "upgradeUnit", unitType: "soldier", skill: "damage" })).ok, true);
  assert.equal((await host.act("B", { type: "entry", index: 1 })).ok, true);
  const units = view("B").state.enemies;
  assert.equal(units.length, 3);
  assert.equal(units[0].path, undefined); // routes stay on the server
  const ids = units.map((u) => u.id);
  assert.equal((await host.act("B", { type: "order", kind: "move", ids, x: 457, y: 191 })).ok, true);
  assert.equal((await host.act("B", { type: "order", kind: "enter", ids })).ok, true);
  assert.equal(host.state.enemies[0].order.kind, "enter");
  assert.equal((await host.act("B", { type: "order", kind: "stop", ids })).ok, true);
  assert.equal((await host.act("B", { type: "order", kind: "dance", ids })).reason, "unknown-order");
});

test("both get ready, the round starts, and its clock runs", async () => {
  const { host, view, run } = await versus();
  assert.equal((await host.act("A", { type: "ready" })).started, false);
  assert.equal(view("B").net.sides.defense.ready, true);
  assert.equal((await host.act("B", { type: "ready" })).started, true);
  run(2);
  const v = view("A");
  assert.equal(v.state.attack.phase, "battle");
  assert.ok(v.state.attack.roundLeft < ROUND_TIME - 1.5);
  assert.equal((await host.act("C", { type: "ready" })).reason, "not-seated");
});

test("the attacker's fog arrives in a form the browser turns back into the same fog", async () => {
  const { host, view } = await versus();
  await host.act("B", { type: "buy", unitType: "motorcycle" });
  const wire = view("B").state.attack.fog;
  assert.equal(typeof wire.explored, "string");
  const fog = fogFromWire(wire);
  const u = host.state.enemies[0];
  assert.equal(isVisible(fog, u.x, u.y), true);
  assert.equal(isVisible(fog, u.x, u.y), isVisible(host.state.attack.fog, u.x, u.y));
});

test("an attacker on a phone: the server sends their army in", async () => {
  const { host, view, run } = await versus();
  view("B", { auto: true });
  await host.act("B", { type: "buy", unitType: "soldier", count: 4 });
  await host.act("A", { type: "ready" });
  await host.act("B", { type: "ready" });
  view("A");
  view("B", { auto: true });
  run(0.5);
  assert.ok(host.state.enemies.length > 0);
  assert.ok(host.state.enemies.every((u) => u.order?.kind === "enter"));
});

test("an attacker with the mouse: nothing moves on its own", async () => {
  const { host, view, run } = await versus();
  view("B", { auto: false });
  await host.act("B", { type: "buy", unitType: "soldier", count: 4 });
  await host.act("A", { type: "ready" });
  await host.act("B", { type: "ready" });
  run(0.5);
  assert.ok(host.state.enemies.every((u) => !u.order));
});

test("a player gone mid-round pauses the game, theirs to resume when back", async () => {
  const { host, view, run } = await versus();
  await host.act("A", { type: "ready" });
  await host.act("B", { type: "ready" });
  // A keeps asking for news; B's tab goes quiet
  for (let i = 0; i < 60; i++) {
    view("A");
    run(0.1);
  }
  const a = view("A");
  assert.equal(a.state.paused, true);
  assert.equal(a.net.pausedBy, "attack");
  assert.equal(a.net.gone, "attack");
  assert.equal(a.net.sides.attack.connected, false);
  // B reloads: same id, same side; the game waits for B
  view("B");
  assert.equal((await host.act("A", { type: "pause", on: false })).reason, "not-yours");
  assert.deepEqual(await host.act("B", { type: "pause", on: false }), { ok: true });
  assert.equal(host.state.paused, false);
});

test("either player pauses for both; the menu says which it wants", async () => {
  const { host } = await versus();
  await host.act("A", { type: "ready" });
  await host.act("B", { type: "ready" });
  assert.deepEqual(await host.act("A", { type: "pause" }), { ok: true });
  assert.equal(host.state.paused, true);
  assert.equal((await host.act("B", { type: "pause" })).reason, "not-yours"); // ⏸ again: a resume, not B's
  assert.deepEqual(await host.act("A", { type: "pause", on: true }), { ok: true }); // still paused
  assert.deepEqual(await host.act("A", { type: "pause", on: false }), { ok: true });
  assert.equal(host.state.paused, false);
  assert.equal((await host.act("C", { type: "pause" })).reason, "not-seated");
});

test("autosaves as the preparation and each round start; a save asked for mid-round waits for the next", async () => {
  const { host, run, writes, saved } = await versus();
  run(0.05);
  assert.deepEqual(writes, ["auto"]);
  assert.equal(saved.auto.defender, "player");
  await host.act("A", { type: "ready" });
  await host.act("B", { type: "ready" });
  for (let i = 0; i < 40; i++) {
    host.viewJson("A");
    host.viewJson("B");
    run(0.25);
  }
  assert.deepEqual(await host.act("B", { type: "save", slot: 2 }), { ok: true, queued: true });
  for (let i = 0; i < 220; i++) {
    host.viewJson("A");
    host.viewJson("B");
    run(0.25);
  }
  assert.equal(host.state.attack.round, 2);
  assert.ok(writes.filter((s) => s === "auto").length >= 3);
  assert.equal(saved[2].round, 2);
  assert.equal((await host.act("C", { type: "save", slot: 1 })).reason, "not-seated");
});

test("loading a one-against-the-other save: who was playing keeps their side", async () => {
  const { host, view } = await versus();
  assert.deepEqual(await host.act("B", { type: "save", slot: 1 }), { ok: true, queued: false });
  await host.act("B", { type: "buy", unitType: "tank" });
  assert.deepEqual(await host.act("A", { type: "load", slot: 1 }), { ok: true });
  assert.equal(view("A").net.you, "defense");
  assert.equal(view("B").net.you, "attack");
  assert.equal(host.state.enemies.length, 0);
  assert.equal(host.state.paused, true);
});

test("the server restarted on a one-against-the-other game: both sides free to join", async () => {
  const first = await versus();
  await first.host.act("B", { type: "save", slot: 1 });
  const { restoreGameSave } = await import("./modes.js");
  const { host, view } = setup(restoreGameSave(first.saved[1]));
  const v = view("A");
  assert.equal(v.net.kind, "versus");
  assert.equal(v.net.you, null);
  assert.deepEqual(v.net.sides.defense, { taken: false, connected: false, ready: false });
  assert.equal(v.net.mayChange, true);
  assert.deepEqual(await host.act("B", { type: "join", side: "attack" }), { ok: true });
});

test("a third device can't start or load a game while the players are there; once they've gone, it can", async () => {
  const { host, clock, saved } = await versus();
  saved[3] = createSave(createGameState(1));
  assert.equal((await host.act("C", { type: "restart", level: 1 })).reason, "game-in-progress");
  assert.equal((await host.act("C", { type: "newVersus", level: 1, side: "attack" })).reason, "game-in-progress");
  assert.equal((await host.act("C", { type: "load", slot: 3 })).reason, "game-in-progress");
  clock.add(GONE_AFTER + 1000);
  assert.deepEqual(await host.act("C", { type: "load", slot: 3 }), { ok: true });
  assert.equal(host.state.mode, undefined);
});

test("a rematch: the same map and money, each player on the other side, in preparation", async () => {
  const { host, view } = await versus();
  assert.equal((await host.act("A", { type: "rematch" })).reason, "not-over");
  host.state.gameOver = true;
  host.state.attack.winner = "attacker";
  assert.deepEqual(await host.act("A", { type: "rematch" }), { ok: true });
  const a = view("A");
  assert.equal(a.net.you, "attack");
  assert.equal(view("B").net.you, "defense");
  assert.equal(a.state.level, 2);
  assert.equal(a.state.attack.difficulty, "normal");
  assert.equal(a.state.attack.phase, "prep");
  assert.equal(a.state.gameOver, false);
});

test("an attack against the computer is solo only: its save doesn't load here", async () => {
  const { createAttackState, createAttackSave } = await import("./attack.js");
  const { host, saved } = setup();
  saved[1] = createAttackSave(createAttackState(2, "normal"));
  assert.equal((await host.act("X", { type: "load", slot: 1 })).reason, "solo-only");
});
