import { test } from "node:test";
import assert from "node:assert/strict";
import { SPRITE_UNITS, directionFrame, turnToward, createUnitVisuals, hullFrame, frameRect, drawSize, muzzleOffset } from "./unitSprites.js";

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} is not ${b}`);

test("a heading picks the nearest of the rendered directions, clockwise from facing right", () => {
  assert.equal(directionFrame(0, 32).index, 0);
  assert.equal(directionFrame(Math.PI / 2, 32).index, 8);
  assert.equal(directionFrame(-Math.PI / 2, 32).index, 24);
  assert.equal(directionFrame(Math.PI, 32).index, 16);
  assert.equal(directionFrame(2 * Math.PI - 0.01, 32).index, 0);
});

test("what a heading is off its rendered direction comes back as the rest, to turn the picture by", () => {
  const step = (2 * Math.PI) / 32;
  near(directionFrame(step * 3 + 0.04, 32).rest, 0.04);
  near(directionFrame(step * 3 - 0.04, 32).rest, -0.04);
  assert.ok(Math.abs(directionFrame(1.234, 32).rest) <= step / 2 + 1e-9);
});

test("turning toward an angle goes the short way round and no further than the step", () => {
  near(turnToward(0, 1, 0.25), 0.25);
  near(turnToward(0, 0.1, 0.25), 0.1);
  near(turnToward(3.1, -3.1, 0.05), 3.15); // across the back, not all the way round
  near(turnToward(-3.1, 3.1, 0.05), -3.15);
});

const tank = (over = {}) => ({ id: 7, type: "tank", x: 100, y: 100, angle: 0, fireTimer: 2, ...over });

test("a unit's wheels roll by what it has moved, and stand still when it does", () => {
  const visuals = createUnitVisuals();
  const u = tank();
  const first = visuals.update(u, 0.016).roll;
  u.x += 3;
  assert.equal(visuals.update(u, 0.016).roll, first + 3);
  assert.equal(visuals.update(u, 0.016).roll, first + 3);
});

test("a unit that jumps across the map (a reload, a new game) doesn't spin its wheels", () => {
  const visuals = createUnitVisuals();
  const u = tank();
  const first = visuals.update(u, 0.016).roll;
  u.x += 600;
  assert.equal(visuals.update(u, 0.016).roll, first);
});

test("the hull follows the unit's heading smoothly instead of snapping to it", () => {
  const visuals = createUnitVisuals();
  const u = tank();
  visuals.update(u, 0.016);
  u.angle = Math.PI / 2;
  const v = visuals.update(u, 0.1);
  assert.ok(v.heading > 0 && v.heading < Math.PI / 2, `heading ${v.heading}`);
  for (let i = 0; i < 30; i++) visuals.update(u, 0.1);
  near(visuals.update(u, 0.1).heading, Math.PI / 2);
});

test("the turret turns toward what the unit aims at, and back to the front when it aims at nothing", () => {
  const visuals = createUnitVisuals();
  const u = tank();
  visuals.update(u, 0.016);
  const target = { x: 100, y: 300 }; // straight down the screen: a quarter turn
  const v = visuals.update(u, 0.1, target);
  assert.ok(v.turret > 0 && v.turret < Math.PI / 2, `turret ${v.turret}`);
  near(v.heading, 0); // the hull keeps facing its way
  for (let i = 0; i < 30; i++) visuals.update(u, 0.1, target);
  near(visuals.update(u, 0.1, target).turret, Math.PI / 2);
  for (let i = 0; i < 30; i++) visuals.update(u, 0.1, null);
  near(visuals.update(u, 0.1, null).turret, 0);
});

test("a shot kicks the gun back, and it settles again", () => {
  const visuals = createUnitVisuals();
  const u = tank({ fireTimer: 0.05 });
  assert.equal(visuals.update(u, 0.016).recoil, 0);
  u.fireTimer = 2; // it has just fired: the timer starts over
  assert.equal(visuals.update(u, 0.016).recoil, 1);
  u.fireTimer = 1.9;
  const settling = visuals.update(u, 0.1).recoil;
  assert.ok(settling > 0 && settling < 1, `recoil ${settling}`);
  u.fireTimer = 1.2;
  assert.equal(visuals.update(u, 0.7).recoil, 0);
});

test("units no longer in the game are forgotten", () => {
  const visuals = createUnitVisuals();
  visuals.update(tank({ id: 1 }), 0.016);
  visuals.update(tank({ id: 2 }), 0.016);
  visuals.keepOnly([2]);
  assert.equal(visuals.size(), 1);
});

test("the hull's frame is its wheel step's row of directions", () => {
  const def = SPRITE_UNITS.tank;
  assert.equal(hullFrame(def, 0, 0), 0);
  assert.equal(hullFrame(def, 5, 0), 5);
  assert.equal(hullFrame(def, 5, def.wheelCycle * 0.5), 2 * def.directions + 5);
  assert.equal(hullFrame(def, 5, def.wheelCycle * 1.25), 1 * def.directions + 5);
  assert.equal(hullFrame(def, 5, -def.wheelCycle * 0.25), 3 * def.directions + 5); // backing up
});

test("a frame's place in its sheet, and the size a unit's frame is drawn at", () => {
  assert.deepEqual(frameRect(0, 16, 160), { sx: 0, sy: 0, size: 160 });
  assert.deepEqual(frameRect(17, 16, 160), { sx: 160, sy: 160, size: 160 });
  // The tank is drawn as long as its old picture was: 72 px for 7 m of hull.
  near(drawSize(SPRITE_UNITS.tank), (9.6 * 72) / 7);
});

test("an RTS unit, which counts down its fireCooldown, kicks back when it fires too", () => {
  const visuals = createUnitVisuals();
  const u = { id: 3, type: "tank", x: 0, y: 0, angle: 0, fireCooldown: 0 };
  visuals.update(u, 0.016);
  u.fireCooldown = 1.5;
  assert.equal(visuals.update(u, 0.016).recoil, 1);
});

test("a unit's looks can be read back by its id, once it has been drawn", () => {
  const visuals = createUnitVisuals();
  assert.equal(visuals.get(7), undefined);
  const v = visuals.update(tank(), 0.016);
  assert.equal(visuals.get(7), v);
});

test("the muzzle is ahead of the turret along its aim, and up the screen by the gun's height", () => {
  const def = SPRITE_UNITS.tank;
  const up = def.muzzleUp * def.pxPerMetre * def.heightOnScreen;
  const right = muzzleOffset(def, 0);
  near(right.x, def.muzzleAhead * def.pxPerMetre);
  near(right.y, -up);
  const down = muzzleOffset(def, Math.PI / 2);
  near(down.x, 0, 1e-6);
  near(down.y, def.muzzleAhead * def.pxPerMetre * def.depthOnScreen - up);
});
