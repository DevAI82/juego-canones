import { test } from "node:test";
import assert from "node:assert/strict";
import { loadSettings, saveSettings } from "./settings.js";

function fakeStorage() {
  const items = new Map();
  return { getItem: (k) => (items.has(k) ? items.get(k) : null), setItem: (k, v) => items.set(k, String(v)), removeItem: (k) => items.delete(k) };
}

test("music and effects are on until switched off, and stay as they were left", () => {
  const storage = fakeStorage();
  assert.deepEqual(loadSettings(storage), { music: true, effects: true });
  assert.equal(saveSettings({ music: false, effects: true }, storage), true);
  assert.deepEqual(loadSettings(storage), { music: false, effects: true });
});

test("damaged or unavailable settings fall back to everything on", () => {
  const storage = fakeStorage();
  storage.setItem("td_settings", "{oops");
  assert.deepEqual(loadSettings(storage), { music: true, effects: true });
  storage.setItem("td_settings", "null");
  assert.deepEqual(loadSettings(storage), { music: true, effects: true });
  assert.deepEqual(loadSettings(null), { music: true, effects: true });
  assert.equal(saveSettings({ music: false, effects: false }, null), false);
});
