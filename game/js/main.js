import { CANVAS_WIDTH, CANVAS_HEIGHT, drawMap } from "./map.js";
import { WAVES } from "./waves.js";
import { TOWER_TYPES } from "./tower.js";
import { initBuildMenu, updateBuildMenu, initUpgradePanel, updateUpgradePanel } from "./ui.js";
import {
  createGameState,
  stepSimulation,
  placeTower,
  upgradeTower,
  repairTower,
  sellTower,
  skipWave,
  togglePause,
} from "./simulate.js";
import { playSound, toggleMuted, startMusic, pauseMusic, resumeMusic } from "./audio.js";

// Browsers refuse to start any audio (synthesized SFX or the background
// music) before a real user gesture. Fire once, on whichever happens
// first -- a click anywhere or any keypress -- then get out of the way.
function unlockAudioOnce() {
  startMusic();
  window.removeEventListener("pointerdown", unlockAudioOnce);
  window.removeEventListener("keydown", unlockAudioOnce);
}
window.addEventListener("pointerdown", unlockAudioOnce);
window.addEventListener("keydown", unlockAudioOnce);

const canvas = document.getElementById("game-canvas");
const ctx = canvas.getContext("2d");

// Scales the whole 1200x750 game (canvas + every HTML overlay together,
// see style.css's comment on #game-viewport) to fit the current window,
// so it fills the screen on any monitor size or a phone in either
// orientation instead of only ever rendering at a fixed 1200px.
const gameViewport = document.getElementById("game-viewport");
const gameContainer = document.getElementById("game-container");
function resizeGame() {
  const scale = Math.min(window.innerWidth / CANVAS_WIDTH, window.innerHeight / CANVAS_HEIGHT);
  gameContainer.style.transform = `scale(${scale})`;
  gameViewport.style.width = `${CANVAS_WIDTH * scale}px`;
  gameViewport.style.height = `${CANVAS_HEIGHT * scale}px`;
}
resizeGame();
window.addEventListener("resize", resizeGame);
window.addEventListener("orientationchange", resizeGame);

function loadImage(src) {
  const img = new Image();
  img.src = src;
  return img;
}

const mapImage = loadImage("assets/map_bg.png");
const sprites = {
  tower_basic: loadImage("assets/tower_basic.png"),
  tower_double: loadImage("assets/tower_double.png"),
  tower_laser: loadImage("assets/tower_laser.png"),
  enemy_soldier: loadImage("assets/enemy_soldier.png"),
  enemy_buggy: loadImage("assets/enemy_buggy.png"),
  enemy_tank: loadImage("assets/enemy_tank.png"),
  enemy_motorcycle: loadImage("assets/enemy_motorcycle.png"),
  enemy_rocket: loadImage("assets/enemy_rocket.png"),
  explosion: loadImage("assets/explosion.png"),
  projectile: loadImage("assets/projectile.png"),
};

function ready(img) {
  return img.complete && img.naturalWidth > 0;
}

// --- Game state -------------------------------------------------------
// `state` is exactly simulate.js's shape (economy/enemies/towers/etc).
// In LOCAL mode this tab owns it and steps it itself every frame. In
// NETWORKED mode (see connectToServer() below) it's replaced wholesale
// by whatever the server's last polled snapshot was -- this tab never
// mutates it directly, only sends actions and waits for the next poll.
let state = createGameState();
let networked = false; // set once, before the loop starts (see boot() below)

let selectedBuildType = null;
// The selected tower is tracked by id, not object reference: in networked
// mode `state` (and every tower object in it) is replaced wholesale on
// every poll, so a direct reference would go stale within ~150ms.
let selectedTowerId = null;
const upgradePanelEl = document.getElementById("upgrade-panel");
let mouseX = 0;
let mouseY = 0;

// Running clock (seconds) used only for cosmetic animation phase (the
// enemy walking bob) -- deliberately not gameplay state.
let frameNow = 0;

// Every projectile/beam id we've already played a firing sound for.
// Rebuilt from the CURRENT state each frame (rather than only ever
// growing) so ids belonging to projectiles/beams that have since expired
// naturally fall out -- this also makes it correct across a shared
// server reset in networked mode, where `state` is a wholly new object
// with ids starting over from empty arrays.
let soundedIds = new Set();

// Tracks the last state.paused value we reacted to, so the music is
// paused/resumed exactly on the transition (not fought over every frame)
// -- works for both local play and networked co-op, where `paused` can
// flip because a *different* player hit pause.
let lastMusicPaused = false;
function syncMusicToPause() {
  if (state.paused === lastMusicPaused) return;
  lastMusicPaused = state.paused;
  if (state.paused) pauseMusic();
  else resumeMusic();
}

// Compares this frame's projectiles/beams against what we've already
// played a sound for, and fires the newly-appeared ones' sound effects.
// Every projectile/beam is tagged with `sound`/an implicit "laser" (see
// simulate.js) all the way back at creation, so this never needs to know
// *why* a shot happened, only that one just did.
function playNewShotSounds() {
  const nextSounded = new Set();
  for (const p of state.projectiles) {
    nextSounded.add(p.id);
    if (!soundedIds.has(p.id)) playSound(p.sound);
  }
  for (const b of state.beams) {
    nextSounded.add(b.id);
    if (!soundedIds.has(b.id)) playSound("laser");
  }
  soundedIds = nextSounded;
}

// --- Actions ------------------------------------------------------------
// One call site per player action, used by every click/keydown handler
// below. In local mode these apply directly to `state` (same as calling
// simulate.js's functions inline used to). In networked mode they instead
// POST to the host and return immediately -- the action's actual effect
// (or rejection) shows up on the next state poll, not synchronously.
const actions = {
  place(towerType, x, y) {
    if (networked) {
      postAction({ type: "place", towerType, x, y });
      return;
    }
    placeTower(state, towerType, x, y);
  },
  upgrade(towerId, skill) {
    if (networked) {
      postAction({ type: "upgrade", towerId, skill });
      return;
    }
    upgradeTower(state, towerId, skill);
  },
  repair(towerId) {
    if (networked) {
      postAction({ type: "repair", towerId });
      return;
    }
    repairTower(state, towerId);
  },
  sell(towerId) {
    if (networked) {
      postAction({ type: "sell", towerId });
      return;
    }
    sellTower(state, towerId);
  },
  skip() {
    if (networked) {
      postAction({ type: "skip" });
      return;
    }
    skipWave(state);
  },
  pause() {
    if (networked) {
      postAction({ type: "pause" });
      return;
    }
    togglePause(state);
  },
  reset() {
    if (networked) {
      postAction({ type: "restart" });
      return;
    }
    state = createGameState();
  },
};

function postAction(body) {
  fetch("/api/action", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).catch(() => {}); // best-effort -- the next state poll is the real source of truth
}

// How fast the walking/driving bob cycles, in radians of sine-phase per
// second -- purely a rendering flourish (see drawEnemy), no gameplay effect.
const BOB_SPEED = 9;

function drawEnemy(e) {
  const spriteKey = `enemy_${e.type}`;
  const img = sprites[spriteKey];
  ctx.save();
  // A small side-to-side bob while moving, out of phase per-enemy
  // (bobPhase) so a wave doesn't all bounce in unison -- makes movement
  // read as walking/driving instead of a sprite gliding in place.
  const bob = Math.sin(frameNow * BOB_SPEED + e.bobPhase) * 1.6;
  ctx.translate(e.x, e.y + bob);
  ctx.rotate(e.angle);
  if (ready(img)) {
    // Draw at the sprite's real aspect ratio instead of squashing every
    // enemy into a fixed square -- source crops range up to ~3.8:1.
    const h = 26;
    const w = h * (img.naturalWidth / img.naturalHeight);
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
  } else {
    const FALLBACK_COLOR = { tank: "#7a3b3b", buggy: "#b8ab7a", soldier: "#8a8f5c", motorcycle: "#6b6b52", rocket: "#7a8060" };
    ctx.fillStyle = FALLBACK_COLOR[e.type] || "#8a8f5c";
    ctx.beginPath();
    ctx.arc(0, 0, 10, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // health bar
  const w = 24;
  const pct = e.hp / e.maxHp;
  ctx.fillStyle = "#400";
  ctx.fillRect(e.x - w / 2, e.y - 20, w, 4);
  ctx.fillStyle = "#e33";
  ctx.fillRect(e.x - w / 2, e.y - 20, w * pct, 4);
}

function drawTower(t) {
  const img = sprites[`tower_${t.type}`];
  const levelSum = t.level.damage + t.level.range + t.level.fireRate;

  // A dark platform under every tower keeps it visible regardless of
  // terrain color -- the turret sprites and the grass/dirt map share
  // similar olive/earth tones, so without this a tower can be hard to
  // spot at a glance (this is why every real TD game gives towers a base
  // pad instead of relying on the terrain to contrast on its own).
  ctx.save();
  ctx.fillStyle = "rgba(20,22,18,0.75)";
  ctx.beginPath();
  ctx.arc(t.x, t.y, 38, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(220,220,200,0.55)";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.translate(t.x, t.y);
  ctx.rotate(t.angle);
  if (levelSum > 0) {
    ctx.save();
    ctx.globalAlpha = Math.min(0.15 + levelSum * 0.06, 0.6);
    ctx.fillStyle = "#ffd700";
    ctx.beginPath();
    ctx.arc(0, 0, 52, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  if (ready(img)) {
    // Draw at the sprite's real aspect ratio instead of squashing every
    // turret into a fixed square -- the laser turret crop alone is ~3.8:1.
    // (Doubled from the original 34px per user feedback that towers read
    // too small against the map.)
    const h = 68;
    const w = h * (img.naturalWidth / img.naturalHeight);
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
    const damagePct = 1 - t.hp / t.maxHp;
    if (damagePct > 0) {
      ctx.globalAlpha = damagePct * 0.6;
      ctx.fillStyle = "#000";
      ctx.fillRect(-w / 2, -h / 2, w, h);
      ctx.globalAlpha = 1;
    }
  } else {
    ctx.fillStyle = t.type === "laser" ? "#8a6a3a" : t.type === "double" ? "#888" : "#6b7a4a";
    ctx.fillRect(-14, -10, 28, 20);
    ctx.fillRect(0, -3, 22, 6);
  }
  ctx.restore();

  if (t.id === selectedTowerId) {
    ctx.save();
    ctx.strokeStyle = "#5af";
    ctx.beginPath();
    ctx.arc(t.x, t.y, t.range, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  const w = 54;
  const pct = t.hp / t.maxHp;
  ctx.fillStyle = "#400";
  ctx.fillRect(t.x - w / 2, t.y - 46, w, 5);
  ctx.fillStyle = "#3c3";
  ctx.fillRect(t.x - w / 2, t.y - 46, w * pct, 5);

  const ammoPct = t.ammo / t.maxAmmo;
  ctx.fillStyle = "#225";
  ctx.fillRect(t.x - w / 2, t.y - 38, w, 4);
  ctx.fillStyle = "#5af";
  ctx.fillRect(t.x - w / 2, t.y - 38, w * ammoPct, 4);
}

function drawExplosion(ex) {
  const img = sprites.explosion;
  const t = ex.age / ex.duration;
  const scale = 0.6 + t * 0.8;
  ctx.save();

  // Bright flash at the moment of impact, gone within the first quarter
  // of the explosion's life -- reads as the initial blast of light before
  // the smoke/fire sprite and debris take over.
  if (t < 0.25) {
    ctx.globalAlpha = 1 - t / 0.25;
    ctx.fillStyle = "#fff6d8";
    ctx.beginPath();
    ctx.arc(ex.x, ex.y, 24 * (1 - t), 0, Math.PI * 2);
    ctx.fill();
  }

  // Expanding, fading shockwave ring.
  ctx.globalAlpha = Math.max(0, 0.55 - t * 0.55);
  ctx.strokeStyle = "#ffcf80";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(ex.x, ex.y, 8 + t * 42, 0, Math.PI * 2);
  ctx.stroke();

  ctx.globalAlpha = 1 - t;
  if (ready(img)) {
    const w = 50 * scale, h = 50 * scale;
    ctx.drawImage(img, ex.x - w / 2, ex.y - h / 2, w, h);
  } else {
    ctx.fillStyle = "#f80";
    ctx.beginPath();
    ctx.arc(ex.x, ex.y, 20 * scale, 0, Math.PI * 2);
    ctx.fill();
  }

  // Debris flying outward from the blast center, fading a bit faster than
  // the main fireball so it doesn't linger past the explosion itself.
  ctx.fillStyle = "#241c14";
  ctx.globalAlpha = Math.max(0, 1 - t * 1.3);
  for (const d of ex.debris) {
    const dist = d.speed * ex.age;
    const dx = ex.x + Math.cos(d.angle) * dist;
    const dy = ex.y + Math.sin(d.angle) * dist;
    ctx.beginPath();
    ctx.arc(dx, dy, d.size, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function drawBeam(b) {
  const t = b.age / b.duration;
  ctx.save();
  ctx.globalAlpha = 1 - t;
  ctx.strokeStyle = "#aef9ff";
  ctx.lineWidth = 3;
  ctx.shadowColor = "#7ff9ff";
  ctx.shadowBlur = 8;
  ctx.beginPath();
  ctx.moveTo(b.x1, b.y1);
  ctx.lineTo(b.x2, b.y2);
  ctx.stroke();
  ctx.restore();
}

function projectileDirection(p) {
  const dx = p.target.x - p.x;
  const dy = p.target.y - p.y;
  const dist = Math.hypot(dx, dy) || 1;
  return { dirX: dx / dist, dirY: dy / dist, angle: Math.atan2(dy, dx) };
}

// Lightweight tracer streak (fading trail + bright tip) for the smaller
// infantry/vehicle weapons (soldier, buggy, motorcycle) -- oriented toward
// the current target, the same direction stepProjectile itself moves along.
function drawTracer(p) {
  const { dirX, dirY } = projectileDirection(p);
  const trailLen = 16;
  const tailX = p.x - dirX * trailLen;
  const tailY = p.y - dirY * trailLen;

  ctx.save();
  const grad = ctx.createLinearGradient(tailX, tailY, p.x, p.y);
  grad.addColorStop(0, "rgba(255,180,60,0)");
  grad.addColorStop(1, "rgba(255,235,170,0.95)");
  ctx.strokeStyle = grad;
  ctx.lineWidth = 2.5;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(tailX, tailY);
  ctx.lineTo(p.x, p.y);
  ctx.stroke();

  ctx.fillStyle = "#fff8d8";
  ctx.beginPath();
  ctx.arc(p.x, p.y, 2.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// Tank-shell sprite for the two cannon towers (basic/double) and the
// tank/rocket enemies -- rotated to face its direction of travel, same as
// every other directional sprite in the game.
function drawShell(p) {
  const img = sprites.projectile;
  if (!ready(img)) {
    drawTracer(p);
    return;
  }
  const { angle } = projectileDirection(p);
  const h = 10;
  const w = h * (img.naturalWidth / img.naturalHeight);
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(angle);
  ctx.drawImage(img, -w / 2, -h / 2, w, h);
  ctx.restore();
}

function drawProjectile(p) {
  if (p.style === "shell") {
    drawShell(p);
  } else {
    drawTracer(p);
  }
}

function drawHud() {
  ctx.save();
  ctx.fillStyle = "#fff";
  ctx.font = "20px sans-serif";
  ctx.fillText(`Oleada ${state.economy.wave}/${WAVES.length}`, 20, 30);
  ctx.fillText(`Vidas: ${state.economy.lives}`, 20, 55);
  ctx.fillText(`$${state.economy.money}`, 20, 80);
  if (state.interWaveTimer > 0 && !state.gameOver && !state.win) {
    ctx.fillText(`Siguiente oleada en ${Math.ceil(state.interWaveTimer)}s`, 20, 105);
  }
  if (networked) {
    ctx.font = "13px sans-serif";
    ctx.fillStyle = "#8f8";
    ctx.fillText("Multijugador conectado", 20, CANVAS_HEIGHT - 12);
  }
  if (state.paused && !state.gameOver && !state.win) {
    ctx.font = "36px sans-serif";
    ctx.fillStyle = "#ffd700";
    ctx.textAlign = "center";
    ctx.fillText("PAUSA", CANVAS_WIDTH / 2, 50);
    ctx.textAlign = "left";
  }
  if (state.gameOver || state.win) {
    ctx.font = "48px sans-serif";
    ctx.fillStyle = "#fff";
    ctx.fillText(state.gameOver ? "GAME OVER" : "¡VICTORIA!", CANVAS_WIDTH / 2 - 150, CANVAS_HEIGHT / 2);
    ctx.font = "20px sans-serif";
    ctx.fillText("Pulsa R para reiniciar", CANVAS_WIDTH / 2 - 90, CANVAS_HEIGHT / 2 + 40);
  }
  ctx.restore();
}

const buildMenuEl = document.getElementById("build-menu");
initBuildMenu(buildMenuEl, {
  onSelect: (type) => {
    if (state.gameOver || state.win) return;
    selectedBuildType = selectedBuildType === type ? null : type;
  },
});

// Upgrade panel callbacks are defined once, here, and read the *current*
// value of the module-level `selectedTowerId` variable at click time via
// normal closure semantics -- they are never re-created per frame, which is
// what makes the panel's buttons clickable in the first place (see
// initUpgradePanel's comment in ui.js).
initUpgradePanel(upgradePanelEl, {
  onUpgrade: (skill) => {
    if (state.gameOver || state.win || selectedTowerId == null) return;
    actions.upgrade(selectedTowerId, skill);
  },
  onRepair: () => {
    if (state.gameOver || state.win || selectedTowerId == null) return;
    actions.repair(selectedTowerId);
  },
  onSell: () => {
    if (state.gameOver || state.win || selectedTowerId == null) return;
    actions.sell(selectedTowerId);
    selectedTowerId = null;
  },
});

const skipWaveBtn = document.getElementById("skip-wave-btn");
skipWaveBtn.addEventListener("click", () => {
  if (state.gameOver || state.win) return;
  actions.skip();
});

const muteBtn = document.getElementById("mute-btn");
muteBtn.addEventListener("click", () => {
  const muted = toggleMuted();
  muteBtn.textContent = muted ? "🔇" : "🔊";
  muteBtn.title = muted ? "Activar sonido" : "Silenciar sonido";
});

const pauseBtn = document.getElementById("pause-btn");
pauseBtn.addEventListener("click", () => {
  if (state.gameOver || state.win) return;
  actions.pause();
});

const resetBtn = document.getElementById("reset-btn");
resetBtn.addEventListener("click", () => {
  actions.reset();
  selectedTowerId = null;
  selectedBuildType = null;
});

function canvasPos(evt) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((evt.clientX - rect.left) / rect.width) * CANVAS_WIDTH,
    y: ((evt.clientY - rect.top) / rect.height) * CANVAS_HEIGHT,
  };
}

canvas.addEventListener("mousemove", (evt) => {
  const pos = canvasPos(evt);
  mouseX = pos.x;
  mouseY = pos.y;
});

canvas.addEventListener("click", (evt) => {
  if (state.gameOver || state.win) return;
  const pos = canvasPos(evt);
  if (selectedBuildType) {
    actions.place(selectedBuildType, pos.x, pos.y);
    selectedBuildType = null;
    return;
  }
  let nearestTower = null;
  let nearestDist = 38;
  for (const t of state.towers) {
    const d = Math.hypot(t.x - pos.x, t.y - pos.y);
    if (d < nearestDist) {
      nearestDist = d;
      nearestTower = t;
    }
  }
  selectedTowerId = nearestTower ? nearestTower.id : null;
});

window.addEventListener("keydown", (evt) => {
  if (evt.key.toLowerCase() !== "r") return;
  if (!state.gameOver && !state.win) return;
  if (networked) {
    // Reloading the page alone would just re-fetch the same (still
    // game-over) state from the server -- the shared board only actually
    // resets when the server itself is told to via this action. Every
    // connected player sees the fresh game on their next poll, not just
    // whoever pressed R.
    postAction({ type: "restart" });
  } else {
    location.reload();
  }
});

// --- Networked (multiplayer) mode ---------------------------------------
// Polls the host's /api/state every POLL_MS and replaces `state` wholesale
// with whatever it returns; every player action goes out via postAction()
// instead of touching `state` directly (see the `actions` object above).
// Both players' browsers run this exact same client code -- there is no
// separate "host" vs "guest" UI, only whichever machine happens to be
// running server.js becomes the authority both browsers poll.
const POLL_MS = 120;
async function pollState() {
  try {
    const res = await fetch("/api/state");
    if (res.ok) state = await res.json();
  } catch {
    // transient network hiccup on a LAN -- just try again next tick
  }
  setTimeout(pollState, POLL_MS);
}

// Detects, once at startup, whether this page is being served by
// server.js (which exposes /api/state) or by a plain static file server
// (python -m http.server, or any other host with no such route) -- solo
// play keeps simulating locally exactly as it always has; only serving
// via server.js turns on networked mode.
async function boot() {
  try {
    const res = await fetch("/api/state");
    if (res.ok) {
      networked = true;
      state = await res.json();
      pollState();
    }
  } catch {
    // no /api/state -- solo play, local simulation (the default)
  }
  requestAnimationFrame(loop);
}

let lastTime = performance.now();

function loop(now) {
  const dt = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;
  frameNow = now / 1000;

  if (!networked) {
    stepSimulation(state, dt);
  }
  playNewShotSounds();
  syncMusicToPause();

  ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  if (ready(mapImage)) {
    drawMap(ctx, mapImage);
  } else {
    ctx.fillStyle = "#3a4a2f";
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  }
  // Per user request: the red route line is no longer drawn for the
  // player. PATH itself is untouched -- vehicles (buggy/tank/motorcycle/
  // rocket) still follow it exactly via simulate.js/enemy.js, this only
  // removes the visual debug overlay.
  for (const t of state.towers) drawTower(t);
  for (const e of state.enemies) drawEnemy(e);
  for (const p of state.projectiles) drawProjectile(p);
  for (const bm of state.beams) drawBeam(bm);
  for (const ex of state.explosions) drawExplosion(ex);
  drawHud();

  if (selectedBuildType) {
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = "#5af";
    ctx.beginPath();
    ctx.arc(mouseX, mouseY, 32, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  updateBuildMenu(buildMenuEl, { towers: state.towers, economy: state.economy, selectedType: selectedBuildType });
  const selectedTower = state.towers.find((t) => t.id === selectedTowerId) || null;
  if (selectedTowerId != null && !selectedTower) selectedTowerId = null; // sold/destroyed
  updateUpgradePanel(upgradePanelEl, selectedTower);
  skipWaveBtn.classList.toggle("hidden", !(state.interWaveTimer > 0 && !state.gameOver && !state.win));
  pauseBtn.textContent = state.paused ? "▶" : "⏸";
  pauseBtn.title = state.paused ? "Reanudar" : "Pausar";
  pauseBtn.classList.toggle("active", state.paused);

  requestAnimationFrame(loop);
}

boot();
