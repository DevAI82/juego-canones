// Client-side visual effects, per user request to improve the graphics
// ("quiero mejorar los gráficos"; the RTS screenshots in Imágenes/ are the
// look to aim for): muzzle flashes on enemy guns, smoke trails behind
// rockets, fiery explosions with smoke plumes and scorch marks, a unit
// flaring up as it's hit, smoke and flames from damaged vehicles and
// towers, burnt-out wrecks that slowly fade, and dust and wheel/track marks
// behind vehicles.
//
// None of it is game state: each browser works it out from what changed
// between the frames it draws -- a unit's hp dropping, a new shell, a new
// explosion -- so it adds nothing to what the server sends in co-op, and
// every player still sees the same events.

// Caps, so a huge late wave can't bog the frame rate down: past these, new
// cosmetic particles are skipped (or, for an explosion or muzzle flash, the
// oldest one makes way) and the oldest marks on the ground are dropped.
const MAX_PARTICLES = 700;
const MAX_DECALS = 1400;

const HIT_FLASH_TIME = 0.09;

// How big each kind of explosion is, relative to a buggy's.
const BLAST_SCALE = { soldier: 0.55, motorcycle: 0.8, buggy: 1, tank: 1.35, rocket: 1.45, tower: 1.6, wall: 0.7 };
const VEHICLES = new Set(["buggy", "tank", "motorcycle", "rocket"]);

// Wheel/track marks: how far apart each pair is laid (px travelled), how
// far back and to each side of the vehicle's centre they go, and how long
// they last. Motorcycles leave a single line.
const TRACKS = {
  tank: { back: 30, side: 12, size: 4 },
  rocket: { back: 30, side: 11, size: 3.5 },
  buggy: { back: 17, side: 10, size: 2.5 },
  motorcycle: { back: 20, side: 0, size: 2 },
};
const TRACK_SPACING = 12;
const TRACK_LIFE = 3;

const WRECK_LIFE = 14;
const WRECK_SMOKE_TIME = 7;
const SCORCH_LIFE = 16;

export function createEffects() {
  return {
    particles: [],
    decals: [],
    units: new Map(), // enemy id -> what we last saw of it, and its emitter timers
    towers: new Map(), // tower id -> emitter timer
    shots: new Set(), // projectile and beam ids already seen
    blasts: new Set(), // explosion ids already seen
  };
}

export function clearEffects(fx) {
  fx.particles.length = 0;
  fx.decals.length = 0;
  fx.units.clear();
  fx.towers.clear();
  fx.shots.clear();
  fx.blasts.clear();
}

const rand = (a, b) => a + Math.random() * (b - a);

function spawn(fx, p, important = false) {
  if (fx.particles.length >= MAX_PARTICLES) {
    if (!important) return;
    fx.particles.shift();
  }
  p.age = 0;
  fx.particles.push(p);
}

function addDecal(fx, d) {
  if (fx.decals.length >= MAX_DECALS) fx.decals.shift();
  d.age = 0;
  fx.decals.push(d);
}

// `rise`: how fast it climbs (px/s) -- damage smoke goes up fast enough to
// clear the unit or tower it comes from, which would otherwise hide it.
function smokePuff(fx, x, y, size, life, dark = 0.35, rise = 13) {
  spawn(fx, { kind: "smoke", x, y, vx: rand(-6, 6), vy: -rise * rand(0.7, 1.3), life, size, grow: size * 1.4, dark });
}

function firePuff(fx, x, y, size, speed = 30) {
  const a = rand(0, Math.PI * 2);
  spawn(fx, { kind: "fire", x, y, vx: Math.cos(a) * speed * Math.random(), vy: Math.sin(a) * speed * Math.random() - 12, life: rand(0.25, 0.5), size, grow: -size * 0.6 });
}

function sparks(fx, x, y, n, speed, important = false) {
  for (let i = 0; i < n; i++) {
    const a = rand(0, Math.PI * 2);
    const v = speed * rand(0.5, 1);
    spawn(fx, { kind: "spark", x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rand(0.15, 0.35), size: rand(1, 2) }, important);
  }
}

function muzzleFlash(fx, x, y, angle, size) {
  spawn(fx, { kind: "flash", x, y, vx: 0, vy: 0, angle, life: 0.07, size, grow: 0 }, true);
}

// An enemy that's just been hit flashes white for a moment and throws off
// a few sparks (vehicles) or a puff of dust (soldiers).
function onHit(fx, u, e) {
  u.flash = HIT_FLASH_TIME;
  if (VEHICLES.has(e.type)) sparks(fx, e.x, e.y, 4, 90);
  else spawn(fx, { kind: "dust", x: e.x, y: e.y, vx: rand(-10, 10), vy: rand(-10, 10), life: 0.4, size: 4, grow: 6 });
}

// Wheel/track marks and dust behind a moving vehicle, laid by distance
// travelled rather than time, so a stopped vehicle leaves none.
function trail(fx, u, e) {
  const tr = TRACKS[e.type];
  if (!tr) return;
  const moved = Math.hypot(e.x - u.trackX, e.y - u.trackY);
  if (moved < TRACK_SPACING) return;
  u.trackX = e.x;
  u.trackY = e.y;
  const c = Math.cos(e.angle);
  const s = Math.sin(e.angle);
  const bx = e.x - c * tr.back;
  const by = e.y - s * tr.back;
  if (tr.side === 0) {
    addDecal(fx, { kind: "track", x: bx, y: by, size: tr.size, life: TRACK_LIFE });
  } else {
    addDecal(fx, { kind: "track", x: bx - s * tr.side, y: by + c * tr.side, size: tr.size, life: TRACK_LIFE });
    addDecal(fx, { kind: "track", x: bx + s * tr.side, y: by - c * tr.side, size: tr.size, life: TRACK_LIFE });
  }
  // The light, fast ones kick up dust.
  if ((e.type === "buggy" || e.type === "motorcycle") && Math.random() < 0.45) {
    spawn(fx, { kind: "dust", x: bx, y: by, vx: -c * 12 + rand(-6, 6), vy: -s * 12 + rand(-6, 6), life: rand(0.6, 1), size: rand(4, 6), grow: 12 });
  }
}

// Smoke from a vehicle below half health, flames too below a quarter.
function damageSmoke(fx, u, x, y, frac, dt, scale = 1) {
  if (frac >= 0.5) return;
  u.smoke += dt * (frac < 0.25 ? 9 : 5);
  while (u.smoke >= 1) {
    u.smoke -= 1;
    smokePuff(fx, x + rand(-4, 4) * scale, y + rand(-4, 4) * scale, rand(5, 8) * scale, rand(1.4, 2.2), frac < 0.25 ? 0.7 : 0.5, 30);
    if (frac < 0.25) firePuff(fx, x + rand(-5, 5) * scale, y + rand(-5, 5) * scale, rand(3, 6) * scale, 15);
  }
}

function blast(fx, ex) {
  const k = BLAST_SCALE[ex.kind] ?? 1;
  for (let i = 0; i < Math.round(8 + 10 * k); i++) firePuff(fx, ex.x + rand(-6, 6) * k, ex.y + rand(-6, 6) * k, rand(6, 12) * k, 90 * k);
  for (let i = 0; i < Math.round(4 + 6 * k); i++) {
    spawn(fx, { kind: "smoke", x: ex.x + rand(-10, 10) * k, y: ex.y + rand(-10, 10) * k, vx: rand(-14, 14), vy: rand(-26, -10), life: rand(1.6, 2.8), size: rand(8, 13) * k, grow: 22 * k, dark: 0.5 }, true);
  }
  sparks(fx, ex.x, ex.y, Math.round(6 + 6 * k), 200 * k, true);
  addDecal(fx, { kind: "scorch", x: ex.x, y: ex.y, size: 16 * k, life: SCORCH_LIFE });
  if (VEHICLES.has(ex.kind)) {
    addDecal(fx, { kind: "wreck", type: ex.kind, x: ex.x, y: ex.y, angle: ex.angle || 0, life: WRECK_LIFE, smoke: 0 });
  } else if (ex.kind === "tower") {
    addDecal(fx, { kind: "rubble", x: ex.x, y: ex.y, size: 30, life: WRECK_LIFE * 1.5, smoke: 0, seed: Math.random() * 1000, tone: "#3b3631" });
  } else if (ex.kind === "wall") {
    // A shot-down wall block leaves broken concrete.
    addDecal(fx, { kind: "rubble", x: ex.x, y: ex.y, size: 16, life: WRECK_LIFE, smoke: 0, seed: Math.random() * 1000, tone: "#8d877d" });
  }
}

// Works out this frame's new effects from `view` (main.js's drawnView: the
// state as drawn, interpolated in co-op), then moves everything on by dt.
export function stepEffects(fx, view, dt) {
  const present = new Set();
  for (const e of view.enemies) {
    present.add(e.id);
    let u = fx.units.get(e.id);
    if (!u) {
      u = { hp: e.hp, trackX: e.x, trackY: e.y, smoke: 0, flash: 0 };
      fx.units.set(e.id, u);
    } else if (e.hp < u.hp - 1e-6) {
      onHit(fx, u, e);
    }
    u.hp = e.hp;
    u.flash = Math.max(0, u.flash - dt);
    if (VEHICLES.has(e.type)) {
      trail(fx, u, e);
      damageSmoke(fx, u, e.x, e.y, e.hp / e.maxHp, dt);
    }
  }
  for (const id of fx.units.keys()) if (!present.has(id)) fx.units.delete(id);

  const towersNow = new Set();
  for (const t of view.towers) {
    towersNow.add(t.id);
    let tw = fx.towers.get(t.id);
    if (!tw) fx.towers.set(t.id, (tw = { smoke: 0 }));
    damageSmoke(fx, tw, t.x, t.y - 6, t.hp / t.maxHp, dt, 1.3);
  }
  for (const id of fx.towers.keys()) if (!towersNow.has(id)) fx.towers.delete(id);

  // New shots. An enemy's gun flashes where the enemy is (a tower's own
  // muzzle flash is drawn with the tower); rockets trail smoke all the way.
  const shotsNow = new Set();
  for (const p of view.projectiles) {
    shotsNow.add(p.id);
    if (!fx.shots.has(p.id)) {
      const shooter = nearest(view.enemies, p, 45);
      if (shooter && !nearest(view.towers, p, Math.hypot(shooter.x - p.x, shooter.y - p.y))) {
        const angle = Math.atan2(p.target.y - shooter.y, p.target.x - shooter.x);
        muzzleFlash(fx, shooter.x + Math.cos(angle) * 14, shooter.y + Math.sin(angle) * 14, angle, p.style === "shell" ? 12 : 7);
      }
    }
    if (p.sound === "missile" && Math.random() < dt * 25) {
      spawn(fx, { kind: "smoke", x: p.x, y: p.y, vx: rand(-4, 4), vy: rand(-6, -2), life: rand(0.5, 0.8), size: 3, grow: 9, dark: 0.25 });
    }
  }
  for (const b of view.beams) {
    shotsNow.add(b.id);
    if (!fx.shots.has(b.id)) sparks(fx, b.x2, b.y2, 5, 110);
  }
  fx.shots = shotsNow;

  const blastsNow = new Set();
  for (const ex of view.explosions) {
    blastsNow.add(ex.id);
    if (!fx.blasts.has(ex.id)) blast(fx, ex);
  }
  fx.blasts = blastsNow;

  updateEffects(fx, dt);
}

function nearest(list, p, within) {
  let best = null;
  let bestD = within;
  for (const o of list) {
    const d = Math.hypot(o.x - p.x, o.y - p.y);
    if (d < bestD) {
      best = o;
      bestD = d;
    }
  }
  return best;
}

export function updateEffects(fx, dt) {
  let n = 0;
  for (const p of fx.particles) {
    p.age += dt;
    if (p.age >= p.life) continue;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (p.kind === "smoke" || p.kind === "dust") {
      p.vx *= 1 - 0.8 * dt;
      p.vy *= 1 - 0.8 * dt;
      if (p.kind === "smoke") p.vx += 6 * dt; // a light breeze
    }
    if (p.kind === "spark") {
      p.vx *= 1 - 3 * dt;
      p.vy *= 1 - 3 * dt;
    }
    fx.particles[n++] = p;
  }
  fx.particles.length = n;

  let m = 0;
  for (const d of fx.decals) {
    d.age += dt;
    if (d.age >= d.life) continue;
    if ((d.kind === "wreck" || d.kind === "rubble") && d.age < WRECK_SMOKE_TIME) {
      d.smoke += dt * (3.5 - (2.5 * d.age) / WRECK_SMOKE_TIME);
      while (d.smoke >= 1) {
        d.smoke -= 1;
        smokePuff(fx, d.x + rand(-8, 8), d.y + rand(-8, 8), rand(5, 9), rand(1.5, 2.5), 0.5);
      }
    }
    fx.decals[m++] = d;
  }
  fx.decals.length = m;
}

// 0..1: how strongly to flash enemy `id` white this frame.
export function hitFlash(fx, id) {
  const u = fx.units.get(id);
  return u ? u.flash / HIT_FLASH_TIME : 0;
}

// --- Drawing ----------------------------------------------------------------

// A scorched copy of a vehicle sprite, for its wreck -- made once per image
// the first time it's needed.
const burnt = new Map();
function burntSprite(img) {
  let c = burnt.get(img.src);
  if (!c) {
    c = document.createElement("canvas");
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const g = c.getContext("2d");
    g.drawImage(img, 0, 0);
    g.globalCompositeOperation = "source-atop";
    g.fillStyle = "rgba(30, 24, 18, 0.8)";
    g.fillRect(0, 0, c.width, c.height);
    burnt.set(img.src, c);
  }
  return c;
}

// Everything that lies on the ground, under the units: scorch marks, wheel
// and track marks, wrecks, rubble, dust. `wreckSprite(type)` gives
// { img, w, h } for drawing a vehicle's wreck, or null if not loaded.
export function drawGroundEffects(fx, ctx, wreckSprite) {
  ctx.save();
  for (const d of fx.decals) {
    const fade = 1 - d.age / d.life;
    if (d.kind === "scorch") {
      const g = ctx.createRadialGradient(d.x, d.y, 0, d.x, d.y, d.size);
      g.addColorStop(0, `rgba(15, 10, 6, ${0.55 * fade})`);
      g.addColorStop(1, "rgba(15, 10, 6, 0)");
      ctx.fillStyle = g;
      ctx.fillRect(d.x - d.size, d.y - d.size, d.size * 2, d.size * 2);
    } else if (d.kind === "track") {
      ctx.globalAlpha = 0.22 * fade;
      ctx.fillStyle = "#2a2116";
      ctx.fillRect(d.x - d.size / 2, d.y - d.size / 2, d.size, d.size);
      ctx.globalAlpha = 1;
    }
  }
  for (const d of fx.decals) {
    const fade = Math.min(1, (1 - d.age / d.life) * 3); // full until the last third, then fades out
    if (d.kind === "wreck") {
      const sp = wreckSprite(d.type);
      if (!sp) continue;
      ctx.save();
      ctx.globalAlpha = 0.9 * fade;
      ctx.translate(d.x, d.y);
      ctx.rotate(d.angle);
      ctx.drawImage(burntSprite(sp.img), -sp.w / 2, -sp.h / 2, sp.w, sp.h);
      ctx.restore();
      // Embers glowing in the hull for the first few seconds.
      if (d.age < 4) {
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = (1 - d.age / 4) * (0.5 + 0.3 * Math.sin(d.age * 17 + d.x));
        ctx.fillStyle = "#ff7a1a";
        ctx.beginPath();
        ctx.arc(d.x, d.y, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    } else if (d.kind === "rubble") {
      ctx.save();
      ctx.globalAlpha = 0.85 * fade;
      ctx.fillStyle = d.tone;
      for (let i = 0; i < 9; i++) {
        const a = d.seed + i * 2.4;
        const r = (d.size * ((i * 37) % 10)) / 14;
        ctx.fillRect(d.x + Math.cos(a) * r - 4, d.y + Math.sin(a) * r - 3, 8 - (i % 3), 6 - (i % 2));
      }
      ctx.restore();
    }
  }
  for (const p of fx.particles) {
    if (p.kind !== "dust") continue;
    const t = p.age / p.life;
    ctx.globalAlpha = 0.35 * (1 - t);
    ctx.fillStyle = "#b9a27c";
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size + p.grow * t, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// Everything in the air, over the units: smoke, then (additively, so it
// glows) fire, sparks and muzzle flashes.
export function drawAirEffects(fx, ctx) {
  ctx.save();
  for (const p of fx.particles) {
    if (p.kind !== "smoke") continue;
    const t = p.age / p.life;
    const shade = Math.round(70 - 40 * p.dark);
    ctx.globalAlpha = (1 - t) * (0.25 + 0.45 * p.dark) * Math.min(1, t * 6 + 0.3);
    ctx.fillStyle = `rgb(${shade}, ${shade - 2}, ${shade - 6})`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size + p.grow * t, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalCompositeOperation = "lighter";
  for (const p of fx.particles) {
    const t = p.age / p.life;
    if (p.kind === "fire") {
      ctx.globalAlpha = 0.8 * (1 - t);
      ctx.fillStyle = t < 0.35 ? "#ffd27a" : "#ff7a22";
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(0.5, p.size + p.grow * t), 0, Math.PI * 2);
      ctx.fill();
    } else if (p.kind === "spark") {
      ctx.globalAlpha = 1 - t;
      ctx.fillStyle = "#fff1b8";
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    } else if (p.kind === "flash") {
      ctx.globalAlpha = 1 - t;
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size);
      g.addColorStop(0, "rgba(255, 250, 220, 1)");
      g.addColorStop(0.4, "rgba(255, 200, 90, 0.8)");
      g.addColorStop(1, "rgba(255, 140, 40, 0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      // A short streak out of the barrel.
      ctx.strokeStyle = "rgba(255, 235, 170, 0.9)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x + Math.cos(p.angle) * p.size * 1.6, p.y + Math.sin(p.angle) * p.size * 1.6);
      ctx.stroke();
    }
  }
  ctx.restore();
}
