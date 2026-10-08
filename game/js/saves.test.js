import { test } from "node:test";
import assert from "node:assert/strict";
import { SAVE_SLOTS, canStore, readSave, writeSave, listSaves, slotListing } from "./saves.js";
import { createGameState, createSave } from "./simulate.js";

function fakeStorage() {
  const items = new Map();
  return {
    getItem: (k) => (items.has(k) ? items.get(k) : null),
    setItem: (k, v) => items.set(k, String(v)),
    removeItem: (k) => items.delete(k),
    items,
  };
}
// What a browser that blocks site data (or is out of space) does.
const blocked = {
  getItem() { throw new Error("blocked"); },
  setItem() { throw new Error("blocked"); },
  removeItem() { throw new Error("blocked"); },
};

test("a save written to a slot reads back the same", () => {
  const storage = fakeStorage();
  const save = createSave(createGameState(3));
  assert.equal(writeSave(2, save, storage), true);
  assert.deepEqual(readSave(2, storage), save);
  assert.equal(readSave(1, storage), null);
});

test("the menu's list has every slot, empty, readable or not", () => {
  const storage = fakeStorage();
  writeSave("auto", createSave(createGameState(4)), storage);
  storage.setItem("td_save_1", "{not json");
  storage.setItem("td_save_3", JSON.stringify({ version: 999 }));
  const list = listSaves(storage);
  assert.deepEqual(list.map((e) => e.slot), SAVE_SLOTS);
  assert.deepEqual(list.map((e) => e.status), ["ok", "unreadable", "empty", "unreadable"]);
  assert.equal(list[0].summary.level, 4);
});

test("with storage blocked nothing throws: there's just nothing to list or load, and saving says it failed", () => {
  assert.equal(canStore(blocked), false);
  assert.equal(writeSave(1, createSave(createGameState(1)), blocked), false);
  assert.equal(readSave(1, blocked), null);
  assert.deepEqual(listSaves(blocked).map((e) => e.status), ["empty", "empty", "empty", "empty"]);
  assert.equal(canStore(null), false);
  assert.equal(writeSave(1, {}, null), false);
  assert.deepEqual(listSaves(null).map((e) => e.status), ["empty", "empty", "empty", "empty"]);
  assert.equal(canStore(fakeStorage()), true);
});

test("slotListing describes a save already read (as the server's file holds them)", () => {
  assert.deepEqual(slotListing(1, null), { slot: 1, status: "empty", summary: null });
  assert.equal(slotListing(1, { version: 1, level: "x" }).status, "unreadable");
  assert.equal(slotListing("auto", createSave(createGameState(2))).summary.level, 2);
});
