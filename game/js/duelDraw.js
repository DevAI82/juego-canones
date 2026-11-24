// A duel on the canvas (docs/2026-11-22-duelo-design.md §10): the arena,
// the two armies in their colours, the shots, the HUD and the round's
// banner. The arena is as big as the canvas, so there is no camera: canvas
// pixels are the duel's own coordinates.
//
// drawDuel paints one frame from a `scene`; it keeps nothing between
// frames and changes nothing in the duel.
import { ARENA, ZONES, arenaOf } from "./duelArenas.js";
import { DUEL_UNITS, SIDES, otherSide, unitStats } from "./duel.js";
import { duelHud, duelHint, roundBanner } from "./duelUI.js";

// Each side's colour: the left one blue, the right one red.
export const SIDE_COLOR = { left: "#4aa3ff", right: "#ff5a4a" };
const FOREGROUND_ALPHA = 0.92; // as the levels' foregrounds: what's behind still shows a little

const facing = (side) => (side === "left" ? 0 : Math.PI);

// ------------------------------------------------------------ the ground

// An arena whose picture isn't there (not made yet, or still loading):
// plain sand, and its obstacles as rocks.
function drawPlainGround(ctx, arena) {
  ctx.fillStyle = "#b39a62";
  ctx.fillRect(0, 0, ARENA.width, ARENA.height);
  const shade = ctx.createRadialGradient(ARENA.width / 2, ARENA.height / 2, 200, ARENA.width / 2, ARENA.height / 2, 760);
  shade.addColorStop(0, "rgba(255, 240, 200, 0.12)");
  shade.addColorStop(1, "rgba(40, 25, 5, 0.45)");
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, ARENA.width, ARENA.height);
  for (const o of arena.obstacles) {
    ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
    ctx.beginPath();
    ctx.ellipse(o.x + 5, o.y + 6, o.r, o.r * 0.9, 0, 0, Math.PI * 2);
    ctx.fill();
    const rock = ctx.createRadialGradient(o.x - o.r * 0.35, o.y - o.r * 0.4, o.r * 0.1, o.x, o.y, o.r);
    rock.addColorStop(0, "#a09a8c");
    rock.addColorStop(1, "#4d483f");
    ctx.fillStyle = rock;
    ctx.beginPath();
    ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2);
    ctx.fill();
  }
}

// While shopping: each side's zone, so that it's plain where units may be
// placed and where the rival's will appear.
function drawZones(ctx, side) {
  ctx.save();
  ctx.lineWidth = 2;
  ctx.setLineDash([10, 8]);
  for (const s of SIDES) {
    const z = ZONES[s];
    ctx.globalAlpha = s === side ? 0.16 : 0.08;
    ctx.fillStyle = SIDE_COLOR[s];
    ctx.fillRect(z.x0, z.y0, z.x1 - z.x0, z.y1 - z.y0);
    ctx.globalAlpha = s === side ? 0.85 : 0.4;
    ctx.strokeStyle = SIDE_COLOR[s];
    ctx.strokeRect(z.x0, z.y0, z.x1 - z.x0, z.y1 - z.y0);
  }
  ctx.restore();
  ctx.save();
  ctx.font = "bold 15px sans-serif";
  ctx.textAlign = "center";
  ctx.shadowColor = "rgba(0, 0, 0, 0.8)";
  ctx.shadowBlur = 4;
  for (const s of SIDES) {
    const z = ZONES[s];
    ctx.fillStyle = SIDE_COLOR[s];
    ctx.fillText(s === side ? "TU ZONA" : "ZONA RIVAL", (z.x0 + z.x1) / 2, z.y1 - 12);
  }
  ctx.restore();
}

// ------------------------------------------------------------ the units

// The ring of its side's colour under a unit.
function drawRing(ctx, u, side, { strong = false, color = SIDE_COLOR[side] } = {}) {
  const r = DUEL_UNITS[u.type].radius + 4;
  ctx.save();
  ctx.fillStyle = color;
  ctx.globalAlpha = strong ? 0.3 : 0.16;
  ctx.beginPath();
  ctx.arc(u.x, u.y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = strong ? 1 : 0.75;
  ctx.lineWidth = strong ? 3 : 1.6;
  ctx.strokeStyle = strong ? "#ffffff" : color;
  ctx.stroke();
  ctx.restore();
}

function drawBar(ctx, u, side) {
  const r = DUEL_UNITS[u.type].radius;
  const w = Math.max(20, r * 2 + 8);
  const h = 4;
  const y = u.y - r * 1.2 - 16;
  const pct = Math.max(0, Math.min(1, u.hp / u.maxHp));
  ctx.save();
  ctx.fillStyle = "rgba(0, 0, 0, 0.75)";
  ctx.fillRect(u.x - w / 2 - 1, y - 1, w + 2, h + 2);
  ctx.fillStyle = SIDE_COLOR[side];
  ctx.fillRect(u.x - w / 2, y, w * pct, h);
  ctx.restore();
}

// One unit: its picture off the 3D model, or a disc while the sheets load.
function drawUnit(ctx, scene, u, side, target = null) {
  const drawn = scene.drawUnit({ ...u, paint: side === "right" ? "red" : null }, target);
  if (drawn) return;
  ctx.save();
  ctx.fillStyle = SIDE_COLOR[side];
  ctx.beginPath();
  ctx.arc(u.x, u.y, DUEL_UNITS[u.type].radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// The armies as bought, while shopping: this side's (the unit being
// dragged where the pointer has it), and faded, what the rival fielded in
// the last fight.
function drawArmies(ctx, scene) {
  const { view, side, drag, selectedId } = scene;
  const rival = otherSide(side);
  const theirs = view.sides[rival].army.map((u) => ({ ...u, angle: facing(rival) }));
  ctx.save();
  ctx.globalAlpha = 0.45;
  for (const u of theirs) drawRing(ctx, u, rival);
  for (const u of [...theirs].sort((a, b) => a.y - b.y)) drawUnit(ctx, scene, u, rival);
  ctx.restore();

  const mine = view.sides[side].army.map((u) => ({
    ...u,
    ...(drag && drag.id === u.id ? { x: drag.x, y: drag.y } : null),
    angle: facing(side),
  }));
  const picked = mine.find((u) => u.id === selectedId);
  if (picked) {
    // How far the picked unit shoots, to help place it.
    ctx.save();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.55)";
    ctx.setLineDash([6, 6]);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(picked.x, picked.y, unitStats(picked.type, view.sides[side].upgrades[picked.type]).range, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
  for (const u of mine) {
    const dragged = drag && drag.id === u.id;
    drawRing(ctx, u, side, { strong: u.id === selectedId, color: dragged ? (drag.ok ? "#5dff7a" : "#ff4d4d") : undefined });
  }
  for (const u of [...mine].sort((a, b) => a.y - b.y)) drawUnit(ctx, scene, u, side);
}

// The fight: what is left of the fallen, then the living, each with its
// ring and its health.
function drawFight(ctx, scene) {
  const { view } = scene;
  for (const mark of scene.scorch) {
    const burn = ctx.createRadialGradient(mark.x, mark.y, 1, mark.x, mark.y, mark.r * 1.8);
    burn.addColorStop(0, "rgba(15, 12, 10, 0.75)");
    burn.addColorStop(1, "rgba(15, 12, 10, 0)");
    ctx.fillStyle = burn;
    ctx.beginPath();
    ctx.arc(mark.x, mark.y, mark.r * 1.8, 0, Math.PI * 2);
    ctx.fill();
  }
  const living = view.units.filter((u) => u.alive);
  const byId = new Map(living.map((u) => [u.id, u]));
  for (const u of living) drawRing(ctx, u, u.side);
  for (const u of [...living].sort((a, b) => a.y - b.y)) drawUnit(ctx, scene, u, u.side, byId.get(u.targetId) || null);
  for (const u of living) drawBar(ctx, u, u.side);
}

// ------------------------------------------------------------ shots and blasts

// A shot is in the duel's state for 0.4 s, for this: the hit itself has
// already landed.
function drawShot(ctx, shot) {
  const { from, to, age, type } = shot;
  ctx.save();
  ctx.lineCap = "round";
  if (type === "rocket") {
    // A rocket flies there, trailing smoke, and bursts.
    const flight = 0.22;
    const t = Math.min(1, age / flight);
    const x = from.x + (to.x - from.x) * t;
    const y = from.y + (to.y - from.y) * t;
    ctx.strokeStyle = `rgba(230, 230, 230, ${0.5 * (1 - age / 0.4)})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(x, y);
    ctx.stroke();
    if (t < 1) {
      ctx.fillStyle = "#ffd27a";
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fill();
    } else {
      const k = (age - flight) / (0.4 - flight);
      const reach = DUEL_UNITS.rocket.splash * (0.4 + 0.6 * k);
      const blast = ctx.createRadialGradient(to.x, to.y, 2, to.x, to.y, reach);
      blast.addColorStop(0, `rgba(255, 235, 170, ${0.9 * (1 - k)})`);
      blast.addColorStop(0.5, `rgba(255, 130, 40, ${0.6 * (1 - k)})`);
      blast.addColorStop(1, "rgba(255, 90, 20, 0)");
      ctx.fillStyle = blast;
      ctx.beginPath();
      ctx.arc(to.x, to.y, reach, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    // A gun: a streak that fades, thicker for a tank's shell.
    const heavy = type === "tank";
    const life = heavy ? 0.18 : 0.1;
    if (age < life) {
      ctx.strokeStyle = `rgba(255, 240, 170, ${1 - age / life})`;
      ctx.lineWidth = heavy ? 3 : 1.5;
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
    }
    if (age < 0.2) {
      ctx.fillStyle = `rgba(255, 200, 90, ${0.8 * (1 - age / 0.2)})`;
      ctx.beginPath();
      ctx.arc(to.x, to.y, heavy ? 9 : 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

const BURST_TIME = 0.55; // s a destroyed unit's blast lasts (duelScreen.js ages them)

function drawBurst(ctx, burst) {
  const k = Math.min(1, burst.age / BURST_TIME);
  const reach = burst.size * (0.5 + k);
  const fire = ctx.createRadialGradient(burst.x, burst.y, 1, burst.x, burst.y, reach);
  fire.addColorStop(0, `rgba(255, 245, 200, ${1 - k})`);
  fire.addColorStop(0.4, `rgba(255, 150, 40, ${0.85 * (1 - k)})`);
  fire.addColorStop(1, "rgba(120, 40, 10, 0)");
  ctx.fillStyle = fire;
  ctx.beginPath();
  ctx.arc(burst.x, burst.y, reach, 0, Math.PI * 2);
  ctx.fill();
}

// ------------------------------------------------------------ over the arena

function drawHud(ctx, scene) {
  const { view, side } = scene;
  const hud = duelHud(view, side);
  ctx.save();
  ctx.shadowColor = "rgba(0, 0, 0, 0.85)";
  ctx.shadowBlur = 4;
  ctx.fillStyle = "#fff";
  ctx.font = "20px sans-serif";
  ctx.fillText(hud.head, 20, 30);
  ctx.fillText(`${hud.money}   ·   ${hud.army}`, 20, 55);

  // The score: a pip a round to win, each side's filled as it wins them.
  const mid = ARENA.width / 2;
  const pip = (x, filled, color) => {
    ctx.beginPath();
    ctx.arc(x, 24, 8, 0, Math.PI * 2);
    ctx.fillStyle = filled ? color : "rgba(0, 0, 0, 0.45)";
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = color;
    ctx.stroke();
  };
  const rival = otherSide(side);
  ctx.font = "bold 16px sans-serif";
  ctx.textAlign = "right";
  ctx.fillStyle = SIDE_COLOR[side];
  ctx.fillText("TÚ", mid - 24 - hud.toWin * 24, 30);
  ctx.textAlign = "left";
  ctx.fillStyle = SIDE_COLOR[rival];
  ctx.fillText("RIVAL", mid + 24 + hud.toWin * 24, 30);
  for (let i = 0; i < hud.toWin; i++) {
    pip(mid - 26 - i * 24, i < hud.mine, SIDE_COLOR[side]);
    pip(mid + 26 + i * 24, i < hud.theirs, SIDE_COLOR[rival]);
  }

  ctx.textAlign = "center";
  let y = 62;
  if (hud.clock) {
    ctx.font = "bold 26px sans-serif";
    ctx.fillStyle = "#fff";
    ctx.fillText(hud.clock, mid, y);
    y += 28;
  }
  const hint = duelHint(view, side);
  if (hint) {
    ctx.font = "bold 18px sans-serif";
    ctx.fillStyle = "#ffe27a";
    ctx.fillText(hint, mid, y);
  }
  if (scene.paused) {
    ctx.font = "36px sans-serif";
    ctx.fillStyle = "#ffd700";
    ctx.fillText("PAUSA", mid, 140);
  }
  ctx.restore();
}

function drawBanner(ctx, banner) {
  const w = 560;
  const h = 150;
  const x = (ARENA.width - w) / 2;
  const y = (ARENA.height - h) / 2 - 30;
  const color = banner.won ? "#ffd75e" : "#ff6b5e";
  ctx.save();
  ctx.fillStyle = "rgba(6, 10, 12, 0.82)";
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 10);
  ctx.fill();
  ctx.stroke();
  ctx.textAlign = "center";
  ctx.fillStyle = color;
  ctx.font = "bold 42px sans-serif";
  ctx.fillText(banner.title, ARENA.width / 2, y + 56);
  ctx.fillStyle = "#fff";
  ctx.font = "19px sans-serif";
  ctx.fillText(banner.detail, ARENA.width / 2, y + 92);
  ctx.fillStyle = "#9dffb0";
  ctx.font = "bold 18px sans-serif";
  ctx.fillText(`Asalto: ${banner.income}   ·   Botín del combate: ${banner.earned}`, ARENA.width / 2, y + 126);
  ctx.restore();
}

// ------------------------------------------------------------ a frame

// scene: {
//   view      the duel as the player may see it (duel.js's duelView)
//   side      the player's side
//   map, foreground   the arena's pictures (loaded images), or null
//   drawUnit(unit, target)   draws a unit off its 3D model's sheets (main.js);
//                            false if they aren't loaded yet. unit.paint is
//                            "red" for the right-hand side's
//   selectedId, drag         the unit picked, and { id, x, y, ok } while one is dragged
//   scorch, bursts           marks of the fallen: [{ x, y, r }], [{ x, y, age, size }]
//   paused
// }
export function drawDuel(ctx, scene) {
  const { view } = scene;
  const arena = arenaOf(view.arena);
  if (scene.map) ctx.drawImage(scene.map, 0, 0, ARENA.width, ARENA.height);
  else drawPlainGround(ctx, arena);

  if (view.phase === "buy") {
    drawZones(ctx, scene.side);
    drawArmies(ctx, scene);
  } else {
    drawFight(ctx, scene);
  }
  if (scene.foreground) {
    ctx.save();
    ctx.globalAlpha = FOREGROUND_ALPHA;
    ctx.drawImage(scene.foreground, 0, 0, ARENA.width, ARENA.height);
    ctx.restore();
  }
  // Over the foreground: a shot behind a palisade still shows.
  for (const shot of view.shots) drawShot(ctx, shot);
  for (const burst of scene.bursts) drawBurst(ctx, burst);

  drawHud(ctx, scene);
  const banner = view.phase === "roundEnd" ? roundBanner(view, scene.side) : null;
  if (banner) drawBanner(ctx, banner);
}

export { BURST_TIME };
