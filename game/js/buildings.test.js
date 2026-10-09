import { test } from "node:test";
import assert from "node:assert/strict";
import { BUILDING_TYPES, BUILDING_ORDER, constructionFrame, buildingProgress, PHASE_COUNT, FINAL_CROSSFADE } from "./buildings.js";

test("six support buildings, each with its finished picture and its construction sheet", () => {
  assert.deepEqual(BUILDING_ORDER, ["solar", "wind", "refinery", "barracks", "factory", "lab"]);
  for (const key of BUILDING_ORDER) {
    const t = BUILDING_TYPES[key];
    assert.ok(t.name.length > 3);
    assert.equal(t.sprite, `assets/building_${key}.webp`);
    assert.equal(t.sheet, `assets/building_${key}_build.webp`);
    assert.ok(t.buildTime > 0);
  }
  assert.equal(PHASE_COUNT, 4);
});

test("how far along a building is: none of it when just started, all of it when done", () => {
  assert.equal(buildingProgress({ type: "solar", buildTimeRemaining: BUILDING_TYPES.solar.buildTime }), 0);
  assert.equal(buildingProgress({ type: "solar", buildTimeRemaining: BUILDING_TYPES.solar.buildTime / 4 }), 0.75);
  assert.equal(buildingProgress({ type: "solar", buildTimeRemaining: 0 }), 1);
  assert.equal(buildingProgress({ type: "solar" }), 1);
  assert.equal(buildingProgress({ type: "solar", buildTimeRemaining: -3 }), 1);
});

// constructionFrame(progress) -> { from, to, mix }: draw phase `from`, and
// phase `to` over it at `mix` (phase 4 is the finished building).
test("the four phases come one after another, each fading into the next", () => {
  const seg = (1 - FINAL_CROSSFADE) / PHASE_COUNT;
  assert.deepEqual(constructionFrame(0), { from: 0, to: 0, mix: 0 });
  assert.deepEqual(constructionFrame(seg * 0.5), { from: 0, to: 0, mix: 0 });
  const fading = constructionFrame(seg * 0.9);
  assert.equal(fading.from, 0);
  assert.equal(fading.to, 1);
  assert.ok(fading.mix > 0 && fading.mix < 1);
  assert.deepEqual(constructionFrame(seg * 1.5), { from: 1, to: 1, mix: 0 });
  assert.deepEqual(constructionFrame(seg * 2.5), { from: 2, to: 2, mix: 0 });
  assert.deepEqual(constructionFrame(seg * 3.5), { from: 3, to: 3, mix: 0 });
});

test("the last phase holds until the end, then crossfades into the finished building", () => {
  assert.deepEqual(constructionFrame(1 - FINAL_CROSSFADE), { from: 3, to: 4, mix: 0 });
  const half = constructionFrame(1 - FINAL_CROSSFADE / 2);
  assert.equal(half.from, 3);
  assert.equal(half.to, 4);
  assert.ok(Math.abs(half.mix - 0.5) < 1e-9);
  assert.deepEqual(constructionFrame(1), { from: 4, to: 4, mix: 0 });
  assert.deepEqual(constructionFrame(1.5), { from: 4, to: 4, mix: 0 });
  assert.deepEqual(constructionFrame(-1), { from: 0, to: 0, mix: 0 });
});

test("the picture only ever moves forward as the work goes on", () => {
  let last = -1;
  for (let p = 0; p <= 1.0001; p += 0.001) {
    const f = constructionFrame(p);
    const at = f.from + (f.to - f.from) * f.mix;
    assert.ok(at >= last - 1e-9, `at ${p.toFixed(3)}`);
    last = at;
  }
});
