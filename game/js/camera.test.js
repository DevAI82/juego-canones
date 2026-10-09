import { test } from "node:test";
import assert from "node:assert/strict";
import { clampCameraPosition, zoomAt, pinchZoom } from "./camera.js";

const view = { width: 1200, height: 750 };
const at = (p, x, y) => assert.ok(Math.abs(p.x - x) < 1e-9 && Math.abs(p.y - y) < 1e-9, `camera at (${p.x}, ${p.y}), not (${x}, ${y})`);

test("the camera stays on the map: no further than its edges, and a map that fits the view is centred", () => {
  const world = { w: 2048, h: 2048 };
  at(clampCameraPosition({ x: -50, y: -50 }, world, view, 1), 0, 0);
  at(clampCameraPosition({ x: 5000, y: 5000 }, world, view, 1), 2048 - 1200, 2048 - 750);
  at(clampCameraPosition({ x: 100, y: 200 }, world, view, 1), 100, 200);
  // Level 2's 1200 x 750 map at zoom 1 fills the view exactly.
  at(clampCameraPosition({ x: 30, y: 30 }, { w: 1200, h: 750 }, view, 1), 0, 0);
});

test("the map can be pushed out from under the shop's column and the HUD; one that fits beside them is centred there", () => {
  const world = { w: 1200, h: 750 };
  const pad = { right: 136, top: 128 };
  // Zoomed in: as far as its right edge clear of the column, its top edge clear of the HUD.
  at(clampCameraPosition({ x: 5000, y: -5000 }, world, view, 1.5, pad), 1200 - 800 + 136 / 1.5, -128 / 1.5);
  // Zoomed out until the whole map fits in the room below the HUD: centred in it.
  const zoom = (750 - 128) / 750;
  const p = clampCameraPosition({ x: 5000, y: 5000 }, world, view, zoom, pad);
  at(p, (1200 - 1200 / zoom + 136 / zoom) / 2, (750 - 750 / zoom - 128 / zoom) / 2);
});

test("the map can be pushed up from under the unit upgrade panel at the bottom, even when it fits the room above", () => {
  // Level 2's base is near the map's bottom edge, where the panel that
  // appears with every selection lay over it: units couldn't be ordered in
  // with a right-click there.
  const world = { w: 1200, h: 750 };
  const pad = { right: 136, top: 128, bottom: 245 };
  const zoom = (750 - 128) / 750; // the furthest zoom-out: the map fits below the HUD
  const p = clampCameraPosition({ x: 0, y: 5000 }, world, view, zoom, pad);
  assert.ok(Math.abs(p.y - (750 - 750 / zoom + 245 / zoom)) < 1e-9, `camera y ${p.y}`); // its bottom edge clear of the panel
  const q = clampCameraPosition({ x: 0, y: -5000 }, world, view, zoom, pad);
  assert.ok(Math.abs(q.y - -128 / zoom) < 1e-9, `camera y ${q.y}`); // and back down to the HUD
});

test("zooming toward a point keeps the world point under it in place", () => {
  const cam = { x: 100, y: 50 };
  const next = zoomAt(cam, 1, 2, 600, 300);
  assert.deepEqual(next, { x: 400, y: 200 });
  // the same world point (700, 350) is still under canvas (600, 300)
  assert.equal(next.x + 600 / 2, 700);
  assert.equal(next.y + 300 / 2, 350);
});

test("two fingers moving apart zoom in around the point between them", () => {
  const p = pinchZoom(1, 100, { x: 400, y: 300 }, { x: 600, y: 300 });
  assert.equal(p.zoom, 2);
  assert.equal(p.cx, 500);
  assert.equal(p.cy, 300);
  assert.equal(pinchZoom(1.5, 0, { x: 1, y: 1 }, { x: 1, y: 1 }).zoom, 1.5);
});
