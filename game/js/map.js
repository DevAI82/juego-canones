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

// A shorter, more direct route across open ground -- only foot soldiers use
// this. Vehicles (buggy, tank) are too wide/loud to leave the trench and
// always follow PATH; a soldier can duck out of the trench and cut across
// the field in a straighter line, trading the trench's cover for a shorter,
// more exposed route past the towers.
export const SOLDIER_PATH = [
  { x: -40, y: 10 },
  { x: 220, y: 130 },
  { x: 480, y: 300 },
  { x: 700, y: 340 },
  { x: 960, y: 210 },
  { x: 1240, y: 140 },
];

export function pathPointAt(path, index) {
  return path[index];
}

export function drawMap(ctx, mapImage) {
  ctx.drawImage(mapImage, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
}

// Point-to-segment distance from (x, y) to the segment (x1,y1)-(x2,y2).
function distToSegment(x, y, x1, y1, x2, y2) {
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
