export const CANVAS_WIDTH = 1200;
export const CANVAS_HEIGHT = 750;

// Waypoints tracing the trench in game/assets/map_bg.png. The road enters
// top-left, curves down into the fortified hook-shaped trench, and exits
// off the right edge.
//
// History: two earlier versions of this array were computed from the map
// image alone and both mis-traced the trench (a per-point pixel-snapping
// pass zigzagged between the trench's parallel lanes; a hand-picked
// smooth curve cut across the middle bowl instead of following the outer
// curve). The user then took a screenshot of the running game and drew
// the actual intended route directly on top of it. These waypoints are
// that hand-drawn line, extracted by detecting its color in the
// screenshot, skeletonizing it to a centerline, and mapping screenshot
// pixels back to this file's 1200x750 canvas space (calibrated against
// this same PATH's previous rendering, which was visible in the same
// screenshot) -- i.e. this is a direct trace of what the user actually
// asked for, not another automated guess.
export const PATH = [
  { x: -40, y: 10 },
  { x: 94, y: 40 },
  { x: 134, y: 86 },
  { x: 174, y: 132 },
  { x: 223, y: 160 },
  { x: 271, y: 178 },
  { x: 320, y: 187 },
  { x: 369, y: 197 },
  { x: 417, y: 204 },
  { x: 466, y: 208 },
  { x: 514, y: 212 },
  { x: 563, y: 215 },
  { x: 612, y: 223 },
  { x: 660, y: 246 },
  { x: 696, y: 290 },
  { x: 683, y: 334 },
  { x: 634, y: 349 },
  { x: 586, y: 360 },
  { x: 537, y: 375 },
  { x: 489, y: 388 },
  { x: 440, y: 408 },
  { x: 408, y: 450 },
  { x: 408, y: 497 },
  { x: 442, y: 539 },
  { x: 491, y: 553 },
  { x: 539, y: 560 },
  { x: 588, y: 565 },
  { x: 636, y: 564 },
  { x: 685, y: 565 },
  { x: 734, y: 558 },
  { x: 782, y: 539 },
  { x: 829, y: 498 },
  { x: 877, y: 459 },
  { x: 911, y: 414 },
  { x: 927, y: 367 },
  { x: 936, y: 320 },
  { x: 944, y: 273 },
  { x: 964, y: 225 },
  { x: 1008, y: 187 },
  { x: 1056, y: 165 },
  { x: 1105, y: 152 },
  { x: 1153, y: 145 },
  { x: 1240, y: 140 },
];

// Vehicles (buggy, tank, motorcycle, rocket) are too wide/loud to leave
// their road(s) and always follow one of the current level's paths (see
// levels.js). Foot soldiers don't: per user request, each one gets its
// own randomly generated route wandering anywhere across the open map,
// not a fixed corridor -- trading the road's cover for unpredictability
// that's much harder to wall off with a tower choke point than a single
// shared line ever was. Takes entry/exit explicitly (rather than a fixed
// constant) so every level's soldiers can roam that level's own map
// between that level's own entry/exit points.
const SOLDIER_MARGIN = 50; // keep waypoints off the very top/bottom edge

// worldHeight defaults to the viewport's own height for every level that
// doesn't scroll (levels 1/2, whose world IS the 1200x750 viewport).
// Level 3's much taller scrollable world (see levels.js's worldHeight)
// passes its own real height here so soldiers can roam its full vertical
// extent instead of being stuck pacing within just the first 750px.
// `wall`, when given (level 3's fortress -- see levels.js), is
// { corners, segments, gates }: `corners` is the closed polygon used to
// test whether a point is inside the wall, `segments` is that same
// boundary already split into solid pieces with a gap left at each gate
// (see wallSegmentsWithGates below), and `gates` is the list of opening
// centers. Per user request ("la fortaleza sólo tiene 3 puertas... el
// resto es un muro que NO se debería poder traspasar ni por soldados ni
// por vehículos") -- vehicles are handled separately, by simply routing
// their hand-authored paths (levels.js) through a gate; soldiers get
// their route fixed up here after the usual random-waypoint generation,
// since they're the ones with no fixed path to design a gate into.
export function randomPath(entry, exit, worldHeight = CANVAS_HEIGHT, wall = null) {
  const waypointCount = 3 + Math.floor(Math.random() * 2); // 3-4 interior stops
  const points = [{ x: entry.x, y: entry.y + (Math.random() - 0.5) * 60 }];
  for (let i = 1; i <= waypointCount; i++) {
    const t = i / (waypointCount + 1);
    let wp = {
      x: entry.x + (exit.x - entry.x) * t,
      // Full vertical freedom across the map, not just near the road --
      // this is what makes each soldier's route genuinely unpredictable.
      y: SOLDIER_MARGIN + Math.random() * (worldHeight - SOLDIER_MARGIN * 2),
    };
    if (wall) wp = pushOutsideWall(wp, wall);
    points.push(wp);
  }
  points.push({ x: exit.x, y: exit.y + (Math.random() - 0.5) * 60 });
  return wall ? routeThroughGates(points, wall) : points;
}

// Standard segment-segment intersection test (proper crossings only --
// touching at an endpoint doesn't count, which is what lets a route END
// exactly at a gate point without that final approach registering as a
// "crossing" of the wall).
function segmentsIntersect(p1, p2, p3, p4) {
  const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const d1 = cross(p3, p4, p1);
  const d2 = cross(p3, p4, p2);
  const d3 = cross(p1, p2, p3);
  const d4 = cross(p1, p2, p4);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

// Standard ray-casting point-in-polygon test.
export function pointInPolygon(pt, corners) {
  let inside = false;
  for (let i = 0, j = corners.length - 1; i < corners.length; j = i++) {
    const xi = corners[i].x, yi = corners[i].y;
    const xj = corners[j].x, yj = corners[j].y;
    const intersect = yi > pt.y !== yj > pt.y && pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

// Moves p (in place) out of whichever of `polygons` it's inside, to just
// past the nearest of that polygon's edges -- level 4's river and sea
// (levels.js's water), so a unit swerving round another one slides along
// the shore instead of driving into the water. Edges along the world's
// border (width x height) don't count: that's no shore to be put back on.
export function pushOutOfPolygons(p, polygons, width, height) {
  for (const poly of polygons) {
    if (!pointInPolygon(p, poly)) continue;
    let best = null;
    let bestD = Infinity;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[j];
      const b = poly[i];
      const onBorder = (a.x === b.x && (a.x <= 0 || a.x >= width)) || (a.y === b.y && (a.y <= 0 || a.y >= height));
      if (onBorder) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const lenSq = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq));
      const q = { x: a.x + t * dx, y: a.y + t * dy, nx: dy, ny: -dx };
      const d = Math.hypot(q.x - p.x, q.y - p.y);
      if (d < bestD) {
        bestD = d;
        best = q;
      }
    }
    if (!best) continue;
    // 1px past the edge, along the way out -- or, from right on the edge,
    // along whichever of its normals leads out.
    let ux = best.x - p.x;
    let uy = best.y - p.y;
    if (bestD < 0.01) {
      const n = Math.hypot(best.nx, best.ny) || 1;
      ux = best.nx / n;
      uy = best.ny / n;
      if (pointInPolygon({ x: best.x + ux, y: best.y + uy }, poly)) {
        ux = -ux;
        uy = -uy;
      }
    } else {
      ux /= bestD;
      uy /= bestD;
    }
    p.x = best.x + ux;
    p.y = best.y + uy;
  }
}

export function crossesWall(a, b, wallSegments) {
  return wallSegments.some(([w1, w2]) => segmentsIntersect(a, b, w1, w2));
}

// Splits a closed polygon (`corners`) into solid wall segments, leaving a
// `gateHalfWidth`-wide gap centered on each point in `gates` that lies
// along one of its edges -- so the fortress wall (levels.js's LEVEL3_
// WALL_CORNERS/GATES) blocks movement everywhere except those openings.
export function wallSegmentsWithGates(corners, gates, gateHalfWidth = 26) {
  const segments = [];
  for (let i = 0; i < corners.length; i++) {
    const a = corners[i];
    const b = corners[(i + 1) % corners.length];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    const ux = dx / len;
    const uy = dy / len;
    // Gates that fall on THIS edge (within a few px of the line, and
    // between its endpoints), as a distance-along-the-edge `t`.
    const onEdge = gates
      .map((g) => ({ t: (g.x - a.x) * ux + (g.y - a.y) * uy, g }))
      .filter(({ t, g }) => {
        if (t < 0 || t > len) return false;
        const px = a.x + ux * t;
        const py = a.y + uy * t;
        return Math.hypot(g.x - px, g.y - py) < 20;
      })
      .sort((p, q) => p.t - q.t);
    let cursor = 0;
    for (const { t } of onEdge) {
      const gapStart = Math.max(cursor, t - gateHalfWidth);
      if (gapStart > cursor) {
        segments.push([
          { x: a.x + ux * cursor, y: a.y + uy * cursor },
          { x: a.x + ux * gapStart, y: a.y + uy * gapStart },
        ]);
      }
      cursor = Math.min(len, t + gateHalfWidth);
    }
    if (cursor < len) {
      segments.push([{ x: a.x + ux * cursor, y: a.y + uy * cursor }, b]);
    }
  }
  return segments;
}

// How far a soldier's free-roaming waypoints keep from the wall. A point
// rolled just outside it used to be kept as-is -- a route could then run
// a few px from the wall, close enough that a soldier rounding the corner
// there (enemy.js steers smoothly instead of snapping onto each segment)
// clipped through it.
const WALL_CLEARANCE = 24;

function tooCloseToWall(pt, wall) {
  if (pointInPolygon(pt, wall.corners)) return true;
  return wall.corners.some((a, i) => {
    const b = wall.corners[(i + 1) % wall.corners.length];
    return distToSegment(pt.x, pt.y, a.x, a.y, b.x, b.y) < WALL_CLEARANCE;
  });
}

// Pushes a point straight out from the wall polygon's centroid until it's
// clear of it by WALL_CLEARANCE -- used to keep a soldier's randomly-rolled
// waypoint from landing inside the fortress (the only point allowed to be
// inside is the final destination itself, routed through a gate
// separately by routeThroughGates below) or right up against it.
function pushOutsideWall(pt, wall) {
  if (!tooCloseToWall(pt, wall)) return pt;
  const cx = wall.corners.reduce((s, c) => s + c.x, 0) / wall.corners.length;
  const cy = wall.corners.reduce((s, c) => s + c.y, 0) / wall.corners.length;
  const dx = pt.x - cx || 1;
  const dy = pt.y - cy || 1;
  const len = Math.hypot(dx, dy);
  let out = { x: pt.x, y: pt.y };
  for (let step = 0; step < 60 && tooCloseToWall(out, wall); step++) {
    out = { x: out.x + (dx / len) * 10, y: out.y + (dy / len) * 10 };
  }
  return out;
}

function nearestPoint(candidates, pt) {
  let best = candidates[0];
  let bestDist = Infinity;
  for (const c of candidates) {
    const d = Math.hypot(c.x - pt.x, c.y - pt.y);
    if (d < bestDist) {
      bestDist = d;
      best = c;
    }
  }
  return best;
}

// The point GATE_APPROACH px straight out from `gate`, square to the wall
// edge it sits on -- routes go through it on the way in, so the last leg
// crosses the wall head-on through the gap. Heading for the gate from
// wherever the route happened to be could instead run along the wall face
// itself (one did, exactly on the line of the NE chamfer), and a soldier
// rounding the corner onto that leg cut through the wall.
const GATE_APPROACH = 45;

function gateApproachPoint(gate, wall) {
  let edge = null;
  let edgeDist = Infinity;
  wall.corners.forEach((a, i) => {
    const b = wall.corners[(i + 1) % wall.corners.length];
    const d = distToSegment(gate.x, gate.y, a.x, a.y, b.x, b.y);
    if (d < edgeDist) {
      edgeDist = d;
      edge = [a, b];
    }
  });
  const [a, b] = edge;
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  let nx = -(b.y - a.y) / len;
  let ny = (b.x - a.x) / len;
  const cx = wall.corners.reduce((s, c) => s + c.x, 0) / wall.corners.length;
  const cy = wall.corners.reduce((s, c) => s + c.y, 0) / wall.corners.length;
  if ((gate.x - cx) * nx + (gate.y - cy) * ny < 0) {
    nx = -nx;
    ny = -ny;
  }
  return { x: gate.x + nx * GATE_APPROACH, y: gate.y + ny * GATE_APPROACH };
}

// A point just outside `corner`, pushed radially away from the wall
// polygon's own centroid so it clears the wall by `clearance` px instead
// of sitting exactly on it.
function pushFromCentroid(corner, wall, clearance) {
  const cx = wall.corners.reduce((s, c) => s + c.x, 0) / wall.corners.length;
  const cy = wall.corners.reduce((s, c) => s + c.y, 0) / wall.corners.length;
  const dx = corner.x - cx || 1;
  const dy = corner.y - cy || 1;
  const len = Math.hypot(dx, dy);
  return { x: corner.x + (dx / len) * clearance, y: corner.y + (dy / len) * clearance };
}

// Resolves one hop (a -> b) so no piece of it crosses solid wall: if it
// doesn't cross at all, it's returned as-is; otherwise it's split via a
// detour point -- through whichever gate is nearest, lined up square to
// it first (gateApproachPoint), if `isFinal` (this hop ends at the actual
// destination, deliberately inside the wall -- see levels.js's
// LEVEL3_BASE_INTERIOR); around the nearest WALL CORNER
// otherwise, for a hop between two points that both belong outside it
// (going through a gate there wouldn't make sense -- that would walk the
// soldier into the fortress interior just to immediately walk back out,
// for a hop that was never headed there in the first place) -- and BOTH
// resulting halves are recursively resolved the same way, since a single
// detour point isn't always itself fully clear of the wall (it can take
// another hop or two to actually get around a corner it's still close
// to). `excludeCorners` carries forward the corners already tried on
// this hop's ancestor calls so a nested split doesn't re-pick the same
// one and go nowhere; `depth` just bounds the recursion.
function resolveHop(a, b, wall, isFinal, excludeCorners, depth) {
  if (depth > 5 || !crossesWall(a, b, wall.segments)) return [a, b];
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  if (isFinal) {
    // The approach point is outside the wall, so only the gate -> b leg is
    // still the final one into the interior.
    const gate = nearestPoint(wall.gates, mid);
    const left = resolveHop(a, gateApproachPoint(gate, wall), wall, false, excludeCorners, depth + 1);
    const right = resolveHop(gate, b, wall, true, excludeCorners, depth + 1);
    return [...left, ...right];
  }
  const remaining = wall.corners.filter((c) => !excludeCorners.includes(c));
  const corner = nearestPoint(remaining.length ? remaining : wall.corners, mid);
  const nextExclude = [...excludeCorners, corner];
  const via = pushFromCentroid(corner, wall, 40 + depth * 25);
  const left = resolveHop(a, via, wall, false, nextExclude, depth + 1);
  const right = resolveHop(via, b, wall, false, nextExclude, depth + 1);
  return [...left, ...right.slice(1)]; // `via` ends `left` and starts `right` -- don't duplicate it
}

// Walks the waypoint list and resolves each hop between consecutive
// points via resolveHop above. Not real pathfinding -- just enough to
// turn "soldiers ignore the wall entirely" into "soldiers funnel through
// one of the 3 marked gates, and go around it everywhere else", which is
// what was actually asked for.
function routeThroughGates(points, wall) {
  const out = [points[0]];
  const finalIndex = points.length - 1;
  for (let i = 1; i < points.length; i++) {
    const chain = resolveHop(out[out.length - 1], points[i], wall, i === finalIndex, [], 0);
    out.push(...chain.slice(1));
  }
  return out;
}

export function pathPointAt(path, index) {
  return path[index];
}

// Returns a copy of `path` shifted sideways by `offset` px, perpendicular
// to the path's local direction at each waypoint (estimated from its
// neighbors). Used to give each vehicle its own "lane" across the road's
// width instead of every buggy/tank/motorcycle/rocket queuing along the
// exact same centerline and stacking on top of each other -- per user
// request, so the road reads as something with real width, not a thin
// wire everyone rides single-file.
//
// `pinchAt` (level 3's gates): the lanes narrow toward the road's middle
// within PINCH_RADIUS of each of these points, so vehicles in the outer
// lanes squeeze through a gate's bridge instead of clipping the wall on
// either side of it.
const PINCH_RADIUS = 90;
const PINCH_MIN = 0.25;

export function offsetPath(path, offset, pinchAt = []) {
  if (offset === 0) return path;
  const out = [];
  for (let i = 0; i < path.length; i++) {
    const prev = path[Math.max(0, i - 1)];
    const next = path[Math.min(path.length - 1, i + 1)];
    const dx = next.x - prev.x;
    const dy = next.y - prev.y;
    const len = Math.hypot(dx, dy) || 1;
    // Rotate the local direction 90 degrees to get the perpendicular.
    const px = -dy / len;
    const py = dx / len;
    let k = 1;
    for (const g of pinchAt) k = Math.min(k, Math.max(PINCH_MIN, Math.hypot(path[i].x - g.x, path[i].y - g.y) / PINCH_RADIUS));
    out.push({ x: path[i].x + px * offset * k, y: path[i].y + py * offset * k });
  }
  return out;
}

// width/height default to the viewport's own size (levels 1/2, whose map
// image already IS exactly 1200x750). Level 3's background is shipped at
// its own real (much larger) size instead -- see levels.js's
// worldWidth/worldHeight and main.js's camera, which scrolls a
// 1200x750 window over it rather than squashing the whole thing to fit.
export function drawMap(ctx, mapImage, width = CANVAS_WIDTH, height = CANVAS_HEIGHT) {
  ctx.drawImage(mapImage, 0, 0, width, height);
}

// Point-to-segment distance from (x, y) to the segment (x1,y1)-(x2,y2).
export function distToSegment(x, y, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  let t = lenSq === 0 ? 0 : ((x - x1) * dx + (y - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const px = x1 + t * dx;
  const py = y1 + t * dy;
  return Math.hypot(x - px, y - py);
}

// Minimum distance from (x, y) to any segment of the path (the road).
// Used to reject tower placement on or too close to the road.
export function distanceToPath(path, x, y) {
  let min = Infinity;
  for (let i = 0; i < path.length - 1; i++) {
    const d = distToSegment(x, y, path[i].x, path[i].y, path[i + 1].x, path[i + 1].y);
    if (d < min) min = d;
  }
  return min;
}

export function drawPathDebug(ctx, path) {
  ctx.save();
  ctx.strokeStyle = "rgba(255,0,0,0.6)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(path[0].x, path[0].y);
  for (const p of path.slice(1)) ctx.lineTo(p.x, p.y);
  ctx.stroke();
  ctx.restore();
}
