// The road network of a map, for the attack mode (docs/2026-10-09-modo-
// atacante-design.md): the army only ever drives along roads and streets,
// so every order turns into a route along them. The network is the
// level's roads (levels.js's paths, the ones the defence game's enemies
// take) and its extra streets, joined wherever they meet or cross.
// DOM-free, like the simulation.
import { distToSegment } from "./map.js";

// Points of different roads closer than this are one junction.
const MERGE_DIST = 16;
// A road's point this close to another road's stretch joins it there --
// a street ending on an avenue.
const SNAP_DIST = 12;
// How far inside the map's edge the roads are cut off: the army comes in
// there (the defence game's enemies start off the map), and on level 1
// the base is there (its trench runs off the right-hand edge).
export const EDGE_INSET = 20;

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// Where along segment a-b (0 at a, 1 at b) point p's nearest point is.
function along(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  return len2 === 0 ? 0 : ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
}

// Where segments a-b and c-d cross, strictly inside both (t along a-b, u
// along c-d), or null.
function crossing(a, b, c, d) {
  const rx = b.x - a.x;
  const ry = b.y - a.y;
  const sx = d.x - c.x;
  const sy = d.y - c.y;
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-9) return null;
  const qx = c.x - a.x;
  const qy = c.y - a.y;
  const t = (qx * sy - qy * sx) / den;
  const u = (qx * ry - qy * rx) / den;
  const eps = 1e-6;
  if (t <= eps || t >= 1 - eps || u <= eps || u >= 1 - eps) return null;
  return { x: a.x + rx * t, y: a.y + ry * t, t, u };
}

// The stretch a-b cut at some junctions ([t, node] each): a -> ... -> b.
function chain(a, b, cuts) {
  const out = [];
  let prev = a;
  for (const [, n] of [...cuts].sort((p, q) => p[0] - q[0])) {
    if (n !== prev) out.push([prev, n]);
    prev = n;
  }
  if (prev !== b) out.push([prev, b]);
  return out;
}

// The network of some roads (each a list of points): its junctions
// (nodes), the stretches of road between them (edges, with their length)
// and, for each node, the edges leaving it.
export function buildRoadGraph(polylines) {
  const nodes = [];
  const nodeAt = (p) => {
    let best = -1;
    let bestD = MERGE_DIST;
    nodes.forEach((n, i) => {
      const d = dist(n, p);
      if (d < bestD) {
        best = i;
        bestD = d;
      }
    });
    if (best >= 0) return best;
    nodes.push({ x: p.x, y: p.y });
    return nodes.length - 1;
  };

  let pairs = [];
  for (const line of polylines) {
    let prev = null;
    for (const p of line) {
      const n = nodeAt(p);
      if (prev !== null && prev !== n) pairs.push([prev, n]);
      prev = n;
    }
  }
  // A point of one road lying on another road's stretch joins it there.
  pairs = pairs.flatMap(([a, b]) => {
    const cuts = [];
    nodes.forEach((n, i) => {
      if (i === a || i === b) return;
      const t = along(n, nodes[a], nodes[b]);
      if (t > 0 && t < 1 && distToSegment(n.x, n.y, nodes[a].x, nodes[a].y, nodes[b].x, nodes[b].y) < SNAP_DIST) cuts.push([t, i]);
    });
    return chain(a, b, cuts);
  });
  // Two stretches crossing each other get a junction where they cross.
  const cuts = pairs.map(() => []);
  for (let i = 0; i < pairs.length; i++) {
    for (let j = i + 1; j < pairs.length; j++) {
      const [a, b] = pairs[i];
      const [c, d] = pairs[j];
      if (a === c || a === d || b === c || b === d) continue;
      const hit = crossing(nodes[a], nodes[b], nodes[c], nodes[d]);
      if (!hit) continue;
      const n = nodeAt(hit);
      cuts[i].push([hit.t, n]);
      cuts[j].push([hit.u, n]);
    }
  }
  pairs = pairs.flatMap(([a, b], i) => chain(a, b, cuts[i]));

  // Roads sharing a stretch give it once.
  const edges = [];
  const adj = nodes.map(() => []);
  const seen = new Set();
  for (const [a, b] of pairs) {
    const key = a < b ? `${a}-${b}` : `${b}-${a}`;
    if (a === b || seen.has(key)) continue;
    seen.add(key);
    adj[a].push({ to: b, edge: edges.length });
    adj[b].push({ to: a, edge: edges.length });
    edges.push({ a, b, len: dist(nodes[a], nodes[b]) });
  }
  return { nodes, edges, adj };
}

// The point of the network nearest (x, y): on edge `edge`, a fraction `t`
// of the way from its node a to its node b, `dist` px away.
export function nearestRoadPoint(graph, x, y) {
  let best = null;
  graph.edges.forEach((e, i) => {
    const A = graph.nodes[e.a];
    const B = graph.nodes[e.b];
    const t = Math.max(0, Math.min(1, along({ x, y }, A, B)));
    const px = A.x + (B.x - A.x) * t;
    const py = A.y + (B.y - A.y) * t;
    const d = Math.hypot(px - x, py - y);
    if (!best || d < best.dist) best = { x: px, y: py, edge: i, t, dist: d };
  });
  return best;
}

// Shortest distances along the network (Dijkstra) from some starting
// nodes, each [node, distance already covered to reach it].
function shortest(graph, starts) {
  const n = graph.nodes.length;
  const best = new Array(n).fill(Infinity);
  const prev = new Array(n).fill(-1);
  const heap = []; // [distance, node], smallest first
  const push = (d, node) => {
    heap.push([d, node]);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heap[p][0] <= heap[i][0]) break;
      [heap[p], heap[i]] = [heap[i], heap[p]];
      i = p;
    }
  };
  const pop = () => {
    const top = heap[0];
    const last = heap.pop();
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i], heap[m]];
        i = m;
      }
    }
    return top;
  };
  for (const [node, d] of starts) {
    if (d < best[node]) {
      best[node] = d;
      push(d, node);
    }
  }
  while (heap.length) {
    const [d, u] = pop();
    if (d > best[u]) continue;
    for (const { to, edge } of graph.adj[u]) {
      const nd = d + graph.edges[edge].len;
      if (nd < best[to]) {
        best[to] = nd;
        prev[to] = u;
        push(nd, to);
      }
    }
  }
  return { best, prev };
}

// The way from `from` to `to` by road: from where `from` stands onto the
// nearest road, along the network's shortest route, to the road point
// nearest `to`. A list of points, starting at `from`.
export function roadRoute(graph, from, to) {
  const s = nearestRoadPoint(graph, from.x, from.y);
  const e = nearestRoadPoint(graph, to.x, to.y);
  const pts = [{ x: from.x, y: from.y }, { x: s.x, y: s.y }];
  if (s.edge !== e.edge) {
    const E = graph.edges[s.edge];
    const F = graph.edges[e.edge];
    const { best, prev } = shortest(graph, [
      [E.a, s.t * E.len],
      [E.b, (1 - s.t) * E.len],
    ]);
    let node = best[F.a] + e.t * F.len <= best[F.b] + (1 - e.t) * F.len ? F.a : F.b;
    const via = [];
    for (; node !== -1; node = prev[node]) via.push(graph.nodes[node]);
    pts.push(...via.reverse());
  }
  pts.push({ x: e.x, y: e.y });
  const out = [];
  for (const p of pts) {
    const last = out[out.length - 1];
    if (!last || dist(p, last) > 0.5) out.push({ x: p.x, y: p.y });
  }
  return out;
}

export function routeLength(points) {
  let len = 0;
  for (let i = 1; i < points.length; i++) len += dist(points[i - 1], points[i]);
  return len;
}

// The point `s` px along a route (held at its ends), and the route's
// direction there (unit vector ux, uy).
export function pointAlong(points, s) {
  let ux = 1;
  let uy = 0;
  let left = Math.max(0, s);
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const len = dist(a, b);
    if (len === 0) continue;
    ux = (b.x - a.x) / len;
    uy = (b.y - a.y) / len;
    if (left <= len) return { x: a.x + ux * left, y: a.y + uy * left, ux, uy };
    left -= len;
  }
  const end = points[points.length - 1];
  return { x: end.x, y: end.y, ux, uy };
}

// A route's first `s` px.
export function routePrefix(points, s) {
  const out = [{ x: points[0].x, y: points[0].y }];
  let left = s;
  for (let i = 1; i < points.length && left > 0; i++) {
    const a = points[i - 1];
    const b = points[i];
    const len = dist(a, b);
    if (len >= left) {
      out.push({ x: a.x + ((b.x - a.x) * left) / len, y: a.y + ((b.y - a.y) * left) / len });
      break;
    }
    out.push({ x: b.x, y: b.y });
    left -= len;
  }
  return out;
}

// Where each of a group sent to one spot stops: on the road, one behind
// another along the way they come in and alternating sides of it, rather
// than all piling onto the spot (the design's «se reparten a lo largo de
// la calle»). units: [{ x, y, len, wid }] (len, wid: each one's size).
// Returns, in the same order, { x, y, route }: the stop and the way there.
export function spreadStops(graph, spot, units, gap = 6) {
  const target = nearestRoadPoint(graph, spot.x, spot.y);
  // Units coming in along the same road line up together: grouped by the
  // direction they come from, as seen from the spot.
  const groups = new Map();
  units.forEach((u, i) => {
    const back = roadRoute(graph, u, target).reverse();
    const length = routeLength(back);
    let key = "here";
    if (length >= 1) {
      const p = pointAlong(back, Math.min(30, length));
      key = (((Math.round(Math.atan2(p.y - target.y, p.x - target.x) / (Math.PI / 4)) % 8) + 8) % 8).toString();
    }
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ i, back, length });
  });
  const stops = new Array(units.length);
  for (const [key, members] of groups) {
    if (key === "here") {
      for (const { i } of members) stops[i] = { x: units[i].x, y: units[i].y, route: [{ x: units[i].x, y: units[i].y }] };
      continue;
    }
    // The nearest go to the front; the line runs back along the longest
    // way in, so everyone fits on it.
    members.sort((a, b) => a.length - b.length);
    const line = members[members.length - 1].back;
    const offset = Math.max(...members.map(({ i }) => units[i].wid)) / 2 + 1;
    const taken = { 1: [], [-1]: [] }; // per side: stretches of the line in use
    let side = 1;
    for (const { i } of members) {
      const len = units[i].len + gap;
      let best = null;
      for (const s of [side, -side]) {
        let at = len / 2;
        for (const [a, b] of [...taken[s]].sort((p, q) => p[0] - q[0])) if (at + len / 2 > a && at - len / 2 < b) at = b + len / 2;
        if (!best || at < best.at) best = { s, at };
      }
      taken[best.s].push([best.at - len / 2, best.at + len / 2]);
      side = -best.s;
      const p = pointAlong(line, best.at);
      const stop = { x: p.x - p.uy * offset * best.s, y: p.y + p.ux * offset * best.s };
      const route = roadRoute(graph, units[i], stop);
      if (dist(route[route.length - 1], stop) > 0.5) route.push(stop);
      stops[i] = { x: stop.x, y: stop.y, route };
    }
  }
  return stops;
}

// The stretch of a path inside the map (`inside`): from where it comes in
// to where it leaves, or its end.
function clipped(path, inside) {
  const out = [];
  for (let i = 0; i < path.length; i++) {
    const p = path[i];
    if (inside(p)) {
      if (!out.length && i > 0) out.push(edgePoint(path[i - 1], p, inside));
      out.push({ x: p.x, y: p.y });
    } else if (out.length) {
      out.push(edgePoint(p, path[i - 1], inside));
      break;
    }
  }
  return out;
}

// Where the segment from `outP` (outside) to `inP` (inside) comes in.
function edgePoint(outP, inP, inside) {
  let a = outP;
  let b = inP;
  for (let k = 0; k < 30; k++) {
    const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    if (inside(m)) b = m;
    else a = m;
  }
  return { x: Math.round(b.x), y: Math.round(b.y) };
}

// The attack mode's view of a level: the road network (its roads, cut off
// EDGE_INSET inside the map, and its streets), the entries (where each
// road comes into the map; the army appears there, `route` being that
// road from there on) and the base (where the roads end). Worked out once
// per level.
const maps = new WeakMap();
export function attackMapOf(level) {
  if (maps.has(level)) return maps.get(level);
  const inside = (p) =>
    p.x >= EDGE_INSET && p.y >= EDGE_INSET && p.x <= level.worldWidth - EDGE_INSET && p.y <= level.worldHeight - EDGE_INSET;
  const routes = level.paths.map((path) => clipped(path, inside)).filter((r) => r.length >= 2);
  const graph = buildRoadGraph([...routes, ...(level.streets || [])]);
  const entries = [];
  for (const route of routes) {
    if (!entries.some((e) => dist(e, route[0]) < 30)) entries.push({ x: route[0].x, y: route[0].y, route });
  }
  const end = routes[0][routes[0].length - 1];
  const map = { graph, entries, base: { x: end.x, y: end.y }, routes };
  maps.set(level, map);
  return map;
}
