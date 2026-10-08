// Concrete wall blocks the player can build (simulate.js's placeWall), per
// user request: walls like Command & Conquer's or Dune 2000's -- enemies
// can't get through one, only shoot it down. Laid on a grid of WALL.size
// cells; two blocks side by side span most of a road, three all of it.
// Geometry shared by the simulation (placement) and enemy.js (driving into
// them, steering round them).
export const WALL = { size: 32, cost: 15, hp: 150, max: 40 };

const HALF = WALL.size / 2;

// The centre of the grid cell (x, y) falls in.
export function wallCell(x, y) {
  return {
    x: Math.floor(x / WALL.size) * WALL.size + HALF,
    y: Math.floor(y / WALL.size) * WALL.size + HALF,
  };
}

// Distance from (px, py) to block w's square (0 if inside it).
export function distToBlock(px, py, w) {
  const dx = Math.max(Math.abs(px - w.x) - HALF, 0);
  const dy = Math.max(Math.abs(py - w.y) - HALF, 0);
  return Math.hypot(dx, dy);
}

// Whether the segment a-b passes within `pad` of block w -- through its
// square grown by `pad` on every side (Liang-Barsky clipping).
export function segmentNearBlock(a, b, w, pad) {
  const h = HALF + pad;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  let t0 = 0;
  let t1 = 1;
  for (const [p, q] of [
    [-dx, a.x - (w.x - h)],
    [dx, w.x + h - a.x],
    [-dy, a.y - (w.y - h)],
    [dy, w.y + h - a.y],
  ]) {
    if (p === 0) {
      if (q < 0) return false;
      continue;
    }
    const r = q / p;
    if (p < 0) {
      if (r > t1) return false;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return false;
      if (r < t1) t1 = r;
    }
  }
  return true;
}
