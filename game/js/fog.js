// The attacker's fog of war (docs/2026-10-09-modo-atacante-design.md
// §3.10, per user request «con niebla gris»), on a grid of FOG_CELL px
// squares, each either never seen (black), seen before (grey: the ground
// darkened and the defence's towers drawn as they were when last seen) or
// in sight now. Only the attacker has fog: the computer's defence sees
// its whole ground, as any defender does. DOM-free; attack.js updates it
// every tick and keeps it in saves, main.js draws it.
export const FOG_CELL = 32;
// How far each unit type sees, and what the map's entries always show.
export const SIGHT = { soldier: 150, motorcycle: 240, buggy: 200, tank: 170, rocket: 160 };
export const ENTRY_SIGHT = 150;

export function createFog(width, height) {
  const cols = Math.ceil(width / FOG_CELL);
  const rows = Math.ceil(height / FOG_CELL);
  return { cols, rows, explored: new Uint8Array(cols * rows), visible: new Uint8Array(cols * rows), memory: {} };
}

function cellAt(fog, x, y) {
  const c = Math.floor(x / FOG_CELL);
  const r = Math.floor(y / FOG_CELL);
  return c < 0 || r < 0 || c >= fog.cols || r >= fog.rows ? -1 : r * fog.cols + c;
}

export function isVisible(fog, x, y) {
  const i = cellAt(fog, x, y);
  return i >= 0 && fog.visible[i] === 1;
}

export function isExplored(fog, x, y) {
  const i = cellAt(fog, x, y);
  return i >= 0 && fog.explored[i] === 1;
}

// Remembered structures are keyed by kind and place -- not by id, so the
// memory still matches after a saved game is loaded (everything gets new
// ids then) -- and a tower or block only ever stands on its own spot.
export function structureKey(s) {
  return `${s.kind === "wall" ? "wall" : "tower"}:${s.x},${s.y}`;
}

function snapshot(s) {
  if (s.kind === "wall") return { kind: "wall", x: s.x, y: s.y, hp: s.hp, maxHp: s.maxHp };
  return {
    kind: "tower",
    type: s.type,
    x: s.x,
    y: s.y,
    hp: s.hp,
    maxHp: s.maxHp,
    level: { ...s.level },
    angle: s.angle || 0,
    building: s.buildTimeRemaining > 0,
  };
}

// The fog as `viewers` ([{ x, y, r }]: units and entries) see the ground
// now: their circles are in sight and explored; the defence's
// `structures` (towers and wall blocks) in sight are remembered as they
// are, and a remembered one whose ground is in sight but that's no longer
// there is forgotten.
export function updateFog(fog, viewers, structures) {
  fog.visible.fill(0);
  for (const v of viewers) {
    const c0 = Math.max(0, Math.floor((v.x - v.r) / FOG_CELL));
    const c1 = Math.min(fog.cols - 1, Math.floor((v.x + v.r) / FOG_CELL));
    const r0 = Math.max(0, Math.floor((v.y - v.r) / FOG_CELL));
    const r1 = Math.min(fog.rows - 1, Math.floor((v.y + v.r) / FOG_CELL));
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const dx = (c + 0.5) * FOG_CELL - v.x;
        const dy = (r + 0.5) * FOG_CELL - v.y;
        if (dx * dx + dy * dy > v.r * v.r) continue;
        fog.visible[r * fog.cols + c] = 1;
        fog.explored[r * fog.cols + c] = 1;
      }
    }
  }
  const standing = new Set();
  for (const s of structures) {
    if (!(s.hp > 0)) continue;
    const key = structureKey(s);
    standing.add(key);
    if (isVisible(fog, s.x, s.y)) fog.memory[key] = snapshot(s);
  }
  for (const [key, m] of Object.entries(fog.memory)) {
    if (!standing.has(key) && isVisible(fog, m.x, m.y)) delete fog.memory[key];
  }
}

// Whether the attacker knows of this structure: in sight now, or
// remembered from before.
export function knownStructure(fog, s) {
  return isVisible(fog, s.x, s.y) || Boolean(fog.memory[structureKey(s)]);
}

// For a save: the explored cells as a hex string (4 cells a digit) and the
// remembered structures.
export function saveFog(fog) {
  let explored = "";
  for (let i = 0; i < fog.explored.length; i += 4) {
    let v = 0;
    for (let k = 0; k < 4; k++) if (fog.explored[i + k]) v |= 1 << k;
    explored += v.toString(16);
  }
  return { explored, memory: Object.values(fog.memory).map((m) => JSON.parse(JSON.stringify(m))) };
}

// Back from a save, into a fresh fog of the same map. A damaged part is
// left out rather than breaking the load.
export function restoreFog(fog, saved) {
  if (!saved || typeof saved !== "object") return;
  const hex = saved.explored;
  if (typeof hex === "string" && hex.length === Math.ceil(fog.explored.length / 4) && /^[0-9a-f]*$/.test(hex)) {
    for (let i = 0; i < fog.explored.length; i++) fog.explored[i] = (parseInt(hex[i >> 2], 16) >> (i & 3)) & 1;
  }
  for (const m of Array.isArray(saved.memory) ? saved.memory : []) {
    if (!m || typeof m !== "object" || (m.kind !== "tower" && m.kind !== "wall")) continue;
    if (!Number.isFinite(m.x) || !Number.isFinite(m.y)) continue;
    fog.memory[structureKey(m)] = m;
  }
}

// How the fog looks, one pixel per cell (RGBA, cols x rows, row by row):
// never seen, black; seen before, a dark veil (VEIL_ALPHA); in sight,
// clear. attackDraw.js stretches it over the map, which softens the
// cells' edges into fog.
export const VEIL_ALPHA = 150;

export function fogPixels(fog, out = new Uint8ClampedArray(fog.cols * fog.rows * 4)) {
  for (let i = 0; i < fog.cols * fog.rows; i++) {
    out[i * 4] = 6;
    out[i * 4 + 1] = 8;
    out[i * 4 + 2] = 10;
    out[i * 4 + 3] = fog.visible[i] ? 0 : fog.explored[i] ? VEIL_ALPHA : 255;
  }
  return out;
}

// The grey areas (seen before, not in sight now) as an opaque mid-grey
// mask, the rest clear: drawn with the "saturation" blend, it takes the
// colour out of them -- the design's grey fog.
export function greyPixels(fog, out = new Uint8ClampedArray(fog.cols * fog.rows * 4)) {
  for (let i = 0; i < fog.cols * fog.rows; i++) {
    out[i * 4] = 128;
    out[i * 4 + 1] = 128;
    out[i * 4 + 2] = 128;
    out[i * 4 + 3] = !fog.visible[i] && fog.explored[i] ? 255 : 0;
  }
  return out;
}
