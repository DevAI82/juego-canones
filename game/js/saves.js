// Saved games kept in the browser, for solo play (the co-op game at home
// keeps its own on the server's PC: server-saves.js). One localStorage key
// per slot -- the autosave and three manual ones -- so one damaged slot
// can't take the others with it. Every access is guarded: storage can be
// missing or refuse to work (private browsing, blocked site data, full),
// and the game has to carry on without it. `storage` is a parameter so the
// tests can pass a stand-in.
import { browserStorage } from "./util.js";
import { gameSaveSummary } from "./modes.js";

export const SAVE_SLOTS = ["auto", 1, 2, 3];
const KEY_PREFIX = "td_save_";

// Whether this browser will keep a save at all (tried with a real write).
export function canStore(storage = browserStorage()) {
  if (!storage) return false;
  try {
    storage.setItem(`${KEY_PREFIX}probe`, "1");
    storage.removeItem(`${KEY_PREFIX}probe`);
    return true;
  } catch {
    return false;
  }
}

// The save in `slot`, or null: empty, unreadable, or no storage.
export function readSave(slot, storage = browserStorage()) {
  try {
    const raw = storage ? storage.getItem(KEY_PREFIX + slot) : null;
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// Keeps `save` in `slot`; false if the browser wouldn't.
export function writeSave(slot, save, storage = browserStorage()) {
  if (!storage) return false;
  try {
    storage.setItem(KEY_PREFIX + slot, JSON.stringify(save));
    return true;
  } catch {
    return false;
  }
}

// One slot as the menu lists it, from a save already read: status
// "empty", "ok" (with modes.js's gameSaveSummary: a defence or an attack
// save) or "unreadable". Also
// used by server-saves.js for the server's file.
export function slotListing(slot, save) {
  if (save == null) return { slot, status: "empty", summary: null };
  const summary = gameSaveSummary(save);
  return summary ? { slot, status: "ok", summary } : { slot, status: "unreadable", summary: null };
}

// Every slot, as the menu lists them.
export function listSaves(storage = browserStorage()) {
  return SAVE_SLOTS.map((slot) => {
    let raw = null;
    try {
      raw = storage ? storage.getItem(KEY_PREFIX + slot) : null;
    } catch {
      raw = null;
    }
    if (!raw) return slotListing(slot, null);
    try {
      return slotListing(slot, JSON.parse(raw));
    } catch {
      return { slot, status: "unreadable", summary: null };
    }
  });
}
