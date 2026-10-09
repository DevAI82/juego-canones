// Sound settings, per user request: music and sound effects switched on
// and off separately (the 🔊 button still mutes everything at once). And
// the attack mode's controls (inputMode.js): «auto» by the device, or
// forced to the phone's automatic army or the PC's mouse.
// Remembered in this browser -- each device keeps its own.
import { browserStorage } from "./util.js";
import { CONTROL_SETTINGS } from "./inputMode.js";

const KEY = "td_settings";

export function loadSettings(storage = browserStorage()) {
  try {
    const saved = JSON.parse((storage && storage.getItem(KEY)) || "{}");
    const controls = CONTROL_SETTINGS.includes(saved.controls) ? saved.controls : "auto";
    return { music: saved.music !== false, effects: saved.effects !== false, controls };
  } catch {
    return { music: true, effects: true, controls: "auto" };
  }
}

export function saveSettings(settings, storage = browserStorage()) {
  if (!storage) return false;
  try {
    const controls = CONTROL_SETTINGS.includes(settings.controls) ? settings.controls : "auto";
    storage.setItem(KEY, JSON.stringify({ music: Boolean(settings.music), effects: Boolean(settings.effects), controls }));
    return true;
  } catch {
    return false;
  }
}
