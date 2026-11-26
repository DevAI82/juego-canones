// The musical duel's 3D perspective fight overlay on the canvas:
//   - a tilted 3D smoked-glass rhythm highway fading smoothly into horizon
//     mist at the top, framed by chrome-silver metallic rails with glowing
//     cyan/gold neon edge strips, pure glowing 3D neon arrow notes on the
//     left lanes (← ↓ ↑ →) with laser hold shafts, sleek beveled dark-glass
//     3D number tiles on the right lanes (1 2 3), and a backlit gunmetal 3D
//     receptor dock with concentric neon shockwaves & miss sparks;
//   - fighting-game style metallic 3D top HUD with white damage-lag bars,
//     round pips, song/timer crest and streak badges (plus a matching Buy
//     Phase metallic HUD for the Musical Duel hangar);
//   - parabolic 3D volleys (glowing shells, smoking rockets, muzzle blasts
//     and multi-layer explosions) arcing across the highway whenever either
//     side misses a note.
//
// Each draw function paints its part of one frame from a `scene`; they keep
// nothing between frames and change nothing in the duel.
import { ARENA, arenaOf } from "./duelArenas.js";
import { SIDES, UNIT_CAP, otherSide, ROUNDS_TO_WIN } from "./duel.js";
import { LANES, ARROWS, fightChart, beatLines, songOf } from "./duelSongs.js";
import { songClock, streakPower } from "./duelRhythm.js";
import { armyHealth, danger } from "./duelStage.js";
import { duelHud } from "./duelUI.js";

// ------------------------------------------------------------ 3D perspective math

const LANE = 80; // px a lane is wide at the hit line
const GAP = 40; // px between arrows (left hand) and numbers (right hand) at the hit line
const KEY = 66; // px a note cap is across at the hit line
const WIDTH = LANES.length * LANE + GAP; // 600 px at TRACK.line
const MID = ARENA.width / 2; // 600

// Perspective depth ratio: 1.0 at the hit line, Z_FAR at the top horizon.
// Matches the ~27 deg camera angle of the photorealistic 3D arenas.
const Z_NEAR = 1.0;
const Z_FAR = 2.55;

export const TRACK = {
  x0: MID - WIDTH / 2, // 300
  x1: MID + WIDTH / 2, // 900
  top: 122, // horizon entry under the metallic top HUD & song pill
  line: 636, // 3D backlit receptor dock
  bottom: 734, // foreground bottom of the dock (height = 612 >= 0.8 * 750)
  zNear: Z_NEAR,
  zFar: Z_FAR,
};

export const APPROACH = 1.8; // s a note takes from horizon to hit line

// The middle of a lane at the hit line (scale = 1).
export const laneX = (index) => TRACK.x0 + index * LANE + (index >= ARROWS.length ? GAP : 0) + LANE / 2;

// Perspective scale at any screen Y along the highway: linear in screen Y,
// matching exact pinhole projection of a tilted plane (1 / Z_FAR at TRACK.top,
// 1.0 at TRACK.line, >1.0 toward TRACK.bottom).
export function scaleAtY(y) {
  const frac = (y - TRACK.top) / (TRACK.line - TRACK.top);
  return Math.max(0.18, (1 + frac * (Z_FAR - Z_NEAR)) / Z_FAR);
}

// Project linear travel progress u (0 = horizon, 1 = hit line, >1 = past line)
// onto screen Y and perspective scale via pinhole depth 1/z.
export function perspectiveAt(u) {
  const span = TRACK.line - TRACK.top;
  if (u <= 1.22) {
    const z = Z_FAR - u * (Z_FAR - Z_NEAR);
    const frac = (u * Z_NEAR) / z;
    return { y: TRACK.top + frac * span, scale: Z_NEAR / z, frac };
  }
  const zEdge = Z_FAR - 1.22 * (Z_FAR - Z_NEAR);
  const fracEdge = (1.22 * Z_NEAR) / zEdge;
  const slope = (Z_FAR * Z_NEAR) / (zEdge * zEdge);
  const frac = fracEdge + (u - 1.22) * slope;
  return { y: TRACK.top + frac * span, scale: Z_NEAR / zEdge + (u - 1.22) * 0.5, frac };
}

// Screen X of lane center at screen Y in 3D perspective.
export function laneXAt(index, y) {
  return MID + (laneX(index) - MID) * scaleAtY(y);
}

// Screen X of an offset from center at screen Y in 3D perspective.
const highwayX = (offsetAtLine, y) => MID + offsetAtLine * scaleAtY(y);

// Faster note approach as the player's streak grows (eased by duelScreen.js).
const FASTER_A_HIT = 0.015;
const FASTEST = 1.05;
export const approachOf = (streak) => Math.max(FASTEST, APPROACH * (1 - FASTER_A_HIT * Math.max(0, streak)));

// Screen Y of a key due at `t` when music clock is at `now`, in 3D perspective.
export function keyY(t, now, approach = APPROACH) {
  const u = 1 - (t - now) / approach;
  return perspectiveAt(u).y;
}

// True 3D perspective hit-test: returns the lane under canvas point `pos`, or null.
export function laneAt(pos) {
  if (pos.y < TRACK.top || pos.y > TRACK.bottom) return null;
  const s = scaleAtY(pos.y);
  const unprojectedX = MID + (pos.x - MID) / s;
  for (let i = 0; i < LANES.length; i++) {
    if (Math.abs(unprojectedX - laneX(i)) <= LANE / 2) return LANES[i];
  }
  return null;
}

// ------------------------------------------------------------ streak & feedback

const MISTAKES = ["miss", "wrong", "drop"];

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

const SHAKE_TIME = 0.4;
export function shakeOf(view, side) {
  const events = view.musical ? view.musical.events : [];
  const last = [...events].reverse().find((e) => e.side === side && MISTAKES.includes(e.kind));
  if (!last || last.age >= SHAKE_TIME) return { x: 0, y: 0, red: 0 };
  const k = 1 - last.age / SHAKE_TIME;
  return { x: 12 * k * Math.cos(last.age * 95), y: 9 * k * Math.cos(last.age * 71 + 1), red: k };
}

// ------------------------------------------------------------ note palette & glyphs

const COLOR = {
  left: "#ff4ad8",
  down: "#38d8ff",
  up: "#4eff7a",
  right: "#ff4c4c",
  1: "#ffd24c",
  2: "#ff9233",
  3: "#c678ff",
};

const LIGHT_TOP = {
  left: "#ffd0f6",
  down: "#d4f7ff",
  up: "#d6ffe0",
  right: "#ffd2d2",
  1: "#fff6cc",
  2: "#ffe4c4",
  3: "#f2dcff",
};

const DARK_RIM = {
  left: "#7d1468",
  down: "#0d6082",
  up: "#127530",
  right: "#821818",
  1: "#85620c",
  2: "#85440c",
  3: "#59288f",
};

const TURN = { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 };

// Trace an iconic thick 3D arrow path centered at (0, 0), pointing right (0 rad).
function traceArrowPath(ctx) {
  ctx.beginPath();
  ctx.moveTo(14.5, 0);
  ctx.lineTo(1.5, -12.5);
  ctx.lineTo(1.5, -5.2);
  ctx.lineTo(-13.5, -5.2);
  ctx.lineTo(-13.5, 5.2);
  ctx.lineTo(1.5, 5.2);
  ctx.lineTo(1.5, 12.5);
  ctx.closePath();
}

// Draw a receptor glyph (arrow or digit) centered at (x, y).
function drawSign(ctx, lane, x, y, color, scaleX, scaleY = scaleX, glow = null) {
  ctx.save();
  ctx.fillStyle = color;
  if (glow) {
    ctx.shadowColor = glow;
    ctx.shadowBlur = 10 * scaleX;
  }
  ctx.translate(x, y);
  ctx.scale((KEY / 36) * scaleX, (KEY / 36) * scaleY);
  if (lane in TURN) {
    ctx.rotate(TURN[lane]);
    traceArrowPath(ctx);
    ctx.fill();
  } else {
    ctx.font = "900 24px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(lane, 0, 1);
  }
  ctx.restore();
}

export function shout(ctx, text, x, y, { size, color, alpha = 1, glow = null }) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = `900 ${size}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.lineWidth = Math.max(4, size / 6.5);
  ctx.strokeStyle = "rgba(0, 0, 0, 0.9)";
  if (glow) {
    ctx.shadowColor = glow;
    ctx.shadowBlur = 18;
  }
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.restore();
}

// ------------------------------------------------------------ 2.5D fallback arena

const ARENA_SKY = {
  1: ["#e8c88a", "#c79e5e", "#9a743d"],
  2: ["#4a4640", "#695a4b", "#3a342e"],
  3: ["#1c1518", "#3d2219", "#1d1414"],
  4: ["#162238", "#354d6e", "#768da8"],
  5: ["#4c3557", "#a86b56", "#cfa572"],
};

export function drawFallbackBackdrop(ctx, scene) {
  const { view } = scene;
  const palette = ARENA_SKY[view.arena] || ARENA_SKY[1];
  const horizonY = 175;
  ctx.save();
  const sky = ctx.createLinearGradient(0, 0, 0, horizonY + 40);
  sky.addColorStop(0, palette[0]);
  sky.addColorStop(1, palette[1]);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, ARENA.width, horizonY + 40);
  const ground = ctx.createLinearGradient(0, horizonY, 0, ARENA.height);
  ground.addColorStop(0, palette[1]);
  ground.addColorStop(1, palette[2]);
  ctx.fillStyle = ground;
  ctx.fillRect(0, horizonY, ARENA.width, ARENA.height - horizonY);
  ctx.restore();
}

// ------------------------------------------------------------ side overlays (danger, aura, rival miss)

const FLIGHT = 0.26; // s a shell/missile takes to cross the 3D highway
const SHOT_SHOWN = 0.4;

export function drawRhythmSides(ctx, scene) {
  const { view, side } = scene;
  const m = view.musical;
  const now = songClock(view);
  ctx.save();

  for (const s of SIDES) {
    const mine = s === side;
    const isLeft = s === "left";
    const health = armyHealth(view, s);
    const edge = isLeft ? 0 : ARENA.width;
    const inner = isLeft ? 340 : ARENA.width - 340;
    const rectX = isLeft ? 0 : ARENA.width - 340;

    // 1. Overcharged golden-cyan aura when on 10x / 25x streak
    const pwr = streakPower(m.tally[s].streak);
    if (pwr > 1) {
      const pulse = 0.72 + 0.28 * Math.sin(now * 8);
      const aura = ctx.createLinearGradient(edge, 0, inner, 0);
      const rgb = isLeft ? "56, 210, 255" : "255, 170, 60";
      aura.addColorStop(0, `rgba(${rgb}, ${(pwr >= 2 ? 0.3 : 0.16) * pulse})`);
      aura.addColorStop(1, `rgba(${rgb}, 0)`);
      ctx.fillStyle = aura;
      ctx.fillRect(rectX, 0, 340, ARENA.height);
    }

    // 2. Danger glow when army health drops below 50% (throbs fast below 25%)
    const risk = danger(health);
    if (risk > 0) {
      const throb = risk > 0.5 ? 0.72 + 0.28 * Math.sin(now * 10) : 1;
      const red = ctx.createLinearGradient(edge, 0, inner, 0);
      red.addColorStop(0, `rgba(255, 22, 12, ${0.56 * risk * throb})`);
      red.addColorStop(0.55, `rgba(220, 20, 12, ${0.18 * risk * throb})`);
      red.addColorStop(1, "rgba(220, 20, 12, 0)");
      ctx.fillStyle = red;
      ctx.fillRect(rectX, 0, 340, ARENA.height);
    }

    // 3. Warm fiery impact wash when a volley explodes on this flank
    const landed = view.shots.filter((shot) => shot.side !== s && shot.age >= FLIGHT);
    if (landed.length) {
      const k = Math.min(...landed.map((shot) => (shot.age - FLIGHT) / Math.max(0.01, SHOT_SHOWN - FLIGHT)));
      const flash = ctx.createLinearGradient(edge, 0, inner, 0);
      flash.addColorStop(0, `rgba(255, 175, 70, ${0.32 * (1 - k)})`);
      flash.addColorStop(1, "rgba(255, 175, 70, 0)");
      ctx.fillStyle = flash;
      ctx.fillRect(rectX, 0, 340, ARENA.height);
    }

    // 4. Rival mistake callout right over the rival's flank
    if (!mine) {
      const slip = [...m.events].reverse().find((e) => e.side === s && MISTAKES.includes(e.kind));
      if (slip && slip.age < 0.75) {
        const k = slip.age / 0.75;
        const cx = isLeft ? 190 : ARENA.width - 190;
        const y = 162 - 14 * k;
        ctx.save();
        ctx.globalAlpha = (1 - k * k) * 0.76;
        const stripGrad = ctx.createLinearGradient(cx - 155, y, cx + 155, y);
        stripGrad.addColorStop(0, "rgba(20, 8, 4, 0)");
        stripGrad.addColorStop(0.2, "rgba(25, 10, 4, 0.88)");
        stripGrad.addColorStop(0.8, "rgba(25, 10, 4, 0.88)");
        stripGrad.addColorStop(1, "rgba(20, 8, 4, 0)");
        ctx.fillStyle = stripGrad;
        ctx.fillRect(cx - 155, y - 24, 310, 48);
        ctx.restore();
        shout(ctx, "¡FALLA EL RIVAL!", cx, y, { size: 30, color: "#ffd35a", alpha: 1 - k * k, glow: "#ff7b00" });
      }
    }
  }
  ctx.restore();
}

// ------------------------------------------------------------ 3D perspective highway

function highwayPoly(ctx, leftOffset, rightOffset, yTop, yBottom) {
  ctx.beginPath();
  ctx.moveTo(highwayX(leftOffset, yTop), yTop);
  ctx.lineTo(highwayX(rightOffset, yTop), yTop);
  ctx.lineTo(highwayX(rightOffset, yBottom), yBottom);
  ctx.lineTo(highwayX(leftOffset, yBottom), yBottom);
  ctx.closePath();
}

// Left-hand Arrow Note (← ↓ ↑ →): pure glowing 3D glossy neon arrow floating
// directly over the smoked-glass highway (NO outer square box!), matching the
// concept render. Right-hand Number Note (1 2 3): sleek beveled smoked-glass
// 3D keycap tile with thick glowing neon rim and bold luminous digit.
function drawNote3D(ctx, lane, x, y, s, { holding = false, lost = false } = {}) {
  const isArrow = lane in TURN;
  const col = lost ? "#5b6475" : COLOR[lane];
  const topCol = lost ? "#8a94a6" : LIGHT_TOP[lane];
  const rim = lost ? "#272c36" : DARK_RIM[lane];

  ctx.save();

  if (isArrow) {
    const scaleX = (holding ? 1.18 : 1.06) * s * (KEY / 34);
    const scaleY = (holding ? 0.92 : 0.82) * s * (KEY / 34);
    const depth = Math.max(2.5, (holding ? 8 : 6.5) * s);

    // 1. Soft colored floor reflection on the smoked glass
    if (!lost) {
      ctx.save();
      ctx.globalAlpha *= 0.28;
      const glow = ctx.createRadialGradient(x, y + depth + 4 * s, 2, x, y + depth + 4 * s, 36 * s);
      glow.addColorStop(0, col);
      glow.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.ellipse(x, y + depth + 4 * s, 36 * s, 18 * s, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // 2. Extruded 3D dark underside thickness
    ctx.save();
    ctx.translate(x, y + depth);
    ctx.scale(scaleX, scaleY);
    ctx.rotate(TURN[lane]);
    traceArrowPath(ctx);
    ctx.fillStyle = rim;
    ctx.fill();
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = "rgba(0, 0, 0, 0.72)";
    ctx.stroke();
    ctx.restore();

    // 3. Glossy luminous top arrow face with vibrant neon bloom
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scaleX, scaleY);
    ctx.rotate(TURN[lane]);
    if (!lost) {
      ctx.shadowColor = col;
      ctx.shadowBlur = (holding ? 26 : 16) * s;
    }
    traceArrowPath(ctx);
    const aGrad = ctx.createLinearGradient(-13, -12, 14, 12);
    aGrad.addColorStop(0, topCol);
    aGrad.addColorStop(0.38, col);
    aGrad.addColorStop(1, rim);
    ctx.fillStyle = aGrad;
    ctx.fill();
    ctx.shadowBlur = 0;

    // Bright specular white-neon rim
    ctx.lineWidth = holding ? 2.2 : 1.5;
    ctx.strokeStyle = holding ? "#ffffff" : lost ? "#9aa3b2" : topCol;
    ctx.stroke();

    // Inner bright gloss core
    if (!lost) {
      ctx.scale(0.62, 0.62);
      traceArrowPath(ctx);
      ctx.fillStyle = "rgba(255, 255, 255, 0.34)";
      ctx.fill();
    }
    ctx.restore();
    ctx.restore();
    return;
  }

  // --- Right-hand Number Tile (1, 2, 3): dark smoked-glass beveled 3D keycap with glowing neon rim
  const w = (holding ? KEY + 8 : KEY + 2) * s;
  const h = (holding ? 46 : 40) * s;
  const depth = Math.max(2.5, (holding ? 9 : 7) * s);
  const r = Math.max(3, 8 * s);

  // Soft neon glow reflection on smoked glass
  if (!lost) {
    ctx.save();
    ctx.globalAlpha *= 0.25;
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.roundRect(x - w * 0.56, y - h * 0.5 + depth + 2 * s, w * 1.12, h * 1.05, r);
    ctx.fill();
    ctx.restore();
  }

  // Extruded dark metallic 3D lower block
  ctx.fillStyle = rim;
  ctx.beginPath();
  ctx.roundRect(x - w / 2, y - h / 2 + depth, w, h, r);
  ctx.fill();
  ctx.strokeStyle = "rgba(0, 0, 0, 0.7)";
  ctx.lineWidth = Math.max(1, 1.4 * s);
  ctx.stroke();

  // Dark smoked-glass beveled top face (matches 1/2/3 tiles in base_v2!)
  if (!lost) {
    ctx.shadowColor = col;
    ctx.shadowBlur = (holding ? 24 : 14) * s;
  }
  const faceGrad = ctx.createLinearGradient(x, y - h / 2, x, y + h / 2);
  if (holding) {
    faceGrad.addColorStop(0, topCol);
    faceGrad.addColorStop(0.35, col);
    faceGrad.addColorStop(1, rim);
  } else {
    faceGrad.addColorStop(0, lost ? "#3b4250" : "rgba(52, 58, 74, 0.94)");
    faceGrad.addColorStop(0.45, lost ? "#262b35" : "rgba(22, 26, 36, 0.96)");
    faceGrad.addColorStop(1, lost ? "#181c24" : "rgba(12, 16, 24, 0.98)");
  }
  ctx.fillStyle = faceGrad;
  ctx.beginPath();
  ctx.roundRect(x - w / 2, y - h / 2, w, h, r);
  ctx.fill();
  ctx.shadowBlur = 0;

  // Glossy top-half glass sheen
  ctx.fillStyle = "rgba(255, 255, 255, 0.14)";
  ctx.beginPath();
  ctx.roundRect(x - w * 0.44, y - h * 0.44, w * 0.88, h * 0.34, r * 0.5);
  ctx.fill();

  // Thick luminous neon rim border
  ctx.lineWidth = Math.max(1.5, (holding ? 3.8 : 2.8) * s);
  ctx.strokeStyle = holding ? "#ffffff" : col;
  ctx.beginPath();
  ctx.roundRect(x - w / 2, y - h / 2, w, h, r);
  ctx.stroke();

  // Bold glowing digit
  drawSign(ctx, lane, x, y, holding ? "#0c121e" : lost ? "#9aa3b2" : topCol, s * 0.96, s * 0.72, holding || lost ? null : col);
  ctx.restore();
}

// Draw the 3D backlit gunmetal receptor dock at TRACK.line.
function drawReceptorDock(ctx, scene, now, streak) {
  const dockY0 = TRACK.line - 36;
  const dockY1 = TRACK.line + 44;
  const padHalf = WIDTH / 2 + 26;

  ctx.save();
  // Extruded dark steel lower lip of the dock
  highwayPoly(ctx, -padHalf, padHalf, dockY1 - 6, dockY1 + 10);
  ctx.fillStyle = "rgba(10, 14, 22, 0.98)";
  ctx.fill();

  // Brushed gunmetal housing trapezoid
  highwayPoly(ctx, -padHalf, padHalf, dockY0, dockY1);
  const dockGrad = ctx.createLinearGradient(0, dockY0, 0, dockY1);
  dockGrad.addColorStop(0, "rgba(44, 54, 70, 0.96)");
  dockGrad.addColorStop(0.2, "rgba(22, 28, 40, 0.97)");
  dockGrad.addColorStop(0.82, "rgba(16, 22, 32, 0.98)");
  dockGrad.addColorStop(1, "rgba(58, 70, 88, 0.98)");
  ctx.fillStyle = dockGrad;
  ctx.fill();
  ctx.lineWidth = 2.4;
  ctx.strokeStyle = streak >= 25 ? "rgba(255, 215, 94, 0.92)" : "rgba(170, 220, 250, 0.72)";
  ctx.stroke();

  // Subtle horizontal metallic target seam across the dock
  ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(highwayX(-WIDTH / 2 - 10, TRACK.line), TRACK.line);
  ctx.lineTo(highwayX(WIDTH / 2 + 10, TRACK.line), TRACK.line);
  ctx.stroke();

  // Individual 3D backlit receptor keys
  LANES.forEach((lane, i) => {
    const x = laneX(i);
    const isArrow = lane in TURN;
    const press = scene.presses[lane];
    const lit = press ? Math.max(0, 1 - press.age / 0.25) : 0;
    const isHit = Boolean(press && press.hit);
    const isErr = Boolean(press && !press.hit);
    const sink = lit > 0 ? 4 * lit : 0;
    const w = KEY + 4;
    const h = 46;
    const y = TRACK.line + sink;
    const col = COLOR[lane];
    const topCol = LIGHT_TOP[lane];

    // Recessed dark socket
    ctx.fillStyle = "rgba(4, 7, 12, 0.95)";
    ctx.beginPath();
    ctx.roundRect(x - w / 2 - 3, TRACK.line - h / 2 - 3, w + 6, h + 11, 10);
    ctx.fill();

    // Extruded keycap skirt
    ctx.fillStyle = isErr && lit > 0 ? "#6b1111" : isHit && lit > 0 ? DARK_RIM[lane] : isArrow ? "#1f2937" : DARK_RIM[lane];
    ctx.beginPath();
    ctx.roundRect(x - w / 2, y - h / 2 + 6 - sink * 0.65, w, h, 9);
    ctx.fill();

    // Keycap top surface
    if (lit > 0) {
      ctx.shadowColor = isHit ? col : "#ff2a1a";
      ctx.shadowBlur = 26 * lit;
    }
    const face = ctx.createLinearGradient(x, y - h / 2, x, y + h / 2);
    if (lit > 0 && isHit) {
      face.addColorStop(0, "#ffffff");
      face.addColorStop(0.32, col);
      face.addColorStop(1, DARK_RIM[lane]);
    } else if (lit > 0 && isErr) {
      face.addColorStop(0, "#ffaaaa");
      face.addColorStop(0.4, "#ff2a1a");
      face.addColorStop(1, "#6b1111");
    } else if (isArrow) {
      face.addColorStop(0, "rgba(58, 70, 88, 0.96)");
      face.addColorStop(0.45, "rgba(28, 36, 48, 0.96)");
      face.addColorStop(1, "rgba(18, 24, 34, 0.98)");
    } else {
      face.addColorStop(0, "rgba(44, 48, 62, 0.96)");
      face.addColorStop(0.45, "rgba(20, 24, 34, 0.97)");
      face.addColorStop(1, "rgba(12, 16, 24, 0.98)");
    }
    ctx.fillStyle = face;
    ctx.beginPath();
    ctx.roundRect(x - w / 2, y - h / 2, w, h, 9);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Subtle glass top highlight
    ctx.fillStyle = "rgba(255, 255, 255, 0.12)";
    ctx.beginPath();
    ctx.roundRect(x - w * 0.42, y - h * 0.42, w * 0.84, h * 0.28, 4);
    ctx.fill();

    // Neon rim lighting around the FULL keycap perimeter
    ctx.lineWidth = lit > 0 ? 3.4 : isArrow ? 2.1 : 2.6;
    ctx.strokeStyle = lit > 0 && isErr ? "#ff4d3d" : lit > 0 ? "#ffffff" : isArrow ? "rgba(165, 200, 230, 0.65)" : col;
    ctx.beginPath();
    ctx.roundRect(x - w / 2, y - h / 2, w, h, 9);
    ctx.stroke();

    // Crisp backlit glyph
    const glyphColor = lit > 0 ? "#ffffff" : isArrow ? "rgba(226, 240, 255, 0.92)" : topCol;
    drawSign(ctx, lane, x, y, glyphColor, 0.94, 0.72, lit > 0 || !isArrow ? col : null);

    // Double concentric 3D neon shockwave ring + rising light column on hit (matching base_v2!)
    if (lit > 0 && isHit) {
      const prog = 1 - lit;
      ctx.save();
      ctx.strokeStyle = col;
      ctx.shadowColor = col;
      ctx.shadowBlur = 14;
      ctx.globalAlpha = lit * 0.95;
      ctx.lineWidth = 4.5 * lit;
      ctx.beginPath();
      ctx.ellipse(x, TRACK.line - 4, 24 + prog * 44, (24 + prog * 44) * 0.44, 0, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = "#ffffff";
      ctx.globalAlpha = lit * 0.82;
      ctx.lineWidth = 2.4 * lit;
      ctx.beginPath();
      ctx.ellipse(x, TRACK.line - 4, 14 + prog * 28, (14 + prog * 28) * 0.44, 0, 0, Math.PI * 2);
      ctx.stroke();

      // Upward neon energy plume
      ctx.shadowBlur = 0;
      const beam = ctx.createLinearGradient(x, TRACK.line, x, TRACK.line - 105);
      beam.addColorStop(0, col);
      beam.addColorStop(1, "rgba(255, 255, 255, 0)");
      ctx.globalAlpha = lit * 0.4;
      ctx.fillStyle = beam;
      ctx.fillRect(x - w * 0.44, TRACK.line - 105, w * 0.88, 105);
      ctx.restore();
    }

    // Shattered glowing red sparks on miss/wrong key!
    if (lit > 0 && isErr) {
      const prog = 1 - lit;
      ctx.save();
      for (let k = 0; k < 12; k++) {
        const ang = -Math.PI * 0.08 - (k / 11) * Math.PI * 0.84 + Math.sin(k * 7.3) * 0.14;
        const spd = 30 + (k % 3) * 24;
        const sx = x + Math.cos(ang) * prog * spd;
        const sy = TRACK.line + Math.sin(ang) * prog * spd * 0.9 - prog * 18 + prog * prog * 30;
        ctx.fillStyle = k % 2 === 0 ? "#ff3b30" : "#ffd6a8";
        ctx.globalAlpha = lit;
        ctx.beginPath();
        ctx.arc(sx, sy, 3.8 - prog * 2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  });

  // Glowing cyan/gold chrome accent strip along the front edge of the dock
  ctx.save();
  const frontGlow = ctx.createLinearGradient(highwayX(-padHalf, dockY1), dockY1, highwayX(padHalf, dockY1), dockY1);
  const railRgb = streak >= 25 ? "255, 210, 70" : streak >= 10 ? "110, 235, 255" : "60, 215, 255";
  frontGlow.addColorStop(0, `rgba(${railRgb}, 0.15)`);
  frontGlow.addColorStop(0.5, `rgba(${railRgb}, ${0.72 + 0.2 * Math.sin(now * 6)})`);
  frontGlow.addColorStop(1, `rgba(${railRgb}, 0.15)`);
  ctx.strokeStyle = frontGlow;
  ctx.lineWidth = 3.2;
  ctx.beginPath();
  ctx.moveTo(highwayX(-padHalf + 4, dockY1), dockY1);
  ctx.lineTo(highwayX(padHalf - 4, dockY1), dockY1);
  ctx.stroke();
  ctx.restore();

  ctx.restore();
}

// The highway a duel's keys come down: its deck, its rails (which light up
// with the streak) and its song's beats rushing forward. `lanes`: with the
// seven keys' lanes marked on it (a musical duel's; a Duelo Matemático's
// questions come down its middle, duelQuizDraw.js).
export function drawHighway(ctx, { song, now, approach = APPROACH, streak = 0, lanes = true }) {
  const railOuter = WIDTH / 2 + 24;
  const railInner = WIDTH / 2 + 6;
  const horizonFadeEnd = TRACK.top + 88;

  // Smoked-glass 3D highway deck fading smoothly into horizon mist + chrome neon side rails
  ctx.save();
  // Elevated cast shadow under highway edges (fades cleanly to 0 at horizon!)
  highwayPoly(ctx, -(railOuter + 18), railOuter + 18, TRACK.top, TRACK.bottom + 12);
  const dropShadow = ctx.createLinearGradient(0, TRACK.top, 0, horizonFadeEnd + 60);
  dropShadow.addColorStop(0, "rgba(0, 0, 0, 0)");
  dropShadow.addColorStop(0.65, "rgba(0, 0, 0, 0.36)");
  dropShadow.addColorStop(1, "rgba(0, 0, 0, 0.5)");
  ctx.fillStyle = dropShadow;
  ctx.fill();

  // Main glossy smoked-glass runway surface — seamless transparent fade at TRACK.top!
  highwayPoly(ctx, -railInner, railInner, TRACK.top, TRACK.bottom);
  const deckGrad = ctx.createLinearGradient(0, TRACK.top, 0, TRACK.bottom);
  deckGrad.addColorStop(0, "rgba(10, 14, 22, 0)");
  deckGrad.addColorStop(0.14, "rgba(14, 18, 28, 0.72)");
  deckGrad.addColorStop(0.55, "rgba(10, 14, 22, 0.86)");
  deckGrad.addColorStop(1, "rgba(6, 10, 16, 0.94)");
  ctx.fillStyle = deckGrad;
  ctx.fill();

  // Clip interior lane visuals cleanly inside the trapezoid deck
  ctx.save();
  highwayPoly(ctx, -railInner, railInner, TRACK.top, TRACK.bottom);
  ctx.clip();

  if (lanes) {
  // Subtle colored lane glow washes converging toward horizon
  LANES.forEach((lane, i) => {
    const off = laneX(i) - MID;
    const half = LANE / 2 - 3;
    highwayPoly(ctx, off - half, off + half, TRACK.top, TRACK.bottom);
    const laneGrad = ctx.createLinearGradient(0, TRACK.top, 0, TRACK.bottom);
    laneGrad.addColorStop(0, "rgba(0, 0, 0, 0)");
    laneGrad.addColorStop(0.18, "rgba(0, 0, 0, 0)");
    laneGrad.addColorStop(0.45, COLOR[lane]);
    laneGrad.addColorStop(1, COLOR[lane]);
    ctx.globalAlpha = 0.065;
    ctx.fillStyle = laneGrad;
    ctx.fill();
  });
  ctx.globalAlpha = 1;

  // Center hand separator channel between arrows (4) and numbers (3)
  const gapCenter = (laneX(3) + laneX(4)) / 2 - MID;
  highwayPoly(ctx, gapCenter - 11, gapCenter + 11, TRACK.top, TRACK.bottom);
  const gapGrad = ctx.createLinearGradient(0, TRACK.top, 0, TRACK.top + 110);
  gapGrad.addColorStop(0, "rgba(0, 0, 0, 0)");
  gapGrad.addColorStop(1, "rgba(0, 0, 0, 0.45)");
  ctx.fillStyle = gapGrad;
  ctx.fill();

  // Converging lane divider lines (smoothly fading out into horizon mist)
  const divGrad = ctx.createLinearGradient(0, TRACK.top, 0, horizonFadeEnd);
  divGrad.addColorStop(0, "rgba(255, 255, 255, 0)");
  divGrad.addColorStop(1, "rgba(255, 255, 255, 0.2)");
  ctx.strokeStyle = divGrad;
  ctx.lineWidth = 1.4;
  for (let i = 0; i <= LANES.length; i++) {
    let off;
    if (i === 0) off = -WIDTH / 2;
    else if (i === ARROWS.length) off = laneX(3) - MID + LANE / 2;
    else if (i === LANES.length) off = WIDTH / 2;
    else off = laneX(i) - MID - LANE / 2;
    ctx.beginPath();
    ctx.moveTo(highwayX(off, TRACK.top), TRACK.top);
    ctx.lineTo(highwayX(off, TRACK.bottom), TRACK.bottom);
    ctx.stroke();
    if (i === ARROWS.length) {
      const rightStart = laneX(4) - MID - LANE / 2;
      ctx.beginPath();
      ctx.moveTo(highwayX(rightStart, TRACK.top), TRACK.top);
      ctx.lineTo(highwayX(rightStart, TRACK.bottom), TRACK.bottom);
      ctx.stroke();
    }
  }

  } // (lanes)

  // Beat and bar lines rushing forward in 3D perspective
  const beats = beatLines(song, now, now + approach);
  let beatPulse = 0;
  for (const line of beats) {
    const y = keyY(line.t, now, approach);
    if (y < TRACK.top || y > TRACK.bottom) continue;
    const s = scaleAtY(y);
    const alphaFade = Math.min(1, Math.max(0, (y - TRACK.top) / 70));
    ctx.fillStyle = line.bar
      ? `rgba(255, 255, 255, ${0.34 * alphaFade})`
      : `rgba(200, 232, 255, ${0.13 * alphaFade})`;
    const lx = highwayX(-WIDTH / 2, y);
    const rx = highwayX(WIDTH / 2, y);
    const thick = (line.bar ? 3.0 : 1.5) * s;
    ctx.fillRect(lx, y - thick / 2, rx - lx, thick);
    if (line.t - now < 0.12) beatPulse = Math.max(beatPulse, 1 - (line.t - now) / 0.12);
  }
  ctx.restore(); // end interior clip

  // Gleaming chrome-silver beveled side rails + outer glowing cyan/gold neon edge strip!
  const overcharged = streak >= 25;
  const boosted = streak >= 10;
  const neonRgb = overcharged ? "255, 212, 82" : boosted ? "95, 240, 255" : "56, 224, 255";
  const railColor = overcharged ? "#ffd452" : boosted ? "#5ff0ff" : "#38e0ff";
  for (const dir of [-1, 1]) {
    const a = dir < 0 ? -railOuter : railInner;
    const b = dir < 0 ? -railInner : railOuter;
    highwayPoly(ctx, a, b, TRACK.top, TRACK.bottom + 8);
    const rGrad = ctx.createLinearGradient(0, TRACK.top, 0, TRACK.bottom);
    rGrad.addColorStop(0, "rgba(160, 175, 195, 0)");
    rGrad.addColorStop(0.15, "rgba(180, 195, 212, 0.72)");
    rGrad.addColorStop(0.45, "#64748b");
    rGrad.addColorStop(0.75, "#cbd5e1");
    rGrad.addColorStop(1, "#475569");
    ctx.fillStyle = rGrad;
    ctx.fill();

    // Inner white metallic specular ridge
    const innerRidge = dir * (railInner + 4);
    const ridgeGrad = ctx.createLinearGradient(0, TRACK.top, 0, TRACK.top + 110);
    ridgeGrad.addColorStop(0, "rgba(255, 255, 255, 0)");
    ridgeGrad.addColorStop(1, "rgba(255, 255, 255, 0.65)");
    ctx.strokeStyle = ridgeGrad;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(highwayX(innerRidge, TRACK.top), TRACK.top);
    ctx.lineTo(highwayX(innerRidge, TRACK.bottom + 8), TRACK.bottom + 8);
    ctx.stroke();

    // Outer luminous cyan/gold neon strip along the rail exterior (matches base_v2!)
    const outerNeon = dir * (railOuter - 1);
    ctx.save();
    const nGrad = ctx.createLinearGradient(0, TRACK.top, 0, TRACK.top + 110);
    nGrad.addColorStop(0, `rgba(${neonRgb}, 0)`);
    nGrad.addColorStop(1, `rgba(${neonRgb}, 0.98)`);
    ctx.strokeStyle = nGrad;
    ctx.shadowColor = railColor;
    ctx.shadowBlur = 12 + beatPulse * 12 + (overcharged ? 10 : 0);
    ctx.lineWidth = boosted ? 4.0 : 3.0;
    ctx.beginPath();
    ctx.moveTo(highwayX(outerNeon, TRACK.top), TRACK.top);
    ctx.lineTo(highwayX(outerNeon, TRACK.bottom + 8), TRACK.bottom + 8);
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}

export function drawRhythm(ctx, scene) {
  const { view, side } = scene;
  const m = view.musical;
  const chart = fightChart(m.song);
  const now = songClock(view);
  const marks = m.marks[side] || [];
  const approach = scene.approach || APPROACH;
  const streak = m.tally[side].streak;

  // --- 1. The highway
  drawHighway(ctx, { song: m.song, now, approach, streak });

  // --- 2. 3D Backlit Gunmetal Receptor Dock at TRACK.line
  drawReceptorDock(ctx, scene, now, streak);

  // --- 3. Falling 3D Notes & Perspective Laser Hold Tails (sorted back-to-front)
  const visible = [];
  for (let i = Math.max(0, (m.from[side] || 0) - 8); i < chart.notes.length; i++) {
    const note = chart.notes[i];
    if (note.t > now + approach) break;
    const mark = marks[i];
    if (mark === 1) continue;
    const holding = mark === 3;
    const lost = mark === 2;
    const y = holding ? TRACK.line : keyY(note.t, now, approach);
    const endY = note.hold > 0 ? Math.max(TRACK.top, keyY(note.t + note.hold, now, approach)) : y;
    if (Math.min(y, endY) > TRACK.bottom + 28) continue;
    if (Math.max(y, endY) < TRACK.top) continue;
    visible.push({ note, holding, lost, y, endY });
  }
  visible.sort((a, b) => a.y - b.y);

  ctx.save();
  for (const item of visible) {
    const { note, holding, lost, y, endY } = item;
    const idx = LANES.indexOf(note.lane);
    const s = scaleAtY(y);
    const x = laneXAt(idx, y);
    const fadeIn = Math.min(1, Math.max(0, (y - TRACK.top) / 56));
    const fadeOut = y > TRACK.line + 12 ? Math.max(0, 1 - (y - (TRACK.line + 12)) / 26) : 1;
    const alpha = (lost ? 0.32 : 1) * fadeIn * fadeOut;
    if (alpha <= 0.01) continue;

    ctx.globalAlpha = alpha;

    // Perspective glowing hold-note laser beam tail
    if (note.hold > 0 && endY < y - 2) {
      const sEnd = scaleAtY(endY);
      const xEnd = laneXAt(idx, endY);
      const isArrow = note.lane in TURN;
      const halfHead = (isArrow ? (holding ? 15 : 13) : (holding ? 18 : 15)) * s;
      const halfTail = (isArrow ? (holding ? 15 : 13) : (holding ? 18 : 15)) * sEnd;
      const col = lost ? "#525866" : COLOR[note.lane];

      ctx.save();
      if (!lost) {
        ctx.shadowColor = col;
        ctx.shadowBlur = holding ? 24 : 14;
      }
      const beamGrad = ctx.createLinearGradient(0, endY, 0, y);
      beamGrad.addColorStop(0, "rgba(255, 255, 255, 0.05)");
      beamGrad.addColorStop(0.18, col);
      beamGrad.addColorStop(1, col);
      ctx.beginPath();
      ctx.moveTo(xEnd - halfTail, endY);
      ctx.lineTo(xEnd + halfTail, endY);
      ctx.lineTo(x + halfHead, y);
      ctx.lineTo(x - halfHead, y);
      ctx.closePath();
      ctx.fillStyle = beamGrad;
      ctx.globalAlpha = alpha * (holding ? 0.94 : 0.78);
      ctx.fill();

      // White-hot inner laser core
      if (!lost) {
        ctx.beginPath();
        ctx.moveTo(xEnd - halfTail * 0.34, endY);
        ctx.lineTo(xEnd + halfTail * 0.34, endY);
        ctx.lineTo(x + halfHead * 0.34, y);
        ctx.lineTo(x - halfHead * 0.34, y);
        ctx.closePath();
        ctx.fillStyle = "#ffffff";
        ctx.globalAlpha = alpha * (holding ? 0.88 : 0.58);
        ctx.fill();
      }
      ctx.restore();
      ctx.globalAlpha = alpha;
    }

    drawNote3D(ctx, note.lane, x, y, s, { holding, lost });
  }
  ctx.restore();

  // --- 4. Ready / Loading instructions before the first note arrives
  ctx.save();
  ctx.textAlign = "center";
  ctx.shadowColor = "rgba(0, 0, 0, 0.95)";
  ctx.shadowBlur = 8;
  const next = chart.notes[m.from[side] || 0];
  const nothingYet = m.tally[side].hits + m.tally[side].misses === 0;
  if (scene.loading) {
    shout(ctx, "Cargando música…", MID, TRACK.top + 185, { size: 32, color: "#ffe27a" });
  } else if (nothingYet && next && now < next.t - 0.3) {
    ctx.fillStyle = "rgba(8, 14, 24, 0.78)";
    ctx.strokeStyle = "rgba(96, 210, 255, 0.55)";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.roundRect(MID - 228, TRACK.top + 115, 456, 210, 14);
    ctx.fill();
    ctx.stroke();

    shout(ctx, "¡PREPÁRATE!", MID, TRACK.top + 162, { size: 40, color: "#ffe27a", glow: "#ff9900" });
    ctx.font = "bold 17px sans-serif";
    ctx.fillStyle = "#e2f1ff";
    ctx.fillText("Pulsa flechas (←↓↑→) y números (1 2 3) en la línea", MID, TRACK.top + 208);
    ctx.fillText("Mantén pulsadas las notas con cola láser", MID, TRACK.top + 236);
    ctx.fillStyle = "#ffb4a8";
    ctx.fillText("Si fallas, dispara el rival · Si falla él, disparas tú", MID, TRACK.top + 268);
    ctx.fillStyle = "#9effb0";
    ctx.fillText("Racha 10 (×1,5) y 25 (×2): descargas sobrecargadas", MID, TRACK.top + 298);
  }
  ctx.restore();

  // --- 5 to 7. What the player's last key was worth
  drawRhythmFeedback(ctx, scene);
}

// What the player's last key was worth, in words: under the dock, the
// streak's cheer or the mistake; over the highway, the big "¡FALLO!" and
// the streaks of 10 and 25. `saidY`: where the words under the dock go.
export function drawRhythmFeedback(ctx, scene, { saidY = TRACK.line + 72 } = {}) {
  const { view, side } = scene;
  const m = view.musical;

  // --- 5. Latest key feedback right below the receptor dock
  const last = [...m.events].reverse().find((e) => e.side === side);
  if ((m.held[side] || []).length > 0) {
    shout(ctx, "¡MANTÉN!", MID, saidY, { size: 30, color: "#ffe27a", glow: "#ffaa00" });
  } else if (last && last.age < 0.5) {
    const k = last.age / 0.5;
    if (MISTAKES.includes(last.kind)) {
      shout(ctx, last.kind === "drop" ? "¡SOLTASTE!" : "FALLO", MID, saidY, { size: 32, color: "#ff3b30", alpha: 1 - k });
    } else {
      const sNow = last.kind === "hit" ? last.streak : m.tally[side].streak;
      const pop = 1 + 0.32 * Math.max(0, 1 - last.age / 0.12);
      // (A Duelo Matemático's quick answer: the cheer with a bolt.)
      shout(ctx, `${last.fast ? "⚡ " : ""}${cheer(sNow).text}`, MID, saidY, {
        size: Math.round((sNow >= 5 ? 32 : 27) * pop),
        color: cheerColor(sNow),
        alpha: 1 - k * k,
        glow: sNow >= 10 ? cheerColor(sNow) : null,
      });
    }
  }

  // --- 6. Big center impact callout on player mistake
  const slip = [...m.events].reverse().find((e) => e.side === side && MISTAKES.includes(e.kind));
  if (slip && slip.age < 0.65) {
    const k = slip.age / 0.65;
    const pop = 1 + 0.18 * Math.max(0, 1 - slip.age / 0.12);
    shout(ctx, "¡FALLO!", MID, TRACK.top + 150 - 10 * k, { size: Math.round(78 * pop), color: "#ff3020", alpha: 1 - k * k, glow: "#ff0000" });
    shout(ctx, "DISPARA EL RIVAL", MID, TRACK.top + 198 - 10 * k, { size: 22, color: "#ffffff", alpha: 1 - k * k });
  }

  // --- 7. Milestone streak banner (10x GREAT! / 25x WELL DONE!)
  const feat = [...m.events].reverse().find((e) => e.side === side && e.kind === "hit" && cheer(e.streak).big);
  if (feat && feat.age < 0.9 && !(slip && slip.age < feat.age)) {
    const k = feat.age / 0.9;
    const pop = 1 + 0.4 * Math.max(0, 1 - feat.age / 0.15);
    shout(ctx, cheer(feat.streak).text, MID, TRACK.top + 135, {
      size: Math.round(64 * pop),
      color: cheerColor(feat.streak),
      alpha: 1 - k * k * k,
      glow: feat.streak >= 25 ? "#ff4fd8" : "#ffae00",
    });
    shout(ctx, `${feat.streak} SEGUIDAS · ×${streakPower(feat.streak)} DAÑO`, MID, TRACK.top + 180, {
      size: 21,
      color: "#ffffff",
      alpha: 1 - k * k * k,
    });
  }
}

// ------------------------------------------------------------ parabolic 3D volleys & explosions

function arcPoint(from, to, t, arcHeight) {
  return {
    x: from.x + (to.x - from.x) * t,
    y: from.y + (to.y - from.y) * t - 4 * arcHeight * t * (1 - t),
  };
}

export function drawVolleys(ctx, scene) {
  const { view } = scene;
  const tally = view.musical ? view.musical.tally : null;
  ctx.save();
  ctx.lineCap = "round";

  view.shots.forEach((shot, idx) => {
    const { from, to, age, type, side } = shot;
    const heavy = type === "tank" || type === "rocket";
    const isRocket = type === "rocket";
    const pwr = tally ? streakPower(tally[side]?.streak || 0) : 1;
    const boost = pwr >= 2 ? 1.38 : pwr > 1 ? 1.18 : 1;
    const color = side === "left" ? (pwr > 1 ? "#58e8ff" : "#4aa3ff") : (pwr > 1 ? "#ff7a3c" : "#ff4d3d");
    const core = pwr > 1 ? "#fff4b8" : "#fff7dc";
    const spread = ((idx % 5) - 2) * 14;
    const arc = (isRocket ? 165 : heavy ? 118 : 72) + spread;

    // 1. Blazing muzzle flash + star burst right at the firing barrel
    if (age < 0.14) {
      const fk = 1 - age / 0.14;
      const rFlash = (heavy ? 40 : 22) * boost * (0.65 + 0.55 * fk);
      const grad = ctx.createRadialGradient(from.x, from.y, 1, from.x, from.y, rFlash);
      grad.addColorStop(0, `rgba(255, 255, 240, ${fk})`);
      grad.addColorStop(0.35, `rgba(255, 200, 90, ${0.9 * fk})`);
      grad.addColorStop(0.7, `rgba(255, 110, 25, ${0.48 * fk})`);
      grad.addColorStop(1, "rgba(255, 80, 10, 0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(from.x, from.y, rFlash, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = `rgba(255, 245, 200, ${0.88 * fk})`;
      ctx.lineWidth = (heavy ? 3.8 : 2.2) * fk;
      for (let sp = 0; sp < 4; sp++) {
        const ang = (sp * Math.PI) / 4 + idx * 0.4;
        const len = rFlash * (sp % 2 === 0 ? 1.2 : 0.74);
        ctx.beginPath();
        ctx.moveTo(from.x - Math.cos(ang) * len * 0.4, from.y - Math.sin(ang) * len * 0.4);
        ctx.lineTo(from.x + Math.cos(ang) * len, from.y + Math.sin(ang) * len);
        ctx.stroke();
      }
    }

    // 2. Parabolic projectile flying high over the central 3D highway
    if (age < FLIGHT) {
      const k = age / FLIGHT;
      const head = arcPoint(from, to, k, arc);
      const prev = arcPoint(from, to, Math.max(0, k - 0.04), arc);
      const angle = Math.atan2(head.y - prev.y, head.x - prev.x);

      // Billowing smoke trail behind rockets
      if (isRocket) {
        for (let step = 1; step <= 6; step++) {
          const tk = k - step * 0.055;
          if (tk <= 0) break;
          const pt = arcPoint(from, to, tk, arc);
          const puffR = (7 + step * 3.4) * boost;
          ctx.fillStyle = `rgba(225, 218, 208, ${(0.38 - step * 0.048) * (1 - tk * 0.25)})`;
          ctx.beginPath();
          ctx.arc(pt.x, pt.y + Math.sin(step * 2 + idx) * 2.5, puffR, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Luminous curved tracer streak
      const tailStart = Math.max(0, k - (isRocket ? 0.34 : 0.28));
      const steps = 6;
      for (let s = 0; s < steps; s++) {
        const t0 = tailStart + ((k - tailStart) * s) / steps;
        const t1 = tailStart + ((k - tailStart) * (s + 1)) / steps;
        const p0 = arcPoint(from, to, t0, arc);
        const p1 = arcPoint(from, to, t1, arc);
        const frac = (s + 1) / steps;
        ctx.strokeStyle = color;
        ctx.globalAlpha = frac * 0.92;
        ctx.lineWidth = (heavy ? 8.5 : 4.4) * boost * (0.35 + 0.65 * frac);
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(p1.x, p1.y);
        ctx.stroke();

        ctx.strokeStyle = core;
        ctx.globalAlpha = frac * 0.88;
        ctx.lineWidth = (heavy ? 3.4 : 1.9) * boost * frac;
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(p1.x, p1.y);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      // Glowing warhead / shell nose
      ctx.save();
      ctx.translate(head.x, head.y);
      ctx.rotate(angle);
      ctx.shadowColor = color;
      ctx.shadowBlur = 18 * boost;
      if (isRocket) {
        ctx.fillStyle = "#ff9a2e";
        ctx.beginPath();
        ctx.ellipse(-11 * boost, 0, 9.5 * boost, 4.4 * boost, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#d8e0ea";
        ctx.beginPath();
        ctx.moveTo(12 * boost, 0);
        ctx.lineTo(-7 * boost, -3.8 * boost);
        ctx.lineTo(-9 * boost, 0);
        ctx.lineTo(-7 * boost, 3.8 * boost);
        ctx.closePath();
        ctx.fill();
      } else {
        ctx.fillStyle = core;
        ctx.beginPath();
        ctx.ellipse(0, 0, (heavy ? 11.5 : 6.8) * boost, (heavy ? 5.2 : 3.2) * boost, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    } else {
      // 3. Initial flash explosion at target impact
      const k = Math.min(1, (age - FLIGHT) / Math.max(0.01, SHOT_SHOWN - FLIGHT));
      const reach = (isRocket ? 72 : heavy ? 56 : 32) * boost * (0.45 + 0.8 * k);

      ctx.strokeStyle = `rgba(255, 220, 140, ${(1 - k) * 0.82})`;
      ctx.lineWidth = Math.max(1.5, 4 * (1 - k));
      ctx.beginPath();
      ctx.ellipse(to.x, to.y + 8, reach * 1.18, reach * 0.46, 0, 0, Math.PI * 2);
      ctx.stroke();

      const smoke = ctx.createRadialGradient(to.x, to.y - 16 * k, 4, to.x, to.y - 16 * k, reach * 1.08);
      smoke.addColorStop(0, `rgba(26, 20, 16, ${0.46 * (1 - k)})`);
      smoke.addColorStop(1, "rgba(20, 16, 14, 0)");
      ctx.fillStyle = smoke;
      ctx.beginPath();
      ctx.arc(to.x, to.y - 16 * k, reach * 1.08, 0, Math.PI * 2);
      ctx.fill();

      const blast = ctx.createRadialGradient(to.x, to.y, 2, to.x, to.y, reach);
      blast.addColorStop(0, `rgba(255, 255, 235, ${1 - k * 0.85})`);
      blast.addColorStop(0.32, `rgba(255, 195, 70, ${0.95 * (1 - k)})`);
      blast.addColorStop(0.68, `rgba(255, 85, 20, ${0.74 * (1 - k)})`);
      blast.addColorStop(1, "rgba(180, 30, 5, 0)");
      ctx.fillStyle = blast;
      ctx.beginPath();
      ctx.arc(to.x, to.y, reach, 0, Math.PI * 2);
      ctx.fill();
    }
  });

  // 4. Persistent multi-stage impact explosions (lingering smoke, shockwaves & flying sparks)
  for (const imp of scene.impacts || []) {
    const k = Math.min(1, imp.age / imp.life);
    const reach = imp.size * (0.45 + 0.9 * k);
    ctx.strokeStyle = `rgba(255, 215, 130, ${(1 - k) * 0.72})`;
    ctx.lineWidth = Math.max(1.5, 4.2 * (1 - k));
    ctx.beginPath();
    ctx.ellipse(imp.x, imp.y + 8, reach * 1.25, reach * 0.48, 0, 0, Math.PI * 2);
    ctx.stroke();

    const sy = imp.y - 28 * k;
    const smoke = ctx.createRadialGradient(imp.x, sy, 3, imp.x, sy, reach * 1.15);
    smoke.addColorStop(0, `rgba(28, 22, 18, ${0.52 * (1 - k)})`);
    smoke.addColorStop(0.6, `rgba(20, 16, 14, ${0.3 * (1 - k)})`);
    smoke.addColorStop(1, "rgba(20, 16, 14, 0)");
    ctx.fillStyle = smoke;
    ctx.beginPath();
    ctx.arc(imp.x, sy, reach * 1.15, 0, Math.PI * 2);
    ctx.fill();

    if (k < 0.75) {
      const fk = k / 0.75;
      const fireR = reach * (0.88 - 0.18 * fk);
      const fire = ctx.createRadialGradient(imp.x, imp.y, 1, imp.x, imp.y, fireR);
      fire.addColorStop(0, `rgba(255, 255, 230, ${1 - fk})`);
      fire.addColorStop(0.35, `rgba(255, 185, 55, ${0.9 * (1 - fk)})`);
      fire.addColorStop(0.75, `rgba(255, 75, 15, ${0.65 * (1 - fk)})`);
      fire.addColorStop(1, "rgba(180, 20, 5, 0)");
      ctx.fillStyle = fire;
      ctx.beginPath();
      ctx.arc(imp.x, imp.y, fireR, 0, Math.PI * 2);
      ctx.fill();
    }

    const nSparks = imp.heavy ? 8 : 4;
    for (let sp = 0; sp < nSparks; sp++) {
      const ang = (sp / nSparks) * Math.PI * 2 + imp.seed;
      const dist = reach * (0.65 + (sp % 3) * 0.25) * k;
      const px = imp.x + Math.cos(ang) * dist;
      const py = imp.y + Math.sin(ang) * dist * 0.65 - 26 * k + 38 * k * k;
      ctx.fillStyle = sp % 2 === 0 ? "#fff3b0" : "#ff7b1a";
      ctx.globalAlpha = Math.max(0, 1 - k * 1.1);
      ctx.beginPath();
      ctx.arc(px, py, (imp.heavy ? 3.2 : 2.1) * (1 - k * 0.5), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

// ------------------------------------------------------------ 3D beveled fighting-game top HUD

function drawAngledBar(ctx, x, y, w, h, fillRatio, lagRatio, { fromRight = false, color = "#38bdf8", dangerColor = "#ff4d3d", cells = 10 } = {}) {
  const skew = 14;
  ctx.save();
  ctx.beginPath();
  if (fromRight) {
    ctx.moveTo(x + skew, y);
    ctx.lineTo(x + w, y);
    ctx.lineTo(x + w - skew, y + h);
    ctx.lineTo(x, y + h);
  } else {
    ctx.moveTo(x, y);
    ctx.lineTo(x + w - skew, y);
    ctx.lineTo(x + w, y + h);
    ctx.lineTo(x + skew, y + h);
  }
  ctx.closePath();
  ctx.fillStyle = "rgba(8, 12, 20, 0.9)";
  ctx.fill();

  ctx.save();
  ctx.clip();

  const innerFill = (pct, fillStyle) => {
    const clamped = Math.max(0, Math.min(1, pct));
    if (clamped <= 0) return;
    const fw = w * clamped;
    ctx.fillStyle = fillStyle;
    ctx.fillRect(fromRight ? x + w - fw : x, y, fw, h);
  };

  if (lagRatio > fillRatio + 0.004) {
    innerFill(lagRatio, "rgba(255, 255, 255, 0.92)");
  }

  const fillCol = fillRatio <= 0.25 && dangerColor ? dangerColor : fillRatio <= 0.45 && !fromRight && dangerColor ? "#f59e0b" : color;
  const barGrad = ctx.createLinearGradient(0, y, 0, y + h);
  barGrad.addColorStop(0, "#ffffff");
  barGrad.addColorStop(0.24, fillCol);
  barGrad.addColorStop(1, "rgba(10, 16, 28, 0.85)");
  innerFill(fillRatio, barGrad);

  // Tactical segmented cell dividers
  ctx.strokeStyle = "rgba(0, 0, 0, 0.42)";
  ctx.lineWidth = 1.6;
  for (let i = 1; i < cells; i++) {
    const nx = x + (w * i) / cells;
    ctx.beginPath();
    ctx.moveTo(nx - (fromRight ? -4 : 4), y);
    ctx.lineTo(nx + (fromRight ? -4 : 4), y + h);
    ctx.stroke();
  }
  ctx.restore();

  ctx.lineWidth = 2.2;
  ctx.strokeStyle = "rgba(215, 232, 248, 0.78)";
  ctx.stroke();
  ctx.restore();
}

function drawMetallicCrest(ctx, title, subtitle, songName) {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(MID - 94, 5);
  ctx.lineTo(MID + 94, 5);
  ctx.lineTo(MID + 74, 70);
  ctx.lineTo(MID - 74, 70);
  ctx.closePath();
  const crestGrad = ctx.createLinearGradient(0, 5, 0, 70);
  crestGrad.addColorStop(0, "#475569");
  crestGrad.addColorStop(0.35, "#1e293b");
  crestGrad.addColorStop(1, "#0b1220");
  ctx.fillStyle = crestGrad;
  ctx.fill();
  ctx.lineWidth = 2.4;
  ctx.strokeStyle = "rgba(215, 232, 248, 0.85)";
  ctx.stroke();

  ctx.textAlign = "center";
  ctx.shadowColor = "rgba(0, 0, 0, 0.9)";
  ctx.shadowBlur = 4;
  ctx.fillStyle = "#ffffff";
  ctx.font = title.length > 6 ? "900 20px sans-serif" : "900 28px sans-serif";
  ctx.fillText(title, MID, title.length > 6 ? 36 : 38);
  ctx.font = "bold 12px sans-serif";
  ctx.fillStyle = "#cbd5e1";
  ctx.fillText(subtitle, MID, 57);

  if (songName) {
    const label = `♪ ${songName}`;
    ctx.font = "bold 13px sans-serif";
    const pillW = Math.min(280, ctx.measureText(label).width + 26);
    ctx.fillStyle = "rgba(8, 14, 24, 0.86)";
    ctx.strokeStyle = "rgba(120, 210, 255, 0.5)";
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.roundRect(MID - pillW / 2, 74, pillW, 24, 12);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#e0f2fe";
    ctx.fillText(label, MID, 91);
  }
  ctx.restore();
}

function drawRoundPips(ctx, leftBarX, rightBarX, barW, y, mine, theirs) {
  const pip = (x, filled, color) => {
    ctx.beginPath();
    ctx.arc(x, y, 6.2, 0, Math.PI * 2);
    ctx.fillStyle = filled ? color : "rgba(10, 15, 25, 0.88)";
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = filled ? "#ffffff" : color;
    ctx.stroke();
  };
  for (let i = 0; i < ROUNDS_TO_WIN; i++) {
    pip(leftBarX + barW - 12 - i * 17, i < mine, "#38bdf8");
    pip(rightBarX + 12 + i * 17, i < theirs, "#f87171");
  }
}

export function drawRhythmHud(ctx, scene) {
  const { view, side } = scene;
  const rival = otherSide(side);
  const hud = duelHud(view, side);
  const m = view.musical;
  const myHealth = armyHealth(view, side);
  const theirHealth = armyHealth(view, rival);
  const lag = scene.healthLag || { left: myHealth, right: theirHealth };
  const myLag = lag[side] ?? myHealth;
  const theirLag = lag[rival] ?? theirHealth;

  ctx.save();
  const topShade = ctx.createLinearGradient(0, 0, 0, 108);
  topShade.addColorStop(0, "rgba(6, 10, 18, 0.85)");
  topShade.addColorStop(0.75, "rgba(6, 10, 18, 0.42)");
  topShade.addColorStop(1, "rgba(6, 10, 18, 0)");
  ctx.fillStyle = topShade;
  ctx.fillRect(0, 0, ARENA.width, 108);

  // Far-left subtle league & army badge
  ctx.font = "bold 12px sans-serif";
  ctx.textAlign = "left";
  ctx.fillStyle = "rgba(215, 232, 248, 0.88)";
  ctx.fillText(`LIGA ${arenaOf(view.arena).league.toUpperCase()}`, 16, 24);
  ctx.font = "12px sans-serif";
  ctx.fillStyle = "rgba(180, 200, 220, 0.74)";
  ctx.fillText(`${hud.money} · ${hud.army}`, 16, 42);

  // Symmetric HUD cleanly centered at x=600, keeping x > 896 clear for #top-controls even at 1000px viewports!
  const barY = 12;
  const barH = 26;
  const barW = 198;
  const leftBarX = 304; // 304..502
  const rightBarX = 698; // 698..896

  drawAngledBar(ctx, leftBarX, barY, barW, barH, myHealth, myLag, { fromRight: false, color: "#38bdf8" });
  ctx.font = "900 13px sans-serif";
  ctx.textAlign = "left";
  ctx.shadowColor = "rgba(0,0,0,0.95)";
  ctx.shadowBlur = 4;
  ctx.fillStyle = "#7dd3fc";
  ctx.fillText("TU EJÉRCITO", leftBarX + 8, barY + barH + 17);
  ctx.textAlign = "right";
  ctx.fillStyle = "#ffffff";
  ctx.fillText(`${Math.ceil(myHealth * 100)}%`, leftBarX + barW - 18, barY + 18);

  drawAngledBar(ctx, rightBarX, barY, barW, barH, theirHealth, theirLag, { fromRight: true, color: "#ef4444" });
  ctx.textAlign = "right";
  ctx.fillStyle = "#fca5a5";
  ctx.fillText("EJÉRCITO RIVAL", rightBarX + barW - 8, barY + barH + 17);
  ctx.textAlign = "left";
  ctx.fillStyle = "#ffffff";
  ctx.fillText(`${Math.ceil(theirHealth * 100)}%`, rightBarX + 18, barY + 18);

  drawRoundPips(ctx, leftBarX, rightBarX, barW, barY + barH + 13, hud.mine, hud.theirs);

  // Row 3: Clean hit/miss tally + Streak Multiplier Badge
  const myTally = m.tally[side];
  const theirTally = m.tally[rival];
  ctx.font = "bold 13px sans-serif";
  ctx.textAlign = "left";
  ctx.fillStyle = "rgba(235, 245, 255, 0.92)";
  ctx.fillText(`✔ ${myTally.hits}   ✖ ${myTally.misses}`, leftBarX + 8, barY + barH + 37);
  ctx.textAlign = "right";
  ctx.fillText(`✔ ${theirTally.hits}   ✖ ${theirTally.misses}`, rightBarX + barW - 8, barY + barH + 37);

  if (myTally.streak >= 5) {
    const pwr = streakPower(myTally.streak);
    const bx = leftBarX + 94;
    const by = barY + barH + 22;
    const bw = pwr > 1 ? 114 : 84;
    const bh = 23;
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(bx, by, bw, bh, 6);
    const sg = ctx.createLinearGradient(bx, by, bx, by + bh);
    sg.addColorStop(0, pwr >= 2 ? "#7c2d12" : pwr > 1 ? "#713f12" : "#1e3a5f");
    sg.addColorStop(1, "#0f172a");
    ctx.fillStyle = sg;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = cheerColor(myTally.streak);
    ctx.stroke();
    ctx.font = "900 12px sans-serif";
    ctx.textAlign = "center";
    ctx.fillStyle = cheerColor(myTally.streak);
    ctx.fillText(`🔥 ${myTally.streak}${pwr > 1 ? ` · ×${pwr}` : ""}`, bx + bw / 2, by + 16);
    ctx.restore();
  }

  drawMetallicCrest(ctx, hud.clock || "0:00", `ASALTO ${view.round}`, songOf(m.song).name);

  if (scene.paused) {
    shout(ctx, "PAUSA", MID, TRACK.top + 85, { size: 44, color: "#ffd700" });
  }
  ctx.restore();
}

// Matching 3D Metallic Top HUD for the Musical Duel Buy / Hangar Phase!
export function drawBuyHud(ctx, scene) {
  const { view, side } = scene;
  const hud = duelHud(view, side);
  const mine = view.sides[side];
  const m = view.musical;
  const capRatio = Math.min(1, mine.army.length / UNIT_CAP);

  ctx.save();
  const topShade = ctx.createLinearGradient(0, 0, 0, 110);
  topShade.addColorStop(0, "rgba(6, 10, 18, 0.86)");
  topShade.addColorStop(0.75, "rgba(6, 10, 18, 0.42)");
  topShade.addColorStop(1, "rgba(6, 10, 18, 0)");
  ctx.fillStyle = topShade;
  ctx.fillRect(0, 0, ARENA.width, 110);

  // Far-left league crest label
  ctx.font = "900 13px sans-serif";
  ctx.textAlign = "left";
  ctx.fillStyle = "#ffe27a";
  ctx.fillText(m && m.quiz ? "🧮 DUELO MATEMÁTICO" : "🎵 DUELO MUSICAL", 16, 24);
  ctx.font = "bold 12px sans-serif";
  ctx.fillStyle = "rgba(215, 232, 248, 0.85)";
  ctx.fillText(`LIGA ${arenaOf(view.arena).league.toUpperCase()}`, 16, 42);

  const barY = 12;
  const barH = 26;
  const barW = 198;
  const leftBarX = 304; // 304..502
  const rightBarX = 698; // 698..896 (304px clear on the right for #top-controls!)

  // Left beveled bar: Army capacity (12 tactical cells) + golden money badge
  drawAngledBar(ctx, leftBarX, barY, barW, barH, capRatio, capRatio, {
    fromRight: false,
    color: "#38bdf8",
    dangerColor: null,
    cells: UNIT_CAP,
  });
  ctx.font = "900 13px sans-serif";
  ctx.shadowColor = "rgba(0, 0, 0, 0.95)";
  ctx.shadowBlur = 4;
  ctx.textAlign = "left";
  ctx.fillStyle = "#7dd3fc";
  ctx.fillText(`TU EJÉRCITO (${mine.army.length}/${UNIT_CAP})`, leftBarX + 8, barY + barH + 17);
  ctx.textAlign = "right";
  ctx.fillStyle = "#ffe27a";
  ctx.font = "900 15px sans-serif";
  ctx.fillText(hud.money, leftBarX + barW - 18, barY + 18);

  // Right beveled bar: Rival status (stealth crimson metallic bar)
  drawAngledBar(ctx, rightBarX, barY, barW, barH, 1, 1, {
    fromRight: true,
    color: "#991b1b",
    dangerColor: null,
    cells: 10,
  });
  ctx.font = "900 12px sans-serif";
  ctx.textAlign = "left";
  ctx.fillStyle = "#fecaca";
  ctx.fillText(view.sides[side === "left" ? "right" : "left"].ready ? "LISTO · OCULTO" : "COMPRANDO · OCULTO", rightBarX + 18, barY + 18);
  ctx.font = "900 13px sans-serif";
  ctx.textAlign = "right";
  ctx.fillStyle = "#fca5a5";
  ctx.fillText("EJÉRCITO RIVAL", rightBarX + barW - 8, barY + barH + 17);

  drawRoundPips(ctx, leftBarX, rightBarX, barW, barY + barH + 13, hud.mine, hud.theirs);

  // Center metallic shield crest: Round + Preparation + Song title
  // (Between two players the purchase has a clock.)
  drawMetallicCrest(ctx, hud.clock || `ASALTO ${view.round}`, hud.clock ? `ASALTO ${view.round} · ELIGE TU EJÉRCITO` : "ELIGE TU EJÉRCITO", m ? songOf(m.song).name : "");

  if (scene.paused) {
    shout(ctx, "PAUSA", MID, TRACK.top + 85, { size: 44, color: "#ffd700" });
  }
  ctx.restore();
}

// ------------------------------------------------------------ the home network's notice

// What the home server's seats have to say (duelUI.js's duelNotice: waiting
// for the second player, a pause of the rival's, a player gone), over a
// musical duel's screen.
export function drawRhythmNotice(ctx, text) {
  if (!text) return;
  ctx.save();
  ctx.font = "bold 20px sans-serif";
  const w = Math.min(ARENA.width - 40, ctx.measureText(text).width + 48);
  const h = 42;
  const x = MID - w / 2;
  const y = 150;
  ctx.fillStyle = "rgba(8, 14, 24, 0.9)";
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = "#ffe27a";
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
  ctx.fillStyle = "#ffe27a";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, MID, y + h / 2 + 1, w - 28);
  ctx.restore();
}

// ------------------------------------------------------------ crimson error flash

export function drawRhythmFlash(ctx, shake) {
  if (!shake.red) return;
  ctx.save();
  ctx.fillStyle = `rgba(255, 0, 0, ${0.15 * shake.red})`;
  ctx.fillRect(0, 0, ARENA.width, ARENA.height);
  const edge = ctx.createRadialGradient(MID, ARENA.height / 2, ARENA.height * 0.34, MID, ARENA.height / 2, ARENA.width * 0.62);
  edge.addColorStop(0, "rgba(255, 0, 0, 0)");
  edge.addColorStop(1, `rgba(255, 10, 10, ${0.58 * shake.red})`);
  ctx.fillStyle = edge;
  ctx.fillRect(0, 0, ARENA.width, ARENA.height);
  ctx.restore();
}
