import { test } from "node:test";
import assert from "node:assert/strict";
import { PATH, randomPath, offsetPath, pathPointAt, distanceToPath, CANVAS_HEIGHT, pointInPolygon, crossesWall, wallSegmentsWithGates } from "./map.js";

test("PATH has at least 2 waypoints", () => {
  assert.ok(PATH.length >= 2);
});

test("pathPointAt returns the waypoint at that index", () => {
  const p = pathPointAt(PATH, 0);
  assert.equal(p.x, PATH[0].x);
  assert.equal(p.y, PATH[0].y);
});

test("pathPointAt returns undefined past the end", () => {
  assert.equal(pathPointAt(PATH, PATH.length + 5), undefined);
});

test("distanceToPath returns ~0 for a point exactly on a segment", () => {
  const path = [{ x: 0, y: 0 }, { x: 100, y: 0 }];
  const d = distanceToPath(path, 50, 0);
  assert.ok(d < 0.001);
});

test("distanceToPath returns a large distance for a point far from any segment", () => {
  const path = [{ x: 0, y: 0 }, { x: 100, y: 0 }];
  const d = distanceToPath(path, 50, 5000);
  assert.ok(d > 4000);
});

test("randomPath enters/exits near the given entry/exit but wanders freely (and differently) in between", () => {
  const a = randomPath(PATH[0], PATH.at(-1));
  const b = randomPath(PATH[0], PATH.at(-1));
  assert.ok(a.length >= 4);
  assert.ok(Math.abs(a[0].x - PATH[0].x) < 40);
  assert.ok(Math.abs(a.at(-1).x - PATH.at(-1).x) < 40);
  // the interior waypoints (not the entry/exit, which jitter slightly
  // past the edge like PATH's own entry does) stay on-canvas vertically
  for (const p of a.slice(1, -1)) assert.ok(p.y >= 0 && p.y <= CANVAS_HEIGHT);
  // two soldiers shouldn't get the identical route -- that's the whole point
  const differs = a.some((p, i) => !b[i] || p.x !== b[i].x || p.y !== b[i].y);
  assert.ok(differs);
});

test("offsetPath returns the same path unchanged for a zero offset", () => {
  const path = [{ x: 0, y: 0 }, { x: 100, y: 0 }];
  assert.equal(offsetPath(path, 0), path);
});

test("offsetPath shifts a straight horizontal path sideways by exactly the offset", () => {
  const path = [{ x: 0, y: 0 }, { x: 100, y: 0 }];
  const shifted = offsetPath(path, 20);
  // moving along +x, "sideways" is the y axis
  for (const p of shifted) assert.ok(Math.abs(Math.abs(p.y) - 20) < 0.01);
  // still spans the same x range -- only pushed sideways, not shortened
  assert.ok(Math.abs(shifted[0].x - path[0].x) < 0.01);
  assert.ok(Math.abs(shifted[1].x - path[1].x) < 0.01);
});

test("offsetPath in opposite directions shifts to opposite sides", () => {
  const path = [{ x: 0, y: 0 }, { x: 100, y: 0 }];
  const left = offsetPath(path, 20);
  const right = offsetPath(path, -20);
  assert.ok((left[0].y > 0) !== (right[0].y > 0));
});

// --- Fortress wall (level 3's compound) -----------------------------------
// Per user request: "la fortaleza sólo tiene 3 puertas... el resto es un
// muro que NO se debería poder traspasar ni por soldados ni por
// vehículos". A simple square with one gate centered on its right edge,
// used the same way LEVEL3_WALL_CORNERS/GATES are in levels.js.
const SQUARE = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }];
const GATE = { x: 100, y: 50 };
const WALL = { corners: SQUARE, segments: wallSegmentsWithGates(SQUARE, [GATE], 15), gates: [GATE] };

test("pointInPolygon is true for a point inside the square, false for one outside", () => {
  assert.equal(pointInPolygon({ x: 50, y: 50 }, SQUARE), true);
  assert.equal(pointInPolygon({ x: 200, y: 50 }, SQUARE), false);
});

test("wallSegmentsWithGates leaves a gap at the gate but stays solid elsewhere on that edge", () => {
  // Straight through the gate's own gap -- not blocked.
  assert.equal(crossesWall({ x: 150, y: 50 }, { x: 50, y: 50 }, WALL.segments), false);
  // Same edge, away from the gate -- still solid.
  assert.equal(crossesWall({ x: 150, y: 10 }, { x: 50, y: 10 }, WALL.segments), true);
  // A different edge entirely (top, no gate on it) -- solid.
  assert.equal(crossesWall({ x: 50, y: -50 }, { x: 50, y: 50 }, WALL.segments), true);
});

test("randomPath given a wall never crosses it except at a gate, across many random rolls", () => {
  const entry = { x: 300, y: 50 };
  const exit = { x: 50, y: 50 }; // inside the square -- the "base"
  for (let i = 0; i < 100; i++) {
    const path = randomPath(entry, exit, 400, WALL);
    for (let j = 0; j < path.length - 1; j++) {
      assert.equal(crossesWall(path[j], path[j + 1], WALL.segments), false, `hop ${j} of trial ${i} crossed solid wall`);
    }
    // every waypoint except the final destination should stay outside
    for (let j = 0; j < path.length - 1; j++) {
      assert.equal(pointInPolygon(path[j], SQUARE), false, `waypoint ${j} of trial ${i} ended up inside the wall`);
    }
  }
});
