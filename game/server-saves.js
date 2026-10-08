// Saved games for the co-op game at home: one JSON file on the PC that
// runs server.js -- { auto, 1, 2, 3 } -- so a save outlives restarting the
// server (per user request: restarting it used to lose the match). Each
// write goes to a temporary file first, then renamed into place, so a
// crash mid-write can't leave the file half-written; and writes queue up
// one behind another, so two at once (an autosave and a player's save)
// can't drop each other's slot.
import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import path from "node:path";
import { SAVE_SLOTS, slotListing } from "./js/saves.js";

// Everything in the file, or {} if it's missing or damaged.
export async function readSaveFile(file) {
  try {
    const data = JSON.parse(await readFile(file, "utf-8"));
    return data && typeof data === "object" && !Array.isArray(data) ? data : {};
  } catch {
    return {};
  }
}

let queue = Promise.resolve();

export function writeSaveSlot(file, slot, save) {
  const write = queue.then(async () => {
    const data = await readSaveFile(file);
    data[slot] = save;
    await mkdir(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    await writeFile(tmp, JSON.stringify(data));
    await rename(tmp, file);
  });
  queue = write.catch(() => {});
  return write;
}

// Every slot, as the menu lists them (saves.js's shape).
export async function listSaveFile(file) {
  const data = await readSaveFile(file);
  return SAVE_SLOTS.map((slot) => slotListing(slot, data[slot] ?? null));
}
