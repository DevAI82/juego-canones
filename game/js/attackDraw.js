// Drawing what only the attack mode has (docs/2026-10-09-modo-atacante-
// design.md §3.10, §5): the fog, the selected units' rings and group
// numbers, the entries' flags, the base's mark, where orders were given, a
// tower's reach and the box being dragged. `s` arguments are world px per
// screen px (1 / zoom): marks and labels drawn at s keep their size on
// screen however far the map is zoomed.
import { FOG_CELL, fogPixels, greyPixels } from "./fog.js";
import { FOOTPRINT } from "./enemy.js";

// How long an order's mark stays on the map, in seconds.
export const MARKER_TIME = 0.8;

// The fog over the map: two tiny canvases, one pixel per fog cell,
// stretched over the world -- the stretching blurs the cells' edges into
// soft fog. The first takes the colour out of the grey areas ("saturation"
// blend), the second darkens them and blacks out what's never been seen.
export function createFogLayer() {
  let veil = null;
  let grey = null;
  let veilImage = null;
  let greyImage = null;
  const make = (w, h) => Object.assign(document.createElement("canvas"), { width: w, height: h });
  return {
    draw(ctx, fog) {
      if (!veil || veil.width !== fog.cols || veil.height !== fog.rows) {
        veil = make(fog.cols, fog.rows);
        grey = make(fog.cols, fog.rows);
        veilImage = veil.getContext("2d").createImageData(fog.cols, fog.rows);
        greyImage = grey.getContext("2d").createImageData(fog.cols, fog.rows);
      }
      fogPixels(fog, veilImage.data);
      greyPixels(fog, greyImage.data);
      veil.getContext("2d").putImageData(veilImage, 0, 0);
      grey.getContext("2d").putImageData(greyImage, 0, 0);
      const w = fog.cols * FOG_CELL;
      const h = fog.rows * FOG_CELL;
      ctx.save();
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.globalCompositeOperation = "saturation";
      ctx.drawImage(grey, 0, 0, w, h);
      ctx.globalCompositeOperation = "source-over";
      ctx.drawImage(veil, 0, 0, w, h);
      ctx.restore();
    },
    // The fog as last drawn, one pixel per cell (the minimap shows it too).
    canvas: () => veil,
  };
}

// A selected unit's green ring, round its body however it's turned.
export function drawSelectionRing(ctx, u) {
  const [len, wid] = FOOTPRINT[u.type] || [30, 30];
  ctx.save();
  ctx.translate(u.x, u.y);
  ctx.rotate(u.angle || 0);
  ctx.strokeStyle = "rgba(93, 255, 122, 0.95)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(0, 0, len / 2 + 5, wid / 2 + 5, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

// A unit's group number, by its side.
export function drawGroupNumber(ctx, u, n, s) {
  ctx.save();
  ctx.font = `bold ${13 * s}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineWidth = 3 * s;
  ctx.strokeStyle = "rgba(0, 0, 0, 0.85)";
  ctx.fillStyle = "#c8ffd2";
  const x = u.x + 14 * s;
  const y = u.y + 14 * s;
  ctx.strokeText(String(n), x, y);
  ctx.fillText(String(n), x, y);
  ctx.restore();
}

// A flag on each entry of the map; the active one (where bought units
// come in) bigger, yellow and labelled.
export function drawEntryFlags(ctx, entries, active, s) {
  entries.forEach((e, i) => {
    const on = i === active;
    const h = (on ? 34 : 26) * s;
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.strokeStyle = "#1b1b1b";
    ctx.lineWidth = 3 * s;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -h);
    ctx.stroke();
    ctx.fillStyle = on ? "#ffd84a" : "#6fd8e6";
    ctx.beginPath();
    ctx.moveTo(0, -h);
    ctx.lineTo(18 * s, -h + 7 * s);
    ctx.lineTo(0, -h + 14 * s);
    ctx.closePath();
    ctx.fill();
    ctx.lineWidth = 1 * s;
    ctx.strokeStyle = "rgba(0, 0, 0, 0.6)";
    ctx.stroke();
    if (on) {
      ctx.font = `bold ${11 * s}px sans-serif`;
      ctx.textAlign = "center";
      ctx.lineWidth = 3 * s;
      ctx.strokeStyle = "rgba(0, 0, 0, 0.85)";
      ctx.fillStyle = "#ffe27a";
      ctx.strokeText("ENTRADA", 0, -h - 6 * s);
      ctx.fillText("ENTRADA", 0, -h - 6 * s);
    }
    ctx.restore();
  });
}

// The base, always marked -- even under the fog: it's the target. Under
// the pointer with units picked (`entering`), green with «ENTRAR»: a click
// there sends them in.
export function drawBaseMarker(ctx, base, time, s, entering = false) {
  const pulse = 0.5 + 0.5 * Math.sin(time * 3);
  const r = ((entering ? 28 : 22) + 4 * pulse) * s;
  ctx.save();
  ctx.translate(base.x, base.y);
  ctx.strokeStyle = entering ? `rgba(93, 255, 122, ${0.7 + 0.3 * pulse})` : `rgba(255, 70, 60, ${0.6 + 0.4 * pulse})`;
  ctx.lineWidth = (entering ? 4 : 3) * s;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.stroke();
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 2;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * (r - 6 * s), Math.sin(a) * (r - 6 * s));
    ctx.lineTo(Math.cos(a) * (r + 8 * s), Math.sin(a) * (r + 8 * s));
    ctx.stroke();
  }
  ctx.font = `bold ${12 * s}px sans-serif`;
  ctx.textAlign = "center";
  ctx.lineWidth = 3 * s;
  ctx.strokeStyle = "rgba(0, 0, 0, 0.85)";
  ctx.fillStyle = entering ? "#5dff7a" : "#ff8a80";
  const label = entering ? "ENTRAR" : "BASE";
  ctx.strokeText(label, 0, -r - 10 * s);
  ctx.fillText(label, 0, -r - 10 * s);
  ctx.restore();
}

// Where orders were just given: a shrinking ring, green for a move, red
// for an attack or for going into the base.
export function drawOrderMarkers(ctx, markers, now) {
  for (const m of markers) {
    const age = now - m.t;
    if (age < 0 || age > MARKER_TIME) continue;
    const k = age / MARKER_TIME;
    ctx.save();
    ctx.globalAlpha = 1 - k;
    ctx.strokeStyle = m.kind === "move" ? "#5dff7a" : "#ff4a3d";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(m.x, m.y, 20 * (1 - 0.6 * k), 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

// A tower's reach, under the pointer.
export function drawRange(ctx, x, y, r) {
  ctx.save();
  ctx.fillStyle = "rgba(255, 74, 61, 0.08)";
  ctx.strokeStyle = "rgba(255, 120, 100, 0.8)";
  ctx.lineWidth = 1.5;
  ctx.setLineDash([8, 6]);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

// The box being dragged to select units (canvas px, drawn over the map).
export function drawSelectionBox(ctx, b) {
  const x = Math.min(b.x0, b.x1);
  const y = Math.min(b.y0, b.y1);
  const w = Math.abs(b.x1 - b.x0);
  const h = Math.abs(b.y1 - b.y0);
  ctx.save();
  ctx.fillStyle = "rgba(93, 255, 122, 0.12)";
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = "rgba(93, 255, 122, 0.9)";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x, y, w, h);
  ctx.restore();
}
