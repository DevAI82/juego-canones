export const CANVAS_WIDTH = 1200;
export const CANVAS_HEIGHT = 750;

// Waypoints tracing the trench in game/assets/map_bg.png. The road enters
// top-left, curves down into the fortified hook-shaped trench, and exits
// off the right edge.
//
// History: an earlier version of this array was built by independently
// snapping each candidate point to the nearest strong "dark dirt" pixel
// cluster. That produced an erratic, zigzagging line -- the trench has
// several parallel lanes close together (the concentric sandbag rings),
// so independent per-point snapping could jump to a different lane than
// its neighbors instead of tracing one continuous line, and it also made
// MIN_PLACEMENT_DIST_FROM_PATH block far more of the map than intended
// (many more, closer-together path segments meant far more of the canvas
// counted as "near the road"). This version instead fits a smooth
// Catmull-Rom curve through a small number of hand-picked anchor points
// (the entry, the trench's own visual curve, and the exit), which cannot
// zigzag by construction and was verified by rendering it over the actual
// map image and checking it doesn't cut across any sandbag wall at a hard
// angle (one shallow crossing near the trench's inner ring remains, which
// reads as a connecting trench cut through the position rather than an
// error).
export const PATH = [
  { x: -40, y: 10 },
  { x: -5, y: 7 },
  { x: 47, y: 3 },
  { x: 104, y: 9 },
  { x: 161, y: 36 },
  { x: 224, y: 89 },
  { x: 288, y: 148 },
  { x: 343, y: 192 },
  { x: 386, y: 210 },
  { x: 423, y: 215 },
  { x: 455, y: 217 },
  { x: 485, y: 224 },
  { x: 511, y: 232 },
  { x: 535, y: 241 },
  { x: 560, y: 255 },
  { x: 589, y: 276 },
  { x: 620, y: 303 },
  { x: 643, y: 329 },
  { x: 652, y: 349 },
  { x: 647, y: 362 },
  { x: 634, y: 376 },
  { x: 620, y: 400 },
  { x: 598, y: 444 },
  { x: 570, y: 500 },
  { x: 556, y: 547 },
  { x: 574, y: 565 },
  { x: 626, y: 560 },
  { x: 691, y: 542 },
  { x: 750, y: 520 },
  { x: 798, y: 498 },
  { x: 843, y: 472 },
  { x: 883, y: 440 },
  { x: 914, y: 397 },
  { x: 933, y: 339 },
  { x: 950, y: 279 },
  { x: 976, y: 230 },
  { x: 1017, y: 198 },
  { x: 1066, y: 176 },
  { x: 1114, y: 161 },
  { x: 1154, y: 149 },
  { x: 1189, y: 143 },
  { x: 1219, y: 141 },
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
