import { test } from "node:test";
import assert from "node:assert/strict";
import { PATH, pathPointAt, distanceToPath } from "./map.js";

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
