// Photorealistic 2.5D battlefield renderer for the Musical Duel (both Buy
// Phase and Combat / RoundEnd). Composites high-resolution photorealistic 3D
// arena backdrops (assets/duel_music/arena1..5.jpg) with transparent 3/4 hero
// unit renders (assets/duel_music/unit_<type>_<blue|red>.webp) scaled along
// true perspective depth slots, complete with grounded contact shadows,
// glowing cyan/crimson/gold tactical rings, engine idle vibration, firing
// recoil + muzzle rim light, impact hit-flashes, charred burning wreckages
// with animated fire & rising smoke plumes, and arena ambient particles.
//
// Zero WebGL dependencies — runs smoothly at 60 FPS on desktop and mobile.
import { ARENA } from "./duelArenas.js";
import { stagePhotoPlaces } from "./duelStage.js";
import { streakPower } from "./duelRhythm.js";

const FLIGHT = 0.26; // must match duelRhythmDraw.js volley flight duration

// Calibrated hero visual proportions & exact barrel/muzzle coordinates
// (normalized to the Blue right-facing sprite; Red mirrors mx -> 1 - mx).
export const UNIT_PHOTO = {
  tank: { baseW: 248, anchorY: 0.87, ringRx: 0.50, ringRy: 0.16, muzzleX: 0.96, muzzleY: 0.50, recoil: 11 },
  rocket: { baseW: 218, anchorY: 0.89, ringRx: 0.48, ringRy: 0.15, muzzleX: 0.48, muzzleY: 0.15, recoil: 9 },
  buggy: { baseW: 164, anchorY: 0.89, ringRx: 0.46, ringRy: 0.15, muzzleX: 0.78, muzzleY: 0.34, recoil: 5 },
  motorcycle: { baseW: 118, anchorY: 0.91, ringRx: 0.45, ringRy: 0.14, muzzleX: 0.82, muzzleY: 0.42, recoil: 4 },
  soldier: { baseW: 72, anchorY: 0.93, ringRx: 0.46, ringRy: 0.14, muzzleX: 0.94, muzzleY: 0.32, recoil: 3 },
};

const ARENA_ATMOSPHERE = {
  1: { fallback: ["#e8c88a", "#c79e5e", "#9a743d"], mote: "rgba(255, 224, 155, 0.35)", kind: "dust", tint: [232, 188, 120] },
  2: { fallback: ["#484c52", "#68625b", "#3a3836"], mote: "rgba(210, 200, 190, 0.28)", kind: "dust", tint: [145, 138, 132] },
  3: { fallback: ["#181416", "#3d2219", "#1d1616"], mote: "rgba(255, 150, 50, 0.78)", kind: "embers", tint: [88, 56, 44] },
  4: { fallback: ["#101d34", "#2c4669", "#7b93b0"], mote: "rgba(235, 245, 255, 0.72)", kind: "snow", tint: [165, 195, 232] },
  5: { fallback: ["#4a3456", "#a86b56", "#cfa572"], mote: "rgba(255, 222, 130, 0.55)", kind: "embers", tint: [228, 178, 122] },
};

// Deterministic ambient motes (dust / embers / snow) so there is zero allocation per frame.
const MOTES = Array.from({ length: 42 }, (_, i) => ({
  seed: i * 1.6180339,
  x: ((i * 293 + 71) % 1200),
  y: ((i * 197 + 43) % 750),
  size: 1.4 + (i % 4) * 0.9,
  speed: 14 + (i % 7) * 8,
  phase: i * 0.83,
}));

export function createDuelMusicStage() {
  const arenaImages = new Map();
  const unitImages = new Map();
  const firePulse = new Map(); // unitId -> remaining recoil/muzzle timer
  const hitPulse = new Map();  // unitId -> remaining hit-flash timer
  const seenShots = new WeakSet();
  const hitShots = new WeakSet();

  function loadImg(src) {
    if (typeof Image === "undefined") return null;
    const img = new Image();
    img.src = src;
    return img;
  }

  function arenaImg(id) {
    const key = Math.max(1, Math.min(5, id || 1));
    if (!arenaImages.has(key)) {
      arenaImages.set(key, loadImg(`assets/duel_music/arena${key}.jpg`));
    }
    return arenaImages.get(key);
  }

  function unitImg(type, side) {
    const color = side === "left" ? "blue" : "red";
    const key = `${type}_${color}`;
    if (!unitImages.has(key)) {
      unitImages.set(key, loadImg(`assets/duel_music/unit_${type}_${color}.webp`));
    }
    return unitImages.get(key);
  }

  const readyImg = (img) => (img && img.complete && img.naturalWidth > 0 ? img : null);

  // Preload all 10 unit sprites & current arena cleanly on startup.
  function preload(arenaId = 1) {
    arenaImg(arenaId);
    for (const type of Object.keys(UNIT_PHOTO)) {
      unitImg(type, "left");
      unitImg(type, "right");
    }
  }

  function reset() {
    firePulse.clear();
    hitPulse.clear();
  }

  function updatePulses(view, dt) {
    for (const [id, t] of firePulse) {
      if (t - dt <= 0) firePulse.delete(id);
      else firePulse.set(id, t - dt);
    }
    for (const [id, t] of hitPulse) {
      if (t - dt <= 0) hitPulse.delete(id);
      else hitPulse.set(id, t - dt);
    }
    for (const shot of view.shots || []) {
      if (shot.age < 0.14 && !seenShots.has(shot)) {
        seenShots.add(shot);
        firePulse.set(shot.fromId, 0.24);
      }
      if (shot.age >= FLIGHT - 0.01 && !hitShots.has(shot)) {
        hitShots.add(shot);
        hitPulse.set(shot.toId, 0.24);
      }
    }
  }

  function drawAmbientMotes(ctx, arenaId, clock) {
    const atm = ARENA_ATMOSPHERE[arenaId] || ARENA_ATMOSPHERE[1];
    ctx.save();
    for (const m of MOTES) {
      let x, y, alpha;
      if (atm.kind === "embers") {
        x = (m.x + Math.sin(clock * 1.4 + m.phase) * 28 + ARENA.width) % ARENA.width;
        y = ARENA.height - ((m.y + clock * m.speed * 1.8) % ARENA.height);
        alpha = 0.35 + 0.55 * (0.5 + 0.5 * Math.sin(clock * 6 + m.phase));
      } else if (atm.kind === "snow") {
        x = (m.x + clock * 18 + Math.sin(clock * 1.2 + m.phase) * 22) % ARENA.width;
        y = (m.y + clock * m.speed * 1.35) % ARENA.height;
        alpha = 0.55;
      } else {
        x = (m.x + clock * m.speed * 0.9) % ARENA.width;
        y = (m.y + Math.sin(clock * 0.7 + m.phase) * 14 + ARENA.height) % ARENA.height;
        alpha = 0.26;
      }
      ctx.globalAlpha = alpha;
      ctx.fillStyle = atm.mote;
      ctx.beginPath();
      ctx.arc(x, y, m.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawWreckFire(ctx, cx, cy, scale, clock, seed) {
    ctx.save();
    // Rising billowing dark smoke column
    for (let i = 0; i < 4; i++) {
      const phase = ((clock * 0.75 + seed + i * 0.25) % 1);
      const sx = cx + Math.sin(clock * 2.2 + seed + i * 1.7) * 14 * scale + phase * 18 * scale;
      const sy = cy - (18 + phase * 82) * scale;
      const sr = (16 + phase * 32) * scale;
      const g = ctx.createRadialGradient(sx, sy, 2, sx, sy, sr);
      g.addColorStop(0, `rgba(18, 14, 12, ${0.58 * (1 - phase)})`);
      g.addColorStop(0.6, `rgba(26, 20, 18, ${0.32 * (1 - phase)})`);
      g.addColorStop(1, "rgba(18, 14, 12, 0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(sx, sy, sr, 0, Math.PI * 2);
      ctx.fill();
    }

    // Flickering multi-tongue fire core
    const flicker = 0.86 + 0.22 * Math.sin(clock * 17 + seed * 5);
    const fireR = 38 * scale * flicker;
    const fg = ctx.createRadialGradient(cx, cy - 8 * scale, 2, cx, cy - 12 * scale, fireR);
    fg.addColorStop(0, "rgba(255, 252, 210, 0.95)");
    fg.addColorStop(0.32, "rgba(255, 175, 40, 0.88)");
    fg.addColorStop(0.68, "rgba(235, 65, 12, 0.56)");
    fg.addColorStop(1, "rgba(160, 20, 5, 0)");
    ctx.fillStyle = fg;
    ctx.beginPath();
    ctx.arc(cx, cy - 10 * scale, fireR, 0, Math.PI * 2);
    ctx.fill();

    // Rising glowing embers
    for (let e = 0; e < 4; e++) {
      const ep = ((clock * 1.35 + seed * 2.3 + e * 0.25) % 1);
      const ex = cx + Math.sin(ep * 8 + e * 2.1 + seed) * 22 * scale;
      const ey = cy - (14 + ep * 74) * scale;
      ctx.fillStyle = e % 2 === 0 ? "#fff2a6" : "#ff7b1a";
      ctx.globalAlpha = 1 - ep;
      ctx.beginPath();
      ctx.arc(ex, ey, Math.max(1.2, 2.5 * scale * (1 - ep * 0.5)), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawMiniHpBar(ctx, cx, topY, w, ratio, side) {
    const bw = Math.max(44, Math.min(84, w * 0.42));
    const bh = 6;
    const bx = cx - bw / 2;
    const by = topY - 11;
    ctx.save();
    ctx.fillStyle = "rgba(6, 10, 18, 0.85)";
    ctx.beginPath();
    ctx.roundRect(bx - 1, by - 1, bw + 2, bh + 2, 3);
    ctx.fill();
    const fillCol = ratio <= 0.25 ? "#ff3b30" : side === "left" ? "#38bdf8" : "#f87171";
    ctx.fillStyle = fillCol;
    ctx.beginPath();
    ctx.roundRect(bx, by, Math.max(0, bw * Math.max(0, Math.min(1, ratio))), bh, 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
    ctx.lineWidth = 1;
    ctx.strokeRect(bx - 0.5, by - 0.5, bw + 1, bh + 1);
    ctx.restore();
  }

  // Render the photorealistic 3D battlefield & armies onto `ctx` (1200x750).
  // Returns Map<unitId, { x, y, muzzleX, muzzleY, left, top, w, h, scale }>.
  function render(ctx, view, { clock = 0, dt = 0, side = "left", buyPhase = false, selectedId = null } = {}) {
    updatePulses(view, dt);

    const arenaId = view.arena || 1;
    const atm = ARENA_ATMOSPHERE[arenaId] || ARENA_ATMOSPHERE[1];
    const bg = readyImg(arenaImg(arenaId));

    // 1. Photorealistic 3D arena backdrop
    ctx.save();
    if (bg) {
      ctx.drawImage(bg, 0, 0, ARENA.width, ARENA.height);
    } else {
      const g = ctx.createLinearGradient(0, 0, 0, ARENA.height);
      g.addColorStop(0, atm.fallback[0]);
      g.addColorStop(0.35, atm.fallback[1]);
      g.addColorStop(1, atm.fallback[2]);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, ARENA.width, ARENA.height);
    }

    // Subtle atmospheric contrast vignette so vehicles & highway pop cleanly
    const topVignette = ctx.createLinearGradient(0, 0, 0, 150);
    topVignette.addColorStop(0, "rgba(4, 8, 14, 0.45)");
    topVignette.addColorStop(1, "rgba(4, 8, 14, 0)");
    ctx.fillStyle = topVignette;
    ctx.fillRect(0, 0, ARENA.width, 150);

    // Subtle buy-phase right-flank radar ambience when no rival units are shown
    if (buyPhase) {
      const leftLight = ctx.createRadialGradient(280, 440, 20, 280, 440, 320);
      leftLight.addColorStop(0, "rgba(56, 200, 255, 0.14)");
      leftLight.addColorStop(1, "rgba(56, 200, 255, 0)");
      ctx.fillStyle = leftLight;
      ctx.fillRect(0, 120, 620, 480);
    }
    ctx.restore();

    // 2. Gather units to display
    const units = buyPhase
      ? (view.sides[side]?.army || []).map((u) => ({ ...u, side, alive: true, hp: 1, maxHp: 1 }))
      : view.units || [];

    const places = stagePhotoPlaces(units, { buyPhase });
    // Sort back-to-front by ground Y so foreground vehicles overlap background naturally!
    const ordered = [...units].sort((a, b) => {
      const pa = places.get(a.id);
      const pb = places.get(b.id);
      return (pa ? pa.y : 0) - (pb ? pb.y : 0) || a.id - b.id;
    });

    const m = view.musical;
    const projected = new Map();

    for (const u of ordered) {
      const p = places.get(u.id);
      if (!p) continue;
      const spec = UNIT_PHOTO[u.type] || UNIT_PHOTO.tank;
      const img = readyImg(unitImg(u.type, u.side));
      const aspect = img ? img.naturalHeight / img.naturalWidth : 0.62;
      const w = spec.baseW * p.scale;
      const h = w * aspect;
      const isLeft = u.side === "left";
      const alive = u.alive !== false;

      // Subtle engine vibration / infantry stance sway
      const vib = alive
        ? u.type === "soldier"
          ? Math.sin(clock * 3.4 + u.id * 1.9) * 1.1 * p.scale
          : Math.sin(clock * 14 + u.id * 2.7) * 0.65 * p.scale
        : 0;

      // Recoil kickback when firing + hit-jolt when struck
      const fRem = firePulse.get(u.id) || 0;
      const hRem = hitPulse.get(u.id) || 0;
      const fk = fRem / 0.24;
      const hk = hRem / 0.24;
      const recoilDir = isLeft ? -1 : 1;
      const dx = (fk > 0 ? recoilDir * spec.recoil * p.scale * Math.sin(fk * Math.PI) : 0)
        + (hk > 0 ? recoilDir * 9 * p.scale * Math.sin(hk * Math.PI * 2) : 0);
      const dy = vib;

      const groundX = p.x + dx;
      const groundY = p.y;
      const left = groundX - w / 2;
      const top = groundY - h * spec.anchorY + dy;

      const mxNorm = isLeft ? spec.muzzleX : 1 - spec.muzzleX;
      const muzzleX = left + w * mxNorm;
      const muzzleY = top + h * spec.muzzleY;
      const centerX = groundX;
      const centerY = top + h * 0.48;

      projected.set(u.id, {
        x: centerX,
        y: centerY,
        groundX,
        groundY,
        muzzleX,
        muzzleY,
        left,
        top,
        w,
        h,
        scale: p.scale,
      });

      const selected = buyPhase && selectedId === u.id;
      const sideStreak = !buyPhase && m ? (m.tally[u.side]?.streak || 0) : 0;
      const overcharged = streakPower(sideStreak) >= 2;

      // 2a. Grounded soft contact shadow
      ctx.save();
      const rx = w * spec.ringRx;
      const ry = Math.max(10, w * spec.ringRy);
      const shGrad = ctx.createRadialGradient(groundX, groundY + 2 * p.scale, rx * 0.15, groundX, groundY + 2 * p.scale, rx * 1.12);
      shGrad.addColorStop(0, alive ? "rgba(0, 0, 0, 0.62)" : "rgba(8, 5, 4, 0.82)");
      shGrad.addColorStop(0.65, alive ? "rgba(0, 0, 0, 0.28)" : "rgba(12, 8, 6, 0.45)");
      shGrad.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = shGrad;
      ctx.beginPath();
      ctx.ellipse(groundX, groundY + 2 * p.scale, rx * 1.12, ry * 1.18, 0, 0, Math.PI * 2);
      ctx.fill();

      // 2b. Glowing 3D perspective tactical ring (matching duel_musical_3d_base_v2!)
      if (alive) {
        const ringCol = selected ? "#ffd75e" : overcharged ? "#ffd75e" : isLeft ? "#38e8ff" : "#ff453a";
        const pulse = selected ? 0.82 + 0.18 * Math.sin(clock * 8) : overcharged ? 0.78 + 0.22 * Math.sin(clock * 7) : 0.78;
        ctx.strokeStyle = ringCol;
        ctx.shadowColor = ringCol;
        ctx.shadowBlur = (selected ? 18 : overcharged ? 16 : 11) * p.scale;
        ctx.lineWidth = (selected ? 3.6 : 2.3) * Math.max(0.65, p.scale);
        ctx.globalAlpha = pulse;
        ctx.beginPath();
        ctx.ellipse(groundX, groundY, rx * 1.04, ry * 1.06, 0, 0, Math.PI * 2);
        ctx.stroke();

        // Subtle inner translucent aura wash inside selected ring
        if (selected) {
          ctx.shadowBlur = 0;
          ctx.fillStyle = "rgba(255, 215, 94, 0.16)";
          ctx.fill();
        }
      }
      ctx.restore();

      // 2c. Photorealistic unit sprite (or charred hulk when destroyed)
      ctx.save();
      const tilt = fk > 0 ? (isLeft ? -0.032 : 0.032) * Math.sin(fk * Math.PI) : 0;
      if (tilt !== 0) {
        ctx.translate(groundX, groundY);
        ctx.rotate(tilt);
        ctx.translate(-groundX, -groundY);
      }

      if (!alive) {
        ctx.filter = "brightness(0.42) contrast(1.18) saturate(0.32)";
      } else if (hk > 0.35) {
        ctx.filter = `brightness(${1 + hk * 0.95}) saturate(${1 + hk * 0.5})`;
      } else if (p.scale < 0.62) {
        // Subtle atmospheric depth softening on far back-row units
        ctx.filter = `brightness(${0.92 + p.scale * 0.12}) contrast(${0.94 + p.scale * 0.1})`;
      }

      if (img) {
        ctx.drawImage(img, left, top, w, h);
      } else {
        // Clean fallback silhouette while image loads
        ctx.fillStyle = isLeft ? "#38bdf8" : "#ef4444";
        ctx.beginPath();
        ctx.roundRect(left + w * 0.15, top + h * 0.2, w * 0.7, h * 0.65, 8);
        ctx.fill();
      }
      ctx.filter = "none";

      // Warm muzzle bounce light over front hull when firing
      if (alive && fk > 0) {
        ctx.globalCompositeOperation = "lighter";
        const mg = ctx.createRadialGradient(muzzleX, muzzleY, 2, muzzleX, muzzleY, w * 0.45);
        mg.addColorStop(0, `rgba(255, 215, 110, ${0.42 * fk})`);
        mg.addColorStop(1, "rgba(255, 120, 20, 0)");
        ctx.fillStyle = mg;
        ctx.beginPath();
        ctx.arc(muzzleX, muzzleY, w * 0.45, 0, Math.PI * 2);
        ctx.fill();
      }

      // Incandescent hit-flash bloom across hull when struck by enemy volley
      if (hk > 0) {
        ctx.globalCompositeOperation = "lighter";
        const hg = ctx.createRadialGradient(centerX, centerY, 4, centerX, centerY, w * 0.48);
        hg.addColorStop(0, `rgba(255, 240, 190, ${0.75 * hk})`);
        hg.addColorStop(0.5, `rgba(255, 110, 30, ${0.48 * hk})`);
        hg.addColorStop(1, "rgba(255, 50, 10, 0)");
        ctx.fillStyle = hg;
        ctx.beginPath();
        ctx.arc(centerX, centerY, w * 0.48, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      // 2d. Continuous burning wreckage fire + rising smoke on fallen units!
      if (!alive) {
        drawWreckFire(ctx, centerX, centerY - h * 0.08, p.scale, clock, u.id * 1.37);
      } else if (!buyPhase && u.maxHp > 0 && u.hp < u.maxHp) {
        drawMiniHpBar(ctx, centerX, top + h * 0.08, w, u.hp / u.maxHp, u.side);
      } else if (selected) {
        // Floating golden chevron pointer above selected unit in Buy Phase
        const bob = Math.sin(clock * 6) * 4;
        const py = top - 14 + bob;
        ctx.save();
        ctx.fillStyle = "#ffd75e";
        ctx.shadowColor = "#ffaa00";
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.moveTo(centerX, py + 11);
        ctx.lineTo(centerX - 9, py);
        ctx.lineTo(centerX + 9, py);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    }

    // 3. Ambient arena dust / glowing foundry embers / drifting moonlit snow
    drawAmbientMotes(ctx, arenaId, clock);

    return projected;
  }

  // Hit-test a canvas coordinate `pos` against the last rendered unit bounds
  // (checks front-to-back so clicking overlapping foreground units wins).
  function pickUnit(pos, projected, army) {
    if (!projected || !army || army.length === 0) return null;
    // Sort front-to-back (largest groundY first)
    const ordered = [...army].sort((a, b) => {
      const pa = projected.get(a.id);
      const pb = projected.get(b.id);
      return (pb ? pb.groundY : 0) - (pa ? pa.groundY : 0);
    });
    for (const u of ordered) {
      const b = projected.get(u.id);
      if (!b) continue;
      if (pos.x >= b.left - 8 && pos.x <= b.left + b.w + 8 && pos.y >= b.top - 8 && pos.y <= b.top + b.h + 10) {
        return u;
      }
    }
    return null;
  }

  return { preload, reset, render, pickUnit };
}
