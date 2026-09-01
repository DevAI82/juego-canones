import { CANVAS_WIDTH, CANVAS_HEIGHT, drawMap } from "./map.js";
import { WAVES } from "./waves.js";
import { TOWER_TYPES, BUILD_DURATION } from "./tower.js";
import { initBuildMenu, updateBuildMenu, initUpgradePanel, updateUpgradePanel, renderGameEndScreen, renderRanking } from "./ui.js";
import {
  createGameState,
  startNextLevel,
  stepSimulation,
  canPlaceTower,
  placeTower,
  upgradeTower,
  repairTower,
  sellTower,
  skipWave,
  togglePause,
} from "./simulate.js";
import { MAX_LEVEL, levelData } from "./levels.js";
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
// #build-menu lives outside #game-container (see index.html's comment on
// it) specifically so it can be parked in the black letterbox margin on
// a wide window instead of covering the map, per user request. Since it's
// no longer a scaled descendant of #game-container, its own position/size
// (and, in the fallback case, its own independent scale) have to be
// computed here in JS against the real measured margin -- CSS alone can't
// know how much dead space resizeGame()'s scale left on the sides.
const BUILD_MENU_SIDEBAR_WIDTH = 160;
const BUILD_MENU_SIDEBAR_GAP = 16;

function positionBuildMenu(scale) {
  const buildMenuEl = document.getElementById("build-menu");
  const scaledW = CANVAS_WIDTH * scale;
  const scaledH = CANVAS_HEIGHT * scale;
  const gameLeft = (window.innerWidth - scaledW) / 2;
  const gameTop = (window.innerHeight - scaledH) / 2;
  const marginNeeded = BUILD_MENU_SIDEBAR_WIDTH + BUILD_MENU_SIDEBAR_GAP * 2;

  if (gameLeft >= marginNeeded) {
    // Enough dead space on the sides -- vertical sidebar in the left
    // margin, at a fixed readable size regardless of the game's own scale.
    buildMenuEl.classList.add("sidebar-mode");
    buildMenuEl.style.transform = "none";
    buildMenuEl.style.left = `${Math.round((gameLeft - BUILD_MENU_SIDEBAR_WIDTH) / 2)}px`;
    buildMenuEl.style.top = `${Math.round(gameTop)}px`;
    buildMenuEl.style.width = `${BUILD_MENU_SIDEBAR_WIDTH}px`;
    buildMenuEl.style.height = `${Math.round(scaledH)}px`;
  } else {
    // Not enough margin (narrow window/phone) -- fall back to its
    // original spot overlapping the top of the map, scaled down with it
    // (own CSS transform, since it's no longer a scaled descendant of
    // #game-container to inherit that from).
    buildMenuEl.classList.remove("sidebar-mode");
    buildMenuEl.style.transform = `scale(${scale})`;
    buildMenuEl.style.transformOrigin = "top left";
    buildMenuEl.style.left = `${Math.round(gameLeft)}px`;
    buildMenuEl.style.top = `${Math.round(gameTop + 140 * scale)}px`;
    buildMenuEl.style.width = `${CANVAS_WIDTH}px`;
    buildMenuEl.style.height = "";
  }
}

// Same reasoning as #build-menu above, simpler since these never need a
// sidebar mode -- just pinned near the map's actual top-right corner at
// a fixed, comfortably tappable size (was shrinking to ~20x20px on a
// short phone landscape screen otherwise, per user request to optimize
// that).
function positionTopControls(scale) {
  const topControlsEl = document.getElementById("top-controls");
  const scaledW = CANVAS_WIDTH * scale;
  const scaledH = CANVAS_HEIGHT * scale;
  const gameLeft = (window.innerWidth - scaledW) / 2;
  const gameTop = (window.innerHeight - scaledH) / 2;
  topControlsEl.style.top = `${Math.round(gameTop + 12)}px`;
  topControlsEl.style.right = `${Math.round(window.innerWidth - (gameLeft + scaledW) + 12)}px`;
}

// The on-screen D-pad (see wireNavButton() below), pinned near the map's
// bottom-right corner at a fixed size for the same reason as
// #top-controls above -- per user request ("flechas de navegación para
// desplazarme más cómodo"). NAV_CONTROLS_SIZE must match the 3x3 grid of
// 36px cells + 4px gaps set in style.css (2 * 36 + 2 * 4 for the two gaps
// between three cells... i.e. 3*36 + 2*4).
const NAV_CONTROLS_SIZE = 3 * 36 + 2 * 4;

function positionNavControls(scale) {
  const navControlsEl = document.getElementById("nav-controls");
  const scaledW = CANVAS_WIDTH * scale;
  const scaledH = CANVAS_HEIGHT * scale;
  const gameLeft = (window.innerWidth - scaledW) / 2;
  const gameTop = (window.innerHeight - scaledH) / 2;
  navControlsEl.style.left = `${Math.round(gameLeft + scaledW - NAV_CONTROLS_SIZE - 16)}px`;
  navControlsEl.style.top = `${Math.round(gameTop + scaledH - NAV_CONTROLS_SIZE - 16)}px`;
}

function resizeGame() {
  const scale = Math.min(window.innerWidth / CANVAS_WIDTH, window.innerHeight / CANVAS_HEIGHT);
  gameContainer.style.transform = `scale(${scale})`;
  gameViewport.style.width = `${CANVAS_WIDTH * scale}px`;
  gameViewport.style.height = `${CANVAS_HEIGHT * scale}px`;
  positionBuildMenu(scale);
  positionTopControls(scale);
  positionNavControls(scale);
}
resizeGame();
window.addEventListener("resize", resizeGame);
window.addEventListener("orientationchange", resizeGame);

function loadImage(src) {
  const img = new Image();
  img.src = src;
  return img;
}

// Every level's own background, preloaded up front (a handful of extra
// KB) so switching levels never has to wait on a fresh image load.
const mapImages = {
  1: loadImage(levelData(1).mapImage),
  2: loadImage(levelData(2).mapImage),
  3: loadImage(levelData(3).mapImage),
};
const sprites = {
  tower_basic: loadImage("assets/tower_basic.png"),
  tower_double: loadImage("assets/tower_double.png"),
  tower_laser: loadImage("assets/tower_laser.png"),
  tower_basic_build: loadImage("assets/tower_basic_build.png"),
  enemy_soldier: loadImage("assets/enemy_soldier.png"),
  enemy_buggy: loadImage("assets/enemy_buggy.png"),
  enemy_tank: loadImage("assets/enemy_tank.png"),
  enemy_motorcycle: loadImage("assets/enemy_motorcycle.png"),
  enemy_rocket: loadImage("assets/enemy_rocket.png"),
  explosion: loadImage("assets/explosion.png"),
  projectile: loadImage("assets/projectile.png"),
};

// tower_basic_build.png is a 6x5 grid of 30 frames (see tools/extract_
// assets.py's extract_tower_basic_build) -- these must match its actual
// layout. Only the basic tower has its own build animation; double/laser
// still take BUILD_DURATION to finish (tower.js) but just fade in (see
// drawTower's fallback below) since there's no footage for them.
const BUILD_ANIM_COLS = 6;
const BUILD_ANIM_ROWS = 5;
const BUILD_ANIM_FRAME_COUNT = BUILD_ANIM_COLS * BUILD_ANIM_ROWS;
// The last stretch of the build (in fraction-of-BUILD_DURATION terms)
// crossfades from the animation's final frame into the tower's real
// static sprite, so the switch reads as the effect settling rather than
// a hard pop the instant construction finishes -- the animation's own
// final frames (a fully assembled, but not identical, turret model)
// don't pixel-match tower_basic.png, so a hard cut would be visible.
const BUILD_CROSSFADE_FRACTION = 0.18;

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

// --- Camera (level 3's scrollable world) --------------------------------
// Deliberately NOT part of simulate.js's shared state: in networked co-op
// every connected player polls the same board, but each one should be
// free to scroll around a big map independently -- exactly like
// selectedBuildType/mouseX/mouseY above, this is local-only, per-tab
// state that main.js's own render/input code reads, never sent to or
// read from the server.
const camera = { x: 0, y: 0 };

// How much world-space is visible at once, on top of the pan above -- per
// user request ("zoom con el scroll del ratón"). 1 = the old fixed
// behavior (exactly CANVAS_WIDTH x CANVAS_HEIGHT of world visible).
let zoom = 1;
const MAX_ZOOM = 2.2;

function worldSize(level) {
  const d = levelData(level);
  return { w: d.worldWidth || CANVAS_WIDTH, h: d.worldHeight || CANVAS_HEIGHT };
}

// The zoom level at which the viewport exactly shows the level's full
// world in whichever dimension is more constrained -- zooming out further
// than this would reveal empty space past the world's own edge. For
// levels 1/2 (world == viewport) this is always exactly 1, so those
// levels simply can't zoom out at all, only in.
function minZoomFor(level) {
  const { w, h } = worldSize(level);
  return Math.max(CANVAS_WIDTH / w, CANVAS_HEIGHT / h);
}

function clampZoom(level) {
  zoom = Math.max(minZoomFor(level), Math.min(MAX_ZOOM, zoom));
}

// Levels 1/2's world is exactly the viewport (worldWidth/Height ==
// CANVAS_WIDTH/HEIGHT), so with zoom clamped to 1 there (see minZoomFor)
// the visible span always equals the world size and this always pins the
// camera back to (0,0) -- i.e. every scroll/pan/drag/zoom input below is
// automatically a no-op on a non-scrollable level unless the player
// zooms in, with no separate "is this level scrollable" branch needed
// anywhere else.
function clampCamera(level) {
  const { w, h } = worldSize(level);
  const viewW = CANVAS_WIDTH / zoom;
  const viewH = CANVAS_HEIGHT / zoom;
  camera.x = Math.max(0, Math.min(Math.max(0, w - viewW), camera.x));
  camera.y = Math.max(0, Math.min(Math.max(0, h - viewH), camera.y));
}

// Recenters the camera on a level's "base" (its soldierExit -- the point
// every road ultimately leads to) whenever the current level changes
// (first load, level-select, level transition, or a networked client
// simply polling into a level someone else already switched to -- see
// this being driven from loop() below by watching state.level). Also
// resets zoom to 1, so replaying a level (or joining a fresh one) always
// starts at the same familiar zoomed-out view rather than wherever the
// last game had been left zoomed in to.
function recenterCamera(level) {
  zoom = 1;
  const d = levelData(level);
  const anchor = d.soldierExit || { x: worldSize(level).w / 2, y: worldSize(level).h / 2 };
  camera.x = anchor.x - CANVAS_WIDTH / 2;
  camera.y = anchor.y - CANVAS_HEIGHT / 2;
  clampCamera(level);
}
let lastCameraLevel = null;

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

// Tracks the last "should the music be playing" value we reacted to, so
// it's paused/resumed exactly on the transition (not fought over every
// frame) -- works for both local play and networked co-op, where these
// flags can flip because of a *different* player's action. Covers both
// ways the board can stop moving: an explicit pause, and the game simply
// ending (game over or victory) -- stepSimulation() no-ops on any of the
// three, but never touched audio on its own.
let lastMusicPaused = false;
function syncMusicToPause() {
  const shouldPause = state.paused || state.gameOver || state.win || state.levelComplete;
  if (shouldPause === lastMusicPaused) return;
  lastMusicPaused = shouldPause;
  if (shouldPause) pauseMusic();
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
  nextLevel() {
    if (networked) {
      postAction({ type: "nextLevel" });
      return;
    }
    const fresh = startNextLevel(state);
    if (fresh) state = fresh;
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

// Renders a tower that's still under construction (t.buildTimeRemaining
// > 0): the basic tower plays its build-animation sheet (see the
// BUILD_ANIM_* constants and tools/extract_assets.py's
// extract_tower_basic_build), crossfading into the real static sprite
// over the final BUILD_CROSSFADE_FRACTION of the build; every other type
// has no footage to work with, so it just fades its own real sprite in
// instead of popping in instantly. Either way, a progress bar takes the
// place of the hp/ammo bars until construction finishes -- per user
// request, so deploying a tower visibly takes effort rather than being
// free.
function drawTowerBuilding(t) {
  const progress = 1 - t.buildTimeRemaining / BUILD_DURATION; // 0 -> 1
  const crossfadeStart = 1 - BUILD_CROSSFADE_FRACTION;
  const sheet = sprites.tower_basic_build;

  if (t.type === "basic" && ready(sheet)) {
    const frameIndex = Math.min(BUILD_ANIM_FRAME_COUNT - 1, Math.floor(progress * BUILD_ANIM_FRAME_COUNT));
    const col = frameIndex % BUILD_ANIM_COLS;
    const row = Math.floor(frameIndex / BUILD_ANIM_COLS);
    const fw = sheet.naturalWidth / BUILD_ANIM_COLS;
    const fh = sheet.naturalHeight / BUILD_ANIM_ROWS;
    // Bigger than the resting 68px-tall sprite: the animation's build
    // ring/platform effect reads as spilling out past the turret itself.
    const drawH = 110;
    const drawW = drawH * (fw / fh);
    const animAlpha = progress >= crossfadeStart ? 1 - (progress - crossfadeStart) / BUILD_CROSSFADE_FRACTION : 1;
    ctx.save();
    ctx.globalAlpha = animAlpha;
    ctx.drawImage(sheet, col * fw, row * fh, fw, fh, t.x - drawW / 2, t.y - drawH / 2, drawW, drawH);
    ctx.restore();

    if (progress >= crossfadeStart) {
      const img = sprites[`tower_${t.type}`];
      if (ready(img)) {
        const h = 68;
        const w = h * (img.naturalWidth / img.naturalHeight);
        ctx.save();
        ctx.globalAlpha = (progress - crossfadeStart) / BUILD_CROSSFADE_FRACTION;
        ctx.drawImage(img, t.x - w / 2, t.y - h / 2, w, h);
        ctx.restore();
      }
    }
  } else {
    const img = sprites[`tower_${t.type}`];
    ctx.save();
    ctx.globalAlpha = Math.max(0.15, progress);
    if (ready(img)) {
      const h = 68;
      const w = h * (img.naturalWidth / img.naturalHeight);
      ctx.drawImage(img, t.x - w / 2, t.y - h / 2, w, h);
    } else {
      ctx.fillStyle = t.type === "laser" ? "#8a6a3a" : "#888";
      ctx.fillRect(t.x - 14, t.y - 10, 28, 20);
    }
    ctx.restore();
  }

  const barW = 54;
  ctx.fillStyle = "#223";
  ctx.fillRect(t.x - barW / 2, t.y - 46, barW, 6);
  ctx.fillStyle = "#ffd700";
  ctx.fillRect(t.x - barW / 2, t.y - 46, barW * progress, 6);
}

function drawTower(t) {
  // A dark platform under every tower (building or combat-ready) keeps
  // it visible regardless of terrain color -- the turret sprites and the
  // grass/dirt map share similar olive/earth tones, so without this a
  // tower can be hard to spot at a glance (this is why every real TD
  // game gives towers a base pad instead of relying on the terrain to
  // contrast on its own).
  ctx.save();
  ctx.fillStyle = "rgba(20,22,18,0.75)";
  ctx.beginPath();
  ctx.arc(t.x, t.y, 38, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(220,220,200,0.55)";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();

  if (t.buildTimeRemaining > 0) {
    drawTowerBuilding(t);
  } else {
    const img = sprites[`tower_${t.type}`];
    const levelSum = t.level.damage + t.level.range + t.level.fireRate;
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

  if (t.id === selectedTowerId) {
    ctx.save();
    ctx.strokeStyle = "#5af";
    ctx.beginPath();
    ctx.arc(t.x, t.y, t.range, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
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
  ctx.fillText(`Nivel ${state.level}/${MAX_LEVEL} — Oleada ${state.economy.wave}/${WAVES.length}`, 20, 30);
  ctx.fillText(`Vidas: ${state.economy.lives}`, 20, 55);
  ctx.fillText(`$${state.economy.money}`, 20, 80);
  if (state.interWaveTimer > 0 && !state.gameOver && !state.win && !state.levelComplete) {
    ctx.fillText(`Siguiente oleada en ${Math.ceil(state.interWaveTimer)}s`, 20, 105);
  }
  if (networked) {
    ctx.font = "13px sans-serif";
    ctx.fillStyle = "#8f8";
    ctx.fillText("Multijugador conectado", 20, CANVAS_HEIGHT - 12);
  }
  if (state.paused && !state.gameOver && !state.win && !state.levelComplete) {
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
  } else if (state.levelComplete) {
    ctx.font = "44px sans-serif";
    ctx.fillStyle = "#ffe27a";
    ctx.textAlign = "center";
    ctx.fillText(`¡NIVEL ${state.level} SUPERADO!`, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
    ctx.textAlign = "left";
  }
  ctx.restore();
}

const buildMenuEl = document.getElementById("build-menu");
initBuildMenu(buildMenuEl, {
  onSelect: (type) => {
    if (state.gameOver || state.win || state.levelComplete) return;
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
    if (state.gameOver || state.win || state.levelComplete || selectedTowerId == null) return;
    actions.upgrade(selectedTowerId, skill);
  },
  onRepair: () => {
    if (state.gameOver || state.win || state.levelComplete || selectedTowerId == null) return;
    actions.repair(selectedTowerId);
  },
  onSell: () => {
    if (state.gameOver || state.win || state.levelComplete || selectedTowerId == null) return;
    actions.sell(selectedTowerId);
    selectedTowerId = null;
  },
});

const skipWaveBtn = document.getElementById("skip-wave-btn");
skipWaveBtn.addEventListener("click", () => {
  if (state.gameOver || state.win || state.levelComplete) return;
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
  if (state.gameOver || state.win || state.levelComplete) return;
  actions.pause();
});

// --- Level-select start screen -------------------------------------------
// Shown before any campaign begins -- first load, and again any time the
// player starts a fresh one (the reset button, R after a true match end,
// or the game-end screen's "Jugar de nuevo") -- so they pick which map to
// start on, per user request. `started` gates stepSimulation in LOCAL
// mode only: a fresh createGameState() is NOT gameOver/win/levelComplete,
// so without this the level-1 campaign would silently start ticking
// (enemies spawning) underneath the menu the moment the page loads,
// before the player has chosen anything. Networked mode never needs this
// gate -- the server ticks on its own regardless, and a client that
// joins an already-running co-op match should see it immediately, not a
// menu forced on top of what everyone else is already playing.
let started = false;
const startMenuOverlay = document.getElementById("start-menu");
function showStartMenu() {
  startMenuOverlay.classList.remove("hidden");
}
function hideStartMenu() {
  startMenuOverlay.classList.add("hidden");
}
function chooseLevel(level) {
  hideStartMenu();
  selectedTowerId = null;
  selectedBuildType = null;
  // Forces loop()'s "state.level changed" check to re-fire even when
  // picking the SAME level number again (e.g. replaying level 3 after a
  // loss) -- otherwise the camera would just stay wherever it had been
  // scrolled to last time instead of recentering on the fresh game.
  lastCameraLevel = null;
  if (networked) {
    postAction({ type: "restart", level });
  } else {
    state = createGameState(level);
  }
  started = true;
}
for (const btn of document.querySelectorAll(".start-level-btn")) {
  btn.addEventListener("click", () => chooseLevel(Number(btn.dataset.level)));
}

// Used by every "start a new campaign" entry point below (not a plain
// mid-match restart, which doesn't exist as a separate concept here --
// resetting always means starting over) to bring back the level picker
// instead of silently defaulting to level 1.
function restartToLevelSelect() {
  selectedTowerId = null;
  selectedBuildType = null;
  gameEndOverlay.classList.add("hidden");
  gameEndShown = false;
  started = false;
  showStartMenu();
}

const resetBtn = document.getElementById("reset-btn");
resetBtn.addEventListener("click", restartToLevelSelect);

// --- End-of-game stats/score screen -------------------------------------
// Shown once per match, the tick state.gameOver/state.win first becomes
// true (see checkGameEnd() below, called from loop()). Not just a local
// concern: in networked co-op every connected player sees this on their
// own screen the moment their poll picks up the ended state, and can save
// a score to the SAME shared ranking (server.js persists it to disk) --
// solo play (including the no-backend Vercel deploy) falls back to a
// leaderboard kept in this browser's localStorage instead.
const LOCAL_LEADERBOARD_KEY = "td_leaderboard";
const LOCAL_NAME_KEY = "td_last_name";
const LOCAL_LEADERBOARD_MAX = 20;

const gameEndOverlay = document.getElementById("gameend-overlay");
const gameEndNameInput = document.getElementById("gameend-name-input");
const gameEndSaveBtn = document.getElementById("gameend-save-btn");
const gameEndSaveStatus = document.getElementById("gameend-save-status");
const gameEndCloseBtn = document.getElementById("gameend-close-btn");

async function fetchLeaderboard() {
  if (!networked) {
    try {
      return JSON.parse(localStorage.getItem(LOCAL_LEADERBOARD_KEY) || "[]");
    } catch {
      return [];
    }
  }
  try {
    const res = await fetch("/api/leaderboard");
    return res.ok ? await res.json() : [];
  } catch {
    return [];
  }
}

async function submitScore(name, score) {
  if (!networked) {
    let entries = [];
    try {
      entries = JSON.parse(localStorage.getItem(LOCAL_LEADERBOARD_KEY) || "[]");
    } catch {
      entries = [];
    }
    entries.push({ name, score, date: new Date().toISOString() });
    entries.sort((a, b) => b.score - a.score);
    entries = entries.slice(0, LOCAL_LEADERBOARD_MAX);
    try {
      localStorage.setItem(LOCAL_LEADERBOARD_KEY, JSON.stringify(entries));
    } catch {
      // Storage can be unavailable (private browsing, quota) -- the score
      // still displayed for this match, it just won't persist.
    }
    return entries;
  }
  try {
    const res = await fetch("/api/leaderboard", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, score }),
    });
    const result = await res.json();
    return result.entries || [];
  } catch {
    return [];
  }
}

let currentMatchScore = 0;
let gameEndShown = false;

async function showGameEndScreen() {
  currentMatchScore = renderGameEndScreen(gameEndOverlay, state);
  const interim = state.levelComplete;
  gameEndCloseBtn.textContent = interim ? `Continuar al Nivel ${state.level + 1} ▶` : "Jugar de nuevo";
  gameEndOverlay.classList.remove("hidden");
  if (interim) return; // no save/ranking UI to prep -- ui.js already hid that section

  gameEndSaveStatus.textContent = "";
  gameEndSaveBtn.disabled = false;
  gameEndNameInput.disabled = false;
  try {
    gameEndNameInput.value = localStorage.getItem(LOCAL_NAME_KEY) || "";
  } catch {
    gameEndNameInput.value = "";
  }
  renderRanking(gameEndOverlay, await fetchLeaderboard());
}

gameEndSaveBtn.addEventListener("click", async () => {
  const name = (gameEndNameInput.value || "").trim().toUpperCase().slice(0, 16) || "JUGADOR";
  gameEndSaveBtn.disabled = true;
  gameEndNameInput.disabled = true;
  gameEndSaveStatus.textContent = "Guardando...";
  try {
    localStorage.setItem(LOCAL_NAME_KEY, name);
  } catch {
    // Non-fatal -- just means the name field won't be pre-filled next time.
  }
  const entries = await submitScore(name, currentMatchScore);
  const myIndex = entries.findIndex((e) => e.name === name && e.score === currentMatchScore);
  renderRanking(gameEndOverlay, entries, myIndex);
  gameEndSaveStatus.textContent = "¡Puntuación guardada!";
});

gameEndCloseBtn.addEventListener("click", () => {
  if (state.levelComplete) {
    gameEndOverlay.classList.add("hidden");
    gameEndShown = false;
    actions.nextLevel();
    selectedTowerId = null;
    selectedBuildType = null;
  } else {
    // A true match end (loss, or beating the final level) -- start a new
    // campaign via the level picker rather than defaulting to level 1.
    restartToLevelSelect();
  }
});

// Watches state.gameOver/state.win/state.levelComplete the same "react
// only on the transition" way syncMusicToPause() above watches
// state.paused -- fires the screen exactly once per match end (or level
// clear), and auto-hides it if the match resets out from under it (a
// networked co-op teammate hit R -- or picked a new level -- while it
// was open).
function checkGameEnd() {
  const ended = state.gameOver || state.win || state.levelComplete;
  if (ended && !gameEndShown) {
    gameEndShown = true;
    showGameEndScreen();
  } else if (!ended && gameEndShown) {
    gameEndShown = false;
    gameEndOverlay.classList.add("hidden");
  }
}

// Screen pixel -> WORLD coordinate (adds the camera offset and divides
// out the zoom) -- every gameplay position (towers, enemies, build
// slots) lives in world space, same as before the camera/zoom existed
// for levels 1/2 where camera is always (0,0) and zoom is always 1, so
// this is identical to the old canvas-space conversion there.
function worldPos(evt) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((evt.clientX - rect.left) / rect.width) * CANVAS_WIDTH / zoom + camera.x,
    y: ((evt.clientY - rect.top) / rect.height) * CANVAS_HEIGHT / zoom + camera.y,
  };
}

function handleClick(pos) {
  if (state.gameOver || state.win || state.levelComplete) return;
  if (selectedBuildType) {
    // Checked locally first (same check the ghost preview already used
    // to color itself red/green) so an invalid click gets an immediate
    // sound/feedback without waiting on a server round trip in networked
    // mode -- and per user request, a rejected click does NOT clear the
    // selection, so they can just click again at a better spot.
    const check = canPlaceTower(state, selectedBuildType, pos.x, pos.y);
    if (!check.ok) {
      playSound("error");
      return;
    }
    actions.place(selectedBuildType, check.x, check.y);
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
}

// Pointer-based (not separate mouse/touch handlers) so this works
// identically with a mouse drag and a touch drag. A press-and-drag pans
// the camera (per user request, "que se pueda hacer scroll arriba y
// abajo e izquierda a derecha" for level 3's big map); a press that
// never moves past DRAG_THRESHOLD is a plain click/tap and runs
// handleClick() exactly as the old click listener did. On levels 1/2
// clampCamera() pins the camera to (0,0) regardless, so a drag there
// simply has no visual effect -- it doesn't need its own "is this level
// scrollable" check, and a real drag gesture correctly not placing a
// tower is the right behavior there too.
const DRAG_THRESHOLD = 6; // screen px before a press counts as a drag, not a click
let dragState = null; // { startClientX, startClientY, startCamX, startCamY, moved }

canvas.addEventListener("pointerdown", (evt) => {
  dragState = { startClientX: evt.clientX, startClientY: evt.clientY, startCamX: camera.x, startCamY: camera.y, moved: false };
});

canvas.addEventListener("pointermove", (evt) => {
  const pos = worldPos(evt);
  mouseX = pos.x;
  mouseY = pos.y;
  if (!dragState) return;
  const dxScreen = evt.clientX - dragState.startClientX;
  const dyScreen = evt.clientY - dragState.startClientY;
  if (!dragState.moved && Math.hypot(dxScreen, dyScreen) < DRAG_THRESHOLD) return;
  dragState.moved = true;
  const rect = canvas.getBoundingClientRect();
  const scale = CANVAS_WIDTH / rect.width / zoom; // screen px -> world px, same units mouseX/Y use
  camera.x = dragState.startCamX - dxScreen * scale;
  camera.y = dragState.startCamY - dyScreen * scale;
  clampCamera(state.level);
});

window.addEventListener("pointerup", (evt) => {
  if (!dragState) return;
  if (!dragState.moved) handleClick(worldPos(evt));
  dragState = null;
});

// Mouse-wheel zoom, per user request ("hacer zoom con el scroll del
// ratón") -- zooms toward whatever world point is currently under the
// cursor (same feel as Google Maps) rather than always zooming toward
// the center, by capturing that world point with the OLD zoom, changing
// zoom, then re-deriving the camera so that same world point still lands
// under the cursor at the NEW zoom.
canvas.addEventListener(
  "wheel",
  (evt) => {
    evt.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const cx = ((evt.clientX - rect.left) / rect.width) * CANVAS_WIDTH;
    const cy = ((evt.clientY - rect.top) / rect.height) * CANVAS_HEIGHT;
    const worldX = camera.x + cx / zoom;
    const worldY = camera.y + cy / zoom;
    const ZOOM_STEP = 1.15;
    zoom *= evt.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
    clampZoom(state.level);
    camera.x = worldX - cx / zoom;
    camera.y = worldY - cy / zoom;
    clampCamera(state.level);
  },
  { passive: false },
);

// Arrow keys / WASD pan the camera -- the keyboard equivalent of the
// drag-to-pan above, per the same user request. Held keys are tracked
// here and applied every frame in loop() (scaled by dt) rather than
// stepping the camera once per keydown, so panning is smooth and speed
// doesn't depend on OS key-repeat timing.
const PAN_KEYS = new Set(["arrowup", "arrowdown", "arrowleft", "arrowright", "w", "a", "s", "d"]);
const pressedPanKeys = new Set();
const PAN_SPEED = 600; // world px/sec

window.addEventListener("keydown", (evt) => {
  const key = evt.key.toLowerCase();
  if (key === "r") {
    if (!state.gameOver && !state.win) return;
    // Same as the reset button and the game-end screen's "Jugar de
    // nuevo" -- back to the level picker rather than silently defaulting
    // to level 1 (or, in networked mode, re-fetching the same still-ended
    // shared state instead of actually resetting it).
    restartToLevelSelect();
    return;
  }
  if (PAN_KEYS.has(key)) pressedPanKeys.add(key);
});
window.addEventListener("keyup", (evt) => {
  pressedPanKeys.delete(evt.key.toLowerCase());
});

function updateCameraFromKeys(dt) {
  if (pressedPanKeys.size === 0) return;
  // Don't steal arrow-key input while the player is typing their name
  // into the end-of-game score screen.
  if (document.activeElement === gameEndNameInput) return;
  let dx = 0;
  let dy = 0;
  if (pressedPanKeys.has("arrowleft") || pressedPanKeys.has("a")) dx -= 1;
  if (pressedPanKeys.has("arrowright") || pressedPanKeys.has("d")) dx += 1;
  if (pressedPanKeys.has("arrowup") || pressedPanKeys.has("w")) dy -= 1;
  if (pressedPanKeys.has("arrowdown") || pressedPanKeys.has("s")) dy += 1;
  if (!dx && !dy) return;
  const len = Math.hypot(dx, dy);
  // Divided by zoom so the pan reads at a constant ON-SCREEN speed --
  // without this, the same world-px/sec speed would visibly speed up
  // once zoomed in (the same world distance covers more screen pixels).
  const speed = PAN_SPEED / zoom;
  camera.x += (dx / len) * speed * dt;
  camera.y += (dy / len) * speed * dt;
  clampCamera(state.level);
}

// On-screen D-pad (arrow buttons), per user request ("que haya flechas
// de navegación para desplazarme más cómodo") -- an alternative to
// drag-to-pan/keyboard for anyone who'd rather click/tap a button,
// especially useful once zoomed in on a small screen where a drag
// gesture is easy to mistake for a tap. Reuses PAN_KEYS'/
// pressedPanKeys' own mechanism instead of a separate camera-nudging
// path: holding a button just adds/removes the same synthetic
// "arrowup"/etc. entries a real held key would, so updateCameraFromKeys()
// above drives both identically.
function wireNavButton(id, key) {
  const btn = document.getElementById(id);
  const press = (evt) => {
    evt.preventDefault();
    pressedPanKeys.add(key);
  };
  const release = () => pressedPanKeys.delete(key);
  btn.addEventListener("pointerdown", press);
  btn.addEventListener("pointerup", release);
  btn.addEventListener("pointerleave", release);
  btn.addEventListener("pointercancel", release);
}
wireNavButton("nav-up", "arrowup");
wireNavButton("nav-down", "arrowdown");
wireNavButton("nav-left", "arrowleft");
wireNavButton("nav-right", "arrowright");

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
  if (networked) {
    // Joining an already-running (or already-ended) shared match --
    // show it immediately rather than forcing a level picker on top of
    // whatever the other players are already looking at.
    started = true;
  } else {
    showStartMenu();
  }
  requestAnimationFrame(loop);
}

let lastTime = performance.now();

function loop(now) {
  const dt = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;
  frameNow = now / 1000;

  if (!networked && started) {
    stepSimulation(state, dt);
  }
  playNewShotSounds();
  syncMusicToPause();
  checkGameEnd();

  if (state.level !== lastCameraLevel) {
    lastCameraLevel = state.level;
    recenterCamera(state.level);
  }
  updateCameraFromKeys(dt);

  ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  // Everything below, up to ctx.restore(), draws in WORLD space -- the
  // scale+translate is what turns the fixed 1200x750 canvas into a
  // scrolled, zoomed window over a level's (possibly much bigger) world.
  // On levels 1/2 camera is always (0,0) and zoom is always 1, so this is
  // a no-op transform, identical to drawing directly at canvas
  // coordinates like before the camera/zoom existed.
  ctx.save();
  ctx.scale(zoom, zoom);
  ctx.translate(-camera.x, -camera.y);

  const { w: worldW, h: worldH } = worldSize(state.level);
  const currentMapImage = mapImages[state.level] || mapImages[1];
  if (ready(currentMapImage)) {
    drawMap(ctx, currentMapImage, worldW, worldH);
  } else {
    ctx.fillStyle = "#3a4a2f";
    ctx.fillRect(0, 0, worldW, worldH);
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

  if (selectedBuildType) {
    // A slot-based level (levels.js's buildSlots) only allows building at
    // fixed points -- show every unoccupied one faintly while placing so
    // it's clear where those are at a glance, not just wherever the mouse
    // happens to be hovering.
    const slots = levelData(state.level).buildSlots;
    if (slots) {
      ctx.save();
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = "#5fd8e6";
      for (const slot of slots) {
        const occupied = state.towers.some((t) => t.hp > 0 && Math.hypot(t.x - slot.x, t.y - slot.y) < 20);
        if (occupied) continue;
        ctx.beginPath();
        ctx.arc(slot.x, slot.y, 18, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    // Per user request: green where a click would actually place the
    // tower (snapped to the nearest build slot on a level that has
    // them), red anywhere it would be rejected -- live, as the mouse
    // moves, using the exact same check the click handler uses so the
    // preview is never lying about what a click will do.
    const check = canPlaceTower(state, selectedBuildType, mouseX, mouseY);
    const ghostX = check.ok ? check.x : mouseX;
    const ghostY = check.ok ? check.y : mouseY;
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = check.ok ? "#5f5" : "#f55";
    ctx.beginPath();
    ctx.arc(ghostX, ghostY, 32, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();

  drawHud();
  updateBuildMenu(buildMenuEl, { towers: state.towers, economy: state.economy, selectedType: selectedBuildType });
  const selectedTower = state.towers.find((t) => t.id === selectedTowerId) || null;
  if (selectedTowerId != null && !selectedTower) selectedTowerId = null; // sold/destroyed
  updateUpgradePanel(upgradePanelEl, selectedTower);
  skipWaveBtn.classList.toggle("hidden", !(state.interWaveTimer > 0 && !state.gameOver && !state.win && !state.levelComplete));
  pauseBtn.textContent = state.paused ? "▶" : "⏸";
  pauseBtn.title = state.paused ? "Reanudar" : "Pausar";
  pauseBtn.classList.toggle("active", state.paused);

  requestAnimationFrame(loop);
}

boot();
