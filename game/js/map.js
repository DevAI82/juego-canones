export const CANVAS_WIDTH = 1200;
export const CANVAS_HEIGHT = 750;

// Waypoints approximating the serpentine trench path in game/assets/map_bg.png.
// The road enters top-left, winds through a hook-shaped trench, and exits
// off the right edge. Tuned against the background image (Task 2 Step 6).
export const PATH = [
  { x: -40, y: 10 },
  { x: 132, y: 19 },
  { x: 168, y: 106 },
  { x: 207, y: 143 },
  { x: 244, y: 165 },
  { x: 290, y: 181 },
  { x: 343, y: 192 },
  { x: 381, y: 196 },
  { x: 397, y: 229 },
  { x: 420, y: 300 },
  { x: 424, y: 371 },
  { x: 435, y: 429 },
  { x: 450, y: 452 },
  { x: 540, y: 532 },
  { x: 630, y: 542 },
  { x: 720, y: 527 },
  { x: 810, y: 492 },
  { x: 870, y: 452 },
  { x: 925, y: 318 },
  { x: 976, y: 230 },
  { x: 1020, y: 197 },
  { x: 1074, y: 172 },
  { x: 1135, y: 154 },
  { x: 1175, y: 147 },
  { x: 1240, y: 140 },
];

export function pathPointAt(path, index) {
  return path[index];
}

export function drawMap(ctx, mapImage) {
  ctx.drawImage(mapImage, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
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
