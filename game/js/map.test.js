import { test } from "node:test";
import assert from "node:assert/strict";
import { PATH, pathPointAt } from "./map.js";

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
