import { test } from "node:test";
import assert from "node:assert/strict";
import { PATH, randomSoldierPath, offsetPath, pathPointAt, distanceToPath, CANVAS_HEIGHT } from "./map.js";

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

test("randomSoldierPath enters/exits near PATH's entry/exit but wanders freely (and differently) in between", () => {
  const a = randomSoldierPath();
  const b = randomSoldierPath();
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
