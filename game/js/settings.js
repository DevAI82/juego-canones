// Sound settings, per user request: music and sound effects switched on
// and off separately (the 🔊 button still mutes everything at once).
// Remembered in this browser -- each device keeps its own.
import { browserStorage } from "./util.js";

const KEY = "td_settings";

export function loadSettings(storage = browserStorage()) {
  try {
    const saved = JSON.parse((storage && storage.getItem(KEY)) || "{}");
    return { music: saved.music !== false, effects: saved.effects !== false };
  } catch {
    return { music: true, effects: true };
  }
}

export function saveSettings(settings, storage = browserStorage()) {
  if (!storage) return false;
  try {
    storage.setItem(KEY, JSON.stringify({ music: Boolean(settings.music), effects: Boolean(settings.effects) }));
    return true;
  } catch {
    return false;
  }
}
