import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildRoadGraph,
  nearestRoadPoint,
  roadRoute,
  routeLength,
  pointAlong,
  routePrefix,
  spreadStops,
  attackMapOf,
  EDGE_INSET,
} from "./roadGraph.js";
import { LEVELS, MAX_LEVEL } from "./levels.js";

const P = (pairs) => pairs.map(([x, y]) => ({ x, y }));
const near = (a, b, tol = 1) => Math.hypot(a.x - b.x, a.y - b.y) <= tol;

test("two roads that cross get a junction where they cross", () => {
  const g = buildRoadGraph([P([[0, 50], [100, 50]]), P([[50, 0], [50, 100]])]);
  const j = g.nodes.findIndex((n) => near(n, { x: 50, y: 50 }));
  assert.ok(j >= 0);
  assert.equal(g.adj[j].length, 4);
  const route = roadRoute(g, { x: 0, y: 50 }, { x: 50, y: 0 });
  assert.ok(route.some((p) => near(p, { x: 50, y: 50 })));
  assert.equal(Math.round(routeLength(route)), 100);
});

test("a street ending on a road joins it there", () => {
  const g = buildRoadGraph([P([[0, 0], [200, 0]]), P([[100, 150], [100, 5]])]);
  const route = roadRoute(g, { x: 0, y: 0 }, { x: 100, y: 150 });
  assert.ok(route.some((p) => near(p, { x: 100, y: 5 })));
  assert.ok(Math.abs(routeLength(route) - 245) < 1.5);
});

test("points of different roads this close together are one junction", () => {
  const g = buildRoadGraph([P([[0, 0], [100, 0]]), P([[108, 6], [200, 6]])]);
  assert.equal(g.nodes.length, 3);
  assert.ok(routeLength(roadRoute(g, { x: 0, y: 0 }, { x: 200, y: 6 })) < 205);
});

test("the road point nearest a click is where it projects onto the closest road", () => {
  const g = buildRoadGraph([P([[0, 0], [100, 0]]), P([[0, 100], [100, 100]])]);
  const p = nearestRoadPoint(g, 40, 30);
  assert.ok(near(p, { x: 40, y: 0 }));
  assert.equal(Math.round(p.dist), 30);
});

test("the way somewhere follows the roads, not a straight line", () => {
  const g = buildRoadGraph([P([[0, 0], [100, 0], [100, 100]])]);
  const route = roadRoute(g, { x: 0, y: 0 }, { x: 100, y: 100 });
  assert.deepEqual(
    route.map((p) => [Math.round(p.x), Math.round(p.y)]),
    [
      [0, 0],
      [100, 0],
      [100, 100],
    ],
  );
});

test("pointAlong and routePrefix walk a route by distance", () => {
  const r = P([[0, 0], [100, 0], [100, 100]]);
  assert.deepEqual(pointAlong(r, 150), { x: 100, y: 50, ux: 0, uy: 1 });
  assert.deepEqual(pointAlong(r, 999), { x: 100, y: 100, ux: 0, uy: 1 });
  assert.deepEqual(routePrefix(r, 150), P([[0, 0], [100, 0], [100, 50]]));
});

test("a group sent to one spot lines up along the road, alternating sides, without overlapping", () => {
  const g = buildRoadGraph([P([[0, 0], [1000, 0]])]);
  const units = [0, 1, 2, 3, 4, 5].map((k) => ({ x: 600 + k * 30, y: 0, len: 18, wid: 22 }));
  const stops = spreadStops(g, { x: 200, y: 40 }, units);
  // They come from the right, so they line up from the spot rightwards.
  for (const s of stops) assert.ok(s.x >= 199 && s.x < 400, `stop at x=${s.x}`);
  const sides = stops.map((s) => Math.sign(s.y));
  assert.deepEqual(sides.slice(0, 4), [sides[0], -sides[0], sides[0], -sides[0]]);
  for (let i = 0; i < stops.length; i++) {
    for (let j = i + 1; j < stops.length; j++) {
      const a = stops[i];
      const b = stops[j];
      assert.ok(Math.abs(a.x - b.x) >= 18 || Math.abs(a.y - b.y) >= 22, `stops ${i} and ${j} overlap`);
    }
  }
  for (const s of stops) assert.ok(near(s.route.at(-1), s));
});

test("every level's road network is all one piece, and the base can be reached from every entry", () => {
  for (let level = 1; level <= MAX_LEVEL; level++) {
    const { graph, entries, base } = attackMapOf(LEVELS[level]);
    const seen = new Set([0]);
    const todo = [0];
    while (todo.length) {
      for (const { to } of graph.adj[todo.pop()]) {
        if (!seen.has(to)) {
          seen.add(to);
          todo.push(to);
        }
      }
    }
    assert.equal(seen.size, graph.nodes.length, `level ${level}: the network is in pieces`);
    for (const e of entries) assert.ok(near(roadRoute(graph, e, base).at(-1), base), `level ${level}: no way from an entry to the base`);
  }
});

test("each road comes in at an entry just inside the map, and the base is inside it too (level 1's road runs off the edge)", () => {
  for (let level = 1; level <= MAX_LEVEL; level++) {
    const L = LEVELS[level];
    const { entries, base } = attackMapOf(L);
    assert.equal(entries.length, L.paths.length);
    for (const p of [...entries, base]) {
      assert.ok(p.x >= EDGE_INSET - 1 && p.y >= EDGE_INSET - 1, `level ${level}: (${p.x},${p.y}) outside`);
      assert.ok(p.x <= L.worldWidth - EDGE_INSET + 1 && p.y <= L.worldHeight - EDGE_INSET + 1, `level ${level}: (${p.x},${p.y}) outside`);
    }
  }
  assert.ok(near(attackMapOf(LEVELS[1]).base, { x: LEVELS[1].worldWidth - EDGE_INSET, y: 143 }, 3));
  assert.deepEqual(attackMapOf(LEVELS[3]).base, LEVELS[3].soldierExit);
});

test("the new streets of levels 3 and 4 are part of their networks", () => {
  for (const level of [3, 4]) {
    const { graph } = attackMapOf(LEVELS[level]);
    assert.ok(LEVELS[level].streets.length >= 3);
    for (const street of LEVELS[level].streets) {
      for (const p of street) assert.ok(nearestRoadPoint(graph, p.x, p.y).dist < 2, `level ${level}: (${p.x},${p.y}) off the network`);
    }
  }
  // Level 3: the east street crosses the north-east highway.
  const g3 = attackMapOf(LEVELS[3]).graph;
  const crossing = g3.nodes.findIndex((n) => near(n, { x: 1810, y: 243 }, 3));
  assert.ok(crossing >= 0 && g3.adj[crossing].length === 4);
  // Level 4: the diagonal avenue is a way from the north street to the south avenue.
  const g4 = attackMapOf(LEVELS[4]).graph;
  assert.ok(routeLength(roadRoute(g4, { x: 850, y: 1190 }, { x: 505, y: 1790 })) < 760);
});
