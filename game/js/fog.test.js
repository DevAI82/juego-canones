import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FOG_CELL,
  SIGHT,
  ENTRY_SIGHT,
  createFog,
  updateFog,
  isVisible,
  isExplored,
  structureKey,
  knownStructure,
  saveFog,
  restoreFog,
  fogPixels,
  greyPixels,
  VEIL_ALPHA,
} from "./fog.js";

const tower = (x, y) => ({ id: 1, type: "basic", x, y, hp: 80, maxHp: 80, angle: 0, level: { damage: 0, range: 0, fireRate: 0, armor: 0, ammo: 0 }, buildTimeRemaining: 0 });
const eyes = (x, y, r = 150) => [{ x, y, r }];

test("the fog's grid and sights are the design's", () => {
  assert.equal(FOG_CELL, 32);
  assert.deepEqual(SIGHT, { soldier: 150, motorcycle: 240, buggy: 200, tank: 170, rocket: 160 });
  assert.equal(ENTRY_SIGHT, 150);
  const fog = createFog(2048, 2048);
  assert.equal(fog.cols * fog.rows, 64 * 64);
});

test("what the units see is explored and in sight while they're near it; once they leave it turns grey", () => {
  const fog = createFog(640, 640);
  updateFog(fog, eyes(100, 100), []);
  assert.ok(isVisible(fog, 100, 100) && isExplored(fog, 100, 100));
  assert.ok(isVisible(fog, 200, 150));
  assert.ok(!isVisible(fog, 400, 400) && !isExplored(fog, 400, 400));
  updateFog(fog, eyes(500, 500, 100), []);
  assert.ok(!isVisible(fog, 100, 100) && isExplored(fog, 100, 100));
  assert.ok(!isVisible(fog, -10, 50) && !isExplored(fog, 9999, 50));
});

test("towers are remembered as they were when last seen", () => {
  const fog = createFog(640, 640);
  const t = tower(112, 112);
  updateFog(fog, eyes(100, 100), [t]);
  assert.equal(fog.memory[structureKey(t)].hp, 80);
  updateFog(fog, [], [t]);
  t.hp = 20;
  t.level.damage = 2;
  updateFog(fog, [], [t]);
  assert.equal(fog.memory[structureKey(t)].hp, 80);
  assert.equal(fog.memory[structureKey(t)].level.damage, 0);
  updateFog(fog, eyes(100, 100), [t]);
  assert.equal(fog.memory[structureKey(t)].hp, 20);
  assert.equal(fog.memory[structureKey(t)].level.damage, 2);
});

test("a tower built in a grey area isn't known until the units come back", () => {
  const fog = createFog(640, 640);
  updateFog(fog, eyes(100, 100), []);
  updateFog(fog, [], []);
  const t = tower(112, 112);
  updateFog(fog, [], [t]);
  assert.equal(knownStructure(fog, t), false);
  updateFog(fog, eyes(100, 100), [t]);
  assert.equal(knownStructure(fog, t), true);
  updateFog(fog, [], [t]);
  assert.equal(knownStructure(fog, t), true);
});

test("a destroyed tower stays remembered until its ground is seen again; a wall block too", () => {
  const fog = createFog(640, 640);
  const t = tower(112, 112);
  const w = { id: 2, kind: "wall", x: 176, y: 112, hp: 150, maxHp: 150 };
  updateFog(fog, eyes(100, 100), [t, w]);
  assert.deepEqual(fog.memory[structureKey(w)], { kind: "wall", x: 176, y: 112, hp: 150, maxHp: 150 });
  updateFog(fog, [], [t, w]);
  t.hp = 0;
  updateFog(fog, [], [w]);
  assert.ok(fog.memory[structureKey(t)]);
  updateFog(fog, eyes(100, 100), [w]);
  assert.equal(fog.memory[structureKey(t)], undefined);
  assert.ok(fog.memory[structureKey(w)]);
});

test("explored ground and remembered towers survive a save", () => {
  const fog = createFog(2048, 2048);
  updateFog(fog, [{ x: 300, y: 1700, r: 240 }, { x: 1500, y: 200, r: 150 }], [tower(310, 1690)]);
  updateFog(fog, [], []);
  const copy = createFog(2048, 2048);
  restoreFog(copy, JSON.parse(JSON.stringify(saveFog(fog))));
  assert.deepEqual([...copy.explored], [...fog.explored]);
  assert.deepEqual(copy.memory, fog.memory);
  assert.ok(![...copy.visible].some(Boolean));
});

test("a damaged fog save is ignored rather than breaking the load", () => {
  const fog = createFog(640, 640);
  restoreFog(fog, { explored: "zz", memory: [null, 3, { kind: "tower" }, { kind: "tower", type: "basic", x: 50, y: 60, hp: 80, maxHp: 80 }] });
  restoreFog(fog, null);
  restoreFog(fog, "nonsense");
  assert.ok(![...fog.explored].some(Boolean));
  assert.deepEqual(Object.keys(fog.memory), ["tower:50,60"]);
});

test("the fog's look, a pixel per cell: black where never seen, a veil where seen before, clear in sight", () => {
  const fog = createFog(96, 32); // three cells in a row
  fog.explored[0] = 1;
  fog.visible[0] = 1;
  fog.explored[1] = 1;
  const veil = fogPixels(fog);
  assert.deepEqual([veil[3], veil[7], veil[11]], [0, VEIL_ALPHA, 255]);
  const grey = greyPixels(fog);
  assert.deepEqual([grey[3], grey[7], grey[11]], [0, 255, 0]);
  assert.deepEqual([grey[4], grey[5], grey[6]], [128, 128, 128]);
});
