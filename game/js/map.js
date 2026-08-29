export const CANVAS_WIDTH = 1200;
export const CANVAS_HEIGHT = 750;

// Waypoints tracing the actual dark-dirt trench floor in
// game/assets/map_bg.png. The road enters top-left, spirals down through
// the trench (dipping left into the inner loop before curving back right),
// and exits off the right edge. The middle section (x:381-940) was
// re-derived by sampling the map image directly -- a straight-line guess
// through that stretch used to cut across open grass and a parked tank
// instead of following the trench (see docs/2026-08-29-tower-defense-plan.md
// Task 2's original tuning note); these points were snapped to local
// maxima of "dark, desaturated" pixel density, i.e. the actual trench
// floor, not eyeballed.
export const PATH = [
  { x: -40, y: 10 },
  { x: 132, y: 19 },
  { x: 168, y: 106 },
  { x: 207, y: 143 },
  { x: 244, y: 165 },
  { x: 290, y: 181 },
  { x: 343, y: 192 },
  { x: 381, y: 181 },
  { x: 405, y: 205 },
  { x: 440, y: 260 },
  { x: 445, y: 285 },
  { x: 450, y: 340 },
  { x: 425, y: 355 },
  { x: 435, y: 410 },
  { x: 355, y: 420 },
  { x: 375, y: 480 },
  { x: 475, y: 485 },
  { x: 495, y: 510 },
  { x: 585, y: 505 },
  { x: 655, y: 505 },
  { x: 725, y: 475 },
  { x: 830, y: 425 },
  { x: 850, y: 370 },
  { x: 895, y: 350 },
  { x: 945, y: 300 },
  { x: 915, y: 230 },
  { x: 976, y: 230 },
  { x: 1020, y: 197 },
  { x: 1074, y: 172 },
  { x: 1135, y: 154 },
  { x: 1175, y: 147 },
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
