import { CANVAS_WIDTH, CANVAS_HEIGHT, drawMap } from "./map.js";
import { WAVES } from "./waves.js";
import { TOWER_TYPES, BUILD_DURATION, MUZZLE_OFFSET } from "./tower.js";
import { topValue, UPGRADE_DEFS } from "./upgrades.js";
import { WALL } from "./walls.js";
import {
  initBuildMenu,
  updateBuildMenu,
  initUpgradePanel,
  updateUpgradePanel,
  renderGameEndScreen,
  renderAttackEndScreen,
  renderRanking,
  renderStatsModal,
} from "./ui.js";
import {
  createGameState,
  startNextLevel,
  canPlaceTower,
  placeTower,
  upgradeTower,
  repairStructure,
  sellStructure,
  placeWall,
  canPlaceWall,
  skipWave,
  togglePause,
} from "./simulate.js";
import { MAX_LEVEL, levelData } from "./levels.js";
import { pickTowerTarget } from "./ai.js";
import { lerpAngle, isTypingTarget } from "./util.js";
import { createEffects, clearEffects, stepEffects, hitFlash, drawGroundEffects, drawAirEffects } from "./effects.js";
import { minimapRect, minimapToWorld, drawMinimap } from "./minimap.js";
import { playSound, toggleMuted, startMusic, pauseMusic, resumeMusic, setMusicOn, setEffectsOn } from "./audio.js";
import { clampCameraPosition, zoomAt, pinchZoom } from "./camera.js";
import { createAutoArmy } from "./autoArmy.js";
import { resolveControls, browserControlsEnv } from "./inputMode.js";
import { createSaveScheduler } from "./autosave.js";
import { readSave, writeSave, listSaves, canStore } from "./saves.js";
import { loadSettings, saveSettings } from "./settings.js";
import { createMenu } from "./menu.js";
import { stepGame, canSaveGame, restoreGameSave } from "./modes.js";
import { createAttackState, startAttack, buyUnits, upgradeUnitType, UNIT_ORDER } from "./attack.js";
import { attackMapOf } from "./roadGraph.js";
import { isVisible } from "./fog.js";
import { createAttackControls } from "./attackControls.js";
import {
  createFogLayer,
  drawSelectionRing,
  drawGroupNumber,
  drawEntryFlags,
  drawBaseMarker,
  drawOrderMarkers,
  drawRange,
  drawSelectionBox,
} from "./attackDraw.js";
import { initShop, updateShop, initUnitUpgrades, updateUnitUpgrades, attackHudLines, attackSummary } from "./attackUI.js";
import { BUILDING_TYPES, BUILDING_ORDER, PHASE_COUNT, SHEET_COLS, buildingProgress, constructionFrame } from "./buildings.js";
import { RTS_UNIT_TYPES, RTS_UNIT_ORDER } from "./rtsUnits.js";

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
  positionSidePanel(document.getElementById("build-menu"), scale);
  positionShop(scale);
}

// The attack mode's shop (#attack-shop): in the left margin like the build
// menu when the window leaves room for it, otherwise a narrow column down
// the map's right-hand edge -- not a band across the map like the build
// menu's, which would hide the units coming in at the map's northern
// entries.
const SHOP_COLUMN_WIDTH = 112;

function positionShop(scale) {
  const shopEl = document.getElementById("attack-shop");
  const scaledW = CANVAS_WIDTH * scale;
  const scaledH = CANVAS_HEIGHT * scale;
  const gameLeft = (window.innerWidth - scaledW) / 2;
  const gameTop = (window.innerHeight - scaledH) / 2;
  if (gameLeft >= BUILD_MENU_SIDEBAR_WIDTH + BUILD_MENU_SIDEBAR_GAP * 2) {
    shopEl.classList.remove("column-mode");
    positionSidePanel(shopEl, scale);
    return;
  }
  shopEl.classList.remove("sidebar-mode");
  shopEl.classList.add("column-mode");
  shopEl.style.transform = `scale(${scale})`;
  shopEl.style.transformOrigin = "top left";
  shopEl.style.left = `${Math.round(gameLeft + scaledW - (SHOP_COLUMN_WIDTH + 12) * scale)}px`;
  shopEl.style.top = `${Math.round(gameTop + 64 * scale)}px`;
  shopEl.style.width = `${SHOP_COLUMN_WIDTH}px`;
  shopEl.style.height = "";
}

function positionSidePanel(buildMenuEl, scale) {
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
const mapImages = {};
// ...and the foreground some levels draw over the enemies (levels.js's
// foreground: level 4's skyscrapers that stand in front of roads).
const foregroundImages = {};
for (let level = 1; level <= MAX_LEVEL; level++) {
  const d = levelData(level);
  mapImages[level] = loadImage(d.mapImage);
  if (d.foreground) foregroundImages[level] = loadImage(d.foreground.image);
}
const sprites = {
  tower_basic: loadImage("assets/tower_basic.png"),
  tower_double: loadImage("assets/tower_double.png"),
  tower_laser: loadImage("assets/tower_laser.png"),
  tower_basic_build: loadImage("assets/tower_basic_build.png"),
  tower_double_build: loadImage("assets/tower_double_build.png"),
  tower_laser_build: loadImage("assets/tower_laser_build.png"),
  enemy_soldier: loadImage("assets/enemy_soldier.png"),
  enemy_buggy: loadImage("assets/enemy_buggy.png"),
  enemy_tank: loadImage("assets/enemy_tank.png"),
  enemy_motorcycle: loadImage("assets/enemy_motorcycle.png"),
  enemy_rocket: loadImage("assets/enemy_rocket.png"),
  explosion: loadImage("assets/explosion.png"),
  projectile: loadImage("assets/projectile.png"),
};
// The support buildings (buildings.js): each finished, and its four
// construction phases in one sheet.
for (const key of BUILDING_ORDER) {
  sprites[`building_${key}`] = loadImage(BUILDING_TYPES[key].sprite);
  sprites[`building_${key}_build`] = loadImage(BUILDING_TYPES[key].sheet);
}
// The RTS mode's vehicles (rtsUnits.js): seen from above, like the units.
for (const key of RTS_UNIT_ORDER) sprites[`unit_${key}`] = loadImage(RTS_UNIT_TYPES[key].sprite);
// A unit's picture: the defence's and the attack's units' (enemy_*), or an
// RTS vehicle's (unit_*).
const unitSprite = (type) => sprites[`enemy_${type}`] || sprites[`unit_${type}`];

// Build-animation sheets: 8x6 grids of 48 frames each, keyed from the 720p
// 4-second build videos (tools/extract_all_turrets.py -- COLS/ROWS there
// must match these). Their baked-in progress bars are cut out at
// extraction; drawTowerBuilding draws one progress bar for every type.
const BUILD_ANIM_COLS = 8;
const BUILD_ANIM_ROWS = 6;
const BUILD_ANIM_FRAME_COUNT = BUILD_ANIM_COLS * BUILD_ANIM_ROWS;
// On-screen size of a build-animation frame: sized so the holographic build
// grid spans about the tower pedestal's width (drawTowerBase, 80px).
const BUILD_ANIM_DRAW_SIZE = 96;
// The final stretch of the build crossfades from the animation's last frame
// (a 3/4-view render) into the tower's top-down resting sprite, so the
// switch reads as the effect settling rather than a hard pop.
const BUILD_CROSSFADE_FRACTION = 0.15;
// Resting tower sprites are drawn at this size (square PNGs).
const TOWER_DRAW_SIZE = 76;

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
// An attack (attack.js, docs/2026-10-09-modo-atacante-design.md) rather
// than a defence game: every piece of the screen below has an attack
// version, picked by this.
const attacking = () => state.mode === "attack";

let selectedBuildType = null;
// The selected tower or wall block is tracked by id, not object reference: in networked
// mode `state` (and every tower object in it) is replaced wholesale on
// every poll, so a direct reference would go stale within ~150ms.
let selectedId = null;
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

// The minimum zoom level at which the entire map world is 100% visible
// on screen at once (whichever dimension is more constrained).
// For Level 3 (2048x2048 world), minZoom is ~0.366, allowing full-map
// overview with no scrolling needed. For Levels 1/2, minZoom is 1.0.
function minZoomFor(level) {
  const { w, h } = worldSize(level);
  const pad = cameraPadding(); // (in an attack: the room the shop and HUD leave free)
  return Math.min((CANVAS_WIDTH - pad.right) / w, (CANVAS_HEIGHT - pad.top) / h);
}

function clampZoom(level) {
  zoom = Math.max(minZoomFor(level), Math.min(MAX_ZOOM, zoom));
}

// In an attack the map can be pushed out (canvas px) from under the shop's
// column on the right, from under the HUD and «¡Al ataque!» on top, and
// from under the unit upgrade panel at the bottom -- which comes up with
// every selection, just when orders are given (level 2's base lay under
// it) -- so nothing at the map's edges, an entry or a base, has to stay
// hidden.
const UNIT_PANEL_ROOM = 245; // #unit-upgrade-panel: 225 px tall, 20 px off the bottom (style.css)
function cameraPadding() {
  if (!attacking()) return { right: 0, top: 0, bottom: 0 };
  const shopInColumn = document.getElementById("attack-shop").classList.contains("column-mode");
  return shopInColumn ? { right: SHOP_COLUMN_WIDTH + 24, top: 128, bottom: UNIT_PANEL_ROOM } : { right: 0, top: 0, bottom: UNIT_PANEL_ROOM };
}

function clampCamera(level) {
  const { w, h } = worldSize(level);
  Object.assign(camera, clampCameraPosition(camera, { w, h }, { width: CANVAS_WIDTH, height: CANVAS_HEIGHT }, zoom, cameraPadding()));
}

// Recenters the camera when switching levels or restarting.
// Automatically starts at full map overview (minZoomFor) so the player
// has a complete tactical view of the battlefield right away.
function recenterCamera(level) {
  const { w, h } = worldSize(level);
  zoom = minZoomFor(level);
  clampZoom(level);
  const d = levelData(level);
  // An attack opens on where the army comes in; a defence game on its base.
  const anchor = attacking() ? attackMapOf(d).entries[state.attack.entry] : d.soldierExit || { x: w / 2, y: h / 2 };
  camera.x = anchor.x - (CANVAS_WIDTH / zoom) / 2;
  camera.y = anchor.y - (CANVAS_HEIGHT / zoom) / 2;
  clampCamera(level);
}
let lastCameraLevel = null;

function centerCameraOn(p) {
  camera.x = p.x - CANVAS_WIDTH / zoom / 2;
  camera.y = p.y - CANVAS_HEIGHT / zoom / 2;
  clampCamera(state.level);
}

// Only a level bigger than the screen (level 3) gets a minimap.
function currentMinimap() {
  const { w, h } = worldSize(state.level);
  if (w <= CANVAS_WIDTH && h <= CANVAS_HEIGHT) return null;
  return minimapRect(w, h, CANVAS_HEIGHT);
}

// Running clock (seconds) used only for cosmetic animation phase (the
// enemy walking bob) -- deliberately not gameplay state.
let frameNow = 0;

// Particles and ground marks (effects.js) -- local to this tab, like the
// camera: worked out from what this tab sees change, never shared.
const fx = createEffects();

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
  // id: a tower's or a wall block's.
  repair(id) {
    if (networked) {
      postAction({ type: "repair", id });
      return;
    }
    repairStructure(state, id);
  },
  sell(id) {
    if (networked) {
      postAction({ type: "sell", id });
      return;
    }
    sellStructure(state, id);
  },
  placeWall(x, y) {
    if (networked) {
      postAction({ type: "placeWall", x, y });
      return;
    }
    placeWall(state, x, y);
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

const ENEMY_DRAW_SIZES = {
  tank: { h: 36, shadowRx: 28, shadowRy: 16 },
  rocket: { h: 34, shadowRx: 26, shadowRy: 15 },
  buggy: { h: 30, shadowRx: 22, shadowRy: 13 },
  motorcycle: { h: 26, shadowRx: 18, shadowRy: 10 },
  soldier: { h: 24, shadowRx: 11, shadowRy: 11 },
  // The RTS mode's vehicles: drawn as wide as their footprint (rtsUnits.js).
  harvester: { h: RTS_UNIT_TYPES.harvester.footprint[1], shadowRx: 50, shadowRy: 24 },
};

function drawEnemy(e) {
  const img = unitSprite(e.type);
  const sizeDef = ENEMY_DRAW_SIZES[e.type] || { h: 28, shadowRx: 20, shadowRy: 12 };
  const h = sizeDef.h;
  const w = ready(img) ? h * (img.naturalWidth / img.naturalHeight) : h * 1.5;

  ctx.save();
  // A small side-to-side bob while moving, out of phase per-enemy
  // (bobPhase) so a wave doesn't all bounce in unison -- makes movement
  // read as walking/driving instead of a sprite gliding in place. Scaled
  // by how fast it's going, so a unit that's stopped (a rocket truck
  // shelling a tower) sits still.
  const moving = e.v == null || !e.speed ? 1 : Math.min(1, e.v / e.speed);
  const bob = Math.sin(frameNow * BOB_SPEED + e.bobPhase) * 1.4 * moving;
  ctx.translate(e.x, e.y + bob);

  // Subtle directional ground shadow under vehicles and soldiers
  ctx.save();
  ctx.rotate(e.angle);
  ctx.fillStyle = "rgba(0, 0, 0, 0.28)";
  ctx.beginPath();
  ctx.ellipse(2, 4, sizeDef.shadowRx, sizeDef.shadowRy, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.rotate(e.angle);
  if (ready(img)) {
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
    // Just hit: flare up for a moment (effects.js) -- the sprite added over
    // itself, so it brightens but keeps its detail (a flat white overlay
    // turned these near-rectangular vehicles into a grey box).
    const flash = hitFlash(fx, e.id);
    if (flash > 0) {
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = 0.65 * flash;
      ctx.drawImage(img, -w / 2, -h / 2, w, h);
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
    }
  } else {
    const FALLBACK_COLOR = { tank: "#635843", buggy: "#786d52", soldier: "#5f6848", motorcycle: "#555246", rocket: "#66614f" };
    ctx.fillStyle = FALLBACK_COLOR[e.type] || "#5f6848";
    ctx.beginPath();
    ctx.arc(0, 0, h / 2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // Health bar, in the enemy side's red (the towers' are green), as in the
  // RTS screenshots the user gave as reference. Placed just above the
  // sprite however it's turned, so a long vehicle heading up or down the
  // screen doesn't end up with its bar drawn across its own hull.
  const barW = Math.max(22, Math.min(38, w * 0.75));
  const barH = 4;
  const halfTall = Math.abs(Math.sin(e.angle)) * (w / 2) + Math.abs(Math.cos(e.angle)) * (h / 2);
  const barY = e.y - halfTall - 8;
  const pct = Math.max(0, Math.min(1, e.hp / e.maxHp));
  ctx.save();
  ctx.fillStyle = "rgba(0, 0, 0, 0.75)";
  ctx.fillRect(e.x - barW / 2 - 1, barY - 1, barW + 2, barH + 2);
  // In an attack these are the player's own units: green bars.
  ctx.fillStyle = attacking() ? "#0d3a12" : "#3a0d0d";
  ctx.fillRect(e.x - barW / 2, barY, barW, barH);
  ctx.fillStyle = attacking() ? "#47d35a" : "#e5392f";
  ctx.fillRect(e.x - barW / 2, barY, barW * pct, barH);
  ctx.restore();
}

// What effects.js draws a destroyed vehicle's wreck from: its sprite at the
// same size drawEnemy draws it, or null until the image has loaded.
function wreckSprite(type) {
  const img = unitSprite(type);
  if (!ready(img)) return null;
  const h = (ENEMY_DRAW_SIZES[type] || { h: 28 }).h;
  return { img, w: h * (img.naturalWidth / img.naturalHeight), h };
}

// A rocket truck stopped to shell a tower from out of its reach (ai.js's
// holdsForSiege) paints its target with a pulsing red targeting line and
// reticle -- so the player can see what's hitting them from out of range,
// and which tower is in danger. Same target choice the simulation's own
// fire uses (pickTowerTarget), recomputed here from the drawn state.
function drawSiegeDesignator(e) {
  const target = pickTowerTarget(e, state.towers);
  if (!target) return;
  const alpha = 0.5 + 0.3 * Math.sin(frameNow * 10);
  ctx.save();
  ctx.strokeStyle = `rgba(255, 50, 30, ${alpha})`;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([7, 5]);
  ctx.lineDashOffset = -frameNow * 40; // dashes march toward the target
  ctx.beginPath();
  ctx.moveTo(e.x, e.y);
  ctx.lineTo(target.x, target.y);
  ctx.stroke();
  ctx.setLineDash([]);
  const r = 30;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(target.x, target.y, r, 0, Math.PI * 2);
  ctx.stroke();
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 2 + frameNow * 1.5;
    ctx.beginPath();
    ctx.moveTo(target.x + Math.cos(a) * (r - 7), target.y + Math.sin(a) * (r - 7));
    ctx.lineTo(target.x + Math.cos(a) * (r + 7), target.y + Math.sin(a) * (r + 7));
    ctx.stroke();
  }
  ctx.restore();
}

// The resting (built) turret sprite, rotated so its barrel points along
// t.angle -- shared by drawTower and the end of drawTowerBuilding's
// crossfade.
function drawTurretSprite(t, alpha = 1) {
  const img = sprites[`tower_${t.type}`];
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(t.x, t.y);
  ctx.rotate(t.angle - (TOWER_RESTING_ANGLES[t.type] || 0));
  if (ready(img)) {
    ctx.drawImage(img, -TOWER_DRAW_SIZE / 2, -TOWER_DRAW_SIZE / 2, TOWER_DRAW_SIZE, TOWER_DRAW_SIZE);
  } else {
    ctx.fillStyle = t.type === "laser" ? "#8a6a3a" : t.type === "double" ? "#888" : "#6b7a4a";
    ctx.fillRect(-14, -10, 28, 20);
  }
  ctx.restore();
}

// Renders a tower that's still under construction (t.buildTimeRemaining
// > 0): its build-animation sheet (BUILD_ANIM_* above), crossfading into
// the resting sprite over the final BUILD_CROSSFADE_FRACTION, plus a
// progress bar in place of the hp/ammo bars. Falls back to fading the
// resting sprite in if the sheet hasn't loaded.
function drawTowerBuilding(t) {
  const progress = 1 - t.buildTimeRemaining / BUILD_DURATION; // 0 -> 1
  const sheet = sprites[`tower_${t.type}_build`];
  const crossfadeStart = 1 - BUILD_CROSSFADE_FRACTION;
  const settle = Math.max(0, (progress - crossfadeStart) / BUILD_CROSSFADE_FRACTION); // 0 -> 1 over the crossfade

  if (sheet && ready(sheet)) {
    const frameIndex = Math.min(BUILD_ANIM_FRAME_COUNT - 1, Math.floor(progress * BUILD_ANIM_FRAME_COUNT));
    const col = frameIndex % BUILD_ANIM_COLS;
    const row = Math.floor(frameIndex / BUILD_ANIM_COLS);
    const fw = sheet.naturalWidth / BUILD_ANIM_COLS;
    const fh = sheet.naturalHeight / BUILD_ANIM_ROWS;
    const s = BUILD_ANIM_DRAW_SIZE;
    ctx.save();
    ctx.globalAlpha = 1 - settle;
    ctx.drawImage(sheet, col * fw, row * fh, fw, fh, t.x - s / 2, t.y - s / 2, s, s);
    ctx.restore();
    if (settle > 0) drawTurretSprite(t, settle);
  } else {
    drawTurretSprite(t, Math.max(0.2, progress));
  }

  drawBuildBar(t.x, t.y - 44, progress);
}

// The works' progress bar, Command & Conquer style -- a tower's or a
// building's -- centred on x, its top at barY.
function drawBuildBar(x, barY, progress, barW = 56) {
  const barH = 6;

  ctx.save();
  // Outer frame with tactical bevel
  ctx.fillStyle = "rgba(10, 15, 20, 0.9)";
  ctx.fillRect(x - barW / 2 - 2, barY - 2, barW + 4, barH + 4);
  ctx.strokeStyle = "#4fd1c5";
  ctx.lineWidth = 1;
  ctx.strokeRect(x - barW / 2 - 2, barY - 2, barW + 4, barH + 4);

  // Background slot
  ctx.fillStyle = "#1a202c";
  ctx.fillRect(x - barW / 2, barY, barW, barH);

  // Energetic cyan progress fill
  const grad = ctx.createLinearGradient(x - barW / 2, barY, x + barW / 2, barY);
  grad.addColorStop(0, "#319795");
  grad.addColorStop(0.5, "#38b2ac");
  grad.addColorStop(1, "#4fd1c5");
  ctx.fillStyle = grad;
  ctx.fillRect(x - barW / 2, barY, barW * progress, barH);

  // Top gloss highlight
  ctx.fillStyle = "rgba(255, 255, 255, 0.45)";
  ctx.fillRect(x - barW / 2, barY, barW * progress, 2);
  ctx.restore();
}

function drawTowerBase(t) {
  const rx = 40;
  const ry = 28;
  const h = 7; // Height/thickness of the 3D concrete/metal base

  ctx.save();
  // 1. Soft directional ground shadow (offset down-right)
  ctx.fillStyle = "rgba(0, 0, 0, 0.42)";
  ctx.beginPath();
  ctx.ellipse(t.x + 4, t.y + 10, rx + 4, ry + 2, 0, 0, Math.PI * 2);
  ctx.fill();

  // 2. 3D Platform Side / Thickness (front-facing bevel)
  const sideGrad = ctx.createLinearGradient(t.x - rx, t.y, t.x + rx, t.y);
  sideGrad.addColorStop(0, "#1a202c");
  sideGrad.addColorStop(0.5, "#2d3748");
  sideGrad.addColorStop(1, "#171923");
  ctx.fillStyle = sideGrad;
  ctx.beginPath();
  ctx.ellipse(t.x, t.y + h, rx, ry, 0, 0, Math.PI);
  ctx.ellipse(t.x, t.y, rx, ry, 0, Math.PI, 0, true);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(0, 0, 0, 0.5)";
  ctx.lineWidth = 1;
  ctx.stroke();

  // 3. 3D Platform Top Face (illuminated from above)
  const topGrad = ctx.createRadialGradient(t.x - 8, t.y - 6, 4, t.x, t.y, rx);
  topGrad.addColorStop(0, "#4a5568");
  topGrad.addColorStop(0.7, "#2d3748");
  topGrad.addColorStop(1, "#1a202c");
  ctx.fillStyle = topGrad;
  ctx.beginPath();
  ctx.ellipse(t.x, t.y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();

  // Top highlight rim
  ctx.strokeStyle = "rgba(226, 232, 240, 0.35)";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // 4. Inner mechanical turret socket
  ctx.fillStyle = "#111418";
  ctx.beginPath();
  ctx.ellipse(t.x, t.y, rx * 0.55, ry * 0.55, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(79, 209, 197, 0.6)"; // subtle tactical cyan ring
  ctx.lineWidth = 1;
  ctx.stroke();

  // 5. Perimeter tactical bolts
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 3) {
    const bx = t.x + Math.cos(a) * (rx * 0.82);
    const by = t.y + Math.sin(a) * (ry * 0.82);
    ctx.fillStyle = "#a0aec0";
    ctx.beginPath();
    ctx.arc(bx, by, 1.6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// Which way each tower sprite's barrel points as drawn in its PNG, so the
// sprite can be rotated to match t.angle (0 = +x). Measured from the
// sprites' own alpha (direction of the farthest opaque pixels from the
// hull's centroid): tower_basic.png's barrel points straight down,
// tower_double/tower_laser.png's straight up. The previous values here
// (-59.5/+90/+90) didn't match the PNGs, which left every turret aiming
// well off its target while its rounds still left from the correct side.
const TOWER_RESTING_ANGLES = {
  basic: Math.PI / 2,
  double: -Math.PI / 2,
  laser: -Math.PI / 2,
};

// A support building (buildings.js) at its place on the map (b.x, b.y: the
// middle of its ground), with its works going on or finished: the phase
// of the works (constructionFrame) -- fading into the next, and at the
// end into the finished building, like a tower's build animation -- and
// the progress bar; once finished, its health bar when it's been hit.
const BUILDING_DRAW_WIDTH = 150; // world px: about two build slots across
// The pictures stand their isometric ground in their lower part: the
// building's place is drawn this share of the picture's width above its
// bottom edge.
const BUILDING_GROUND = 0.3;

function drawBuilding(b) {
  const finished = sprites[`building_${b.type}`];
  const sheet = sprites[`building_${b.type}_build`];
  const w = BUILDING_DRAW_WIDTH;
  const h = ready(finished) ? (w * finished.naturalHeight) / finished.naturalWidth : w;
  const left = b.x - w / 2;
  const top = b.y + w * BUILDING_GROUND - h;
  const progress = buildingProgress(b);
  const frame = constructionFrame(progress);
  const drawPhase = (phase, alpha) => {
    if (alpha <= 0) return;
    ctx.globalAlpha = alpha;
    if (phase < PHASE_COUNT && ready(sheet)) {
      const cw = sheet.naturalWidth / SHEET_COLS;
      const ch = sheet.naturalHeight / Math.ceil(PHASE_COUNT / SHEET_COLS);
      ctx.drawImage(sheet, (phase % SHEET_COLS) * cw, Math.floor(phase / SHEET_COLS) * ch, cw, ch, left, top, w, h);
    } else if (ready(finished)) {
      ctx.drawImage(finished, left, top, w, h);
    } else {
      // (pictures still loading: the building's ground)
      ctx.fillStyle = "#6b6a5a";
      ctx.beginPath();
      ctx.moveTo(b.x - w / 2, b.y);
      ctx.lineTo(b.x, b.y - w / 4);
      ctx.lineTo(b.x + w / 2, b.y);
      ctx.lineTo(b.x, b.y + w / 4);
      ctx.closePath();
      ctx.fill();
    }
  };
  ctx.save();
  drawPhase(frame.from, 1);
  if (frame.to !== frame.from) drawPhase(frame.to, frame.mix);
  ctx.restore();
  const barY = b.y - w * 0.42;
  if (progress < 1) drawBuildBar(b.x, barY, progress, 80);
  else if (b.hp < b.maxHp) drawTowerBar(b.x, barY, 5, 80, b.hp / b.maxHp, "#3c3", "#400");
  if (b.id != null && b.id === selectedId) {
    ctx.save();
    ctx.strokeStyle = "#5fe0f0";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(b.x - w / 2, b.y);
    ctx.lineTo(b.x, b.y - w / 4);
    ctx.lineTo(b.x + w / 2, b.y);
    ctx.lineTo(b.x, b.y + w / 4);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }
}

// Furthest first, so a nearer building stands in front of one behind it.
function drawBuildings(buildings) {
  for (const b of [...buildings].sort((p, q) => p.y - q.y)) drawBuilding(b);
}

// The player's concrete wall blocks (walls.js): beveled slabs drawn as one
// continuous wall where blocks touch (no edge between neighbours), cracking
// as they take damage, outlined when selected.
function drawWalls(walls) {
  if (!walls.length) return;
  const S = WALL.size;
  const at = new Set(walls.map((w) => `${w.x},${w.y}`));
  const has = (x, y) => at.has(`${x},${y}`);
  ctx.save();
  // All the shadows first, so no block's shadow falls across its neighbour.
  ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
  for (const w of walls) ctx.fillRect(w.x - S / 2 + 4, w.y - S / 2 + 5, S, S);
  for (const w of walls) {
    const x = w.x - S / 2;
    const y = w.y - S / 2;
    const dmg = 1 - w.hp / w.maxHp;
    const tone = (v) => Math.round(v * (1 - 0.35 * dmg));
    ctx.fillStyle = `rgb(${tone(134)}, ${tone(129)}, ${tone(120)})`;
    ctx.fillRect(x, y, S, S);
    // Lighter top face, inset on the sides with no neighbour.
    const l = has(w.x - S, w.y) ? 0 : 4;
    const r = has(w.x + S, w.y) ? 0 : 4;
    const t = has(w.x, w.y - S) ? 0 : 4;
    const b = has(w.x, w.y + S) ? 0 : 7;
    ctx.fillStyle = `rgb(${tone(172)}, ${tone(167)}, ${tone(157)})`;
    ctx.fillRect(x + l, y + t, S - l - r, S - t - b);
    if (!has(w.x, w.y + S)) {
      ctx.fillStyle = `rgb(${tone(84)}, ${tone(80)}, ${tone(73)})`;
      ctx.fillRect(x, y + S - 4, S, 4);
    }
    // Cracks, the same ones every frame for a given block.
    if (dmg > 0.3) {
      ctx.strokeStyle = "rgba(40, 36, 32, 0.85)";
      ctx.lineWidth = 1.5;
      const n = dmg > 0.65 ? 3 : 1;
      for (let i = 0; i < n; i++) {
        const seed = (w.id * 7919 + i * 104729) % 1000;
        const sx = x + 6 + (seed % 20);
        const sy = y + 6 + ((seed * 7) % 20);
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx + ((seed % 13) - 6), sy + 7);
        ctx.lineTo(sx + ((seed % 9) - 2), sy + 13);
        ctx.stroke();
      }
    }
    if (w.hp < w.maxHp) drawTowerBar(w.x, y - 8, 3, S - 6, w.hp / w.maxHp, "#3c3", "#400");
    if (w.id === selectedId) {
      ctx.strokeStyle = "#5fe0f0";
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 1, y + 1, S - 2, S - 2);
    }
  }
  ctx.restore();
}

// A level's foreground (levels.js -- level 4's skyscrapers that stand in
// front of roads): the same pixels as the map under them, drawn again over
// the enemies, so traffic passes behind those towers instead of across
// their facades. Not quite opaque, so a convoy behind one still shows
// faintly and the player can keep track of it.
const FOREGROUND_ALPHA = 0.8;

function drawForeground(level) {
  const fg = levelData(level).foreground;
  const img = foregroundImages[level];
  if (!fg || !img || !ready(img)) return;
  ctx.save();
  ctx.globalAlpha = FOREGROUND_ALPHA;
  ctx.drawImage(img, fg.x, fg.y);
  ctx.restore();
}

const TOWER_BAR_FULL = 64; // px, a fully upgraded tower's bars

function drawTowerBar(cx, y, h, w, frac, fill, back) {
  ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
  ctx.fillRect(cx - w / 2 - 1, y - 1, w + 2, h + 2);
  ctx.fillStyle = back;
  ctx.fillRect(cx - w / 2, y, w, h);
  ctx.fillStyle = fill;
  ctx.fillRect(cx - w / 2, y, w * Math.max(0, Math.min(1, frac)), h);
}

function drawTower(t) {
  // Render the volumetric 3D base pedestal
  drawTowerBase(t);

  if (t.buildTimeRemaining > 0) {
    drawTowerBuilding(t);
  } else {
    const levelSum = t.level.damage + t.level.range + t.level.fireRate;

    // Dynamic drop shadow under the rotating turret body
    ctx.save();
    ctx.translate(t.x + 3, t.y + 4);
    ctx.rotate(t.angle);
    ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
    ctx.beginPath();
    ctx.ellipse(0, 0, 24, 18, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    if (levelSum > 0) {
      ctx.save();
      ctx.globalAlpha = Math.min(0.15 + levelSum * 0.06, 0.6);
      ctx.fillStyle = "#ffd700";
      ctx.beginPath();
      ctx.arc(t.x, t.y, 52, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Damage darkens the turret itself (a brightness filter only touches
    // its opaque pixels) -- the old black fillRect over the sprite's whole
    // square showed up as a dark box around a damaged turret.
    const damagePct = 1 - t.hp / t.maxHp;
    if (damagePct > 0) ctx.filter = `brightness(${(1 - damagePct * 0.55).toFixed(2)})`;
    drawTurretSprite(t);
    ctx.filter = "none";

    // Muzzle flash at the cannon tip, only for the brief window right after
    // a shot (tower.js's muzzleFlash countdown).
    if (t.muzzleFlash > 0) {
      ctx.save();
      const flashX = t.x + Math.cos(t.angle) * MUZZLE_OFFSET;
      const flashY = t.y + Math.sin(t.angle) * MUZZLE_OFFSET;
      ctx.fillStyle = t.type === "laser" ? "#4fd1c5" : "#ffb700";
      ctx.shadowColor = t.type === "laser" ? "#81e6d9" : "#ff8800";
      ctx.shadowBlur = 12;

      if (t.type === "double") {
        const spread = 6;
        const p1x = flashX - Math.sin(t.angle) * spread;
        const p1y = flashY + Math.cos(t.angle) * spread;
        const p2x = flashX + Math.sin(t.angle) * spread;
        const p2y = flashY - Math.cos(t.angle) * spread;
        ctx.beginPath();
        ctx.arc(p1x, p1y, 5, 0, Math.PI * 2);
        ctx.arc(p2x, p2y, 5, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.arc(flashX, flashY, 6, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // Health and ammo bars. Per user request, each bar's LENGTH is the
    // tower's capacity -- short on a fresh tower, growing with every
    // armor/ammo upgrade to full length at level 5 (upgrades.js's
    // topValue) -- and its fill how much of it is left.
    const def = TOWER_TYPES[t.type];
    drawTowerBar(t.x, t.y - 46, 5, TOWER_BAR_FULL * (t.maxHp / topValue("armor", def)), t.hp / t.maxHp, "#3c3", "#400");
    drawTowerBar(t.x, t.y - 38, 4, TOWER_BAR_FULL * (t.maxAmmo / topValue("ammo", def)), t.ammo / t.maxAmmo, "#5af", "#225");
  }

  if (t.id === selectedId) {
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
  if (attacking()) return drawAttackHud();
  ctx.save();
  ctx.fillStyle = "#fff";
  ctx.font = "20px sans-serif";
  ctx.fillText(`Nivel ${state.level}/${MAX_LEVEL} — Oleada ${state.economy.wave}/${WAVES.length}`, 20, 30);
  ctx.fillText(`Vidas: ${state.economy.lives}`, 20, 55);
  ctx.fillText(`$${state.economy.money}`, 20, 80);
  // (The between-waves countdown is shown on #skip-wave-btn itself, which
  // sits right where a canvas line here would be drawn.)
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

// An attack's HUD (attackUI.js's lines): the round and its clock, the
// base's lives, the money and the army -- and, while preparing, what to do.
function drawAttackHud() {
  ctx.save();
  ctx.fillStyle = "#fff";
  ctx.font = "20px sans-serif";
  ctx.shadowColor = "rgba(0, 0, 0, 0.8)";
  ctx.shadowBlur = 4;
  // Two rows, like the defence game's HUD height, so «¡Al ataque!» fits
  // under them: the round and its clock, then the rest side by side.
  const [head, ...rest] = attackHudLines(state);
  ctx.fillText(head, 20, 30);
  ctx.fillText(rest.join("   ·   "), 20, 55);
  ctx.textAlign = "center";
  // With the mouse, what the clicks do (per user request: «no sé cómo
  // conquistarla»): with units picked, their orders; with none, how to
  // pick them.
  const mouseArmy = !autoArmyOn() && !state.gameOver;
  if (mouseArmy && attackControls.selectedIds().size) {
    ctx.font = "bold 16px sans-serif";
    ctx.fillStyle = "#9dffb0";
    ctx.fillText("Clic: ir · en una torre: atacarla · en la BASE: entrar · clic derecho: soltar", CANVAS_WIDTH / 2, 30);
  } else if (state.attack.phase === "prep" && !state.gameOver) {
    ctx.font = "bold 18px sans-serif";
    ctx.fillStyle = "#ffe27a";
    ctx.fillText(
      autoArmyOn() ? "Compra tu ejército y pulsa «¡Al ataque!»: irá solo" : "Compra tu ejército, elígelo con clic o recuadro y pulsa «¡Al ataque!»",
      CANVAS_WIDTH / 2,
      30,
    );
  } else if (mouseArmy) {
    ctx.font = "16px sans-serif";
    ctx.fillStyle = "rgba(255, 255, 255, 0.75)";
    ctx.fillText("Elige unidades con clic o recuadro · arrastra con el botón derecho para mover el mapa", CANVAS_WIDTH / 2, 30);
  }
  // The automatic army's reinforcements wait at the entry for the next round.
  const waiting = autoArmyOn() && state.attack.phase === "battle" && !state.gameOver ? state.enemies.filter((u) => u.alive && !u.order).length : 0;
  if (waiting) {
    ctx.font = "bold 18px sans-serif";
    ctx.fillStyle = "#ffe27a";
    ctx.fillText(`Refuerzos: ${waiting} · atacan en la próxima ronda`, CANVAS_WIDTH / 2, 30);
  }
  // (A loaded preparation waits paused, but nothing runs in it anyway.)
  if (state.paused && !state.gameOver && state.attack.phase === "battle") {
    ctx.font = "36px sans-serif";
    ctx.fillStyle = "#ffd700";
    ctx.fillText("PAUSA", CANVAS_WIDTH / 2, 70);
  }
  ctx.restore();
}

const buildMenuEl = document.getElementById("build-menu");
initBuildMenu(buildMenuEl, {
  onSelect: (type) => {
    if (state.gameOver || state.win || state.levelComplete) return;
    selectedBuildType = selectedBuildType === type ? null : type;
  },
  onRepair: () => {
    if (state.gameOver || state.win || state.levelComplete || selectedId == null) return;
    actions.repair(selectedId);
  },
  onSell: () => {
    if (state.gameOver || state.win || state.levelComplete || selectedId == null) return;
    actions.sell(selectedId);
    selectedId = null;
  },
});

// Upgrade panel callbacks are defined once, here, and read the *current*
// value of the module-level `selectedId` variable at click time
initUpgradePanel(upgradePanelEl, {
  onUpgrade: (skill) => {
    if (state.gameOver || state.win || state.levelComplete || selectedId == null) return;
    actions.upgrade(selectedId, skill);
  },
});

// The attack mode's shop and unit upgrade panel (attackUI.js), in place of
// the build menu and the towers' upgrade panel.
const attackShopEl = document.getElementById("attack-shop");
initShop(attackShopEl, {
  onBuy: (type, count) => {
    if (!attacking() || state.gameOver) return;
    if (!buyUnits(state, type, count).ok) playSound("error");
  },
});
const unitUpgradeEl = document.getElementById("unit-upgrade-panel");
let unitUpgradeType = null; // the type whose upgrades show (a tab per type in the selection)
let unitUpgradesOpen = false; // folded away to its tabs until the player opens it
initUnitUpgrades(unitUpgradeEl, {
  onUpgrade: (skill) => {
    if (attacking() && unitUpgradeType) upgradeUnitType(state, unitUpgradeType, skill);
  },
  onTab: (type) => {
    unitUpgradeType = type;
    unitUpgradesOpen = true;
  },
  onToggle: () => {
    unitUpgradesOpen = !unitUpgradesOpen;
  },
});

const skipWaveBtn = document.getElementById("skip-wave-btn");
skipWaveBtn.addEventListener("click", () => {
  if (state.gameOver || state.win || state.levelComplete) return;
  // In an attack's preparation it's «¡Al ataque!».
  if (attacking()) startAttack(state);
  else actions.skip();
});

const statsBtn = document.getElementById("stats-btn");
const statsOverlay = document.getElementById("stats-overlay");
const statsCloseBtn = document.getElementById("stats-close-btn");

async function openStatsModal() {
  statsOverlay.classList.remove("hidden");
  // (the game's panels stay out of the way, as under the menu)
  document.body.classList.add("stats-open");
  // Same source the end-of-game screen uses (server's /api/leaderboard in
  // co-op, this browser's localStorage in solo play) -- this used to ask
  // for a nonexistent /api/ranking and a different localStorage key, so
  // the ranking here was always empty.
  renderStatsModal(statsOverlay, state, await fetchLeaderboard());
}

function closeStatsModal() {
  statsOverlay.classList.add("hidden");
  document.body.classList.remove("stats-open");
}

statsBtn.addEventListener("click", () => {
  if (statsOverlay.classList.contains("hidden")) {
    openStatsModal();
  } else {
    closeStatsModal();
  }
});

statsCloseBtn.addEventListener("click", closeStatsModal);

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

// --- Menus, saved games, settings ----------------------------------------
// Per user request (docs/2026-10-08-menu-y-guardado-design.md): a main
// menu first, a pause menu during play (☰ or Esc), saving and loading.
// `started` gates stepGame in LOCAL mode only: a fresh
// createGameState() isn't over, so without it the level-1 game would tick
// along under the main menu before the player has chosen anything.
// Networked mode never needs it -- the server ticks on its own, and a
// player joining the co-op game sees it straight away.
let started = false;

// Solo games save into this browser (saves.js); the co-op game at home
// asks the server, which keeps its saves on its PC. The scheduler writes
// the autosave between waves and a save asked for mid-wave once the wave
// is over (autosave.js).
const saveScheduler = createSaveScheduler((slot, save) => writeSave(slot, save));

let settings = loadSettings();
setMusicOn(settings.music);
setEffectsOn(settings.effects);

const toastEl = document.getElementById("toast");
let toastTimer = null;
function showToast(message) {
  toastEl.textContent = message;
  toastEl.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.add("hidden"), 2500);
}
const savedMessage = (slot, ok) => (ok ? `Partida guardada en el hueco ${slot}` : "Este navegador no permite guardar");

// Asks the server and waits for its answer (postAction above doesn't).
async function askServer(body) {
  try {
    const res = await fetch("/api/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return await res.json();
  } catch {
    return { ok: false, reason: "network" };
  }
}

async function listSavesForMenu() {
  if (!networked) return listSaves();
  try {
    const res = await fetch("/api/saves");
    return res.ok ? await res.json() : [];
  } catch {
    return [];
  }
}

// Back to the board, with nothing left selected or showing from before.
function enterGame() {
  menu.close();
  selectedId = null;
  selectedBuildType = null;
  attackControls.reset();
  autoArmy.reset();
  unitUpgradeType = null;
  // Forces loop()'s "state.level changed" check to re-fire even for the
  // SAME level number (replaying level 3 after a loss, loading another
  // level-3 game) so the camera recenters on the new game.
  lastCameraLevel = null;
  gameEndOverlay.classList.add("hidden");
  gameEndShown = false;
}

// options: { mode: "attack", difficulty } for an attack (menu.js).
function startNewGame(level, { mode = "defense", difficulty = "normal" } = {}) {
  if (networked) {
    postAction({ type: "restart", level });
  } else {
    state = mode === "attack" ? createAttackState(level, difficulty) : createGameState(level);
    saveScheduler.reset(state);
    started = true;
  }
  enterGame();
}

async function loadSlot(slot) {
  if (networked) {
    const result = await askServer({ type: "load", slot });
    if (!result.ok) return showToast("No se puede cargar esta partida");
  } else {
    const restored = restoreGameSave(readSave(slot));
    if (!restored) return showToast("No se puede cargar esta partida");
    state = restored;
    saveScheduler.reset(state); // «Continuar» now means this game
    started = true;
  }
  enterGame();
}

async function saveToSlot(slot) {
  if (networked) {
    const result = await askServer({ type: "save", slot });
    if (!result.ok) showToast("No se ha podido guardar");
    else showToast(result.queued ? "Se guardará al terminar la oleada" : `Partida guardada en el hueco ${slot}`);
    return;
  }
  const result = saveScheduler.request(slot, state);
  const later = attacking() ? "Se guardará al empezar la ronda siguiente" : "Se guardará al terminar la oleada";
  showToast(result.done ? savedMessage(slot, result.result) : later);
}

// The pause menu pauses a solo game while it's open, and leaves it as it
// was on closing (paused with ⏸ beforehand: still paused). In co-op it
// pauses nobody -- the shared ⏸ is for that.
let pausedBeforeMenu = false;
function openPauseMenu() {
  if (menu.isOpen() || gameEndShown) return;
  if (!networked) {
    if (!started) return;
    pausedBeforeMenu = state.paused;
    state.paused = true;
  }
  menu.openPause();
}

// After a finished game ("Jugar de nuevo", or R): pick how to play the next.
function backToNewGame() {
  gameEndOverlay.classList.add("hidden");
  gameEndShown = false;
  if (!networked) started = false;
  menu.openNewGame();
}

const menu = createMenu(document.getElementById("menu"), {
  get networked() {
    return networked;
  },
  listSaves: listSavesForMenu,
  canStore: () => networked || canStore(),
  canSaveNow: () => canSaveGame(state),
  attacking: () => attacking(),
  hasGame: () => !networked && started,
  getSettings: () => settings,
  onContinue: () => (networked ? enterGame() : loadSlot("auto")),
  onNewGame: startNewGame,
  onLoad: loadSlot,
  onSave: saveToSlot,
  onRecords: openStatsModal,
  onQuitToMain: () => {
    if (!networked) started = false;
    menu.openMain();
  },
  onResume: () => {
    if (!networked) state.paused = pausedBeforeMenu;
  },
  onSettingsChange: (next) => {
    settings = next;
    saveSettings(settings);
    setMusicOn(settings.music);
    setEffectsOn(settings.effects);
  },
});

document.getElementById("menu-btn").addEventListener("click", openPauseMenu);

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
  if (attacking()) {
    // An attack's end: who won and how it went -- no score or ranking.
    renderAttackEndScreen(gameEndOverlay, attackSummary(state));
    gameEndCloseBtn.textContent = "Jugar de nuevo";
    gameEndOverlay.classList.remove("hidden");
    return;
  }
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
    selectedId = null;
    selectedBuildType = null;
  } else {
    // A true match end (loss, or beating the final level) -- choose how
    // to play the next game on the menu rather than defaulting to level 1.
    backToNewGame();
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
  if (selectedBuildType === "wall") return; // placed on press/drag instead (paintWall)
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
    const def = TOWER_TYPES[selectedBuildType];
    const moneyAfter = state.economy.money - def.cost;
    const countAfter = state.towers.filter((t) => t.type === selectedBuildType && t.hp > 0).length + 1;
    if (moneyAfter < def.cost || countAfter >= def.maxCount) {
      selectedBuildType = null;
    }
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
  const wall = state.walls.find((w) => Math.abs(w.x - pos.x) <= WALL.size / 2 && Math.abs(w.y - pos.y) <= WALL.size / 2);
  selectedId = nearestTower ? nearestTower.id : wall ? wall.id : null;
}

// Wall mode: pressing lays a block in the grid cell under the pointer, and
// dragging lays one in every further cell it passes over -- a whole row in
// one stroke, like laying walls in Command & Conquer. An invalid first
// press buzzes, same as an invalid tower placement.
let wallPaint = null; // { lastKey } while the pointer is held down in wall mode

function paintWall(pos, firstPress) {
  const check = canPlaceWall(state, pos.x, pos.y);
  if (!check.ok) {
    if (firstPress) playSound("error");
    return;
  }
  const key = `${check.x},${check.y}`;
  if (key === wallPaint.lastKey) return;
  wallPaint.lastKey = key;
  actions.placeWall(check.x, check.y);
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
const DRAG_THRESHOLD = 15; // screen px before a press counts as a drag, not a click
let dragState = null; // { startClientX, startClientY, startCamX, startCamY, startWorldPos, moved }
// A press that starts on the minimap moves the camera to that spot, and
// keeps it following the pointer until released -- instead of panning
// or placing a tower.
let minimapDragging = false;

function canvasPoint(evt) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((evt.clientX - rect.left) / rect.width) * CANVAS_WIDTH,
    y: ((evt.clientY - rect.top) / rect.height) * CANVAS_HEIGHT,
  };
}

// The attack mode's mouse, keyboard and touch (attackControls.js).
const attackControls = createAttackControls({
  getState: () => state,
  worldAt: worldPos,
  canvasAt: canvasPoint,
  view: () => ({ x: camera.x, y: camera.y, w: CANVAS_WIDTH / zoom, h: CANVAS_HEIGHT / zoom }),
  canvasSize: { w: CANVAS_WIDTH, h: CANVAS_HEIGHT },
  clientToCanvas: () => CANVAS_WIDTH / canvas.getBoundingClientRect().width,
  panCanvas: (dx, dy) => {
    camera.x += dx / zoom;
    camera.y += dy / zoom;
    clampCamera(state.level);
  },
  centerOn: centerCameraOn,
  entries: () => attackMapOf(levelData(state.level)).entries,
  base: () => attackMapOf(levelData(state.level)).base,
  now: () => performance.now() / 1000,
  onRefused: () => playSound("error"),
  autoArmy: () => autoArmyOn(),
});

// The pointer's look over an attack's map: a hand over a unit a click
// would pick, a crosshair where a click would attack or go into the base.
let mapCursor = "";
function updateMapCursor() {
  const look = attacking() && started && !state.gameOver && !menu.isOpen() ? attackControls.hoverOrder() : null;
  const cursor = look === "pick" ? "pointer" : look === "attack" || look === "enter" ? "crosshair" : "";
  if (cursor === mapCursor) return;
  mapCursor = cursor;
  canvas.style.cursor = cursor;
}

// The phone's automatic army (autoArmy.js), per user request: on a touch
// screen -- or with Ajustes › Controles set to «Móvil» -- the player only
// buys units and zooms, and the army goes on its own to the least defended
// entry; on a PC the mouse commands it (attackControls.js).
const autoArmy = createAutoArmy();
const AUTO_ARMY_EVERY = 0.25; // s between its looks at the army
let autoArmyClock = 0;
function autoArmyOn() {
  return attacking() && resolveControls(settings.controls, browserControlsEnv()) === "touch";
}

// Two-finger pinch zoom on a touch screen, per user request ("poder hacer
// zoom en la pantalla" on the phone), in both modes. The fingers on the
// canvas are tracked here; while two are down they zoom toward the point
// between them, and the finger left on after a pinch neither pans, taps,
// orders nor builds until every finger is up.
const touchPoints = new Map(); // pointerId -> canvas point
let pinch = null; // { zoom, dist } as the second finger touched down
let pinchEnded = false;

function pinchDown(evt) {
  if (evt.pointerType !== "touch") return false;
  touchPoints.set(evt.pointerId, canvasPoint(evt));
  if (touchPoints.size === 2) {
    const [a, b] = [...touchPoints.values()];
    pinch = { zoom, dist: Math.hypot(a.x - b.x, a.y - b.y) };
    attackControls.cancelTouch();
    dragState = null;
    wallPaint = null;
    minimapDragging = false;
    return true;
  }
  return touchPoints.size > 2 || pinchEnded;
}

function pinchMove(evt) {
  if (evt.pointerType !== "touch" || !touchPoints.has(evt.pointerId)) return false;
  touchPoints.set(evt.pointerId, canvasPoint(evt));
  if (pinch && touchPoints.size >= 2) {
    const [a, b] = [...touchPoints.values()];
    const p = pinchZoom(pinch.zoom, pinch.dist, a, b);
    const oldZoom = zoom;
    zoom = p.zoom;
    clampZoom(state.level);
    Object.assign(camera, zoomAt(camera, oldZoom, zoom, p.cx, p.cy));
    clampCamera(state.level);
    return true;
  }
  return pinchEnded;
}

// True if the lifted finger belonged to a pinch (nothing else should see it).
function pinchUp(evt) {
  if (evt.pointerType !== "touch" || !touchPoints.delete(evt.pointerId)) return false;
  if (pinch && touchPoints.size < 2) {
    pinch = null;
    pinchEnded = true;
  }
  const swallowed = pinchEnded;
  if (touchPoints.size === 0) pinchEnded = false;
  return swallowed;
}
// The middle button pans the map in an attack: not the browser's autoscroll.
canvas.addEventListener("mousedown", (evt) => {
  if (evt.button === 1) evt.preventDefault();
});
canvas.addEventListener("pointerleave", () => attackControls.pointerLeave());
// The right button is the game's (it lets go of an attack's units, and
// drags the map): never the browser's menu, wherever on the page it's
// pressed -- per user request, it kept popping up over the map. A name
// being typed keeps it, for pasting.
window.addEventListener("contextmenu", (evt) => {
  if (!isTypingTarget(evt.target)) evt.preventDefault();
});

// Where the mouse is, for an attack's panning at the screen's edges (per
// user request: «desplazarme por el mapa ... con el cursor del ratón»): over
// the map, or gone out of the window across one of its edges -- the map
// keeps sliding that way until the pointer comes back -- but not over a
// panel or a button, nor once the window's left behind.
window.addEventListener("pointermove", (evt) => {
  if (evt.pointerType !== "mouse") return;
  attackControls.pointerAt(evt.target === canvas ? canvasPoint(evt) : null);
});
document.addEventListener("mouseout", (evt) => {
  if (!evt.relatedTarget) attackControls.pointerAt(canvasPoint(evt));
});
window.addEventListener("blur", () => attackControls.pointerAt(null));

canvas.addEventListener("pointerdown", (evt) => {
  if (pinchDown(evt)) return;
  if (attacking()) {
    if (!started || state.gameOver) return;
    // The minimap still moves the camera -- or, right-clicked, sends the
    // selected units there; everything else is the attack controls'.
    const mini = currentMinimap();
    const cp = canvasPoint(evt);
    const onMinimap = mini && minimapToWorld(mini, cp.x, cp.y);
    if (onMinimap && evt.button === 2) return attackControls.orderAt(onMinimap);
    if (onMinimap && evt.button === 0) {
      minimapDragging = true;
      centerCameraOn(onMinimap);
      return;
    }
    attackControls.pointerDown(evt);
    return;
  }
  if (evt.button === 2) {
    // Right-click cancels build selection
    if (selectedBuildType) {
      selectedBuildType = null;
    }
    return;
  }
  if (evt.button !== 0) return;
  const mini = currentMinimap();
  const cp = canvasPoint(evt);
  const onMinimap = mini && minimapToWorld(mini, cp.x, cp.y);
  if (onMinimap) {
    minimapDragging = true;
    centerCameraOn(onMinimap);
    return;
  }
  if (selectedBuildType === "wall" && !state.gameOver && !state.win && !state.levelComplete) {
    wallPaint = { lastKey: null };
    paintWall(worldPos(evt), true);
    return;
  }
  const startWorldPos = worldPos(evt);
  dragState = {
    startClientX: evt.clientX,
    startClientY: evt.clientY,
    startCamX: camera.x,
    startCamY: camera.y,
    startWorldPos,
    moved: false,
  };
});

canvas.addEventListener("pointermove", (evt) => {
  if (pinchMove(evt)) return;
  const pos = worldPos(evt);
  mouseX = pos.x;
  mouseY = pos.y;
  if (attacking() && !minimapDragging) {
    attackControls.pointerMove(evt);
    return;
  }
  if (wallPaint) {
    paintWall(pos, false);
    return;
  }
  if (minimapDragging) {
    const mini = currentMinimap();
    const cp = canvasPoint(evt);
    if (mini) centerCameraOn(minimapToWorld(mini, cp.x, cp.y, true));
    return;
  }
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
  if (pinchUp(evt)) {
    minimapDragging = false;
    wallPaint = null;
    dragState = null;
    return;
  }
  const wasOnMinimap = minimapDragging;
  minimapDragging = false;
  wallPaint = null;
  if (attacking()) {
    if (!wasOnMinimap) attackControls.pointerUp(evt);
    return;
  }
  if (!dragState) return;
  const dxScreen = evt.clientX - dragState.startClientX;
  const dyScreen = evt.clientY - dragState.startClientY;
  const dist = Math.hypot(dxScreen, dyScreen);

  // If it didn't move past threshold, or if we are in build mode and released near a valid placement
  if (!dragState.moved || dist < DRAG_THRESHOLD || (selectedBuildType && dist < 30)) {
    const endPos = worldPos(evt);
    const startCheck = selectedBuildType ? canPlaceTower(state, selectedBuildType, dragState.startWorldPos.x, dragState.startWorldPos.y) : null;
    const endCheck = selectedBuildType ? canPlaceTower(state, selectedBuildType, endPos.x, endPos.y) : null;

    if (endCheck && endCheck.ok) {
      handleClick(endPos);
    } else if (startCheck && startCheck.ok) {
      handleClick(dragState.startWorldPos);
    } else {
      handleClick(endPos);
    }
  }
  dragState = null;
});

// The browser took a finger away (a system gesture, say): forget it.
window.addEventListener("pointercancel", (evt) => {
  if (evt.pointerType !== "touch") return;
  touchPoints.delete(evt.pointerId);
  if (touchPoints.size < 2) pinch = null;
  if (touchPoints.size === 0) pinchEnded = false;
  attackControls.cancelTouch();
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
    const ZOOM_STEP = 1.15;
    const oldZoom = zoom;
    zoom *= evt.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
    clampZoom(state.level);
    Object.assign(camera, zoomAt(camera, oldZoom, zoom, cx, cy));
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
const WASD = new Set(["w", "a", "s", "d"]);
const pressedPanKeys = new Set();
const PAN_SPEED = 600; // world px/sec

window.addEventListener("keydown", (evt) => {
  if (isTypingTarget(evt.target)) return; // a name being typed, not shortcuts
  const key = evt.key.toLowerCase();
  if (key === "escape") {
    // Esc first lets go of a tower or wall picked to build; otherwise it
    // opens the pause menu, or (in a menu) goes back a screen.
    if (selectedBuildType) {
      selectedBuildType = null;
    } else if (!menu.isOpen() && attacking() && attackControls.escape()) {
      // Esc in an attack first lets go of the selected units.
    } else if (menu.isOpen()) {
      menu.back();
    } else {
      openPauseMenu();
    }
    return;
  }
  if (menu.isOpen()) return; // no panning or R under a menu
  if (key === "r") {
    if (!state.gameOver && !state.win) return;
    // Same as the game-end screen's "Jugar de nuevo" -- on to choosing
    // the next game on the menu rather than silently defaulting to level 1
    // (or, in networked mode, re-fetching the same still-ended shared
    // state instead of actually resetting it).
    backToNewGame();
    return;
  }
  if (attacking()) {
    if (started && !state.gameOver && attackControls.keyDown(evt)) return;
    // WASD don't pan in an attack: S is «stop».
    if (WASD.has(key)) return;
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

// --- The attack mode's battlefield ---------------------------------------
// The defence's towers and wall blocks show only where the army can see
// them; elsewhere as they were when last seen (fog.js's memory), greyed by
// the fog drawn over them. Shots and blasts only in sight; the army itself
// always. Over the fog: the base, the entries' flags, the orders' marks
// and the reach of a known tower under the pointer.
const fogLayer = createFogLayer();

// A tower as the attacker last saw it, drawn like a live one.
function rememberedTower(m) {
  return { ...m, id: -1, buildTimeRemaining: m.building ? BUILD_DURATION / 2 : 0, muzzleFlash: 0, ammo: 1, maxAmmo: 1, range: 0 };
}

// A live or remembered tower's reach.
function towerRange(t) {
  if (t.range) return t.range;
  return TOWER_TYPES[t.type].range * UPGRADE_DEFS.range.mult ** ((t.level && t.level.range) || 0);
}

// The defence the attacker knows of: what's in sight as it is, the rest as
// it was when last seen.
function knownDefence(view) {
  const fog = state.attack.fog;
  const remembered = Object.values(fog.memory).filter((m) => !isVisible(fog, m.x, m.y));
  return {
    towers: [...view.towers.filter((t) => isVisible(fog, t.x, t.y)), ...remembered.filter((m) => m.kind === "tower").map(rememberedTower)],
    walls: [...(view.walls || []).filter((w) => isVisible(fog, w.x, w.y)), ...remembered.filter((m) => m.kind === "wall").map((m) => ({ ...m, id: -1 }))],
  };
}

// A laser beam from a tower out of sight shows only its last stretch, as
// it comes out of the fog onto the unit it hits.
function drawBeamInFog(b, fog) {
  if (isVisible(fog, b.x1, b.y1)) return drawBeam(b);
  if (!isVisible(fog, b.x2, b.y2)) return;
  const len = Math.hypot(b.x2 - b.x1, b.y2 - b.y1) || 1;
  const k = Math.max(0, 1 - 60 / len);
  drawBeam({ ...b, x1: b.x1 + (b.x2 - b.x1) * k, y1: b.y1 + (b.y2 - b.y1) * k });
}

function drawAttackWorld(view, now) {
  const fog = state.attack.fog;
  const inSight = (o) => isVisible(fog, o.x, o.y);
  const known = knownDefence(view);
  drawWalls(known.walls);
  for (const t of known.towers) drawTower(t);
  const picked = attackControls.selectedIds();
  for (const e of view.enemies) if (picked.has(e.id)) drawSelectionRing(ctx, e);
  for (const e of view.enemies) drawEnemy(e);
  drawForeground(state.level);
  for (const e of view.enemies) {
    const group = attackControls.groupOf(e.id);
    if (group != null) drawGroupNumber(ctx, e, group, 1 / zoom);
  }
  for (const p of view.projectiles) if (inSight(p)) drawProjectile(p);
  for (const bm of view.beams) drawBeamInFog(bm, fog);
  for (const ex of view.explosions) if (inSight(ex)) drawExplosion(ex);
  drawAirEffects(fx, ctx);
  fogLayer.draw(ctx, fog);
  const map = attackMapOf(levelData(state.level));
  const order = attackControls.hoverOrder();
  drawBaseMarker(ctx, map.base, now / 1000, 1 / zoom, order === "enter");
  drawEntryFlags(ctx, map.entries, state.attack.entry, 1 / zoom);
  drawOrderMarkers(ctx, attackControls.markers(), now / 1000);
  const hover = attackControls.hoverWorld();
  const hovered = hover && known.towers.find((t) => Math.hypot(t.x - hover.x, t.y - hover.y) < 38);
  if (hovered) drawRange(ctx, hovered.x, hovered.y, towerRange(hovered));
}

// The minimap of an attack: fogged, with the defence the attacker knows
// of, its own army, the entries and the base.
function attackMinimap(view, mapImage) {
  const map = attackMapOf(levelData(state.level));
  const known = knownDefence(view);
  return {
    mapImage: ready(mapImage) ? mapImage : null,
    enemies: [],
    units: view.enemies,
    towers: known.towers,
    walls: known.walls,
    base: map.base,
    view: { camera, w: CANVAS_WIDTH / zoom, h: CANVAS_HEIGHT / zoom },
    fog: fogLayer.canvas(),
    entries: map.entries,
    activeEntry: state.attack.entry,
  };
}

// An attack's panels, every frame: the shop instead of the build menu, the
// upgrade panel of the selected units' types, and «¡Al ataque!» on the
// start button while the attack is being prepared.
function updateAttackPanels() {
  buildMenuEl.classList.add("hidden");
  upgradePanelEl.classList.add("hidden");
  attackShopEl.classList.remove("hidden");
  updateShop(attackShopEl, state);
  const picked = attackControls.selected();
  const types = UNIT_ORDER.filter((type) => picked.some((u) => u.type === type));
  if (!types.includes(unitUpgradeType)) unitUpgradeType = types[0] || null;
  updateUnitUpgrades(unitUpgradeEl, state, types, unitUpgradeType, unitUpgradesOpen);
  const preparing = state.attack.phase === "prep" && !state.gameOver;
  skipWaveBtn.classList.toggle("hidden", !preparing);
  if (preparing) {
    skipWaveBtn.textContent = "⚔ ¡Al ataque!";
    skipWaveBtn.classList.add("pulse");
    skipWaveBtn.title = "Empezar la ronda 1";
  }
}

// A defence game's panels, every frame: the build menu, the towers'
// upgrade panel and the start / next-wave button.
function updateDefencePanels() {
  buildMenuEl.classList.remove("hidden");
  attackShopEl.classList.add("hidden");
  unitUpgradeEl.classList.add("hidden");
  const selectedTower = state.towers.find((t) => t.id === selectedId) || null;
  const selectedWall = (state.walls || []).find((w) => w.id === selectedId) || null;
  if (selectedId != null && !selectedTower && !selectedWall) selectedId = null; // sold/destroyed
  updateBuildMenu(buildMenuEl, {
    towers: state.towers,
    walls: state.walls || [],
    economy: state.economy,
    selectedType: selectedBuildType,
    selected: selectedTower || selectedWall,
  });
  updateUpgradePanel(upgradePanelEl, selectedTower);

  // Play / Advance Wave button: during the countdown it starts the next
  // wave now (and carries the countdown itself -- the canvas HUD line it
  // used to sit on top of is gone); mid-wave it calls the next wave in
  // early, but only once the current one has finished spawning (see
  // simulate.js's skipWave).
  const playing = !state.gameOver && !state.win && !state.levelComplete;
  const inCountdown = state.interWaveTimer > 0;
  const canCallEarly = state.spawnQueue.length === 0 && state.waveIndex < WAVES.length - 1;
  const canAdvanceWave = playing && (inCountdown || canCallEarly);
  skipWaveBtn.classList.toggle("hidden", !canAdvanceWave);
  if (canAdvanceWave) {
    if (inCountdown) {
      skipWaveBtn.textContent = `▶ Iniciar Oleada ${state.waveIndex + 1} (${Math.ceil(state.interWaveTimer)}s)`;
      skipWaveBtn.classList.add("pulse");
      skipWaveBtn.title = "Comenzar oleada inmediatamente";
    } else {
      skipWaveBtn.textContent = `▶ +Oleada ${state.waveIndex + 2}`;
      skipWaveBtn.classList.remove("pulse");
      skipWaveBtn.title = "Llamar a la siguiente oleada de inmediato (acelerar juego)";
    }
  }
}

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
    if (res.ok) receiveSnapshot(await res.json());
  } catch {
    // transient network hiccup on a LAN -- just try again next tick
  }
  setTimeout(pollState, POLL_MS);
}

// The snapshot before the latest one, and when the latest arrived -- see
// drawnView.
let prevSnapshot = null;
let snapshotAt = 0;

function receiveSnapshot(next) {
  prevSnapshot = { state, at: snapshotAt };
  state = next;
  snapshotAt = performance.now();
}

// What to draw this frame. Solo play simulates every frame, so that's the
// state itself. In networked play the state only changes every POLL_MS,
// and drawn as-is everything moved in jumps several times a second; so
// units, shells and turrets are drawn partway from where they were in the
// previous snapshot to where they are in the latest (running one poll
// behind, which nobody notices at this game's pace), and explosions and
// beams keep ageing locally in between.
function drawnView(now) {
  if (!networked || !prevSnapshot) return state;
  const span = snapshotAt - prevSnapshot.at;
  const elapsed = now - snapshotAt;
  const k = span > 0 ? Math.min(1, elapsed / span) : 1;
  const between = (list, prevList, fields) => {
    const prevById = new Map(prevList.map((o) => [o.id, o]));
    return list.map((o) => {
      const p = prevById.get(o.id);
      if (!p) return o;
      const out = { ...o };
      if (fields.includes("pos")) {
        out.x = p.x + (o.x - p.x) * k;
        out.y = p.y + (o.y - p.y) * k;
      }
      if (fields.includes("angle")) out.angle = lerpAngle(p.angle, o.angle, k);
      return out;
    });
  };
  const aged = (list) => list.map((o) => ({ ...o, age: Math.min(o.duration, o.age + elapsed / 1000) }));
  const prev = prevSnapshot.state;
  return {
    towers: between(state.towers, prev.towers, ["angle"]),
    enemies: between(state.enemies, prev.enemies, ["pos", "angle"]),
    projectiles: between(state.projectiles, prev.projectiles, ["pos"]),
    beams: aged(state.beams),
    explosions: aged(state.explosions),
    walls: state.walls || [],
  };
}

// Detects, once at startup, whether this page is being served by
// server.js (which exposes /api/state) or by a plain static file server
// (python -m http.server, or any other host with no such route) -- solo
// play keeps simulating locally exactly as it always has; only serving
// via server.js turns on networked mode.
// Installable on a phone (sw.js): only where the game is hosted over https
// -- never on the home server, which ships its updates through no-store.
if ("serviceWorker" in navigator && location.protocol === "https:") {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}

async function boot() {
  try {
    const res = await fetch("/api/state");
    if (res.ok) {
      networked = true;
      state = await res.json();
      snapshotAt = performance.now();
      pollState();
    }
  } catch {
    // no /api/state -- solo play, local simulation (the default)
  }
  if (networked) {
    // Joining an already-running (or already-ended) shared match --
    // show it immediately rather than forcing the main menu on top of
    // whatever the other players are already looking at.
    started = true;
  } else {
    menu.openMain();
  }
  requestAnimationFrame(loop);
}

let lastTime = performance.now();

function loop(now) {
  // Never negative: a frame stamped earlier than the last one (it can
  // happen on the very first frame) must not run the game backwards.
  const dt = Math.max(0, Math.min((now - lastTime) / 1000, 0.05));
  lastTime = now;
  frameNow = now / 1000;

  if (!networked && started) {
    // Before stepping: a level's start is only between waves until its
    // first tick spawns the opening units.
    saveScheduler.tick(state, (slot, ok) => showToast(savedMessage(slot, ok)));
    stepGame(state, dt);
    autoArmyClock += dt;
    if (autoArmyOn() && autoArmyClock >= AUTO_ARMY_EVERY) {
      autoArmyClock = 0;
      autoArmy.step(state);
    }
  }
  playNewShotSounds();
  syncMusicToPause();
  checkGameEnd();

  if (state.level !== lastCameraLevel) {
    lastCameraLevel = state.level;
    recenterCamera(state.level);
    clearEffects(fx);
  }
  updateCameraFromKeys(dt);
  if (attacking() && started && !menu.isOpen()) attackControls.update(dt);
  updateMapCursor();

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
  const view = drawnView(now);
  // Effects freeze with the game when it's paused.
  if (!state.paused) stepEffects(fx, view, dt);
  drawGroundEffects(fx, ctx, wreckSprite);
  if (attacking()) {
    drawAttackWorld(view, now);
  } else {
    drawWalls(view.walls || []);
    // The support buildings (buildings.js) -- none in any mode yet.
    drawBuildings(state.buildings || []);
    for (const t of view.towers) drawTower(t);
    for (const e of view.enemies) drawEnemy(e);
    drawForeground(state.level);
    // Over the foreground: a rocket truck shelling from behind a skyscraper
    // still shows where it's firing from.
    for (const e of view.enemies) if (e.holding) drawSiegeDesignator(e);
    for (const p of view.projectiles) drawProjectile(p);
    for (const bm of view.beams) drawBeam(bm);
    for (const ex of view.explosions) drawExplosion(ex);
    drawAirEffects(fx, ctx);
  }

  if (selectedBuildType) {
    // A slot-based level (levels.js's buildSlots) only allows building at
    // fixed points -- show every unoccupied one faintly while placing so
    // it's clear where those are at a glance, not just wherever the mouse
    // happens to be hovering.
    const slots = selectedBuildType === "wall" ? null : levelData(state.level).buildSlots;
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
    if (selectedBuildType === "wall") {
      const check = canPlaceWall(state, mouseX, mouseY);
      const cell = { x: Math.floor(mouseX / WALL.size) * WALL.size, y: Math.floor(mouseY / WALL.size) * WALL.size };
      ctx.save();
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = check.ok ? "#5f5" : "#f55";
      ctx.fillRect(cell.x, cell.y, WALL.size, WALL.size);
      ctx.restore();
    } else {
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
  }
  ctx.restore();

  // The box being dragged to select units, over the map in screen space.
  const dragBox = attacking() ? attackControls.box() : null;
  if (dragBox) drawSelectionBox(ctx, dragBox);

  const mini = currentMinimap();
  if (mini && attacking()) {
    drawMinimap(ctx, mini, attackMinimap(view, currentMapImage));
  } else if (mini) {
    drawMinimap(ctx, mini, {
      mapImage: ready(currentMapImage) ? currentMapImage : null,
      enemies: view.enemies,
      towers: view.towers,
      walls: view.walls || [],
      base: levelData(state.level).soldierExit,
      view: { camera, w: CANVAS_WIDTH / zoom, h: CANVAS_HEIGHT / zoom },
    });
  }

  drawHud();
  if (attacking()) updateAttackPanels();
  else updateDefencePanels();

  pauseBtn.textContent = state.paused ? "▶" : "⏸";
  pauseBtn.title = state.paused ? "Reanudar" : "Pausar";
  pauseBtn.classList.toggle("active", state.paused);

  requestAnimationFrame(loop);
}

boot();
