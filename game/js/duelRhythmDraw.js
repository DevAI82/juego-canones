// The musical duel's fight on the canvas (docs/2026-11-25-duelo-musical-
// prueba.md): a wide track down the middle of the arena where the song's
// keys fall to a line -- the four arrows on one side, the numbers on the
// other, as they lie on a keyboard -- and, either side of it, the two
// armies (duelStage.js puts them there, bigger), each with its health, its
// tally and what is happening to it.
//
// The player's eyes are on the keys, so everything that matters is said
// loud: a word for every hit, bigger ones for the streaks, a red shake for
// a mistake, the shells flying over the track, a side going red as its
// army runs out of health (all asked by the user, 2026-11-26).
//
// Each function paints its part of one frame from a `scene`; they keep
// nothing between frames and change nothing in the duel. duelScreen.js
// calls them in order, between duelDraw.js's own parts:
//
//   the ground and the armies (duelDraw.js)
//   drawRhythmSides    each side's danger, health and tally
//   drawRhythm         the track, its keys and what is said to the player
//   drawVolleys        the shots, over the track
//   (the fallen's blasts, the HUD: duelDraw.js)
//   drawRhythmFlash    the red of a mistake, over everything
//
// scene: {
//   view      the duel (a musical one, in its fight), as duelStage.js's
//             stagedView shows it
//   side      the player's side
//   presses   what the player just pressed: { [lane]: { age (s), hit } }
//   loading   the song's recording hasn't come yet: the fight waits for it
//   approach  s the keys are taking down the track (approachOf the player's
//             streak, eased by the screen so that they don't jump)
// }
import { ARENA } from "./duelArenas.js";
import { SIDES } from "./duel.js";
import { LANES, ARROWS, fightChart, beatLines, songOf } from "./duelSongs.js";
import { songClock, streakPower } from "./duelRhythm.js";
import { SIDE_COLOR } from "./duelDraw.js";
import { STAGE, armyHealth, danger } from "./duelStage.js";

// ------------------------------------------------------------ where things are

const LANE = 80; // px a key's lane is wide
const GAP = 40; // px between the arrows and the numbers
const KEY = 66; // px a key is across
const WIDTH = LANES.length * LANE + GAP;
export const TRACK = {
  x0: (ARENA.width - WIDTH) / 2,
  x1: (ARENA.width + WIDTH) / 2,
  top: 92, // where a key comes in
  line: 618, // where it is to be pressed
  bottom: 728,
};
export const APPROACH = 1.8; // s a key takes from the top to the line
const PANEL = { x: TRACK.x0 - 10, y: TRACK.top - 14, w: WIDTH + 20, h: TRACK.bottom - TRACK.top + 24 };

// The middle of a lane (its place in LANES).
export const laneX = (index) => TRACK.x0 + index * LANE + (index >= ARROWS.length ? GAP : 0) + LANE / 2;

// The time a key takes down the track for a player who has hit so many in
// a row: the better one plays the faster they come (and the heavier one's
// volleys: the prize is bigger, so is the trial -- the user's, 2026-11-26).
// A key is on the line at its moment whatever the pace: it only shows later.
const FASTER_A_HIT = 0.015; // of the time, a hit
const FASTEST = 1.05; // s
export const approachOf = (streak) => Math.max(FASTEST, APPROACH * (1 - FASTER_A_HIT * Math.max(0, streak)));

// Where a key due at `t` is when the music is at `now` (approach: the time
// keys are taking down the track).
export const keyY = (t, now, approach = APPROACH) => TRACK.line - ((t - now) / approach) * (TRACK.line - TRACK.top);

// The lane under a point of the arena (a finger on the track presses its
// key), or null.
export function laneAt(pos) {
  if (pos.y < TRACK.top || pos.y > TRACK.bottom) return null;
  for (let i = 0; i < LANES.length; i++) {
    if (Math.abs(pos.x - laneX(i)) <= LANE / 2) return LANES[i];
  }
  return null;
}

// ------------------------------------------------------------ what is said

const MISTAKES = ["miss", "wrong", "drop"];

// The word for a hit that makes so many in a row: { text, big } -- big for
// the streaks that make the army's volleys heavier (duelRhythm.js's
// STREAK_POWER), which are told with a banner.
export function cheer(streak = 1) {
  if (streak === 25) return { text: "WELL DONE!", big: true };
  if (streak === 10) return { text: "GREAT!", big: true };
  if (streak > 25) return { text: "¡QUÉ PASADA!", big: false };
  if (streak >= 15) return { text: "EXCELLENT!", big: false };
  if (streak > 10) return { text: "SUPER!", big: false };
  if (streak >= 5) return { text: "¡MUY BIEN!", big: false };
  return { text: "¡BIEN!", big: false };
}
const cheerColor = (streak = 1) => (streak >= 25 ? "#ff9df0" : streak >= 10 ? "#ffd75e" : streak >= 5 ? "#c8ff6a" : "#7dff8e");

// A mistake of the player's shakes the screen for a moment, and reddens
// it: { x, y } px to move everything by, red 0 to 1.
const SHAKE_TIME = 0.4;
export function shakeOf(view, side) {
  const events = view.musical ? view.musical.events : [];
  const last = [...events].reverse().find((e) => e.side === side && MISTAKES.includes(e.kind));
  if (!last || last.age >= SHAKE_TIME) return { x: 0, y: 0, red: 0 };
  const k = 1 - last.age / SHAKE_TIME;
  return { x: 12 * k * Math.cos(last.age * 95), y: 9 * k * Math.cos(last.age * 71 + 1), red: k };
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
const SIGN = KEY / 34; // the signs were drawn for a key 34 px across

// A key's sign, about (x, y): an arrow, or its number.
function drawSign(ctx, lane, x, y, color) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.translate(x, y);
  ctx.scale(SIGN, SIGN);
  if (lane in TURN) {
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
    ctx.fillText(lane, 0, 1);
  }
  ctx.restore();
}

function box(ctx, x, y, size) {
  ctx.beginPath();
  ctx.roundRect(x - size / 2, y - size / 2, size, size, 12);
}

// Words that must be read at a glance: filled, with a dark edge.
function shout(ctx, text, x, y, { size, color, alpha = 1 }) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = `900 ${size}px sans-serif`;
  ctx.textAlign = "center";
  ctx.lineJoin = "round";
  ctx.lineWidth = Math.max(4, size / 7);
  ctx.strokeStyle = "rgba(0, 0, 0, 0.85)";
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.restore();
}

// ------------------------------------------------------------ the two sides

const FLIGHT = 0.24; // s a shell takes to cross (of the 0.4 a shot is in the state)
const SHOT_SHOWN = 0.4;

// Each side's part of the screen, from its edge to the track: redder as its
// army runs out of health, lit when a volley lands on it; over it, the
// army's health, its player's tally and streak.
export function drawRhythmSides(ctx, scene) {
  const { view, side } = scene;
  const m = view.musical;
  const now = songClock(view);
  ctx.save();
  for (const s of SIDES) {
    const mine = s === side;
    const strip = STAGE[s];
    const x0 = s === "left" ? 0 : PANEL.x + PANEL.w;
    const x1 = s === "left" ? PANEL.x : ARENA.width;
    const health = armyHealth(view, s);

    // In danger: red from the screen's edge in, throbbing when it is nearly over.
    const risk = danger(health);
    if (risk > 0) {
      const throb = risk > 0.5 ? 0.78 + 0.22 * Math.sin(now * 9) : 1;
      const edge = s === "left" ? x0 : x1;
      const inner = s === "left" ? x1 : x0;
      const red = ctx.createLinearGradient(edge, 0, inner, 0);
      red.addColorStop(0, `rgba(255, 20, 10, ${0.62 * risk * throb})`);
      red.addColorStop(1, `rgba(255, 20, 10, ${0.2 * risk * throb})`);
      ctx.fillStyle = red;
      ctx.fillRect(x0, 0, x1 - x0, ARENA.height);
    }
    // A volley landing on it.
    const landed = view.shots.filter((shot) => shot.side !== s && shot.age >= FLIGHT);
    if (landed.length) {
      const k = Math.min(...landed.map((shot) => (shot.age - FLIGHT) / (SHOT_SHOWN - FLIGHT)));
      ctx.fillStyle = `rgba(255, 190, 90, ${0.3 * (1 - k)})`;
      ctx.fillRect(x0, 0, x1 - x0, ARENA.height);
    }

    // The army's health.
    const bx = strip.x0 + 14;
    const bw = strip.x1 - strip.x0 - 28;
    ctx.shadowColor = "rgba(0, 0, 0, 0.9)";
    ctx.shadowBlur = 4;
    ctx.font = "bold 15px sans-serif";
    ctx.textAlign = "left";
    ctx.fillStyle = SIDE_COLOR[s];
    ctx.fillText(mine ? "TU EJÉRCITO" : "EJÉRCITO RIVAL", bx, 96);
    ctx.textAlign = "right";
    ctx.fillStyle = "#ffffff";
    ctx.fillText(`${Math.ceil(health * 100)} %`, bx + bw, 96);
    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
    ctx.fillRect(bx - 2, 102, bw + 4, 18);
    ctx.fillStyle = health > 0.5 ? "#5fd96b" : health > 0.25 ? "#ffd24a" : "#ff4d3d";
    ctx.fillRect(bx, 104, bw * health, 14);

    // Its player's tally, and the streak when there is one to speak of.
    const tally = m.tally[s];
    const cx = (strip.x0 + strip.x1) / 2;
    ctx.shadowBlur = 4;
    ctx.textAlign = "center";
    ctx.font = "bold 16px sans-serif";
    ctx.fillStyle = "#ffffff";
    ctx.fillText(`✔ ${tally.hits}     ✖ ${tally.misses}`, cx, 142);
    if (tally.streak >= 5) {
      const power = streakPower(tally.streak);
      ctx.font = "bold 16px sans-serif";
      ctx.fillStyle = cheerColor(tally.streak);
      ctx.fillText(`${tally.streak} seguidas${power > 1 ? `  ·  disparos ×${power}` : ""}`, cx, 163);
    }
    ctx.shadowBlur = 0;

    // The rival's mistake is told on its side (the player's own, on the track).
    const slip = mine ? null : [...m.events].reverse().find((e) => e.side === s && MISTAKES.includes(e.kind));
    if (slip && slip.age < 0.7) {
      const k = slip.age / 0.7;
      shout(ctx, "¡FALLA!", cx, 230 - 16 * k, { size: 40, color: "#ffe27a", alpha: 1 - k });
    }
  }
  ctx.restore();
}

// ------------------------------------------------------------ the track

export function drawRhythm(ctx, scene) {
  const { view, side } = scene;
  const m = view.musical;
  const chart = fightChart(m.song);
  const now = songClock(view);
  const marks = m.marks[side] || [];
  const mid = ARENA.width / 2;
  const approach = scene.approach || APPROACH;

  // The track.
  ctx.save();
  ctx.fillStyle = "rgba(8, 12, 20, 0.8)";
  ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(PANEL.x, PANEL.y, PANEL.w, PANEL.h, 14);
  ctx.fill();
  ctx.stroke();
  // Everything that moves on it stays inside it.
  ctx.beginPath();
  ctx.rect(PANEL.x, PANEL.y, PANEL.w, PANEL.h);
  ctx.clip();

  // The lanes, and the beats coming down them: the bars' are brighter.
  LANES.forEach((lane, i) => {
    ctx.fillStyle = COLOR[lane];
    ctx.globalAlpha = 0.08;
    ctx.fillRect(laneX(i) - LANE / 2 + 3, PANEL.y, LANE - 6, PANEL.h);
  });
  ctx.globalAlpha = 1;
  for (const line of beatLines(m.song, now, now + approach)) {
    const y = keyY(line.t, now, approach);
    ctx.fillStyle = line.bar ? "rgba(255, 255, 255, 0.28)" : "rgba(255, 255, 255, 0.1)";
    ctx.fillRect(TRACK.x0, y - 1, WIDTH, line.bar ? 3 : 2);
  }

  // The line, with each lane's key on it: lit for a moment when pressed.
  ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
  ctx.fillRect(TRACK.x0 - 4, TRACK.line + KEY / 2 + 5, WIDTH + 8, 3);
  LANES.forEach((lane, i) => {
    const x = laneX(i);
    const press = scene.presses[lane];
    const lit = press ? Math.max(0, 1 - press.age / 0.18) : 0;
    box(ctx, x, TRACK.line, KEY);
    ctx.fillStyle = lit > 0 ? (press.hit ? COLOR[lane] : "#ff3b30") : "rgba(0, 0, 0, 0.45)";
    ctx.globalAlpha = lit > 0 ? 0.35 + 0.65 * lit : 1;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.lineWidth = 3;
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
    if (note.t > now + approach) break;
    const mark = marks[i];
    if (mark === 1) continue;
    const holding = mark === 3;
    const lost = mark === 2;
    const y = holding ? TRACK.line : keyY(note.t, now, approach);
    const end = keyY(note.t + note.hold, now, approach); // where its tail ends, above it
    if (Math.min(y, end) > TRACK.bottom + KEY) continue;
    const x = laneX(LANES.indexOf(note.lane));
    ctx.globalAlpha = lost ? 0.35 : 1;
    if (note.hold > 0 && end < y) {
      ctx.beginPath();
      ctx.roundRect(x - 17, end, 34, y - end, 17);
      ctx.fillStyle = lost ? "#555b66" : COLOR[note.lane];
      ctx.globalAlpha *= holding ? 1 : 0.7;
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = holding ? "#ffffff" : "rgba(0, 0, 0, 0.5)";
      ctx.stroke();
      ctx.globalAlpha = lost ? 0.35 : 1;
    }
    box(ctx, x, y, holding ? KEY + 10 : KEY);
    ctx.fillStyle = lost ? "#555b66" : COLOR[note.lane];
    ctx.fill();
    ctx.lineWidth = holding ? 5 : 3;
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

  // Before the round's first key: the song, and what to do.
  const next = chart.notes[m.from[side] || 0];
  const nothingYet = m.tally[side].hits + m.tally[side].misses === 0;
  if (scene.loading) {
    ctx.font = "bold 30px sans-serif";
    ctx.fillStyle = "#ffe27a";
    ctx.fillText("Cargando la música…", mid, TRACK.top + 190);
  } else if (nothingYet && next && now < next.t - 0.3) {
    ctx.font = "bold 22px sans-serif";
    ctx.fillStyle = "#9fd6ff";
    ctx.fillText(`♪  ${songOf(m.song).name}`, mid, TRACK.top + 120);
    ctx.font = "bold 40px sans-serif";
    ctx.fillStyle = "#ffe27a";
    ctx.fillText("¡Prepárate!", mid, TRACK.top + 190);
    ctx.font = "22px sans-serif";
    ctx.fillStyle = "#ffffff";
    ctx.fillText("Pulsa cada tecla cuando llegue a la línea de abajo", mid, TRACK.top + 240);
    ctx.fillText("Las que traen cola se mantienen pulsadas", mid, TRACK.top + 276);
    ctx.fillText("Si fallas, el rival dispara", mid, TRACK.top + 324);
    ctx.fillText("10 y 25 aciertos seguidos: tus disparos pegan más", mid, TRACK.top + 360);
  }
  ctx.restore();

  // The player's own latest key, under the line (clear of the keys coming):
  // a word for a hit, by its streak; red for a mistake.
  const said = TRACK.line + KEY / 2 + 58;
  const last = [...m.events].reverse().find((e) => e.side === side);
  if ((m.held[side] || []).length > 0) {
    shout(ctx, "¡MANTÉN!", mid, said, { size: 38, color: "#ffe27a" });
  } else if (last && last.age < 0.5) {
    const k = last.age / 0.5;
    if (MISTAKES.includes(last.kind)) {
      shout(ctx, last.kind === "drop" ? "¡SOLTASTE!" : "FALLO", mid, said, { size: 40, color: "#ff3b30", alpha: 1 - k });
    } else {
      // (A long key kept to its end is cheered as the streak stands.)
      const streak = last.kind === "hit" ? last.streak : m.tally[side].streak;
      const pop = 1 + 0.35 * Math.max(0, 1 - last.age / 0.12);
      shout(ctx, cheer(streak).text, mid, said, { size: Math.round((streak >= 5 ? 40 : 34) * pop), color: cheerColor(streak), alpha: 1 - k * k });
    }
  }

  // A mistake, told big across the track: nobody is to miss that the rival
  // is firing.
  const slip = [...m.events].reverse().find((e) => e.side === side && MISTAKES.includes(e.kind));
  if (slip && slip.age < 0.6) {
    const k = slip.age / 0.6;
    shout(ctx, "¡FALLO!", mid, TRACK.top + 250 - 14 * k, { size: 96, color: "#ff2a1a", alpha: 1 - k * k });
    shout(ctx, "Dispara el rival", mid, TRACK.top + 292 - 14 * k, { size: 24, color: "#ffffff", alpha: 1 - k * k });
  }

  // The streaks that make the army's volleys heavier: a banner.
  const feat = [...m.events].reverse().find((e) => e.side === side && e.kind === "hit" && cheer(e.streak).big);
  if (feat && feat.age < 0.8 && !(slip && slip.age < feat.age)) {
    const k = feat.age / 0.8;
    const pop = 1 + 0.5 * Math.max(0, 1 - feat.age / 0.15);
    shout(ctx, cheer(feat.streak).text, mid, TRACK.top + 190, { size: Math.round(78 * pop), color: cheerColor(feat.streak), alpha: 1 - k * k * k });
    shout(ctx, `${feat.streak} seguidas: tus disparos pegan ×${streakPower(feat.streak)}`, mid, TRACK.top + 232, { size: 24, color: "#ffffff", alpha: 1 - k * k * k });
  }
}

// ------------------------------------------------------------ the volleys

// The shots, over the track: a shell of its army's colour flies from the
// unit that fired to the one it was for, and bursts there.
export function drawVolleys(ctx, scene) {
  ctx.save();
  ctx.lineCap = "round";
  for (const shot of scene.view.shots) {
    const { from, to, age, type } = shot;
    const heavy = type === "tank" || type === "rocket";
    const color = SIDE_COLOR[shot.side];
    if (age < 0.09) {
      // The gun's flash.
      ctx.fillStyle = `rgba(255, 240, 180, ${1 - age / 0.09})`;
      ctx.beginPath();
      ctx.arc(from.x, from.y, heavy ? 22 : 13, 0, Math.PI * 2);
      ctx.fill();
    }
    if (age < FLIGHT) {
      const k = age / FLIGHT;
      const at = (share) => ({ x: from.x + (to.x - from.x) * share, y: from.y + (to.y - from.y) * share });
      const head = at(k);
      const tail = at(Math.max(0, k - 0.3));
      const trail = ctx.createLinearGradient(tail.x, tail.y, head.x, head.y);
      trail.addColorStop(0, "rgba(255, 255, 255, 0)");
      trail.addColorStop(1, color);
      ctx.strokeStyle = trail;
      ctx.lineWidth = heavy ? 8 : 4;
      ctx.beginPath();
      ctx.moveTo(tail.x, tail.y);
      ctx.lineTo(head.x, head.y);
      ctx.stroke();
      ctx.shadowColor = color;
      ctx.shadowBlur = 18;
      ctx.fillStyle = "#fff6d8";
      ctx.beginPath();
      ctx.arc(head.x, head.y, heavy ? 9 : 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    } else {
      const k = Math.min(1, (age - FLIGHT) / (SHOT_SHOWN - FLIGHT));
      const reach = (heavy ? 52 : 28) * (0.45 + 0.75 * k);
      const blast = ctx.createRadialGradient(to.x, to.y, 2, to.x, to.y, reach);
      blast.addColorStop(0, `rgba(255, 245, 200, ${1 - k})`);
      blast.addColorStop(0.45, `rgba(255, 140, 40, ${0.75 * (1 - k)})`);
      blast.addColorStop(1, "rgba(255, 90, 20, 0)");
      ctx.fillStyle = blast;
      ctx.beginPath();
      ctx.arc(to.x, to.y, reach, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

// ------------------------------------------------------------ a mistake's red

// The whole screen, red for a moment (shake: shakeOf's), deepest at its edges.
export function drawRhythmFlash(ctx, shake) {
  if (!shake.red) return;
  ctx.save();
  ctx.fillStyle = `rgba(255, 0, 0, ${0.3 * shake.red})`;
  ctx.fillRect(0, 0, ARENA.width, ARENA.height);
  const edge = ctx.createRadialGradient(ARENA.width / 2, ARENA.height / 2, ARENA.height * 0.35, ARENA.width / 2, ARENA.height / 2, ARENA.width * 0.62);
  edge.addColorStop(0, "rgba(255, 0, 0, 0)");
  edge.addColorStop(1, `rgba(255, 0, 0, ${0.8 * shake.red})`);
  ctx.fillStyle = edge;
  ctx.fillRect(0, 0, ARENA.width, ARENA.height);
  ctx.restore();
}
