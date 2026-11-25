// The musical duel's keys on the canvas (docs/2026-11-25-duelo-musical-
// prueba.md): a track down the middle of the arena, between the two armies,
// where the song's keys fall to a line -- the four arrows on one side, the
// numbers on the other, as they lie on a keyboard. duelDraw.js has painted
// the arena, the armies and the shots before this is called.
//
// drawRhythm paints one frame from a `scene`; it keeps nothing between
// frames and changes nothing in the duel.
import { ARENA, ZONES } from "./duelArenas.js";
import { SIDES, otherSide } from "./duel.js";
import { LANES, ARROWS, fightChart, songOf } from "./duelSongs.js";
import { songClock } from "./duelRhythm.js";
import { SIDE_COLOR } from "./duelDraw.js";

// ------------------------------------------------------------ where things are

const LANE = 40; // px a key's lane is wide
const GAP = 20; // px between the arrows and the numbers
const KEY = 34; // px a key is across
const WIDTH = LANES.length * LANE + GAP;
export const TRACK = {
  x0: (ARENA.width - WIDTH) / 2,
  x1: (ARENA.width + WIDTH) / 2,
  top: 100, // where a key comes in
  line: 640, // where it is to be pressed
  bottom: 700,
};
export const APPROACH = 1.8; // s a key takes from the top to the line

// The middle of a lane (its place in LANES).
export const laneX = (index) => TRACK.x0 + index * LANE + (index >= ARROWS.length ? GAP : 0) + LANE / 2;

// Where a key due at `t` is when the music is at `now`.
export const keyY = (t, now) => TRACK.line - ((t - now) / APPROACH) * (TRACK.line - TRACK.top);

// The lane under a point of the arena (a finger on the track presses its
// key), or null.
export function laneAt(pos) {
  if (pos.y < TRACK.top || pos.y > TRACK.bottom) return null;
  for (let i = 0; i < LANES.length; i++) {
    if (Math.abs(pos.x - laneX(i)) <= LANE / 2) return LANES[i];
  }
  return null;
}

// ------------------------------------------------------------ a key

const COLOR = {
  left: "#e052c8",
  down: "#38c6f4",
  up: "#4fd96b",
  right: "#f25757",
  1: "#f6c544",
  2: "#f29a3c",
  3: "#b7a2ff",
};
const TURN = { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 };

// A key's sign, about (x, y): an arrow, or its number.
function drawSign(ctx, lane, x, y, color) {
  ctx.save();
  ctx.fillStyle = color;
  if (lane in TURN) {
    ctx.translate(x, y);
    ctx.rotate(TURN[lane]);
    ctx.beginPath();
    ctx.moveTo(11, 0);
    ctx.lineTo(0, -10);
    ctx.lineTo(0, -4);
    ctx.lineTo(-10, -4);
    ctx.lineTo(-10, 4);
    ctx.lineTo(0, 4);
    ctx.lineTo(0, 10);
    ctx.closePath();
    ctx.fill();
  } else {
    ctx.font = "bold 22px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(lane, x, y + 1);
  }
  ctx.restore();
}

function box(ctx, x, y, size) {
  ctx.beginPath();
  ctx.roundRect(x - size / 2, y - size / 2, size, size, 7);
}

// ------------------------------------------------------------ a frame

// scene: {
//   view      the duel (a musical one, in its fight)
//   side      the player's side
//   presses   what the player just pressed: { [lane]: { age (s), hit } }
//   paused
//   loading   the song's recording hasn't come yet: the fight waits for it
// }
export function drawRhythm(ctx, scene) {
  const { view, side } = scene;
  const m = view.musical;
  const chart = fightChart(m.song);
  const now = songClock(view);
  const marks = m.marks[side] || [];
  const mid = ARENA.width / 2;

  // The track.
  ctx.save();
  ctx.fillStyle = "rgba(8, 12, 20, 0.66)";
  ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(TRACK.x0 - 10, TRACK.top - 14, WIDTH + 20, TRACK.bottom - TRACK.top + 24, 12);
  ctx.fill();
  ctx.stroke();
  // Everything that moves on it stays inside it.
  ctx.beginPath();
  ctx.rect(TRACK.x0 - 10, TRACK.top - 14, WIDTH + 20, TRACK.bottom - TRACK.top + 24);
  ctx.clip();

  // The lanes, and the beats coming down them: the bars' are brighter.
  LANES.forEach((lane, i) => {
    ctx.fillStyle = COLOR[lane];
    ctx.globalAlpha = 0.07;
    ctx.fillRect(laneX(i) - LANE / 2 + 2, TRACK.top - 14, LANE - 4, TRACK.bottom - TRACK.top + 24);
  });
  ctx.globalAlpha = 1;
  const { beat, first } = songOf(m.song);
  for (let k = Math.max(0, Math.ceil((now - first) / beat)); first + k * beat < now + APPROACH; k++) {
    const y = keyY(first + k * beat, now);
    ctx.fillStyle = k % 4 === 0 ? "rgba(255, 255, 255, 0.28)" : "rgba(255, 255, 255, 0.1)";
    ctx.fillRect(TRACK.x0, y - 1, WIDTH, 2);
  }

  // The line, with each lane's key on it: lit for a moment when pressed.
  ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
  ctx.fillRect(TRACK.x0 - 4, TRACK.line + KEY / 2 + 3, WIDTH + 8, 2);
  LANES.forEach((lane, i) => {
    const x = laneX(i);
    const press = scene.presses[lane];
    const lit = press ? Math.max(0, 1 - press.age / 0.18) : 0;
    box(ctx, x, TRACK.line, KEY);
    ctx.fillStyle = lit > 0 ? (press.hit ? COLOR[lane] : "#ff3b30") : "rgba(0, 0, 0, 0.45)";
    ctx.globalAlpha = lit > 0 ? 0.35 + 0.65 * lit : 1;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.lineWidth = 2;
    ctx.strokeStyle = COLOR[lane];
    ctx.stroke();
    drawSign(ctx, lane, x, TRACK.line, lit > 0 ? "#ffffff" : "rgba(255, 255, 255, 0.55)");
  });

  // The keys on their way down: those still to be pressed, the long ones
  // being held (they stay on the line while their tail runs into it) and,
  // for a moment, greyed, the ones missed. A long key has a tail as long
  // as it is to be kept down.
  for (let i = Math.max(0, (m.from[side] || 0) - 8); i < chart.notes.length; i++) {
    const note = chart.notes[i];
    if (note.t > now + APPROACH) break;
    const mark = marks[i];
    if (mark === 1) continue;
    const holding = mark === 3;
    const lost = mark === 2;
    const y = holding ? TRACK.line : keyY(note.t, now);
    const end = keyY(note.t + note.hold, now); // where its tail ends, above it
    if (Math.min(y, end) > TRACK.bottom + KEY) continue;
    const x = laneX(LANES.indexOf(note.lane));
    ctx.globalAlpha = lost ? 0.35 : 1;
    if (note.hold > 0 && end < y) {
      ctx.beginPath();
      ctx.roundRect(x - 9, end, 18, y - end, 9);
      ctx.fillStyle = lost ? "#555b66" : COLOR[note.lane];
      ctx.globalAlpha *= holding ? 1 : 0.7;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = holding ? "#ffffff" : "rgba(0, 0, 0, 0.5)";
      ctx.stroke();
      ctx.globalAlpha = lost ? 0.35 : 1;
    }
    box(ctx, x, y, holding ? KEY + 6 : KEY);
    ctx.fillStyle = lost ? "#555b66" : COLOR[note.lane];
    ctx.fill();
    ctx.lineWidth = holding ? 3 : 2;
    ctx.strokeStyle = holding ? "#ffffff" : "rgba(0, 0, 0, 0.55)";
    ctx.stroke();
    drawSign(ctx, note.lane, x, y, lost ? "#c9ccd2" : "#10141c");
    ctx.globalAlpha = 1;
  }
  ctx.restore();

  ctx.save();
  ctx.textAlign = "center";
  ctx.shadowColor = "rgba(0, 0, 0, 0.9)";
  ctx.shadowBlur = 5;

  // Before the round's first key: what to do.
  const next = chart.notes[m.from[side] || 0];
  const nothingYet = m.tally[side].hits + m.tally[side].misses === 0;
  if (scene.loading) {
    ctx.font = "bold 22px sans-serif";
    ctx.fillStyle = "#ffe27a";
    ctx.fillText("Cargando la música…", mid, TRACK.top + 150);
  } else if (nothingYet && next && now < next.t - 0.3) {
    ctx.font = "bold 22px sans-serif";
    ctx.fillStyle = "#ffe27a";
    ctx.fillText("¡Prepárate!", mid, TRACK.top + 150);
    ctx.font = "16px sans-serif";
    ctx.fillStyle = "#ffffff";
    ctx.fillText("Pulsa cada tecla cuando", mid, TRACK.top + 180);
    ctx.fillText("llegue a la línea de abajo", mid, TRACK.top + 202);
    ctx.fillText("Las que traen cola se", mid, TRACK.top + 236);
    ctx.fillText("mantienen pulsadas", mid, TRACK.top + 258);
    ctx.fillText("Si fallas, el rival dispara", mid, TRACK.top + 292);
  }

  // What each side just did, over its own army; and how it is doing.
  for (const s of SIDES) {
    const zone = ZONES[s];
    const x = (zone.x0 + zone.x1) / 2;
    const tally = m.tally[s];
    const mine = s === side;
    ctx.font = "bold 15px sans-serif";
    ctx.fillStyle = SIDE_COLOR[s];
    ctx.fillText(`${mine ? "TÚ" : "RIVAL"}:  ✔ ${tally.hits}   ✖ ${tally.misses}`, x, 112);
    if (tally.streak >= 5) {
      ctx.font = "bold 18px sans-serif";
      ctx.fillStyle = "#ffe27a";
      ctx.fillText(`¡${tally.streak} seguidas!`, x, 136);
    }
    // The latest thing this side did.
    const event = [...m.events].reverse().find((e) => e.side === s);
    if (event && event.kind !== "hit" && event.kind !== "held" && event.age < 0.7) {
      const k = event.age / 0.7;
      ctx.globalAlpha = 1 - k;
      ctx.font = "bold 40px sans-serif";
      ctx.fillStyle = "#ff4d3d";
      ctx.fillText(mine ? "¡FALLO!" : "¡FALLA EL RIVAL!", x, 190 - 20 * k);
      ctx.font = "bold 17px sans-serif";
      ctx.fillStyle = "#ffffff";
      ctx.fillText(`Dispara el ejército ${otherSide(s) === side ? "tuyo" : "rival"}`, x, 216 - 20 * k);
      ctx.globalAlpha = 1;
    }
  }

  // The player's own latest key, by the line.
  const last = [...m.events].reverse().find((e) => e.side === side);
  const good = last && (last.kind === "hit" || last.kind === "held");
  if ((m.held[side] || []).length > 0) {
    ctx.font = "bold 24px sans-serif";
    ctx.fillStyle = "#ffe27a";
    ctx.fillText("¡MANTÉN!", mid, TRACK.line - 44);
  } else if (last && last.age < 0.45) {
    ctx.globalAlpha = 1 - last.age / 0.45;
    ctx.font = "bold 24px sans-serif";
    ctx.fillStyle = good ? "#7dff8e" : "#ff4d3d";
    ctx.fillText(good ? "¡BIEN!" : last.kind === "drop" ? "¡SOLTASTE!" : "FALLO", mid, TRACK.line - 44 - 14 * (last.age / 0.45));
    ctx.globalAlpha = 1;
  }

  if (scene.paused) {
    ctx.font = "36px sans-serif";
    ctx.fillStyle = "#ffd700";
    ctx.fillText("PAUSA", mid, TRACK.top + 120);
  }
  ctx.restore();
}
