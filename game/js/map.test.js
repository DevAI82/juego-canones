import { test } from "node:test";
import assert from "node:assert/strict";
import { PATH, SOLDIER_PATH, pathPointAt, distanceToPath } from "./map.js";

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

test("SOLDIER_PATH has at least 2 waypoints and starts/ends near PATH's entry/exit", () => {
  assert.ok(SOLDIER_PATH.length >= 2);
  // both routes should enter and exit at roughly the same map edges, even
  // though they take different ways through the middle
  assert.ok(Math.abs(SOLDIER_PATH[0].x - PATH[0].x) < 5);
  assert.ok(Math.abs(SOLDIER_PATH.at(-1).x - PATH.at(-1).x) < 5);
});
