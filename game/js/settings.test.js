import { test } from "node:test";
import assert from "node:assert/strict";
import { loadSettings, saveSettings } from "./settings.js";

function fakeStorage() {
  const items = new Map();
  return { getItem: (k) => (items.has(k) ? items.get(k) : null), setItem: (k, v) => items.set(k, String(v)), removeItem: (k) => items.delete(k) };
}

test("music and effects are on until switched off, and stay as they were left", () => {
  const storage = fakeStorage();
  assert.deepEqual(loadSettings(storage), { music: true, effects: true, controls: "auto" });
  assert.equal(saveSettings({ music: false, effects: true }, storage), true);
  assert.deepEqual(loadSettings(storage), { music: false, effects: true, controls: "auto" });
});

test("damaged or unavailable settings fall back to everything on", () => {
  const storage = fakeStorage();
  storage.setItem("td_settings", "{oops");
  assert.deepEqual(loadSettings(storage), { music: true, effects: true, controls: "auto" });
  storage.setItem("td_settings", "null");
  assert.deepEqual(loadSettings(storage), { music: true, effects: true, controls: "auto" });
  assert.deepEqual(loadSettings(null), { music: true, effects: true, controls: "auto" });
  assert.equal(saveSettings({ music: false, effects: false }, null), false);
});

test("the controls are «auto» until chosen, and only the known choices stick", () => {
  const storage = fakeStorage();
  saveSettings({ music: true, effects: true, controls: "mouse" }, storage);
  assert.equal(loadSettings(storage).controls, "mouse");
  saveSettings({ music: true, effects: true, controls: "joystick" }, storage);
  assert.equal(loadSettings(storage).controls, "auto");
});
