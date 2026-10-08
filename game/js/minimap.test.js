import { test } from "node:test";
import assert from "node:assert/strict";
import { minimapRect, minimapToWorld } from "./minimap.js";

test("the minimap sits in the bottom-left corner and maps back onto the whole world", () => {
  const r = minimapRect(2048, 2048, 750);
  assert.ok(r.x < 30 && r.y + r.h > 700, "bottom-left corner of the canvas");
  assert.deepEqual(minimapToWorld(r, r.x, r.y), { x: 0, y: 0 });
  const far = minimapToWorld(r, r.x + r.w, r.y + r.h);
  assert.ok(Math.abs(far.x - 2048) < 1e-6 && Math.abs(far.y - 2048) < 1e-6);
});

test("a click off the minimap isn't a minimap click, but a drag that strays off it sticks to its edge", () => {
  const r = minimapRect(2048, 2048, 750);
  assert.equal(minimapToWorld(r, r.x - 5, r.y + 10), null);
  const clamped = minimapToWorld(r, r.x - 50, r.y + r.h / 2, true);
  assert.equal(clamped.x, 0);
  assert.ok(Math.abs(clamped.y - 1024) < 1e-6);
});
