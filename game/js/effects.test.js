import { test } from "node:test";
import assert from "node:assert/strict";
import { createEffects, stepEffects, hitFlash } from "./effects.js";

const view = (over = {}) => ({ enemies: [], towers: [], projectiles: [], beams: [], explosions: [], ...over });
const tank = (over = {}) => ({ id: 1, type: "tank", x: 100, y: 100, angle: 0, hp: 120, maxHp: 120, ...over });

test("a destroyed vehicle leaves a scorch mark and a burnt-out wreck; a soldier only the scorch", () => {
  const fx = createEffects();
  stepEffects(fx, view({ explosions: [{ id: 7, x: 50, y: 60, kind: "tank", angle: 1 }] }), 0.016);
  assert.deepEqual(fx.decals.map((d) => d.kind).sort(), ["scorch", "wreck"]);
  const wreck = fx.decals.find((d) => d.kind === "wreck");
  assert.equal(wreck.type, "tank");
  assert.equal(wreck.angle, 1);

  const fx2 = createEffects();
  stepEffects(fx2, view({ explosions: [{ id: 8, x: 50, y: 60, kind: "soldier", angle: 0 }] }), 0.016);
  assert.deepEqual(fx2.decals.map((d) => d.kind), ["scorch"]);
});

test("each explosion is only set off once, however many frames it stays on screen", () => {
  const fx = createEffects();
  const ex = { id: 3, x: 0, y: 0, kind: "buggy", angle: 0 };
  for (let i = 0; i < 10; i++) stepEffects(fx, view({ explosions: [ex] }), 0.016);
  assert.equal(fx.decals.filter((d) => d.kind === "wreck").length, 1);
});

test("a unit flashes white when its hp drops, and the flash dies away", () => {
  const fx = createEffects();
  stepEffects(fx, view({ enemies: [tank()] }), 0.016);
  assert.equal(hitFlash(fx, 1), 0);
  stepEffects(fx, view({ enemies: [tank({ hp: 100 })] }), 0.016);
  assert.ok(hitFlash(fx, 1) > 0.5);
  for (let i = 0; i < 10; i++) stepEffects(fx, view({ enemies: [tank({ hp: 100 })] }), 0.016);
  assert.equal(hitFlash(fx, 1), 0);
});

test("vehicles leave wheel/track marks only while they move", () => {
  const fx = createEffects();
  for (let i = 0; i < 30; i++) stepEffects(fx, view({ enemies: [tank()] }), 0.016);
  assert.equal(fx.decals.length, 0, "a parked tank leaves no tracks");
  for (let i = 0; i < 30; i++) stepEffects(fx, view({ enemies: [tank({ x: 100 + i * 2 })] }), 0.016);
  assert.ok(fx.decals.some((d) => d.kind === "track"));
});

test("a badly damaged vehicle smokes, a healthy one doesn't", () => {
  const healthy = createEffects();
  const hurt = createEffects();
  for (let i = 0; i < 60; i++) {
    stepEffects(healthy, view({ enemies: [tank()] }), 0.016);
    stepEffects(hurt, view({ enemies: [tank({ hp: 20 })] }), 0.016);
  }
  assert.equal(healthy.particles.filter((p) => p.kind === "smoke").length, 0);
  assert.ok(hurt.particles.filter((p) => p.kind === "smoke").length > 2);
});

test("however much blows up at once, the effects stay within their caps", () => {
  const fx = createEffects();
  const explosions = Array.from({ length: 300 }, (_, i) => ({ id: i, x: i, y: i, kind: "rocket", angle: 0 }));
  stepEffects(fx, view({ explosions }), 0.016);
  assert.ok(fx.particles.length <= 700);
  assert.ok(fx.decals.length <= 1400);
});
