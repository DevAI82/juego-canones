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
import { isVisible, isExplored, fogFromWire } from "./fog.js";
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
import { initShop, updateShop, initUnitUpgrades, updateUnitUpgrades, attackHudLines, defenderHudLines, attackSummary } from "./attackUI.js";
import { BUILDING_TYPES, BUILDING_ORDER, PHASE_COUNT, SHEET_COLS, buildingProgress, constructionFrame } from "./buildings.js";
import { RTS_UNIT_TYPES, RTS_UNIT_ORDER } from "./rtsUnits.js";
import { entrySafePoints, reachesEntryRoad } from "./entryRoads.js";
import { createRtsUI } from "./rtsUI.js";
import {
  createRtsState,
  RTS_CONFIG,
  RTS_BUILDINGS,
  RTS_UNITS,
  RTS_RESEARCH_UPGRADES,
  deployMcv,
  completeMcvDeployment,
  createRtsBuilding,
  canBuildAtLocation,
  calculatePowerGrid,
  enqueueUnit,
  cancelQueueItem,
  startResearch,
} from "./rts.js";
import { createRts3DRenderer } from "./renderer3d.js";

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
  const baseRight = Math.round(window.innerWidth - (gameLeft + scaledW) + 12);
  const sidebar = document.getElementById("cnc-sidebar");
  const isRts = Boolean(sidebar && !sidebar.classList.contains("hidden"));
  topControlsEl.style.right = isRts ? `${Math.max(baseRight, 285)}px` : `${baseRight}px`;
}

// The on-screen D-pad (see wireNavButton() below), pinned near the map's
// bottom-right corner at a fixed size for the same reason as
// #top-controls above -- per user request ("flechas de navegación para
// desplazarme más cómodo"). NAV_CONTROLS_SIZE must match the 3x3 grid of
// 36px cells + 4px gaps set in style.css (2 * 36 + 2 * 4 for the two gaps
// between three cells... i.e. 3*36 + 2*4).
const NAV_CONTROLS_SIZE = 3 * 36 + 2 * 4;

function positionNavControls() {
  const navControlsEl = document.getElementById("nav-controls");
  if (!navControlsEl) return;
  const show = Boolean(state && (state.isRts || state.level === 3));
  navControlsEl.style.display = show ? "grid" : "none";
}

let state = null;

function resizeGame() {
  const sidebar = document.getElementById("cnc-sidebar");
  const isRts = Boolean(sidebar && !sidebar.classList.contains("hidden")) || Boolean(state && state.isRts);

  if (isRts) {
    const isSidebarVisible = Boolean(sidebar && !sidebar.classList.contains("hidden"));
    const sidebarW = isSidebarVisible ? (sidebar.getBoundingClientRect().width || 270) : 0;
    const availW = Math.max(300, window.innerWidth - sidebarW);
    const availH = window.innerHeight;
    const scaleX = availW / CANVAS_WIDTH;
    const scaleY = availH / CANVAS_HEIGHT;

    gameViewport.style.position = "fixed";
    gameViewport.style.left = "0px";
    gameViewport.style.top = "0px";
    gameViewport.style.width = `${availW}px`;
    gameViewport.style.height = `${availH}px`;
    gameViewport.style.margin = "0";

    gameContainer.style.transform = `scale(${scaleX}, ${scaleY})`;

    const topControlsEl = document.getElementById("top-controls");
    if (topControlsEl) {
      topControlsEl.style.top = "12px";
      topControlsEl.style.right = `${sidebarW + 12}px`;
    }

    const navControlsEl = document.getElementById("nav-controls");
    if (navControlsEl) {
      navControlsEl.style.display = "grid";
    }

    if (mode3D && rts3DRenderer) {
      rts3DRenderer.resize(availW, availH);
    }
    return;
  }

  // Non-RTS modes: default centered proportional scaling
  gameViewport.style.position = "relative";
  gameViewport.style.left = "";
  gameViewport.style.top = "";
  gameViewport.style.margin = "";
  const scale = Math.min(window.innerWidth / CANVAS_WIDTH, window.innerHeight / CANVAS_HEIGHT);
  gameContainer.style.transform = `scale(${scale})`;
  gameViewport.style.width = `${CANVAS_WIDTH * scale}px`;
  gameViewport.style.height = `${CANVAS_HEIGHT * scale}px`;
  positionBuildMenu(scale);
  positionTopControls(scale);
  positionNavControls();
}

// ============================================================================
// 3D GRAPHICS ENGINE (Three.js WebGL) INTEGRATION
// ============================================================================
let mode3D = false;
let rts3DRenderer = null;
const mode3DBtn = document.getElementById("mode-3d-btn");

function init3DRenderer() {
  if (rts3DRenderer) return;
  rts3DRenderer = createRts3DRenderer({
    container: gameViewport,
    getState: () => state,
    getCamera: () => camera,
    getZoom: () => zoom,
    onWorldClick: (pos) => {
      handleClick(pos);
    },
    onWorldRightClick: (pos) => {
      if (selectedBuildType) {
        selectedBuildType = null;
      }
      if (state && state.isRts) {
        selectedRtsBuilding = null;
        if (rtsUI) rtsUI.closeBuildingContext();
        for (const u of state.rtsUnits) u.selected = false;
      }
    },
    canvasWidth: CANVAS_WIDTH,
    canvasHeight: CANVAS_HEIGHT,
  });
  rts3DRenderer.init();
}

function set3DMode(active) {
  mode3D = active;
  if (!rts3DRenderer && active) {
    init3DRenderer();
  }
  if (rts3DRenderer) {
    if (active) {
      rts3DRenderer.show();
      const sidebar = document.getElementById("cnc-sidebar");
      const sidebarW = (sidebar && !sidebar.classList.contains("hidden")) ? (sidebar.getBoundingClientRect().width || 270) : 0;
      rts3DRenderer.resize(Math.max(300, window.innerWidth - sidebarW), window.innerHeight);
    } else {
      rts3DRenderer.hide();
    }
  }
  canvas.style.background = active ? "transparent" : "#000";
  if (mode3DBtn) {
    mode3DBtn.classList.toggle("active", active);
    mode3DBtn.textContent = active ? "🚀 3D ON" : "🎮 3D";
  }
  showToast(active ? "Modo 3D WebGL Activado" : "Modo 2D Canvas Activado");
}

if (mode3DBtn) {
  mode3DBtn.addEventListener("click", () => {
    set3DMode(!mode3D);
  });
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
// Specific RTS buildings & MCV sprites
sprites.bld_hq = loadImage("assets/bld_hq.jpg");
sprites.bld_hq_build = loadImage("assets/bld_hq_build.jpg");
sprites.unit_mcv = loadImage("assets/unit_mcv.jpg");
sprites.unit_harvester = loadImage("assets/unit_harvester.png");
sprites.bld_wall = loadImage("assets/bld_wall.jpg");
sprites.bld_solar = loadImage("assets/bld_solar.jpg");
sprites.bld_solar_build = loadImage("assets/bld_solar_build.jpg");
sprites.bld_wind = loadImage("assets/bld_wind.jpg");
sprites.bld_wind_build = loadImage("assets/bld_wind_build.jpg");
sprites.bld_refinery = loadImage("assets/bld_refinery.jpg");
sprites.bld_refinery_build = loadImage("assets/bld_refinery_build.jpg");
sprites.bld_barracks = loadImage("assets/bld_barracks.jpg");
sprites.bld_barracks_build = loadImage("assets/bld_barracks_build.jpg");
sprites.bld_factory = loadImage("assets/bld_factory.jpg");
sprites.bld_factory_build = loadImage("assets/bld_factory_build.jpg");
sprites.bld_techlab = loadImage("assets/bld_techlab.jpg");
sprites.bld_techlab_build = loadImage("assets/bld_techlab_build.jpg");

// The RTS mode's vehicles (rtsUnits.js): seen from above, like the units.
for (const key of RTS_UNIT_ORDER) sprites[`unit_${key}`] = loadImage(RTS_UNIT_TYPES[key].sprite);
// A unit's picture: the defence's and the attack's units' (enemy_*), or an
// RTS vehicle's (unit_*).
const unitSprite = (type) => sprites[`unit_${type}`] || sprites[`enemy_${type}`];

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
state = createGameState();
let networked = false; // set once, before the loop starts (see boot() below)
// An attack (attack.js, docs/2026-10-09-modo-atacante-design.md) rather
// than a defence game: what the rules and the state are.
const attacking = () => state.mode === "attack";

// --- Who's playing (docs/2026-10-09-uno-contra-otro-design.md) -----------
// On the home network, one against the other, the server knows this tab
// by an id it makes up once and keeps in the tab's sessionStorage -- a
// reload keeps its side; another tab, even on this computer, is another
// player -- and tells it, with every snapshot, where it stands (`net`,
// host.js's viewJson): the game's kind, its side, the two sides', whose
// pause it is, whether it may change the game.
const playerId = (() => {
  try {
    let id = sessionStorage.getItem("td_player");
    if (!id) {
      id = `${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
      sessionStorage.setItem("td_player", id);
    }
    return id;
  } catch {
    return Math.random().toString(36).slice(2);
  }
})();
let net = { kind: "coop", you: null, mayChange: true };
const versusGame = () => networked && net.kind === "versus";
// The side this tab plays: in solo play, the game's; at home in co-op, the
// defence; one against the other, the server's word (null: no side yet).
function mySide() {
  if (versusGame()) return net.you;
  if (networked) return "defense";
  return attacking() ? "attack" : "defense";
}
// Every piece of the screen has an attacker's version -- shop, army, fog,
// orders -- and a defender's: picked by the side, not only by the game's
// kind, since the defender of an attack plays with the defence's screen.
const commanding = () => attacking() && mySide() === "attack";
const SIDE_NAMES = { attack: "el atacante", defense: "el defensor" };

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
  if (state && state.isRts) {
    // In RTS mode, minimum zoom guarantees the map covers 100% of the canvas with zero grey bars
    return Math.max(CANVAS_WIDTH / w, CANVAS_HEIGHT / h);
  }
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
  if (!commanding()) return { right: 0, top: 0, bottom: 0 };
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
  if (state && state.isRts) {
    zoom = 1.0;
    clampZoom(level);
    const mcv = state.rtsUnits ? state.rtsUnits.find((u) => u.type === "mcv" && u.team === "blue") : null;
    const anchor = mcv ? { x: mcv.x, y: mcv.y } : RTS_CONFIG.blueBase;
    camera.x = anchor.x - (CANVAS_WIDTH / zoom) / 2;
    camera.y = anchor.y - (CANVAS_HEIGHT / zoom) / 2;
    clampCamera(level);
    return;
  }
  zoom = minZoomFor(level);
  clampZoom(level);
  const d = levelData(level);
  // The army's commander starts where it comes in; a defender on the base.
  const anchor = commanding()
    ? attackMapOf(d).entries[state.attack.entry]
    : attacking()
      ? attackMapOf(d).base
      : d.soldierExit || { x: w / 2, y: h / 2 };
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
  if (state.isRts || !state.projectiles) return;
  const nextSounded = new Set();
  for (const p of state.projectiles) {
    nextSounded.add(p.id);
    if (!soundedIds.has(p.id)) playSound(p.sound);
  }
  for (const b of state.beams || []) {
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
  // The army's shop and its upgrades (attack.js).
  buy(type, count) {
    if (networked) {
      postAction({ type: "buy", unitType: type, count });
      return;
    }
    if (!buyUnits(state, type, count).ok) playSound("error");
  },
  upgradeUnit(type, skill) {
    if (networked) {
      postAction({ type: "upgradeUnit", unitType: type, skill });
      return;
    }
    upgradeUnitType(state, type, skill);
  },
  // «¡Al ataque!» -- or, one against the other, «¡Listo!»: the round starts
  // once both sides have said so (versus.js).
  startAttack() {
    if (networked) {
      postAction({ type: "ready" });
      return;
    }
    startAttack(state);
  },
};

// The army's orders on the home network (attackControls.js's env.orders):
// to the server, which carries them out.
const networkOrders = {
  move: (ids, x, y) => postAction({ type: "order", kind: "move", ids, x, y }),
  attack: (ids, targetId) => postAction({ type: "order", kind: "attack", ids, targetId }),
  enter: (ids) => postAction({ type: "order", kind: "enter", ids }),
  stop: (ids) => postAction({ type: "order", kind: "stop", ids }),
  entry: (index) => postAction({ type: "entry", index }),
};

function postAction(body) {
  fetch("/api/action", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ player: playerId, ...body }),
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
  // To the army's commander these are their own units: green bars.
  ctx.fillStyle = commanding() ? "#0d3a12" : "#3a0d0d";
  ctx.fillRect(e.x - barW / 2, barY, barW, barH);
  ctx.fillStyle = commanding() ? "#47d35a" : "#e5392f";
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

// The player's concrete wall blocks (walls.js), per user request in the
// drawing Imágenes/muralla defensiva.jpg (tools/extract_walls.py): every
// block a concrete barrier with hazard stripes, and where the wall turns --
// a block with neighbours both across and up or down -- the corner piece
// with razor wire. The pictures are 3/4 views taller than their 32 px
// cell, standing on it: drawn from the back of the map to the front, so a
// nearer block stands in front of the one behind. Damage darkens a block;
// a damaged one shows its health bar, the selected one an outline.
const WALL_DRAW_WIDTH = 37; // world px: the block picture's width, a little over its cell
const wallBlockImg = loadImage("assets/wall_block.webp");
const wallCornerImg = loadImage("assets/wall_corner.webp");

function drawWalls(walls) {
  if (!walls.length) return;
  const S = WALL.size;
  const at = new Set(walls.map((w) => `${w.x},${w.y}`));
  const has = (x, y) => at.has(`${x},${y}`);
  const scale = WALL_DRAW_WIDTH / (wallBlockImg.naturalWidth || 200);
  ctx.save();
  for (const w of [...walls].sort((a, b) => a.y - b.y || a.x - b.x)) {
    const across = has(w.x - S, w.y) || has(w.x + S, w.y);
    const upDown = has(w.x, w.y - S) || has(w.x, w.y + S);
    const img = across && upDown ? wallCornerImg : wallBlockImg;
    const dmg = 1 - w.hp / w.maxHp;
    const foot = w.y + S / 2 + 3; // where the piece stands: its cell's front edge
    if (ready(img)) {
      const dw = img.naturalWidth * scale;
      const dh = img.naturalHeight * scale;
      if (dmg > 0) ctx.filter = `brightness(${(1 - 0.45 * dmg).toFixed(2)})`;
      ctx.drawImage(img, w.x - dw / 2, foot - dh, dw, dh);
      ctx.filter = "none";
    } else {
      // (pictures still loading: a plain concrete block)
      ctx.fillStyle = "#8a857a";
      ctx.fillRect(w.x - S / 2, w.y - S / 2, S, S);
    }
    if (w.hp < w.maxHp) drawTowerBar(w.x, foot - WALL_DRAW_WIDTH * 1.45, 3, S - 6, w.hp / w.maxHp, "#3c3", "#400");
    if (w.id === selectedId) {
      ctx.strokeStyle = "#5fe0f0";
      ctx.lineWidth = 2;
      ctx.strokeRect(w.x - S / 2 + 1, w.y - S / 2 + 1, S - 2, S - 2);
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

function drawRtsHud() {
  ctx.save();
  ctx.fillStyle = "#fff";
  ctx.font = "bold 18px sans-serif";
  const subname = state.rtsSubmode === "survival" ? "SUPERVIVENCIA" : "CAMPAÑA";
  ctx.fillText(`MODO RTS — ${subname}`, 20, 30);
  if (state.rtsSubmode === "survival") {
    ctx.font = "14px sans-serif";
    ctx.fillStyle = "#ffe27a";
    ctx.fillText(`Oleada: ${state.survivalWave}/${state.maxSurvivalWaves} · Próxima en: ${Math.ceil(state.survivalWaveTimer)}s`, 20, 55);
  }
  if (state.winner) {
    ctx.font = "bold 44px sans-serif";
    ctx.textAlign = "center";
    ctx.fillStyle = state.winner === "blue" || state.winner === "victory" ? "#4ade80" : "#ef4444";
    const winMsg = state.winner === "blue" || state.winner === "victory" ? "¡VICTORIA!" : "DERROTA";
    ctx.fillText(winMsg, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
  }
  ctx.restore();
}

function drawHud() {
  if (state.isRts) {
    drawRtsHud();
    return;
  }
  if (attacking()) {
    if (commanding()) drawAttackHud();
    else drawDefenderHud();
    drawVersusBanner();
    return;
  }
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
    const go = versusGame() ? "«¡Listo!»" : "«¡Al ataque!»";
    ctx.fillText(
      autoArmyOn() ? `Compra tu ejército y pulsa ${go}: irá solo` : `Compra tu ejército, elígelo con clic o recuadro y pulsa ${go}`,
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
  // (A loaded preparation waits paused, but nothing runs in it anyway. One
  // against the other, drawVersusBanner says whose pause it is.)
  if (state.paused && !state.gameOver && state.attack.phase === "battle" && !versusGame()) {
    ctx.font = "36px sans-serif";
    ctx.fillStyle = "#ffd700";
    ctx.fillText("PAUSA", CANVAS_WIDTH / 2, 70);
  }
  ctx.restore();
}

// The defender's HUD in an attack, one against the other: the round and its
// clock, the base, the defence's money and the army coming (attackUI.js),
// and while preparing, what to do.
function drawDefenderHud() {
  ctx.save();
  ctx.fillStyle = "#fff";
  ctx.font = "20px sans-serif";
  ctx.shadowColor = "rgba(0, 0, 0, 0.8)";
  ctx.shadowBlur = 4;
  const [head, ...rest] = defenderHudLines(state);
  ctx.fillText(head, 20, 30);
  ctx.fillText(rest.join("   ·   "), 20, 55);
  if (state.attack.phase === "prep" && !state.gameOver) {
    ctx.textAlign = "center";
    ctx.font = "bold 18px sans-serif";
    ctx.fillStyle = "#ffe27a";
    ctx.fillText("Construye tus torres y pulsa «¡Listo!»: no se puede tapar la entrada del ejército", CANVAS_WIDTH / 2, 30);
  }
  ctx.restore();
}

// The address the other computer opens: this page's own, unless it was
// opened as localhost on the server's computer -- then the server's
// address on the home network (server.js's /api/address, asked at boot).
let lanUrls = [];
function homeAddress() {
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);
  return local && lanUrls.length ? lanUrls[0] : location.origin;
}

// One against the other: what the other player is up to, over the game --
// waiting for them to come, getting ready, a pause and whose it is, a
// player gone.
const capitalised = (text) => text[0].toUpperCase() + text.slice(1);
function drawVersusBanner() {
  if (!versusGame() || state.gameOver) return;
  const a = state.attack;
  const other = net.you === "attack" ? "defense" : net.you === "defense" ? "attack" : null;
  let text = null;
  if (state.paused && a.phase === "battle") {
    if (net.gone) text = `${capitalised(SIDE_NAMES[net.gone])} se ha desconectado. Esperando a que vuelva…`;
    else if (net.pausedBy && net.pausedBy !== net.you) text = `Pausa: ${SIDE_NAMES[net.pausedBy]} ha parado la partida`;
    else text = "PAUSA · pulsa ▶ para seguir";
  } else if (a.phase === "prep" && other) {
    if (!net.sides[other].connected) text = `Esperando al otro jugador: que abra ${homeAddress()} en su ordenador`;
    else if (net.sides[net.you].ready) text = `Listo. Esperando a ${SIDE_NAMES[other]}…`;
    else if (net.sides[other].ready) text = `${capitalised(SIDE_NAMES[other])} está listo`;
  }
  if (!text) return;
  ctx.save();
  ctx.font = "bold 19px sans-serif";
  const w = ctx.measureText(text).width + 36;
  ctx.fillStyle = "rgba(6, 10, 12, 0.85)";
  ctx.strokeStyle = "#ffe27a";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(CANVAS_WIDTH / 2 - w / 2, 74, w, 34, 6);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#ffe27a";
  ctx.textAlign = "center";
  ctx.fillText(text, CANVAS_WIDTH / 2, 98);
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
    // In an attack no tower may reach the entries' safe stretch, and a
    // longer range mustn't take one over it either (simulate.js's
    // upgradeTower): said at once, not left to a silent refusal.
    const tower = state.towers.find((t) => t.id === selectedId);
    if (attacking() && skill === "range" && tower && tower.level.range < UPGRADE_DEFS.range.levels) {
      const range = TOWER_TYPES[tower.type].range * UPGRADE_DEFS.range.mult ** (tower.level.range + 1);
      if (reachesEntryRoad(levelData(state.level), tower.x, tower.y, range)) {
        playSound("error");
        return showToast(ENTRY_ROAD_REFUSED);
      }
    }
    actions.upgrade(selectedId, skill);
  },
});

// The attack mode's shop and unit upgrade panel (attackUI.js), in place of
// the build menu and the towers' upgrade panel.
const attackShopEl = document.getElementById("attack-shop");
initShop(attackShopEl, {
  onBuy: (type, count) => {
    if (!commanding() || state.gameOver) return;
    actions.buy(type, count);
  },
});
const unitUpgradeEl = document.getElementById("unit-upgrade-panel");
let unitUpgradeType = null; // the type whose upgrades show (a tab per type in the selection)
let unitUpgradesOpen = false; // folded away to its tabs until the player opens it
initUnitUpgrades(unitUpgradeEl, {
  onUpgrade: (skill) => {
    if (commanding() && unitUpgradeType) actions.upgradeUnit(unitUpgradeType, skill);
  },
  onTab: (type) => {
    unitUpgradeType = type;
    unitUpgradesOpen = true;
  },
  onToggle: () => {
    unitUpgradesOpen = !unitUpgradesOpen;
  },
});

// RTS mode's Command & Conquer sidebar and contextual building panel (rtsUI.js)
const cncSidebarEl = document.getElementById("cnc-sidebar");
const rtsContextPanelEl = document.getElementById("rts-context-panel");
let selectedRtsBuilding = null;

const rtsUI = createRtsUI(cncSidebarEl, rtsContextPanelEl, {
  onSelectBuildType: (type) => {
    if (!state.isRts || state.winner) return;
    selectedBuildType = selectedBuildType === type ? null : type;
    if (selectedBuildType) {
      rtsUI.closeBuildingContext();
      const def = RTS_BUILDINGS[selectedBuildType];
      showToast(def ? `Colocando ${def.name}: Haz clic en el terreno cerca de tu base` : "Toca en el mapa para situar la construcción");
    }
  },
  onEnqueueSoldier: (uType, building) => {
    if (!state.isRts || state.winner) return;
    const b = building || (state.rtsBuildings || []).find((bld) => bld.team === "blue" && bld.type === "barracks" && bld.hp > 0 && bld.buildTimeRemaining <= 0);
    if (!b) return showToast("Necesitas un Barracón Militar completado");
    const res = enqueueUnit(b, uType, state.teams.blue);
    if (!res.ok) {
      if (res.reason === "insufficient-credits") showToast("Créditos insuficientes ($" + RTS_UNITS[uType].cost + ")");
      else showToast("No se puede reclutar en este momento");
    } else {
      playSound("upgrade");
    }
  },
  onEnqueueVehicle: (uType, building) => {
    if (!state.isRts || state.winner) return;
    const b = building || (state.rtsBuildings || []).find((bld) => bld.team === "blue" && bld.type === "factory" && bld.hp > 0 && bld.buildTimeRemaining <= 0);
    if (!b) return showToast("Necesitas una Fábrica de Blindados completada");
    const res = enqueueUnit(b, uType, state.teams.blue);
    if (!res.ok) {
      if (res.reason === "insufficient-credits") showToast("Créditos insuficientes ($" + RTS_UNITS[uType].cost + ")");
      else showToast("No se puede fabricar en este momento");
    } else {
      playSound("upgrade");
    }
  },
  onCancelQueue: (building, index) => {
    if (!state.isRts || state.winner) return;
    const ok = cancelQueueItem(building, index, state.teams.blue);
    if (ok) {
      playSound("sell");
      showToast("Producción cancelada. Créditos reembolsados.");
    }
  },
  onStartResearch: (techLab, upgradeKey) => {
    if (!state.isRts || state.winner) return;
    const res = startResearch(techLab, upgradeKey, state.teams.blue);
    if (!res.ok) {
      if (res.reason === "insufficient-credits") showToast("Créditos insuficientes para investigar");
      else showToast("No se puede investigar en este momento");
    } else {
      playSound("upgrade");
      showToast("Investigando: " + RTS_RESEARCH_UPGRADES[upgradeKey].name);
    }
  },
  onDeselectBuilding: () => {
    selectedRtsBuilding = null;
  },
});

// Radar canvas setup inside #cnc-radar-mount
const radarMountEl = document.getElementById("cnc-radar-mount");
let radarCanvas = null;
let radarCtx = null;
if (radarMountEl) {
  radarCanvas = document.createElement("canvas");
  radarCanvas.width = 200;
  radarCanvas.height = 200;
  radarMountEl.appendChild(radarCanvas);
  radarCtx = radarCanvas.getContext("2d");

  radarCanvas.addEventListener("pointerdown", (evt) => {
    if (!state.isRts) return;
    const rect = radarCanvas.getBoundingClientRect();
    const rx = evt.clientX - rect.left;
    const ry = evt.clientY - rect.top;
    const worldW = 2048;
    const worldH = 2048;
    const targetX = (rx / 200) * worldW;
    const targetY = (ry / 200) * worldH;
    camera.x = targetX - (CANVAS_WIDTH / zoom) / 2;
    camera.y = targetY - (CANVAS_HEIGHT / zoom) / 2;
    clampCamera(state.level);
  });
}

const skipWaveBtn = document.getElementById("skip-wave-btn");
skipWaveBtn.addEventListener("click", () => {
  if (state.gameOver || state.win || state.levelComplete) return;
  // In an attack's preparation it's «¡Al ataque!» (one against the other,
  // either player's «¡Listo!»).
  if (attacking()) actions.startAttack();
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
pauseBtn.addEventListener("click", async () => {
  if (state.gameOver || state.win || state.levelComplete) return;
  if (!versusGame()) return actions.pause();
  // One against the other, only the side that paused carries on (versus.js).
  const result = await askServer({ type: "pause" });
  if (result.reason === "not-yours") showToast(`Solo ${SIDE_NAMES[net.pausedBy] || "el otro jugador"} puede reanudar la partida`);
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
      body: JSON.stringify({ player: playerId, ...body }),
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
  selectedRtsBuilding = null;
  attackControls.reset();
  autoArmy.reset();
  unitUpgradeType = null;
  // Forces loop()'s "state.level changed" check to re-fire even for the
  // SAME level number (replaying level 3 after a loss, loading another
  // level-3 game) so the camera recenters on the new game.
  lastCameraLevel = null;
  showGameEndOverlay(false);
  gameEndShown = false;

  const isRts = Boolean(state && state.isRts);
  if (cncSidebarEl) cncSidebarEl.classList.toggle("hidden", !isRts);
  if (rtsContextPanelEl) rtsContextPanelEl.classList.add("hidden");
  if (isRts) {
    buildMenuEl.classList.add("hidden");
    attackShopEl.classList.add("hidden");
    unitUpgradeEl.classList.add("hidden");
    skipWaveBtn.classList.add("hidden");
  }
  resizeGame();
}

// A tower (or its range) refused over the army's entries (entryRoads.js).
const ENTRY_ROAD_REFUSED = "Ahí alcanzaría la entrada del ejército: elige un hueco que no esté en rojo";

// Why the home server turned a new game or a load down, for the player.
const GAME_IN_PROGRESS = "Hay una partida uno contra otro en marcha: solo sus dos jugadores pueden cambiarla";

// options (menu.js): { mode: "attack", difficulty } for an attack against
// the computer; { mode: "versus", side, money } for one against the other
// at home -- this tab takes `side`, the other is left for the second player;
// { mode: "rts", submode: "campaign"|"survival" } for RTS mode.
async function startNewGame(level, { mode = "defense", difficulty = "normal", side = "defense", money = "normal", submode = "campaign" } = {}) {
  if (networked) {
    const result = await askServer(mode === "versus" ? { type: "newVersus", level, side, money } : { type: "restart", level });
    if (!result.ok) return showToast(result.reason === "game-in-progress" ? GAME_IN_PROGRESS : "No se ha podido empezar la partida");
  } else {
    if (mode === "rts") {
      state = createRtsState(submode);
      state.level = 3;
      state.onHarvesterSpawned = (harvester, refinery) => {
        if (harvester.team === "blue") {
          playSound("upgrade");
          showToast("¡Cosechadora desplegada automáticamente en la Refinería!");
        }
      };
    } else if (mode === "attack") {
      state = createAttackState(level, difficulty);
    } else {
      state = createGameState(level);
    }
    saveScheduler.reset(state);
    started = true;
    window.__gameState = () => state;
    window.__rtsUI = () => rtsUI;
  }
  enterGame();
}

// One against the other: this tab takes a free side of the game (menu.js's
// «Unirse a la partida»).
async function joinSide(side) {
  const result = await askServer({ type: "join", side });
  if (!result.ok) return showToast("Ese bando ya lo juega otro");
  enterGame();
}

async function loadSlot(slot) {
  if (networked) {
    const result = await askServer({ type: "load", slot });
    if (!result.ok) return showToast(result.reason === "game-in-progress" ? GAME_IN_PROGRESS : "No se puede cargar esta partida");
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
    const later = attacking() ? "Se guardará al empezar la ronda siguiente" : "Se guardará al terminar la oleada";
    if (!result.ok) showToast("No se ha podido guardar");
    else showToast(result.queued ? later : `Partida guardada en el hueco ${slot}`);
    return;
  }
  const result = saveScheduler.request(slot, state);
  const later = attacking() ? "Se guardará al empezar la ronda siguiente" : "Se guardará al terminar la oleada";
  showToast(result.done ? savedMessage(slot, result.result) : later);
}

// The pause menu pauses a solo game while it's open, and leaves it as it
// was on closing (paused with ⏸ beforehand: still paused). One against the
// other it pauses the game for both, and closing it carries on if the pause
// was this player's (versus.js). In co-op it pauses nobody -- the shared ⏸
// is for that.
let pausedBeforeMenu = false;
function openPauseMenu() {
  if (menu.isOpen() || gameEndShown) return;
  if (!networked) {
    if (!started) return;
    pausedBeforeMenu = state.paused;
    state.paused = true;
  } else if (versusGame() && net.you) {
    pausedBeforeMenu = state.paused;
    postAction({ type: "pause", on: true });
  }
  menu.openPause();
}

// After a finished game ("Jugar de nuevo", or R): pick how to play the next.
function backToNewGame() {
  showGameEndOverlay(false);
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
  onJoin: joinSide,
  onLoad: loadSlot,
  onSave: saveToSlot,
  onRecords: openStatsModal,
  onQuitToMain: () => {
    if (!networked) started = false;
    if (cncSidebarEl) cncSidebarEl.classList.add("hidden");
    if (rtsContextPanelEl) rtsContextPanelEl.classList.add("hidden");
    resizeGame();
    menu.openMain();
  },
  onResume: () => {
    if (!networked) state.paused = pausedBeforeMenu;
    else if (versusGame() && net.you && !pausedBeforeMenu) postAction({ type: "pause", on: false });
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
// The end screen, with the board's panels out of its way (style.css).
function showGameEndOverlay(visible) {
  gameEndOverlay.classList.toggle("hidden", !visible);
  document.body.classList.toggle("gameend-open", visible);
}

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
  gameEndRematchBtn.classList.add("hidden");
  if (state.isRts) {
    const isWin = state.winner === "blue" || state.winner === "victory";
    const sub = state.rtsSubmode === "survival" ? "Supervivencia" : "Campaña";
    const title = isWin ? "¡VICTORIA TÁCTICA!" : "BASE DESTRUIDA - DERROTA";
    const subtitle = isWin
      ? (state.rtsSubmode === "survival" ? "Has repelido las 20 oleadas y defendido la base con éxito." : "Has aniquilado la base y tropas enemigas.")
      : "Tu base o unidades han sido destruidas.";
    const blueUnits = state.rtsUnits.filter((u) => u.team === "blue").length;
    const blueBlds = state.rtsBuildings.filter((b) => b.team === "blue").length;
    renderAttackEndScreen(gameEndOverlay, {
      title,
      subtitle,
      rows: [
        ["Modo de juego", `RTS (${sub})`],
        ["Créditos finales", `$${state.teams.blue ? state.teams.blue.credits : 0}`],
        ["Edificios en pie", `${blueBlds}`],
        ["Unidades activas", `${blueUnits}`],
        ...(state.rtsSubmode === "survival" ? [["Oleada alcanzada", `${state.survivalWave} / ${state.maxSurvivalWaves}`]] : []),
      ],
    });
    gameEndCloseBtn.textContent = "Volver al Menú";
    showGameEndOverlay(true);
    return;
  }
  if (attacking()) {
    // An attack's end: who won and how it went -- no score or ranking. One
    // against the other, each player reads their own result and may ask
    // for the rematch.
    renderAttackEndScreen(gameEndOverlay, attackSummary(state, mySide() || "attack"));
    const rematch = versusGame() && Boolean(net.you);
    gameEndRematchBtn.classList.toggle("hidden", !rematch);
    gameEndCloseBtn.textContent = rematch ? "Menú principal" : "Jugar de nuevo";
    showGameEndOverlay(true);
    return;
  }
  currentMatchScore = renderGameEndScreen(gameEndOverlay, state);
  const interim = state.levelComplete;
  gameEndCloseBtn.textContent = interim ? `Continuar al Nivel ${state.level + 1} ▶` : "Jugar de nuevo";
  showGameEndOverlay(true);
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

// «Revancha»: the server starts the same map again with the sides swapped
// (host.js); the end screen goes when the new game's snapshot arrives.
const gameEndRematchBtn = document.getElementById("gameend-rematch-btn");
gameEndRematchBtn.addEventListener("click", async () => {
  const result = await askServer({ type: "rematch" });
  if (!result.ok) showToast("No se ha podido empezar la revancha");
});

gameEndCloseBtn.addEventListener("click", () => {
  if (state.levelComplete) {
    showGameEndOverlay(false);
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
    showGameEndOverlay(false);
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

  if (state.isRts) {
    if (state.winner) return;

    // 1. Placing building or wall
    if (selectedBuildType) {
      const def = RTS_BUILDINGS[selectedBuildType];
      if (!def) {
        selectedBuildType = null;
        return;
      }
      const canBuild = canBuildAtLocation(pos.x, pos.y, selectedBuildType, state.rtsBuildings, state.teams.blue.hq, "blue");
      if (!canBuild) {
        playSound("error");
        showToast("Demasiado lejos de la base (construye cerca de tus edificios)");
        return;
      }
      if (state.teams.blue.credits < def.cost) {
        playSound("error");
        showToast("Créditos insuficientes ($" + def.cost + ")");
        return;
      }
      state.teams.blue.credits -= def.cost;
      const bld = createRtsBuilding(selectedBuildType, pos.x, pos.y, "blue", state.nextId++);
      state.rtsBuildings.push(bld);
      playSound("upgrade");
      showToast(def.name + (def.buildDuration === 0 ? " colocado" : " en construcción"));
      if (selectedBuildType !== "wall") selectedBuildType = null;
      rtsUI.refreshSidebar();
      return;
    }

    // 2. Check MCV double click or click
    const clickedMcv = state.rtsUnits.find((u) => u.team === "blue" && u.type === "mcv" && Math.hypot(u.x - pos.x, u.y - pos.y) <= 45);
    if (clickedMcv) {
      deployMcv(clickedMcv, state);
      playSound("upgrade");
      showToast("¡Desplegando Centro de Mando!");
      return;
    }

    // 3. Clicked on friendly building -> open building contextual panel!
    const clickedBld = state.rtsBuildings.find((b) => b.team === "blue" && Math.hypot(b.x - pos.x, b.y - pos.y) <= (b.footprint || 45));
    if (clickedBld) {
      selectedRtsBuilding = clickedBld;
      rtsUI.openBuildingContext(clickedBld, state);
      for (const u of state.rtsUnits) u.selected = false;
      playSound("click");
      return;
    }

    // 4. Clicked on friendly unit -> select unit!
    const clickedFriendlyUnit = state.rtsUnits.find((u) => u.team === "blue" && Math.hypot(u.x - pos.x, u.y - pos.y) <= 32);
    if (clickedFriendlyUnit) {
      selectedRtsBuilding = null;
      rtsUI.closeBuildingContext();
      for (const u of state.rtsUnits) {
        if (u.team === "blue") u.selected = false;
      }
      clickedFriendlyUnit.selected = true;
      playSound("click");
      showToast(RTS_UNITS[clickedFriendlyUnit.type].name + " seleccionado");
      return;
    }

    // 5. If we have friendly units selected, issue orders:
    const selectedBlueUnits = state.rtsUnits.filter((u) => u.team === "blue" && u.selected);
    if (selectedBlueUnits.length > 0) {
      // Check if clicked on enemy unit or enemy building -> attack order!
      const clickedEnemy = state.rtsUnits.find((u) => u.team !== "blue" && Math.hypot(u.x - pos.x, u.y - pos.y) <= 35) ||
                           state.rtsBuildings.find((b) => b.team !== "blue" && Math.hypot(b.x - pos.x, b.y - pos.y) <= (b.footprint || 45));
      if (clickedEnemy) {
        for (const u of selectedBlueUnits) {
          if (u.damage > 0) {
            u.targetEnemyId = clickedEnemy.id;
            u.targetX = undefined;
            u.targetY = undefined;
            u.state = "ATTACKING";
          }
        }
        playSound("click");
        showToast("¡Atacando objetivo!");
        return;
      }

      // Check if clicked on mineral field -> order harvesters!
      const clickedField = state.mineralFields && state.mineralFields.find((f) => Math.hypot(f.x - pos.x, f.y - pos.y) <= f.radius);
      if (clickedField) {
        let sentHarvester = false;
        for (const u of selectedBlueUnits) {
          if (u.type === "harvester") {
            u.targetFieldId = clickedField.id;
            u.state = "TO_FIELD";
            sentHarvester = true;
          }
        }
        if (sentHarvester) {
          playSound("click");
          showToast("Cosechadora enviada a " + clickedField.name);
          return;
        }
      }

      // Ground click -> Move selected units with tactical formation spread!
      const N = selectedBlueUnits.length;
      for (let i = 0; i < N; i++) {
        const u = selectedBlueUnits[i];
        const ox = (i % 4 - 1.5) * 26;
        const oy = (Math.floor(i / 4) - 0.5) * 26;
        u.targetX = pos.x + ox;
        u.targetY = pos.y + oy;
        u.targetEnemyId = null;
        u.state = "MOVING";
      }
      playSound("click");
      return;
    }

    // 6. Clicked elsewhere -> close contextual panel and deselect
    selectedRtsBuilding = null;
    rtsUI.closeBuildingContext();
    for (const u of state.rtsUnits) u.selected = false;
    return;
  }

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
      if (check.reason === "entry-road") showToast(ENTRY_ROAD_REFUSED);
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
  // On the home network the army's orders go to the server; solo, the
  // controls carry them out themselves.
  get orders() {
    return networked ? networkOrders : null;
  },
});

// The pointer's look over an attack's map: a hand over a unit a click
// would pick, a crosshair where a click would attack or go into the base.
let mapCursor = "";
function updateMapCursor() {
  const look = commanding() && started && !state.gameOver && !menu.isOpen() ? attackControls.hoverOrder() : null;
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
  return commanding() && resolveControls(settings.controls, browserControlsEnv()) === "touch";
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
  if (commanding()) {
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
    if (state.isRts) {
      selectedRtsBuilding = null;
      rtsUI.closeBuildingContext();
      for (const u of state.rtsUnits) u.selected = false;
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
  if (commanding() && !minimapDragging) {
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
  if (commanding()) {
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
    } else if (!menu.isOpen() && commanding() && attackControls.escape()) {
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
  if (commanding()) {
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

function drawRtsRoundRect(c, x, y, w, h, r) {
  if (typeof c.roundRect === "function") {
    c.beginPath();
    c.roundRect(x, y, w, h, r);
  } else {
    c.beginPath();
    c.rect(x, y, w, h);
  }
}

function drawMineralField(field, now) {
  const pct = Math.max(0, Math.min(1, field.reserves / field.maxReserves));
  ctx.save();

  // 1. Ambient Ley-line Energy Aura on Ground
  const pulse = Math.sin(now / 450) * 0.12 + 0.88;
  const grad = ctx.createRadialGradient(field.x, field.y, field.radius * 0.05, field.x, field.y, field.radius);
  grad.addColorStop(0, `rgba(245, 158, 11, ${0.45 * pulse})`);
  grad.addColorStop(0.4, `rgba(217, 119, 6, ${0.25 * pulse})`);
  grad.addColorStop(0.75, `rgba(56, 189, 248, ${0.08 * pulse})`);
  grad.addColorStop(1, "rgba(217, 119, 6, 0)");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(field.x, field.y, field.radius, 0, Math.PI * 2);
  ctx.fill();

  // 2. Luminous Subterranean Energy Veins / Fractures
  const veinCount = 6;
  ctx.save();
  ctx.lineWidth = 2;
  ctx.strokeStyle = `rgba(251, 191, 36, ${0.35 * pulse})`;
  for (let v = 0; v < veinCount; v++) {
    const vAngle = (v * (Math.PI * 2 / veinCount)) + 0.3;
    const vLen = field.radius * (0.6 + ((v * 17) % 30) * 0.01);
    ctx.beginPath();
    ctx.moveTo(field.x, field.y);
    const midX = field.x + Math.cos(vAngle - 0.2) * (vLen * 0.5);
    const midY = field.y + Math.sin(vAngle - 0.2) * (vLen * 0.5);
    const endX = field.x + Math.cos(vAngle) * vLen;
    const endY = field.y + Math.sin(vAngle) * vLen;
    ctx.quadraticCurveTo(midX, midY, endX, endY);
    ctx.stroke();
  }
  ctx.restore();

  // 3. Multi-Faceted 3D Isometric Crystal Spires
  // Determine crystal clusters based on reserves percentage
  const clusterCount = Math.max(4, Math.round(5 + pct * 11));
  for (let i = 0; i < clusterCount; i++) {
    // Deterministic distribution seeded by field ID and index
    const angle = (i * 2.399963) + (field.id === "ore_center" ? 0.4 : 1.15);
    const dist = (field.radius * 0.15) + ((i * 47) % Math.round(field.radius * 0.68));
    const cx = field.x + Math.cos(angle) * dist;
    const cy = field.y + Math.sin(angle) * dist;
    const baseH = (14 + (i % 5) * 5) * (0.65 + pct * 0.35); // Height grows with reserves
    const baseW = (6 + (i % 3) * 2.5);
    const isCyanSpire = i % 3 === 2; // Mixed rare cyan Tiberium crystals with amber
    const shimmer = Math.sin(now / 350 + i * 1.7) * 0.25 + 0.75;

    ctx.save();
    ctx.translate(cx, cy);

    // 3a. Cast Ground Shadow (projected to the bottom-right in isometric perspective)
    ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
    ctx.beginPath();
    ctx.moveTo(-baseW * 0.6, 0);
    ctx.lineTo(baseH * 0.65, baseH * 0.32);
    ctx.lineTo(baseH * 0.75 + baseW * 0.3, baseH * 0.36);
    ctx.lineTo(baseW * 0.6, 0);
    ctx.closePath();
    ctx.fill();

    // 3b. Ground Occlusion Base
    ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
    ctx.beginPath();
    ctx.ellipse(0, 0, baseW * 0.9, baseW * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();

    // 3c. Left Facet (Ambient / Shadowed face)
    ctx.beginPath();
    ctx.moveTo(0, -baseH);
    ctx.lineTo(-baseW * 0.7, -baseH * 0.15);
    ctx.lineTo(0, baseW * 0.25);
    ctx.closePath();
    ctx.fillStyle = isCyanSpire
      ? `rgba(3, 105, 161, ${shimmer})`
      : `rgba(180, 83, 9, ${shimmer})`;
    ctx.fill();

    // 3d. Right Facet (Sunlit face - brightly illuminated)
    ctx.beginPath();
    ctx.moveTo(0, -baseH);
    ctx.lineTo(0, baseW * 0.25);
    ctx.lineTo(baseW * 0.75, -baseH * 0.12);
    ctx.closePath();
    ctx.fillStyle = isCyanSpire
      ? `rgba(56, 189, 248, ${shimmer})`
      : `rgba(251, 191, 36, ${shimmer})`;
    ctx.fill();

    // 3e. Center Specular Ridge Line & Apex Glint
    ctx.strokeStyle = isCyanSpire ? "#e0f2fe" : "#fef08a";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(0, -baseH);
    ctx.lineTo(0, baseW * 0.25);
    ctx.stroke();

    // 3f. Occasional Apex Light Glint (twinkling star)
    if (Math.sin(now / 200 + i * 2.3) > 0.85) {
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(0, -baseH, 2, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  // 4. Floating Luminous Ion Particles
  const partCount = 8;
  for (let p = 0; p < partCount; p++) {
    const pSeed = (p * 53) % 100;
    const pAge = ((now * 0.05 + pSeed * 10) % 100) / 100; // 0 to 1
    const pAng = (p * 1.25) + (pAge * 0.4);
    const pDist = (field.radius * 0.1) + ((p * 29) % Math.round(field.radius * 0.6));
    const px = field.x + Math.cos(pAng) * pDist;
    const py = field.y + Math.sin(pAng) * pDist - (pAge * 28);
    const pAlpha = Math.sin(pAge * Math.PI) * 0.7;
    ctx.fillStyle = p % 2 === 0 ? `rgba(251, 191, 36, ${pAlpha})` : `rgba(56, 189, 248, ${pAlpha})`;
    ctx.beginPath();
    ctx.arc(px, py, 1.8, 0, Math.PI * 2);
    ctx.fill();
  }

  // 5. Tactical Command & Conquer Holographic Badge
  ctx.save();
  const labelY = field.y - field.radius - 14;
  const labelText = `${field.name}: ${Math.round(field.reserves)} kg`;
  ctx.font = "bold 12px 'Trebuchet MS', sans-serif";
  const tw = ctx.measureText(labelText).width;
  ctx.fillStyle = "rgba(10, 15, 20, 0.88)";
  ctx.strokeStyle = pct > 0.25 ? "#f59e0b" : "#ef4444";
  ctx.lineWidth = 1.5;
  drawRtsRoundRect(ctx, field.x - tw / 2 - 8, labelY - 14, tw + 16, 20, 4);
  ctx.fill();
  ctx.stroke();

  // Small reserve bar
  ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
  ctx.fillRect(field.x - tw / 2 - 4, labelY + 7, tw + 8, 4);
  ctx.fillStyle = pct > 0.3 ? "#f59e0b" : "#ef4444";
  ctx.fillRect(field.x - tw / 2 - 4, labelY + 7, (tw + 8) * pct, 4);

  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(labelText, field.x, labelY - 3);
  ctx.restore();

  ctx.restore();
}

function drawRtsSelectionBrackets(c, r) {
  c.save();
  c.strokeStyle = "#38bdf8";
  c.lineWidth = 2.5;
  const arm = r * 0.35;
  // Top-left
  c.beginPath();
  c.moveTo(-r, -r + arm);
  c.lineTo(-r, -r);
  c.lineTo(-r + arm, -r);
  c.stroke();
  // Top-right
  c.beginPath();
  c.moveTo(r - arm, -r);
  c.lineTo(r, -r);
  c.lineTo(r, -r + arm);
  c.stroke();
  // Bottom-left
  c.beginPath();
  c.moveTo(-r, r - arm);
  c.lineTo(-r, r);
  c.lineTo(-r + arm, r);
  c.stroke();
  // Bottom-right
  c.beginPath();
  c.moveTo(r - arm, r);
  c.lineTo(r, r);
  c.lineTo(r, r - arm);
  c.stroke();
  c.restore();
}

function drawWeldingSparks(c, x, y, time) {
  c.save();
  const pulse = Math.sin(time / 45);
  if (pulse > -0.2) {
    const grad = c.createRadialGradient(x, y, 1, x, y, 14);
    grad.addColorStop(0, "rgba(255, 255, 255, 0.95)");
    grad.addColorStop(0.35, "rgba(56, 189, 248, 0.85)");
    grad.addColorStop(1, "rgba(56, 189, 248, 0)");
    c.fillStyle = grad;
    c.beginPath();
    c.arc(x, y, 14, 0, Math.PI * 2);
    c.fill();

    for (let i = 0; i < 4; i++) {
      const angle = (time * 0.015 + i * 1.57) % (Math.PI * 2);
      const dist = 4 + ((time * 0.08 + i * 9) % 18);
      const sx = x + Math.cos(angle) * dist;
      const sy = y + Math.sin(angle) * dist + dist * 0.25;
      c.fillStyle = i % 2 === 0 ? "#fef08a" : "#67e8f9";
      c.fillRect(sx - 1, sy - 1, 2, 2);
    }
  }
  c.restore();
}

function drawRtsBuildProgressBar(c, x, y, prog, label) {
  const barW = 76;
  const barH = 7;
  c.save();
  // Outer frame
  c.fillStyle = "rgba(10, 15, 20, 0.92)";
  c.fillRect(x - barW / 2 - 2, y - 2, barW + 4, barH + 4);
  c.strokeStyle = "#38bdf8";
  c.lineWidth = 1;
  c.strokeRect(x - barW / 2 - 2, y - 2, barW + 4, barH + 4);

  // Background slot
  c.fillStyle = "#0f172a";
  c.fillRect(x - barW / 2, y, barW, barH);

  // Cyan progress gradient
  const grad = c.createLinearGradient(x - barW / 2, y, x + barW / 2, y);
  grad.addColorStop(0, "#0284c7");
  grad.addColorStop(0.6, "#38bdf8");
  grad.addColorStop(1, "#7dd3fc");
  c.fillStyle = grad;
  c.fillRect(x - barW / 2, y, barW * Math.max(0, Math.min(1, prog)), barH);

  // Text
  c.fillStyle = "#f8fafc";
  c.font = "bold 9px monospace";
  c.textAlign = "center";
  c.shadowColor = "#000";
  c.shadowBlur = 4;
  c.fillText(`${Math.round(prog * 100)}%`, x, y - 3);
  c.restore();
}

function drawRtsBuilding(b, now) {
  const isSelected = selectedRtsBuilding && selectedRtsBuilding.id === b.id;
  const fp = b.footprint || 45;
  const def = RTS_BUILDINGS[b.type] || {};

  ctx.save();
  ctx.translate(b.x, b.y);

  // 1. Team foundation outline / shadow
  ctx.save();
  ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
  ctx.beginPath();
  ctx.ellipse(3, 5, fp * 0.75, fp * 0.55, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = b.team === "blue" ? "rgba(56, 189, 248, 0.6)" : "rgba(239, 68, 68, 0.6)";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.ellipse(0, 0, fp * 0.7, fp * 0.5, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  // 2. Building Body
  const imgKey = `bld_${b.type}`;
  const img = sprites[imgKey] || sprites[b.type] || (def.sprite ? sprites[def.sprite] : null);

  if (b.buildTimeRemaining > 0) {
    const totalTime = b.totalBuildTime || def.buildDuration || 4.0;
    const prog = Math.max(0, Math.min(0.999, 1 - (b.buildTimeRemaining / totalTime)));

    if (b.type.startsWith("turret_")) {
      // 48-frame turret construction animation
      const tType = b.type.replace("turret_", "");
      const sheet = sprites[`tower_${tType}_build`];
      const finished = sprites[b.type];
      const s = fp * 1.5;
      if (sheet && ready(sheet)) {
        const frameIndex = Math.min(BUILD_ANIM_FRAME_COUNT - 1, Math.floor(prog * BUILD_ANIM_FRAME_COUNT));
        const col = frameIndex % BUILD_ANIM_COLS;
        const row = Math.floor(frameIndex / BUILD_ANIM_COLS);
        const fw = sheet.naturalWidth / BUILD_ANIM_COLS;
        const fh = sheet.naturalHeight / BUILD_ANIM_ROWS;
        ctx.drawImage(sheet, col * fw, row * fh, fw, fh, -s / 2, -s / 2, s, s);
      } else if (ready(finished)) {
        ctx.globalAlpha = 0.35 + prog * 0.65;
        ctx.drawImage(finished, -s / 2, -s / 2, s, s);
      }
      if (prog > 0.1 && prog < 0.95) {
        drawWeldingSparks(ctx, 0, -fp * 0.2, now);
      }
    } else {
      // 4-Phase military building construction animation (2x2 sheet)
      const sheet = sprites[`bld_${b.type}_build`] || sprites[`building_${b.type}_build`];
      const finished = sprites[`bld_${b.type}`] || sprites[b.type] || (def.sprite ? sprites[def.sprite] : null);
      const sz = fp * 1.65;
      const frame = constructionFrame(prog);

      ctx.save();
      const drawPhase = (phase, alpha) => {
        if (alpha <= 0) return;
        ctx.globalAlpha = alpha;
        if (phase < 4 && sheet && ready(sheet)) {
          const cw = sheet.naturalWidth / 2;
          const ch = sheet.naturalHeight / 2;
          const sx = (phase % 2) * cw;
          const sy = Math.floor(phase / 2) * ch;
          ctx.drawImage(sheet, sx, sy, cw, ch, -sz / 2, -sz / 2, sz, sz);
        } else if (ready(finished)) {
          ctx.drawImage(finished, -sz / 2, -sz / 2, sz, sz);
        }
      };

      drawPhase(frame.from, 1);
      if (frame.to !== frame.from) drawPhase(frame.to, frame.mix);

      // Active construction effects: holographic grid + sparks
      ctx.strokeStyle = "rgba(56, 189, 248, 0.75)";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(-fp * 0.7, -fp * 0.7, fp * 1.4, fp * 1.4);

      if (prog > 0.1 && prog < 0.95) {
        drawWeldingSparks(ctx, -sz * 0.18, -sz * 0.1, now);
        drawWeldingSparks(ctx, sz * 0.18, sz * 0.05, now + 90);
      }
      ctx.restore();
    }

    // Tactical C&C Progress Bar
    drawRtsBuildProgressBar(ctx, 0, -fp * 0.85 - 14, prog, def.name);
  } else {
    // Finished building:
    if (b.type === "wall") {
      const sz = 32;
      if (ready(sprites.bld_wall)) {
        ctx.drawImage(sprites.bld_wall, -sz / 2, -sz / 2, sz, sz);
      } else {
        ctx.fillStyle = "#64748b";
        ctx.fillRect(-sz / 2, -sz / 2, sz, sz);
        ctx.strokeStyle = "#334155";
        ctx.lineWidth = 2;
        ctx.strokeRect(-sz / 2, -sz / 2, sz, sz);
      }
    } else if (b.type.startsWith("turret_")) {
      const sz = fp * 1.35;
      const turretImg = sprites[b.type];
      if (ready(turretImg)) {
        ctx.save();
        ctx.rotate(b.turretAngle || 0);
        ctx.drawImage(turretImg, -sz / 2, -sz / 2, sz, sz);
        ctx.restore();
      } else {
        ctx.fillStyle = b.team === "blue" ? "#1e3a8a" : "#7f1d1d";
        ctx.beginPath();
        ctx.arc(0, 0, fp * 0.45, 0, Math.PI * 2);
        ctx.fill();
        ctx.save();
        ctx.rotate(b.turretAngle || 0);
        ctx.fillStyle = "#94a3b8";
        ctx.fillRect(0, -3, fp * 0.6, 6);
        ctx.restore();
      }
      if (b.type === "turret_laser" && calculatePowerGrid(state.rtsBuildings, b.team).isLowPower) {
        ctx.fillStyle = "#ef4444";
        ctx.font = "bold 11px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("⚡ OFF", 0, -fp * 0.6);
      }
    } else {
      const sz = fp * 1.5;
      if (ready(img)) {
        ctx.drawImage(img, -sz / 2, -sz / 2, sz, sz);
      } else {
        ctx.fillStyle = b.team === "blue" ? "#1e293b" : "#450a0a";
        ctx.fillRect(-sz / 2, -sz / 2, sz, sz);
        ctx.strokeStyle = b.team === "blue" ? "#38bdf8" : "#f87171";
        ctx.lineWidth = 2;
        ctx.strokeRect(-sz / 2, -sz / 2, sz, sz);
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 11px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(def.name || b.type, 0, 4);
      }
    }
  }

  // 3. Health bar
  const barW = Math.max(40, fp * 1.1);
  const barH = 5;
  const barY = -fp * 0.85 - 6;
  const hpPct = Math.max(0, Math.min(1, b.hp / b.maxHp));
  ctx.fillStyle = "rgba(0, 0, 0, 0.8)";
  ctx.fillRect(-barW / 2 - 1, barY - 1, barW + 2, barH + 2);
  ctx.fillStyle = b.team === "blue" ? "#22c55e" : "#ef4444";
  ctx.fillRect(-barW / 2, barY, barW * hpPct, barH);

  // 4. Production Queue or Research active badge
  if (b.queue && (b.queue.current || (b.queue.pending && b.queue.pending.length > 0))) {
    const qCount = (b.queue.current ? 1 : 0) + (b.queue.pending ? b.queue.pending.length : 0);
    const qPct = b.queue.current ? (b.queue.current.progress / b.queue.current.totalTime) : 0;
    ctx.save();
    ctx.fillStyle = "rgba(15, 23, 42, 0.9)";
    ctx.strokeStyle = "#38bdf8";
    ctx.lineWidth = 1;
    drawRtsRoundRect(ctx, -25, barY - 16, 50, 14, 3);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#38bdf8";
    ctx.fillRect(-23, barY - 5, 46 * Math.max(0, Math.min(1, qPct)), 2);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 9px monospace";
    ctx.textAlign = "center";
    ctx.fillText(`COLA x${qCount}`, 0, barY - 7);
    ctx.restore();
  } else if (b.research) {
    const rPct = b.research.progress / b.research.totalTime;
    ctx.save();
    ctx.fillStyle = "rgba(15, 23, 42, 0.9)";
    ctx.strokeStyle = "#a855f7";
    ctx.lineWidth = 1;
    drawRtsRoundRect(ctx, -25, barY - 16, 50, 14, 3);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#a855f7";
    ctx.fillRect(-23, barY - 5, 46 * Math.max(0, Math.min(1, rPct)), 2);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 9px monospace";
    ctx.textAlign = "center";
    ctx.fillText(`I+D ${Math.round(rPct * 100)}%`, 0, barY - 7);
    ctx.restore();
  }

  // 5. Selection brackets if selected
  if (isSelected) {
    drawRtsSelectionBrackets(ctx, fp * 0.85);
  }

  ctx.restore();
}

function drawRtsUnit(u, now) {
  // 0. MCV Active Deployment Animation (4 Phases from bld_hq_build.jpg)
  if (u.type === "mcv" && u.isDeploying) {
    const prog = Math.max(0, Math.min(0.999, (u.deployProgress || 0) / (u.deployDuration || 3.5)));
    const sheet = sprites.bld_hq_build;
    const finished = sprites.bld_hq;
    const sz = 110;
    const frame = constructionFrame(prog);

    ctx.save();
    ctx.translate(u.x, u.y);

    // Foundation shadow
    ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
    ctx.beginPath();
    ctx.ellipse(0, 10, sz * 0.45, sz * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();

    const drawHqPhase = (phase, alpha) => {
      if (alpha <= 0) return;
      ctx.globalAlpha = alpha;
      if (phase < 4 && sheet && ready(sheet)) {
        const cw = sheet.naturalWidth / 2;
        const ch = sheet.naturalHeight / 2;
        const sx = (phase % 2) * cw;
        const sy = Math.floor(phase / 2) * ch;
        ctx.drawImage(sheet, sx, sy, cw, ch, -sz / 2, -sz / 2, sz, sz);
      } else if (ready(finished)) {
        ctx.drawImage(finished, -sz / 2, -sz / 2, sz, sz);
      }
    };

    drawHqPhase(frame.from, 1);
    if (frame.to !== frame.from) drawHqPhase(frame.to, frame.mix);

    // Welding sparks and deploy holographic beacon
    if (prog > 0.2 && prog < 0.95) {
      drawWeldingSparks(ctx, -sz * 0.12, -sz * 0.18, now);
      drawWeldingSparks(ctx, sz * 0.16, sz * 0.05, now + 80);
    }

    ctx.strokeStyle = "rgba(56, 189, 248, 0.8)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(-sz * 0.45, -sz * 0.45, sz * 0.9, sz * 0.9);
    ctx.restore();

    drawRtsBuildProgressBar(ctx, u.x, u.y - sz * 0.5 - 14, prog, "DESPLEGANDO BASE");
    return;
  }

  const isSelected = Boolean(u.selected);
  const img = unitSprite(u.type);
  const sizeDef = ENEMY_DRAW_SIZES[u.type] || { h: 28, shadowRx: 20, shadowRy: 12 };
  const h = sizeDef.h || 32;
  const w = ready(img) ? h * (img.naturalWidth / img.naturalHeight) : h * 1.4;

  ctx.save();
  ctx.translate(u.x, u.y);

  // 1. Team ground halo
  ctx.save();
  ctx.fillStyle = u.team === "blue" ? "rgba(59, 130, 246, 0.28)" : "rgba(239, 68, 68, 0.28)";
  ctx.beginPath();
  ctx.ellipse(0, 0, w * 0.65, h * 0.65, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // 2. Unit Sprite (rotated by u.angle)
  ctx.save();
  ctx.rotate(u.angle || 0);

  // Shadow
  ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
  ctx.beginPath();
  ctx.ellipse(2, 3, sizeDef.shadowRx || 16, sizeDef.shadowRy || 10, 0, 0, Math.PI * 2);
  ctx.fill();

  if (ready(img)) {
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
  } else {
    ctx.fillStyle = u.team === "blue" ? "#3b82f6" : "#ef4444";
    ctx.beginPath();
    ctx.arc(0, 0, h / 2, 0, Math.PI * 2);
    ctx.fill();
  }

  // Harvester Local Specialized Visuals (Rotated with vehicle)
  if (u.type === "harvester") {
    const loadPct = Math.max(0, Math.min(1, (u.load || u.cargo || 0) / (u.capacity || 300)));

    // 2a. Rear Cargo Hopper with Physical Glowing Tiberium/Ore Crystals
    if (loadPct > 0) {
      const hopX = -w * 0.32;
      const hopW = w * 0.38;
      const hopH = h * 0.55;
      ctx.fillStyle = "rgba(10, 15, 20, 0.9)";
      ctx.fillRect(hopX - hopW / 2, -hopH / 2, hopW, hopH);
      ctx.strokeStyle = loadPct >= 0.95 ? "#f59e0b" : "#0284c7";
      ctx.lineWidth = 1;
      ctx.strokeRect(hopX - hopW / 2, -hopH / 2, hopW, hopH);

      // Filled crystal ore inside hopper
      const fillW = hopW * loadPct;
      const oreGrad = ctx.createLinearGradient(hopX - hopW / 2, 0, hopX - hopW / 2 + fillW, 0);
      oreGrad.addColorStop(0, "#d97706");
      oreGrad.addColorStop(0.7, "#fbbf24");
      oreGrad.addColorStop(1, "#fef08a");
      ctx.fillStyle = oreGrad;
      ctx.fillRect(hopX - hopW / 2 + 1, -hopH / 2 + 1, fillW - 2, hopH - 2);

      // Shimmer lines across loaded ore
      ctx.strokeStyle = "rgba(255, 255, 255, 0.6)";
      ctx.lineWidth = 1;
      for (let s = 0; s < Math.floor(loadPct * 4); s++) {
        const sx = hopX - hopW / 2 + 3 + s * 6;
        ctx.beginPath();
        ctx.moveTo(sx, -hopH * 0.35);
        ctx.lineTo(sx + 3, hopH * 0.35);
        ctx.stroke();
      }
    }

    // 2b. Active Dual Mining Cutting Lasers (state: HARVESTING)
    if (u.state === "HARVESTING") {
      const targetDist = 38 + Math.sin(now / 110) * 3;
      const jitterY = Math.cos(now / 90) * 4;
      const hitX = w * 0.45 + targetDist;
      const hitY = jitterY;

      // Dual laser emitters at harvester front mandibles
      const emitters = [-6, 6];
      emitters.forEach((ey) => {
        // Outer glow
        ctx.save();
        ctx.strokeStyle = "rgba(56, 189, 248, 0.4)";
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(w * 0.4, ey);
        ctx.lineTo(hitX, hitY);
        ctx.stroke();

        // Inner piercing cutting beam
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(w * 0.4, ey);
        ctx.lineTo(hitX, hitY);
        ctx.stroke();

        // Amber plasma harmonic beam
        ctx.strokeStyle = "rgba(251, 191, 36, 0.75)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(w * 0.4, ey);
        ctx.lineTo(hitX, hitY);
        ctx.stroke();
        ctx.restore();
      });

      // Impact cutting flare
      ctx.save();
      const flareGrad = ctx.createRadialGradient(hitX, hitY, 1, hitX, hitY, 14);
      flareGrad.addColorStop(0, "rgba(255, 255, 255, 1)");
      flareGrad.addColorStop(0.3, "rgba(56, 189, 248, 0.9)");
      flareGrad.addColorStop(0.7, "rgba(245, 158, 11, 0.6)");
      flareGrad.addColorStop(1, "rgba(245, 158, 11, 0)");
      ctx.fillStyle = flareGrad;
      ctx.beginPath();
      ctx.arc(hitX, hitY, 14, 0, Math.PI * 2);
      ctx.fill();

      // Welding & crystal sparks flying off rock
      drawWeldingSparks(ctx, hitX, hitY, now);

      // Ore suction drift particles towards harvester intake
      for (let p = 0; p < 4; p++) {
        const pProg = ((now * 0.08 + p * 25) % 100) / 100; // 0 (rock) to 1 (harvester)
        const px = hitX - (targetDist * pProg);
        const py = hitY * (1 - pProg) + (Math.sin(now / 100 + p) * 3);
        ctx.fillStyle = p % 2 === 0 ? "#fbbf24" : "#38bdf8";
        ctx.beginPath();
        ctx.arc(px, py, 1.4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // 2c. Unloading Magnetic Conduit (state: UNLOADING)
    if (u.state === "UNLOADING") {
      ctx.save();
      // Glowing discharge arcs from rear hopper
      const pulse = Math.sin(now / 120) * 0.3 + 0.7;
      ctx.strokeStyle = `rgba(251, 191, 36, ${pulse})`;
      ctx.lineWidth = 2.5;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(-w * 0.35, 0);
      ctx.lineTo(-w * 0.85, 0);
      ctx.stroke();
      drawWeldingSparks(ctx, -w * 0.45, 0, now);
      ctx.restore();
    }
  }
  ctx.restore();

  // 3. Selection ring / brackets if selected
  if (isSelected) {
    ctx.save();
    ctx.strokeStyle = "#38bdf8";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, Math.max(w, h) * 0.75, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // 5. Harvester Tactical Cargo Badge
  if (u.type === "harvester") {
    const cargoVal = Math.round(u.load || u.cargo || 0);
    const cap = u.capacity || 300;
    const loadPct = Math.max(0, Math.min(1, cargoVal / cap));
    const cBarW = 34;
    const cBarH = 5;
    const cBarY = -h * 0.65 - 13;

    ctx.save();
    ctx.fillStyle = "rgba(10, 15, 20, 0.9)";
    ctx.fillRect(-cBarW / 2 - 1, cBarY - 1, cBarW + 2, cBarH + 2);
    ctx.strokeStyle = loadPct >= 0.9 ? "#f59e0b" : "#0284c7";
    ctx.lineWidth = 0.8;
    ctx.strokeRect(-cBarW / 2 - 1, cBarY - 1, cBarW + 2, cBarH + 2);

    ctx.fillStyle = loadPct >= 0.9 ? "#fbbf24" : "#38bdf8";
    ctx.fillRect(-cBarW / 2, cBarY, cBarW * loadPct, cBarH);

    // State text indicator above harvester
    const stateTag = u.state === "HARVESTING" ? "⛏ EXTRACCIÓN" :
                     u.state === "TO_REFINERY" ? "🚚 A REFINERÍA" :
                     u.state === "UNLOADING" ? "⚡ DESCARGANDO" :
                     u.state === "TO_FIELD" ? "🧭 A MINERAL" : null;
    if (stateTag) {
      ctx.font = "bold 9px monospace";
      ctx.fillStyle = u.state === "HARVESTING" ? "#fbbf24" : "#38bdf8";
      ctx.textAlign = "center";
      ctx.fillText(stateTag, 0, cBarY - 4);
    }
    ctx.restore();
  }

  // 6. Health bar
  const barW = Math.max(24, Math.min(42, w * 0.8));
  const barH = 4;
  const barY = -h * 0.65 - 6;
  const pct = Math.max(0, Math.min(1, u.hp / u.maxHp));
  ctx.fillStyle = "rgba(0, 0, 0, 0.8)";
  ctx.fillRect(-barW / 2 - 1, barY - 1, barW + 2, barH + 2);
  ctx.fillStyle = u.team === "blue" ? "#22c55e" : "#ef4444";
  ctx.fillRect(-barW / 2, barY, barW * pct, barH);

  ctx.restore();
}

function drawRtsBuildPreview(x, y, bType) {
  const def = RTS_BUILDINGS[bType];
  if (!def) return;
  const canBuild = canBuildAtLocation(x, y, bType, state.rtsBuildings, state.teams.blue.hq, "blue");
  const fp = def.footprint || 45;

  ctx.save();
  ctx.translate(x, y);

  // Footprint ring
  ctx.fillStyle = canBuild ? "rgba(34, 197, 94, 0.35)" : "rgba(239, 68, 68, 0.35)";
  ctx.strokeStyle = canBuild ? "#22c55e" : "#ef4444";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(0, 0, fp, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Floating cost & name badge
  ctx.fillStyle = "rgba(10, 15, 25, 0.9)";
  ctx.strokeStyle = canBuild ? "#22c55e" : "#ef4444";
  ctx.lineWidth = 1.5;
  const badgeText = `${def.name} ($${def.cost})`;
  ctx.font = "bold 13px 'Trebuchet MS', sans-serif";
  const tw = ctx.measureText(badgeText).width;
  drawRtsRoundRect(ctx, -tw / 2 - 8, -fp - 26, tw + 16, 22, 4);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(badgeText, 0, -fp - 15);

  ctx.restore();
}

function drawMineralFieldBadge(field) {
  const pct = Math.max(0, Math.min(1, field.reserves / field.maxReserves));
  ctx.save();
  const labelY = field.y - field.radius - 14;
  const labelText = `${field.name}: ${Math.round(field.reserves)} kg`;
  ctx.font = "bold 12px 'Trebuchet MS', sans-serif";
  const tw = ctx.measureText(labelText).width;
  ctx.fillStyle = "rgba(10, 15, 20, 0.88)";
  ctx.strokeStyle = pct > 0.25 ? "#f59e0b" : "#ef4444";
  ctx.lineWidth = 1.5;
  drawRtsRoundRect(ctx, field.x - tw / 2 - 8, labelY - 14, tw + 16, 20, 4);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
  ctx.fillRect(field.x - tw / 2 - 4, labelY + 7, tw + 8, 4);
  ctx.fillStyle = pct > 0.3 ? "#f59e0b" : "#ef4444";
  ctx.fillRect(field.x - tw / 2 - 4, labelY + 7, (tw + 8) * pct, 4);

  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(labelText, field.x, labelY - 3);
  ctx.restore();
}

function drawRtsUnitOverlays(u) {
  const isSelected = Boolean(u.selected);
  const sizeDef = ENEMY_DRAW_SIZES[u.type] || { h: 28 };
  const h = sizeDef.h || 32;
  const w = h * 1.4;

  ctx.save();
  ctx.translate(u.x, u.y);

  if (isSelected) {
    ctx.strokeStyle = "#38bdf8";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, Math.max(w, h) * 0.75, 0, Math.PI * 2);
    ctx.stroke();
  }

  if (u.type === "harvester") {
    const cargoVal = Math.round(u.load || u.cargo || 0);
    const cap = u.capacity || 300;
    const loadPct = Math.max(0, Math.min(1, cargoVal / cap));
    const cBarW = 34;
    const cBarH = 5;
    const cBarY = -h * 0.65 - 13;

    ctx.fillStyle = "rgba(10, 15, 20, 0.9)";
    ctx.fillRect(-cBarW / 2 - 1, cBarY - 1, cBarW + 2, cBarH + 2);
    ctx.strokeStyle = loadPct >= 0.9 ? "#f59e0b" : "#0284c7";
    ctx.lineWidth = 0.8;
    ctx.strokeRect(-cBarW / 2 - 1, cBarY - 1, cBarW + 2, cBarH + 2);

    ctx.fillStyle = loadPct >= 0.9 ? "#fbbf24" : "#38bdf8";
    ctx.fillRect(-cBarW / 2, cBarY, cBarW * loadPct, cBarH);

    const stateTag = u.state === "HARVESTING" ? "⛏ EXTRACCIÓN" :
                     u.state === "TO_REFINERY" ? "🚚 A REFINERÍA" :
                     u.state === "UNLOADING" ? "⚡ DESCARGANDO" :
                     u.state === "TO_FIELD" ? "🧭 A MINERAL" : null;
    if (stateTag) {
      ctx.font = "bold 9px monospace";
      ctx.fillStyle = u.state === "HARVESTING" ? "#fbbf24" : "#38bdf8";
      ctx.textAlign = "center";
      ctx.fillText(stateTag, 0, cBarY - 4);
    }
  }

  // Health bar
  const barW = Math.max(24, Math.min(42, w * 0.8));
  const barH = 4;
  const barY = -h * 0.65 - 6;
  const pct = Math.max(0, Math.min(1, u.hp / u.maxHp));
  ctx.fillStyle = "rgba(0, 0, 0, 0.8)";
  ctx.fillRect(-barW / 2 - 1, barY - 1, barW + 2, barH + 2);
  ctx.fillStyle = u.team === "blue" ? "#22c55e" : "#ef4444";
  ctx.fillRect(-barW / 2, barY, barW * pct, barH);

  ctx.restore();
}

function drawRtsWorld(state, now, overlaysOnly = false) {
  const fog = state.fog;

  // 1. Mineral Fields: only draw if explored!
  if (state.mineralFields) {
    for (const field of state.mineralFields) {
      if (!fog || isExplored(fog, field.x, field.y)) {
        if (!overlaysOnly) {
          drawMineralField(field, now);
        } else {
          drawMineralFieldBadge(field);
        }
      }
    }
  }

  // 2. Build radius rings if placing a building
  if (selectedBuildType) {
    const isWind = selectedBuildType === "wind";
    const isWall = selectedBuildType === "wall";
    if (!isWind && !isWall) {
      ctx.save();
      ctx.strokeStyle = "rgba(56, 189, 248, 0.45)";
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 8]);
      if (state.teams.blue && state.teams.blue.hq) {
        ctx.beginPath();
        ctx.arc(state.teams.blue.hq.x, state.teams.blue.hq.y, RTS_CONFIG.buildRadius, 0, Math.PI * 2);
        ctx.stroke();
      }
      for (const b of state.rtsBuildings) {
        if (b.team === "blue" && b.hp > 0) {
          ctx.beginPath();
          ctx.arc(b.x, b.y, RTS_CONFIG.buildRadius, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      ctx.restore();
    }
  }

  // 3. RTS Buildings
  for (const b of state.rtsBuildings) {
    if (b.team === "blue" || !fog || isExplored(fog, b.x, b.y)) {
      if (!overlaysOnly) {
        drawRtsBuilding(b, now);
      } else if (b.buildTimeRemaining > 0) {
        const def = RTS_BUILDINGS[b.type] || {};
        const totalTime = b.totalBuildTime || def.buildDuration || 4.0;
        const prog = Math.max(0, Math.min(0.999, 1 - (b.buildTimeRemaining / totalTime)));
        drawRtsBuildProgressBar(ctx, b.x, b.y - (b.footprint || 45) * 0.85 - 14, prog, def.name || "");
      }
    }
  }

  // 4. RTS Units
  for (const u of state.rtsUnits) {
    if (u.team === "blue" || !fog || isVisible(fog, u.x, u.y)) {
      if (!overlaysOnly) {
        drawRtsUnit(u, now);
      } else {
        drawRtsUnitOverlays(u);
      }
    }
  }

  // 5. Active combat tracers / lasers (only if in sight)
  if (state.rtsTracers) {
    for (const tr of state.rtsTracers) {
      if (!fog || isVisible(fog, tr.x1, tr.y1) || isVisible(fog, tr.x2, tr.y2)) {
        ctx.save();
        ctx.strokeStyle = tr.color || "#60a5fa";
        ctx.lineWidth = tr.width || 2;
        ctx.globalAlpha = Math.min(1, tr.life * 4);
        ctx.beginPath();
        ctx.moveTo(tr.x1, tr.y1);
        ctx.lineTo(tr.x2, tr.y2);
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  // 6. Draw Fog of War layer over the entire 2048x2048 map!
  if (fog) {
    fogLayer.draw(ctx, fog);
  }

  // 7. Ghost building placement preview (drawn on top of the fog)
  if (selectedBuildType) {
    drawRtsBuildPreview(mouseX, mouseY, selectedBuildType);
  }
}

function drawRtsRadarMinimap(mapImg, now) {
  if (!radarCtx) return;
  const w = 200;
  const h = 200;
  const scale = w / 2048;

  radarCtx.clearRect(0, 0, w, h);

  // Tactical background
  radarCtx.fillStyle = "#05130b";
  radarCtx.fillRect(0, 0, w, h);

  if (ready(mapImg)) {
    radarCtx.save();
    radarCtx.globalAlpha = 0.45;
    radarCtx.drawImage(mapImg, 0, 0, w, h);
    radarCtx.restore();
  }

  // Circular radar grid lines
  radarCtx.save();
  radarCtx.strokeStyle = "rgba(34, 197, 94, 0.25)";
  radarCtx.lineWidth = 1;
  for (const r of [35, 68, 95]) {
    radarCtx.beginPath();
    radarCtx.arc(100, 100, r, 0, Math.PI * 2);
    radarCtx.stroke();
  }
  radarCtx.beginPath();
  radarCtx.moveTo(100, 5); radarCtx.lineTo(100, 195);
  radarCtx.moveTo(5, 100); radarCtx.lineTo(195, 100);
  radarCtx.stroke();
  radarCtx.restore();

  // Rotating Radar sweep
  radarCtx.save();
  const sweepAngle = (now / 2000) % (Math.PI * 2);
  const grad = radarCtx.createRadialGradient(100, 100, 5, 100, 100, 98);
  grad.addColorStop(0, "rgba(34, 197, 94, 0.35)");
  grad.addColorStop(1, "rgba(34, 197, 94, 0)");
  radarCtx.fillStyle = grad;
  radarCtx.beginPath();
  radarCtx.moveTo(100, 100);
  radarCtx.arc(100, 100, 96, sweepAngle - 0.5, sweepAngle);
  radarCtx.closePath();
  radarCtx.fill();

  radarCtx.strokeStyle = "rgba(74, 222, 128, 0.85)";
  radarCtx.lineWidth = 1.5;
  radarCtx.beginPath();
  radarCtx.moveTo(100, 100);
  radarCtx.lineTo(100 + Math.cos(sweepAngle) * 96, 100 + Math.sin(sweepAngle) * 96);
  radarCtx.stroke();
  radarCtx.restore();

  // Mineral fields (glowing amber) - ONLY IF EXPLORED
  if (state.mineralFields) {
    radarCtx.fillStyle = "#fbbf24";
    for (const f of state.mineralFields) {
      if (f.reserves > 0 && (!state.fog || isExplored(state.fog, f.x, f.y))) {
        radarCtx.beginPath();
        radarCtx.arc(f.x * scale, f.y * scale, 4.5, 0, Math.PI * 2);
        radarCtx.fill();
      }
    }
  }

  // Buildings (blue vs red squares) - enemy buildings only if explored
  for (const b of state.rtsBuildings) {
    if (b.hp <= 0) continue;
    if (b.team !== "blue" && state.fog && !isExplored(state.fog, b.x, b.y)) continue;
    radarCtx.fillStyle = b.team === "blue" ? "#38bdf8" : "#ef4444";
    const sz = b.type === "hq" ? 6 : 4;
    radarCtx.fillRect(b.x * scale - sz / 2, b.y * scale - sz / 2, sz, sz);
  }

  // Units (blue vs red dots) - enemy units ONLY if currently in sight!
  for (const u of state.rtsUnits) {
    if (u.hp <= 0) continue;
    if (u.team !== "blue" && state.fog && !isVisible(state.fog, u.x, u.y)) continue;
    radarCtx.fillStyle = u.team === "blue" ? "#60a5fa" : "#f87171";
    radarCtx.beginPath();
    radarCtx.arc(u.x * scale, u.y * scale, 2.5, 0, Math.PI * 2);
    radarCtx.fill();
  }

  // Radar Fog overlay (blacks out unexplored, dims explored-out-of-sight)
  if (state.fog && fogLayer.canvas()) {
    radarCtx.save();
    radarCtx.imageSmoothingEnabled = true;
    radarCtx.drawImage(fogLayer.canvas(), 0, 0, w, h);
    radarCtx.restore();
  }

  // Viewport camera window
  const vx = camera.x * scale;
  const vy = camera.y * scale;
  const vw = (CANVAS_WIDTH / zoom) * scale;
  const vh = (CANVAS_HEIGHT / zoom) * scale;
  radarCtx.strokeStyle = "rgba(255, 255, 255, 0.85)";
  radarCtx.lineWidth = 1.5;
  radarCtx.strokeRect(vx, vy, vw, vh);

  // Outer bezel border
  radarCtx.strokeStyle = "rgba(34, 197, 94, 0.75)";
  radarCtx.lineWidth = 2;
  radarCtx.strokeRect(1, 1, w - 2, h - 2);
}

function updateRtsPanels() {
  if (!state.isRts) return;
  if (selectedRtsBuilding && (selectedRtsBuilding.hp <= 0 || !state.rtsBuildings.some((b) => b.id === selectedRtsBuilding.id))) {
    selectedRtsBuilding = null;
    rtsUI.closeBuildingContext();
  }
  rtsUI.update(state);
  const currentMapImage = mapImages[state.level] || mapImages[3] || mapImages[1];
  drawRtsRadarMinimap(currentMapImage, performance.now());
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
  showStartButton("⚔ ¡Al ataque!");
}

// The start of round 1 on the start button, in an attack's preparation:
// «¡Al ataque!» -- or, one against the other, either player's «¡Listo!»,
// waiting for the other once pressed.
function showStartButton(label) {
  const preparing = state.attack.phase === "prep" && !state.gameOver && (!versusGame() || Boolean(net.you));
  skipWaveBtn.classList.toggle("hidden", !preparing);
  if (!preparing) return;
  const ready = versusGame() && net.sides[net.you].ready;
  skipWaveBtn.textContent = versusGame() ? (ready ? "✔ Listo" : "✔ ¡Listo!") : label;
  skipWaveBtn.classList.toggle("pulse", !ready);
  skipWaveBtn.title = versusGame() ? "La ronda 1 empieza cuando los dos estéis listos" : "Empezar la ronda 1";
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
  // The defender of an attack, one against the other: no waves to call,
  // only «¡Listo!» while preparing.
  if (attacking()) return showStartButton("✔ ¡Listo!");

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
// Asking for news says who's asking (playerId) and whether this device
// plays the attack with the phone's automatic army, which the server then
// runs for it (host.js).
const stateUrl = () =>
  `/api/state?player=${encodeURIComponent(playerId)}&auto=${resolveControls(settings.controls, browserControlsEnv()) === "touch" ? 1 : 0}`;

async function pollState() {
  try {
    const res = await fetch(stateUrl());
    if (res.ok) receiveSnapshot(await res.json());
  } catch {
    // transient network hiccup on a LAN -- just try again next tick
  }
  setTimeout(pollState, POLL_MS);
}

// The server's answer: { state, net } (host.js's viewJson) -- the game, its
// fog back from the wire form it travels in (fog.js), and where this tab
// stands in it.
function unpackView(body) {
  const next = body.state;
  if (next?.attack?.fog) next.attack.fog = fogFromWire(next.attack.fog);
  return { state: next, net: body.net || { kind: "coop", you: null, mayChange: true } };
}

// The snapshot before the latest one, and when the latest arrived -- see
// drawnView.
let prevSnapshot = null;
let snapshotAt = 0;

function receiveSnapshot(body) {
  const view = unpackView(body);
  const before = { you: net.you, kind: net.kind, over: state.gameOver };
  prevSnapshot = { state, at: snapshotAt };
  state = view.state;
  net = view.net;
  snapshotAt = performance.now();
  // Another game under this tab -- a rematch, a load, a new game started by
  // the other player, a side taken: its picks and camera start over.
  if (net.you !== before.you || net.kind !== before.kind || (before.over && !state.gameOver)) resetLocalView();
}

function resetLocalView() {
  selectedId = null;
  selectedBuildType = null;
  attackControls.reset();
  unitUpgradeType = null;
  lastCameraLevel = null; // (the camera recentres: on the army's entry, or the base)
}

// One against the other, a tab without a side can join a free one -- or, with
// both taken, only wait (menu.js's «Unirse a la partida» / «Hay una partida
// uno contra otro en marcha»), over the game going on.
let lastSeatInfo = null;
function checkSeat() {
  if (!versusGame() || net.you) {
    if (menu.isSeatScreen()) menu.close();
    lastSeatInfo = null;
    return;
  }
  if (menu.isOpen() && !menu.isSeatScreen()) return; // (choosing something else)
  const info = {
    level: state.level,
    money: state.attack?.difficulty,
    free: ["defense", "attack"].filter((side) => !net.sides[side].connected),
  };
  const key = JSON.stringify(info);
  if (key === lastSeatInfo && menu.isSeatScreen()) return;
  lastSeatInfo = key;
  menu.openSeat(info);
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
    const res = await fetch(stateUrl());
    if (res.ok) {
      networked = true;
      const view = unpackView(await res.json());
      state = view.state;
      net = view.net;
      snapshotAt = performance.now();
      pollState();
      fetch("/api/address")
        .then((r) => (r.ok ? r.json() : { urls: [] }))
        .then((body) => (lanUrls = Array.isArray(body.urls) ? body.urls : []))
        .catch(() => {});
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
  if (networked) checkSeat();

  if (state.level !== lastCameraLevel) {
    lastCameraLevel = state.level;
    recenterCamera(state.level);
    clearEffects(fx);
  }
  updateCameraFromKeys(dt);
  if (commanding() && started && !menu.isOpen()) attackControls.update(dt);
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

  if (state.isRts && mode3D) {
    if (rts3DRenderer) rts3DRenderer.update(dt, now);
    drawRtsWorld(state, now, true); // Overlays only: 3D scene renders underneath on WebGL
  } else {
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
    if (state.isRts) {
      drawRtsWorld(state, now, false);
    } else if (commanding()) {
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
  }

  if (selectedBuildType && !state.isRts) {
    // A slot-based level (levels.js's buildSlots) only allows building at
    // fixed points -- show every unoccupied one faintly while placing so
    // it's clear where those are at a glance, not just wherever the mouse
    // happens to be hovering.
    const L = levelData(state.level);
    const slots = selectedBuildType === "wall" ? null : L.buildSlots;
    // In an attack (the defender, one against the other) the entries' safe
    // stretch is off limits to the towers (entryRoads.js): it shows as a red
    // band, and so do the slots where this tower would reach it.
    const guarded = attacking() && slots;
    if (guarded) {
      ctx.save();
      ctx.globalAlpha = 0.28;
      ctx.fillStyle = "#ff3b30";
      for (const p of entrySafePoints(L)) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 15, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    if (slots) {
      ctx.save();
      ctx.globalAlpha = 0.35;
      for (const slot of slots) {
        const occupied = state.towers.some((t) => t.hp > 0 && Math.hypot(t.x - slot.x, t.y - slot.y) < 20);
        if (occupied) continue;
        const banned = guarded && reachesEntryRoad(L, slot.x, slot.y, TOWER_TYPES[selectedBuildType].range);
        ctx.fillStyle = banned ? "#ff5a4a" : "#5fd8e6";
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
  const dragBox = commanding() ? attackControls.box() : null;
  if (dragBox) drawSelectionBox(ctx, dragBox);

  const mini = currentMinimap();
  if (!state.isRts) {
    if (mini && commanding()) {
      drawMinimap(ctx, mini, attackMinimap(view, currentMapImage));
    } else if (mini) {
      drawMinimap(ctx, mini, {
        mapImage: ready(currentMapImage) ? currentMapImage : null,
        enemies: view.enemies,
        towers: view.towers,
        walls: view.walls || [],
        base: attacking() ? attackMapOf(levelData(state.level)).base : levelData(state.level).soldierExit,
        view: { camera, w: CANVAS_WIDTH / zoom, h: CANVAS_HEIGHT / zoom },
      });
    }
  }

  drawHud();
  if (state.isRts) updateRtsPanels();
  else if (commanding()) updateAttackPanels();
  else updateDefencePanels();

  pauseBtn.textContent = state.paused ? "▶" : "⏸";
  pauseBtn.title = state.paused ? "Reanudar" : "Pausar";
  pauseBtn.classList.toggle("active", state.paused);

  requestAnimationFrame(loop);
}

if (typeof window !== "undefined") {
  window.__gameState = () => state;
  window.__rtsUI = () => rtsUI;
  window.__startNewGame = (lvl, opts) => startNewGame(lvl, opts);
  window.__handleClick = (x, y) => handleClick({ x, y });
  window.__camera = () => camera;
  window.__zoom = () => zoom;
}

boot();
