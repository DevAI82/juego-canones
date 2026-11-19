import { test } from "node:test";
import assert from "node:assert/strict";
import { levelData } from "./levels.js";

test("level 3's map is the one built in Blender, with what stands up on it drawn over the units", () => {
  const d = levelData(3);
  assert.equal(d.mapImage, "assets/maps/level3.jpg");
  // The layer covers the whole map, and is nearly solid: walls and trees, not level 4's see-through towers.
  assert.deepEqual(d.foreground, { image: "assets/maps/level3_fg.webp", x: 0, y: 0, alpha: 0.92 });
});

test("level 4's towers in front of the roads keep their place and their usual see-through", () => {
  const fg = levelData(4).foreground;
  assert.equal(fg.image, "assets/map_fg_level4.png");
  assert.equal(fg.alpha, undefined);
});
