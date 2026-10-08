import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { readSaveFile, writeSaveSlot, listSaveFile } from "./server-saves.js";
import { createGameState, createSave } from "./js/simulate.js";

async function tempSavesFile() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "td-saves-"));
  return { file: path.join(dir, "data", "saves.json"), cleanup: () => rm(dir, { recursive: true, force: true }) };
}

test("the server keeps each slot's save in its file", async () => {
  const { file, cleanup } = await tempSavesFile();
  try {
    await writeSaveSlot(file, "auto", createSave(createGameState(3)));
    await writeSaveSlot(file, 2, createSave(createGameState(4)));
    const data = await readSaveFile(file);
    assert.equal(data.auto.level, 3);
    assert.equal(data[2].level, 4);
    const list = await listSaveFile(file);
    assert.deepEqual(list.map((e) => [e.slot, e.status]), [["auto", "ok"], [1, "empty"], [2, "ok"], [3, "empty"]]);
  } finally {
    await cleanup();
  }
});

test("two saves made at once both land", async () => {
  const { file, cleanup } = await tempSavesFile();
  try {
    await Promise.all([writeSaveSlot(file, 1, createSave(createGameState(1))), writeSaveSlot(file, 3, createSave(createGameState(2)))]);
    const data = await readSaveFile(file);
    assert.equal(data[1].level, 1);
    assert.equal(data[3].level, 2);
  } finally {
    await cleanup();
  }
});

test("a missing or damaged saves file reads as no saves, without throwing", async () => {
  const { file, cleanup } = await tempSavesFile();
  try {
    assert.deepEqual(await readSaveFile(file), {});
    await writeSaveSlot(file, 1, createSave(createGameState(1)));
    for (const junk of ["{not json", "[1,2]", "null"]) {
      await writeFile(file, junk);
      assert.deepEqual(await readSaveFile(file), {});
      assert.deepEqual((await listSaveFile(file)).map((e) => e.status), ["empty", "empty", "empty", "empty"]);
    }
    await writeFile(file, JSON.stringify({ auto: { version: 1, level: 77 } }));
    assert.equal((await listSaveFile(file))[0].status, "unreadable");
  } finally {
    await cleanup();
  }
});
