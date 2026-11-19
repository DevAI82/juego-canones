import { test } from "node:test";
import assert from "node:assert/strict";
import { levelData } from "./levels.js";

test("level 3's map is the one built in Blender, with what stands up on it drawn over the units", () => {
  const d = levelData(3);
  assert.equal(d.mapImage, "assets/maps/level3.jpg");
  // The layer covers the whole map, and is nearly solid: walls and trees, not level 4's see-through towers.
  assert.deepEqual(d.foreground, { image: "assets/maps/level3_fg.webp", x: 0, y: 0, alpha: 0.92 });
});

test("level 4, the other large map, is built in Blender as well", () => {
  const d = levelData(4);
  assert.equal(d.mapImage, "assets/maps/level4.jpg");
  assert.deepEqual(d.foreground, { image: "assets/maps/level4_fg.webp", x: 0, y: 0, alpha: 0.92 });
});

test("levels 1 and 2 are built in Blender too, at twice their size: their layer over the units is drawn at the map's own", () => {
  for (const n of [1, 2]) {
    const d = levelData(n);
    assert.equal(d.mapImage, `assets/maps/level${n}.jpg`);
    assert.deepEqual(d.foreground, { image: `assets/maps/level${n}_fg.webp`, x: 0, y: 0, width: d.worldWidth, height: d.worldHeight, alpha: 0.92 });
  }
});
