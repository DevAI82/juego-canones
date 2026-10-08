import { test } from "node:test";
import assert from "node:assert/strict";
import { describeSave } from "./menu.js";

test("a save is listed as level, wave, lives, money and when", () => {
  const text = describeSave({ level: 4, wave: 12, lives: 15, money: 320, savedAt: "2026-10-08T18:30:00.000Z" });
  assert.match(text, /^Nivel 4 · Oleada 12 · ❤ 15 · \$320 · \d\d\/\d\d \d\d:\d\d$/);
  assert.equal(describeSave({ level: 1, wave: 1, lives: 20, money: 150, savedAt: null }), "Nivel 1 · Oleada 1 · ❤ 20 · $150");
});
