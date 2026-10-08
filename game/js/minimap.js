// Overview map for a level bigger than the screen (level 3), per the RTS
// screenshots the user gave as reference (their "MINI" panel): the whole
// level in miniature in the bottom-left corner, enemies as red dots, the
// player's towers in cyan, the base marked, and a frame showing which part
// of the map is on screen. Clicking or dragging on it moves the camera
// there (main.js).

const LONG_SIDE = 190; // canvas px
const MARGIN = 14;
const HEADER = 18;

// Where the map part of the minimap sits on the canvas, and k, its scale
// from world px.
export function minimapRect(worldW, worldH, canvasH) {
  const k = LONG_SIDE / Math.max(worldW, worldH);
  const w = worldW * k;
  const h = worldH * k;
  return { x: MARGIN, y: canvasH - MARGIN - h, w, h, k };
}

// The world point under canvas point (cx, cy), or null if that's not on
// the minimap -- unless `clamp`, for a drag that started on it and has
// strayed off its edge: then the nearest point on it.
export function minimapToWorld(rect, cx, cy, clamp = false) {
  const inside = cx >= rect.x && cy >= rect.y && cx <= rect.x + rect.w && cy <= rect.y + rect.h;
  if (!inside && !clamp) return null;
  const px = Math.max(rect.x, Math.min(rect.x + rect.w, cx));
  const py = Math.max(rect.y, Math.min(rect.y + rect.h, cy));
  return { x: (px - rect.x) / rect.k, y: (py - rect.y) / rect.k };
}

// A scaled-down copy of the map image, made once: scaling the full image
// down every frame would be slow and shimmer.
const thumbs = new Map();
function thumbnail(img, w, h) {
  const key = `${img.src}|${w}x${h}`;
  let c = thumbs.get(key);
  if (!c) {
    c = document.createElement("canvas");
    c.width = Math.round(w);
    c.height = Math.round(h);
    const g = c.getContext("2d");
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = "high";
    g.drawImage(img, 0, 0, c.width, c.height);
    thumbs.set(key, c);
  }
  return c;
}

// `view`: { camera: {x, y}, w, h } -- the world rectangle on screen.
export function drawMinimap(ctx, rect, { mapImage, enemies, towers, walls = [], base, view }) {
  const { x, y, w, h, k } = rect;
  ctx.save();
  // Panel, with a header strip, in the build menu's teal-edged style.
  ctx.fillStyle = "rgba(6, 12, 18, 0.85)";
  ctx.fillRect(x - 4, y - HEADER - 4, w + 8, h + HEADER + 8);
  ctx.strokeStyle = "rgba(95, 216, 230, 0.7)";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x - 4, y - HEADER - 4, w + 8, h + HEADER + 8);
  ctx.fillStyle = "#9fe8f2";
  ctx.font = "bold 12px sans-serif";
  ctx.fillText("MAPA", x + 2, y - 7);

  if (mapImage) ctx.drawImage(thumbnail(mapImage, w, h), x, y, w, h);
  else {
    ctx.fillStyle = "#3a4a2f";
    ctx.fillRect(x, y, w, h);
  }
  // Dim the map a little so the markers stand out.
  ctx.fillStyle = "rgba(0, 0, 0, 0.25)";
  ctx.fillRect(x, y, w, h);

  if (base) {
    const bx = x + base.x * k;
    const by = y + base.y * k;
    ctx.fillStyle = "#3d8bff";
    ctx.beginPath();
    ctx.moveTo(bx, by - 6);
    ctx.lineTo(bx + 5, by);
    ctx.lineTo(bx, by + 6);
    ctx.lineTo(bx - 5, by);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = "#c9c3b8";
  for (const w of walls) ctx.fillRect(x + w.x * k - 1.5, y + w.y * k - 1.5, 3, 3);
  ctx.fillStyle = "#5fe0f0";
  for (const t of towers) ctx.fillRect(x + t.x * k - 2, y + t.y * k - 2, 4, 4);
  ctx.fillStyle = "#ff4a3d";
  for (const e of enemies) {
    const r = e.type === "soldier" ? 1.3 : 2;
    ctx.fillRect(x + e.x * k - r, y + e.y * k - r, r * 2, r * 2);
  }

  // What's on screen right now, clipped to the minimap.
  const vx = Math.max(x, x + view.camera.x * k);
  const vy = Math.max(y, y + view.camera.y * k);
  const vw = Math.min(x + w, x + (view.camera.x + view.w) * k) - vx;
  const vh = Math.min(y + h, y + (view.camera.y + view.h) * k) - vy;
  ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(vx, vy, vw, vh);
  ctx.restore();
}
