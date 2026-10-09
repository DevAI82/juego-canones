import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { startServer } from "./server.js";

// A real server on a spare port, its saves in a temporary folder -- never
// the family's on 8420.
async function withServer(run) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "td-server-"));
  const server = await startServer({ port: 0, dataDir: dir, log: () => {} });
  const base = `http://127.0.0.1:${server.port}`;
  const state = async (player, auto) => (await fetch(`${base}/api/state?player=${player}${auto == null ? "" : `&auto=${auto}`}`)).json();
  const act = async (player, body) =>
    (await fetch(`${base}/api/action`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ player, ...body }) })).json();
  try {
    await run({ base, state, act });
  } finally {
    await server.close();
    await rm(dir, { recursive: true, force: true });
  }
}

test("two tabs play one against the other through the server", async () => {
  await withServer(async ({ state, act }) => {
    assert.equal((await state("A")).net.kind, "coop");
    assert.deepEqual(await act("A", { type: "newVersus", level: 2, side: "defense", money: "normal" }), { ok: true });
    assert.equal((await state("A")).net.you, "defense");
    assert.equal((await state("B")).net.you, null);
    assert.deepEqual(await act("B", { type: "join", side: "attack" }), { ok: true });
    assert.equal((await act("B", { type: "buy", unitType: "soldier", count: 2 })).bought, 2);
    assert.equal((await act("B", { type: "place", towerType: "basic", x: 300, y: 300 })).reason, "not-your-side");
    await act("A", { type: "ready" });
    assert.equal((await act("B", { type: "ready" })).started, true);
    await new Promise((r) => setTimeout(r, 300));
    const v = await state("B");
    assert.equal(v.state.attack.phase, "battle");
    assert.ok(v.state.attack.roundLeft < 60);
    assert.equal(typeof v.state.attack.fog.explored, "string");
    assert.equal(v.state.enemies.length, 2);
  });
});

test("the server still serves the game and its saves list, and turns down nonsense", async () => {
  await withServer(async ({ base, act }) => {
    const page = await fetch(`${base}/`);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /<canvas/);
    assert.equal((await fetch(`${base}/js/host.js`)).headers.get("cache-control"), "no-store");
    const saves = await (await fetch(`${base}/api/saves`)).json();
    assert.deepEqual(saves.map((e) => e.slot), ["auto", 1, 2, 3]);
    assert.equal((await act("A", { type: "fly" })).reason, "unknown-action");
    const bad = await (await fetch(`${base}/api/action`, { method: "POST", body: "{not json" })).json();
    assert.equal(bad.reason, "bad-request");
  });
});
