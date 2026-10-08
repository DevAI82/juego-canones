# Main menu and saved games — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A main menu as the game's first screen, a pause menu, and saving/loading games — solo games in the browser, the co-op game at home on the server PC (which now resumes its last autosave when restarted).

**Architecture:** Saving lives in the DOM-free simulation (`simulate.js`: a save holds the player's decisions at a moment between waves; loading rebuilds the game from them). A small scheduler (`autosave.js`) decides when to write saves and is shared by `main.js` (solo) and `server.js` (co-op). Storage is separate: `saves.js`/`settings.js` for the browser, `server-saves.js` for the server's file. The menus are one DOM overlay driven by `menu.js`, which only shows screens and reports choices; `main.js` wires them to the game.

**Tech Stack:** Vanilla JS ES modules, Canvas 2D, DOM overlays, Node's built-in test runner (`node --test` from `game/`), Node `http` server for co-op. No new dependencies.

**Spec:** [docs/2026-10-08-menu-y-guardado-design.md](2026-10-08-menu-y-guardado-design.md)

## Global Constraints

- The game's name on the menu is **TOWER DEFENSE**.
- Saves happen only between waves; a save asked for mid-wave is made as soon as the wave ends.
- Save slots: the autosave and 3 manual slots (1, 2, 3).
- Solo saves in the browser's `localStorage`; co-op saves in `game/data/saves.json` on the server PC.
- Loading leaves the game paused in the countdown before its next wave.
- No new npm dependencies; code readable for a learner (comments explain why).
- Never touch the family's LAN server on port 8420 or its `game/data/`; test the server with `PORT=8431 DATA_DIR=<temp dir>`.
- All UI text in Spanish.

## Review Focus

1. **Storage blocked or full** (private browsing, blocked site data): the menu still works, saving says it couldn't, nothing throws — tests in Task 3.
2. **Damaged or hand-edited save data** (in the browser or in `saves.json`): listed as «No se puede cargar», never breaks the menu or the server's startup — tests in Tasks 1, 3 and 4.
3. **Save asked for mid-wave**: not lost, written when the wave ends — tests in Task 2.
4. **Game lost after the last autosave**: «Continuar» goes back to the last wave won, not to the defeat — test in Task 2.
5. **Saves made before a balance change or a map edit**: towers come back with today's upgrade values, at the spot where they stood — test in Task 1.

---

## File Structure

```
game/
├── js/simulate.js        (modify) saves: canSaveNow, saveMoment, createSave, restoreSave, saveSummary
├── js/save.test.js       (create) tests for the above
├── js/autosave.js        (create) createSaveScheduler: when to write the autosave / a requested save
├── js/autosave.test.js   (create)
├── js/util.js            (modify) browserStorage()
├── js/saves.js           (create) browser save slots (localStorage), slotListing
├── js/saves.test.js      (create)
├── js/settings.js        (create) music/effects settings in the browser
├── js/settings.test.js   (create)
├── js/menu.js            (create) main menu + pause menu screens, describeSave
├── js/menu.test.js       (create)
├── js/audio.js           (modify) setMusicOn / setEffectsOn
├── js/main.js            (modify) wire menus, saves, settings, toast, Esc
├── server-saves.js       (create) the server's saves file (atomic, queued writes)
├── server-saves.test.js  (create)
├── server.js             (modify) DATA_DIR, resume on start, autosave, save/load actions, GET /api/saves
├── index.html            (modify) #menu overlay, #toast, ☰ button instead of ⟲
├── style.css             (modify) menu styles
├── .gitignore            (modify) data/saves.json
└── .vercelignore         (modify) data, server-saves*.js
docs/2026-10-08-menu-y-guardado-design.md  (modify) mid-wave save is queued, not greyed out
```

---

### Task 1: Saved games in the simulation

**Files:**
- Modify: `game/js/simulate.js` (imports at the top; `createGameState`; new section at the end)
- Create: `game/js/save.test.js`
- Modify: `docs/2026-10-08-menu-y-guardado-design.md` (sections 3.1 and 4.1)

**Interfaces:**
- Produces: `SAVE_VERSION` (1), `canSaveNow(state) -> boolean`, `saveMoment(state) -> string`, `createSave(state, now = new Date()) -> object`, `restoreSave(save) -> state | null`, `saveSummary(save) -> { level, wave, lives, money, savedAt } | null`.

- [ ] **Step 1: Write the failing tests** — `game/js/save.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createGameState,
  stepSimulation,
  placeTower,
  placeWall,
  upgradeTower,
  canSaveNow,
  saveMoment,
  createSave,
  restoreSave,
  saveSummary,
  SAVE_VERSION,
  INTER_WAVE_DELAY,
} from "./simulate.js";
import { createTower, TOWER_TYPES } from "./tower.js";
import { applyUpgrade } from "./upgrades.js";
import { LEVELS } from "./levels.js";

// A level 1 game between waves: wave 3 just cleared, the countdown to wave
// 4 running, two towers (one upgraded and damaged, one half out of ammo),
// a wall and some campaign stats.
function gameBetweenWaves() {
  const s = createGameState(1);
  s.economy.money = 5000;
  const [a, b] = LEVELS[1].buildSlots;
  const id = placeTower(s, "basic", a.x, a.y).towerId;
  placeTower(s, "laser", b.x, b.y);
  for (const skill of ["damage", "damage", "armor", "ammo", "range"]) assert.equal(upgradeTower(s, id, skill).ok, true);
  assert.equal(placeWall(s, 405, 610).ok, true);
  s.towers[0].hp = 30;
  s.towers[1].ammo = 7;
  s.towers[1].buildTimeRemaining = 0;
  // As nextWaveIfDone leaves things when wave 3 has just been cleared.
  s.waveIndex = 3;
  s.economy.wave = 4;
  s.waveClock = 0;
  s.interWaveTimer = INTER_WAVE_DELAY;
  s.totalWavesCleared = 3;
  s.economy.money = 777;
  s.economy.lives = 14;
  s.stats.kills.tank = 4;
  return s;
}

test("a game saved between waves loads back the same: level, wave, money, lives, towers, walls and stats", () => {
  const s = gameBetweenWaves();
  const loaded = restoreSave(JSON.parse(JSON.stringify(createSave(s))));
  assert.equal(loaded.level, 1);
  assert.equal(loaded.waveIndex, 3);
  assert.equal(loaded.economy.wave, 4);
  assert.equal(loaded.totalWavesCleared, 3);
  assert.equal(loaded.economy.money, 777);
  assert.equal(loaded.economy.lives, 14);
  assert.deepEqual(loaded.stats, s.stats);
  const pick = (t) => ({
    type: t.type, x: t.x, y: t.y, level: t.level, hp: t.hp, maxHp: t.maxHp, ammo: t.ammo, maxAmmo: t.maxAmmo,
    damage: t.damage, range: t.range, fireRate: t.fireRate, buildTimeRemaining: t.buildTimeRemaining,
  });
  assert.deepEqual(loaded.towers.map(pick), s.towers.map(pick));
  const wall = (w) => [w.x, w.y, w.hp, w.maxHp];
  assert.deepEqual(loaded.walls.map(wall), s.walls.map(wall));
});

test("loading rebuilds each tower from its type and applies its upgrades again, at the spot it stood", () => {
  const save = createSave(gameBetweenWaves());
  // Only what was bought, as an older save would have it -- and not on
  // any of today's build slots.
  save.towers[0] = { type: "basic", x: 500, y: 300, level: { damage: 2, armor: 1 } };
  const tower = restoreSave(save).towers[0];
  const expected = createTower("basic", 500, 300);
  for (const skill of ["damage", "damage", "armor"]) applyUpgrade(expected, skill, TOWER_TYPES.basic);
  assert.equal(tower.damage, expected.damage);
  assert.equal(tower.maxHp, expected.maxHp);
  assert.equal(tower.hp, expected.maxHp, "no saved health: full");
  assert.deepEqual([tower.x, tower.y], [500, 300]);
});

test("a loaded game waits, paused, in the countdown before its next wave -- which then comes as normal", () => {
  const loaded = restoreSave(createSave(gameBetweenWaves()));
  assert.equal(loaded.paused, true);
  assert.equal(loaded.interWaveTimer, INTER_WAVE_DELAY);
  assert.equal(loaded.enemies.length, 0);
  loaded.paused = false;
  for (let i = 0; i < 200 && loaded.enemies.length === 0; i++) stepSimulation(loaded, 0.05);
  assert.ok(loaded.enemies.length > 0, "wave 4 arrives");
});

test("everything loaded gets a fresh id, and nothing placed afterwards repeats one", () => {
  const loaded = restoreSave(createSave(gameBetweenWaves()));
  loaded.economy.money = 1000;
  const slot = LEVELS[1].buildSlots[5];
  const id = placeTower(loaded, "basic", slot.x, slot.y).towerId;
  const ids = [...loaded.towers, ...loaded.walls].map((o) => o.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.includes(id));
});

test("a game can only be saved between waves", () => {
  const s = createGameState(1);
  assert.equal(canSaveNow(s), true, "a level just begun");
  for (let i = 0; i < 40; i++) stepSimulation(s, 0.05);
  assert.equal(canSaveNow(s), false, "mid-wave");
  assert.equal(canSaveNow(gameBetweenWaves()), true, "the countdown after a wave");
  const lost = gameBetweenWaves();
  lost.gameOver = true;
  assert.equal(canSaveNow(lost), false);
});

test("each between-waves moment has its own saveMoment", () => {
  const a = gameBetweenWaves();
  const b = gameBetweenWaves();
  assert.equal(saveMoment(a), saveMoment(b));
  b.waveIndex = 4;
  assert.notEqual(saveMoment(a), saveMoment(b));
});

test("a save with fields to spare or missing still loads; garbage or another version's doesn't", () => {
  const save = createSave(gameBetweenWaves());
  assert.ok(restoreSave({ ...save, futureFeature: { x: 1 } }));
  const sparse = restoreSave({ version: SAVE_VERSION, level: 3 });
  assert.equal(sparse.level, 3);
  assert.equal(sparse.waveIndex, 0);
  assert.equal(sparse.economy.money, 150);
  assert.equal(sparse.towers.length, 0);
  const odd = restoreSave({ ...save, towers: [{ type: "catapult", x: 1, y: 2 }, { type: "basic" }, ...save.towers] });
  assert.equal(odd.towers.length, save.towers.length, "unknown types and towers with no position are left out");
  for (const bad of [null, undefined, "save", 42, [], {}, { ...save, version: 999 }, { ...save, level: 99 }, { ...save, level: "2" }]) {
    assert.equal(restoreSave(bad), null, JSON.stringify(bad));
  }
});

test("a tower saved with an empty magazine is reloading when the game is loaded", () => {
  const save = createSave(gameBetweenWaves());
  save.towers[1].ammo = 0;
  const tower = restoreSave(save).towers[1];
  assert.equal(tower.ammo, 0);
  assert.equal(tower.reloading, true);
});

test("saveSummary is what the menu shows for a save -- and null for one that can't be loaded", () => {
  const save = createSave(gameBetweenWaves(), new Date("2026-10-08T18:30:00Z"));
  assert.deepEqual(saveSummary(save), { level: 1, wave: 4, lives: 14, money: 777, savedAt: "2026-10-08T18:30:00.000Z" });
  assert.equal(saveSummary({ version: 999, level: 1 }), null);
  assert.equal(saveSummary("nope"), null);
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd game && node --test js/save.test.js`
Expected: FAIL — `canSaveNow`/`createSave`/... are not exported by `simulate.js`.

- [ ] **Step 3: Implement** in `game/js/simulate.js`.

Imports at the top become:

```js
import { createTower, stepTower, damageTower, TOWER_TYPES, MUZZLE_OFFSET, BUILD_DURATION } from "./tower.js";
import { createProjectile, stepProjectile } from "./projectile.js";
import { applyUpgrade, upgradeCost, canUpgrade, UPGRADE_DEFS } from "./upgrades.js";
```

Before `createGameState`, name its starting money and lives:

```js
// What every game starts with (createGameState) -- also what a save with
// no money or lives recorded falls back to (restoreSave).
const START_MONEY = 150;
const START_LIVES = 20;
```

and in `createGameState` replace `economy: createEconomy(150, 20),` with `economy: createEconomy(START_MONEY, START_LIVES),`.

At the end of the file:

```js
// --- Saved games -------------------------------------------------------
// Per user request (docs/2026-10-08-menu-y-guardado-design.md): a game is
// saved, and loaded back, between waves -- the only moments nothing is on
// the field. So a save holds the player's decisions (level, wave, money,
// lives, each tower's type, place and upgrades, the walls, the campaign
// stats) and none of the moving parts. Shared by main.js (solo: the
// browser's storage) and server.js (co-op at home: a file on its PC).
export const SAVE_VERSION = 1;

// Between waves: no one on the field and the current wave not begun --
// the countdown before it, or a level just started.
export function canSaveNow(state) {
  return !state.gameOver && !state.win && !state.levelComplete && state.enemies.length === 0 && state.waveClock === 0;
}

// Which between-waves moment a save would capture (autosave.js writes the
// autosave once per moment, not on every tick of a countdown).
export function saveMoment(state) {
  return `${state.level}:${state.waveIndex}:${state.totalWavesCleared}`;
}

export function createSave(state, now = new Date()) {
  return {
    version: SAVE_VERSION,
    savedAt: now.toISOString(),
    level: state.level,
    waveIndex: state.waveIndex,
    totalWavesCleared: state.totalWavesCleared,
    money: state.economy.money,
    lives: state.economy.lives,
    stats: JSON.parse(JSON.stringify(state.stats)),
    towers: state.towers
      .filter((t) => t.hp > 0)
      .map((t) => ({
        type: t.type,
        x: t.x,
        y: t.y,
        level: { ...t.level },
        hp: t.hp,
        ammo: t.ammo,
        buildTimeRemaining: t.buildTimeRemaining,
      })),
    walls: state.walls.filter((w) => w.hp > 0).map((w) => ({ x: w.x, y: w.y, hp: w.hp })),
  };
}

const num = (v, fallback) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// The level a save is for, or null if it isn't a save this version reads.
function readableLevel(save) {
  if (!save || typeof save !== "object" || save.version !== SAVE_VERSION) return null;
  return Number.isInteger(save.level) && save.level >= 1 && save.level <= MAX_LEVEL ? save.level : null;
}

// The game a save describes, ready to play: paused in the countdown
// before its next wave. Every tower is rebuilt from its type with its
// upgrades applied again level by level, so a save made before a balance
// change loads with today's values -- and stays where it stood even if
// that's no longer a build slot. Everything gets a fresh id (assignId,
// like anything placed in play), so nothing can clash with what comes
// later. Fields it doesn't know are ignored, missing ones take their
// defaults; null if it isn't a save this version can read.
export function restoreSave(save) {
  const level = readableLevel(save);
  if (level == null) return null;
  const state = createGameState(level);
  state.waveIndex = clamp(Math.floor(num(save.waveIndex, 0)), 0, WAVES.length - 1);
  state.economy.wave = state.waveIndex + 1;
  state.spawnQueue = buildSpawnQueue(state.waveIndex);
  state.interWaveTimer = INTER_WAVE_DELAY;
  state.paused = true;
  state.totalWavesCleared = Math.max(0, Math.floor(num(save.totalWavesCleared, 0)));
  state.economy.money = Math.max(0, num(save.money, START_MONEY));
  state.economy.lives = Math.max(1, Math.floor(num(save.lives, START_LIVES)));
  const stats = save.stats && typeof save.stats === "object" ? save.stats : {};
  const kills = stats.kills && typeof stats.kills === "object" ? stats.kills : {};
  for (const type of Object.keys(state.stats.kills)) state.stats.kills[type] = Math.max(0, num(kills[type], 0));
  for (const key of ["towersBuilt", "towersLost", "moneySpent"]) state.stats[key] = Math.max(0, num(stats[key], 0));

  for (const saved of Array.isArray(save.towers) ? save.towers : []) {
    if (!saved || !TOWER_TYPES[saved.type]) continue;
    const x = num(saved.x, NaN);
    const y = num(saved.y, NaN);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    const tower = createTower(saved.type, x, y);
    const levels = saved.level && typeof saved.level === "object" ? saved.level : {};
    for (const skill of Object.keys(UPGRADE_DEFS)) {
      const target = Math.floor(num(levels[skill], 0));
      for (let i = tower.level[skill]; i < target; i++) {
        if (!applyUpgrade(tower, skill, TOWER_TYPES[saved.type])) break;
      }
    }
    tower.hp = clamp(num(saved.hp, tower.maxHp), 1, tower.maxHp);
    tower.ammo = clamp(Math.floor(num(saved.ammo, tower.maxAmmo)), 0, tower.maxAmmo);
    // An empty magazine only refills by reloading (stepTower starts that
    // when the last round is fired) -- start it here, or it never would.
    if (tower.ammo === 0) {
      tower.reloading = true;
      tower.reloadTimer = tower.reloadTime;
    }
    tower.buildTimeRemaining = clamp(num(saved.buildTimeRemaining, 0), 0, BUILD_DURATION);
    state.towers.push(assignId(tower));
  }

  for (const saved of Array.isArray(save.walls) ? save.walls : []) {
    const x = num(saved?.x, NaN);
    const y = num(saved?.y, NaN);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    state.walls.push(assignId({ kind: "wall", x, y, hp: clamp(num(saved.hp, WALL.hp), 1, WALL.hp), maxHp: WALL.hp }));
  }
  return state;
}

// What the menu lists for a save (null: it can't be loaded).
export function saveSummary(save) {
  const level = readableLevel(save);
  if (level == null) return null;
  return {
    level,
    wave: clamp(Math.floor(num(save.waveIndex, 0)), 0, WAVES.length - 1) + 1,
    lives: Math.max(1, Math.floor(num(save.lives, START_LIVES))),
    money: Math.max(0, Math.floor(num(save.money, START_MONEY))),
    savedAt: typeof save.savedAt === "string" ? save.savedAt : null,
  };
}
```

- [ ] **Step 4: Run the tests**

Run: `cd game && node --test js/save.test.js` — Expected: all PASS. Then `cd game && node --test` — Expected: every test passes.

- [ ] **Step 5: Update the spec** — in `docs/2026-10-08-menu-y-guardado-design.md`:
  - 3.1, «Guardar partida»: replace «Solo entre oleadas; durante una oleada aparece en gris con el aviso «Podrás guardar al terminar la oleada».» with «Entre oleadas se guarda al momento; durante una oleada el guardado queda pedido y se hace solo al terminarla (aviso «Se guardará al terminar la oleada»). La cuenta atrás entre oleadas dura 4 segundos: esperar a ella para poder guardar sería muy incómodo.»
  - 4.1, «Guardado manual»: «desde el menú de pausa, en cualquier momento; si es durante una oleada, se hace al terminarla.»

- [ ] **Step 6: Commit**

```bash
git add game/js/simulate.js game/js/save.test.js docs/2026-10-08-menu-y-guardado-design.md
git commit -m "Saved games in the simulation: save between waves, load paused before the next one"
```

---

### Task 2: When to write saves (shared by solo and co-op)

**Files:**
- Create: `game/js/autosave.js`
- Create: `game/js/autosave.test.js`

**Interfaces:**
- Consumes: `canSaveNow`, `saveMoment`, `createSave` (Task 1).
- Produces: `createSaveScheduler(write)` where `write(slot, save) -> result` and the scheduler is `{ reset(state, { saved = false } = {}), request(slot, state) -> { done: true, result } | { done: false }, tick(state, onRequestedWritten?) }`; `onRequestedWritten(slot, result)` is called when a put-off save is written.

- [ ] **Step 1: Write the failing tests** — `game/js/autosave.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { createSaveScheduler } from "./autosave.js";
import { createGameState, stepSimulation } from "./simulate.js";

function recorder() {
  const writes = [];
  const write = (slot, save) => {
    writes.push({ slot, level: save.level, waveIndex: save.waveIndex });
    return true;
  };
  return { writes, write };
}

// Plays level 1 on, ticking the scheduler before each step as main.js and
// server.js do, wiping out every enemy as soon as it appears so waves end
// quickly, until `until(state)` holds.
function play(s, scheduler, until) {
  for (let i = 0; i < 20000 && !until(s); i++) {
    scheduler.tick(s);
    for (const e of s.enemies) e.alive = false;
    stepSimulation(s, 0.05);
  }
}
const countdownTo = (wave) => (s) => s.waveIndex === wave - 1 && s.interWaveTimer > 0;

test("the autosave is written when a level begins and once when each wave ends -- not on every tick of the countdown", () => {
  const { writes, write } = recorder();
  const saves = createSaveScheduler(write);
  const s = createGameState(1);
  play(s, saves, countdownTo(3));
  for (let i = 0; i < 20; i++) saves.tick(s); // the countdown ticking on
  assert.deepEqual(writes.map((w) => [w.slot, w.waveIndex]), [["auto", 0], ["auto", 1], ["auto", 2]]);
});

test("a save asked for mid-wave is written as soon as the wave is over", () => {
  const { writes, write } = recorder();
  const saves = createSaveScheduler(write);
  const s = createGameState(1);
  saves.tick(s);
  stepSimulation(s, 0.05); // wave 1 under way
  assert.deepEqual(saves.request(2, s), { done: false });
  const written = [];
  for (let i = 0; i < 20000 && !written.length; i++) {
    saves.tick(s, (slot, result) => written.push([slot, result]));
    for (const e of s.enemies) e.alive = false;
    stepSimulation(s, 0.05);
  }
  assert.deepEqual(written, [[2, true]]);
  assert.ok(writes.some((w) => w.slot === 2 && w.waveIndex === 1));
});

test("a save asked for between waves is written at once", () => {
  const { writes, write } = recorder();
  const saves = createSaveScheduler(write);
  const s = createGameState(1);
  assert.deepEqual(saves.request(1, s), { done: true, result: true });
  assert.deepEqual(writes, [{ slot: 1, level: 1, waveIndex: 0 }]);
});

test("losing doesn't touch the autosave: «Continuar» goes back to the last wave won", () => {
  const { writes, write } = recorder();
  const saves = createSaveScheduler(write);
  const s = createGameState(1);
  play(s, saves, countdownTo(2));
  const before = writes.length;
  s.gameOver = true;
  s.enemies = [];
  for (let i = 0; i < 10; i++) saves.tick(s);
  assert.equal(writes.length, before);
});

test("a game just loaded is autosaved straight away unless it's said to be saved already", () => {
  const { writes, write } = recorder();
  const saves = createSaveScheduler(write);
  const s = createGameState(2);
  saves.reset(s, { saved: true });
  saves.tick(s);
  assert.equal(writes.length, 0);
  saves.reset(s);
  saves.tick(s);
  assert.deepEqual(writes, [{ slot: "auto", level: 2, waveIndex: 0 }]);
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd game && node --test js/autosave.test.js` — Expected: FAIL (`Cannot find module './autosave.js'`).

- [ ] **Step 3: Implement** — `game/js/autosave.js`:

```js
// When to write saves -- shared by main.js (solo, into the browser) and
// server.js (co-op at home, into a file on its PC), which each pass in
// their own `write(slot, save)`. Saves are only ever made between waves
// (simulate.js's canSaveNow), so:
//   - the autosave is written once per between-waves moment: when a
//     level begins and whenever a wave ends;
//   - a save the player asks for mid-wave is put off until the wave is
//     over, then written (per user request: the countdown between waves
//     lasts a few seconds, too short to have to catch it).
// tick() goes before each simulation step: a level's start only counts
// as between waves until its first tick spawns the opening units.
import { canSaveNow, saveMoment, createSave } from "./simulate.js";

export function createSaveScheduler(write) {
  let lastMoment = null;
  let requestedSlot = null;
  return {
    // A different game now (loaded, resumed, new): its autosave is due at
    // once, unless it's one that's `saved` already (resumed from it).
    reset(state, { saved = false } = {}) {
      lastMoment = saved ? saveMoment(state) : null;
      requestedSlot = null;
    },
    request(slot, state) {
      if (canSaveNow(state)) return { done: true, result: write(slot, createSave(state)) };
      requestedSlot = slot;
      return { done: false };
    },
    tick(state, onRequestedWritten) {
      if (!canSaveNow(state)) return;
      const moment = saveMoment(state);
      if (moment !== lastMoment) {
        lastMoment = moment;
        write("auto", createSave(state));
      }
      if (requestedSlot != null) {
        const slot = requestedSlot;
        requestedSlot = null;
        const result = write(slot, createSave(state));
        if (onRequestedWritten) onRequestedWritten(slot, result);
      }
    },
  };
}
```

- [ ] **Step 4: Run the tests**

Run: `cd game && node --test js/autosave.test.js` — Expected: PASS. Then `cd game && node --test` — all pass.

- [ ] **Step 5: Commit**

```bash
git add game/js/autosave.js game/js/autosave.test.js
git commit -m "Save scheduler: autosave between waves, a mid-wave save made when the wave ends"
```

---

### Task 3: Saves and settings in the browser

**Files:**
- Modify: `game/js/util.js`
- Create: `game/js/saves.js`, `game/js/saves.test.js`
- Create: `game/js/settings.js`, `game/js/settings.test.js`

**Interfaces:**
- Consumes: `saveSummary` (Task 1).
- Produces: `browserStorage()` (util.js); `SAVE_SLOTS = ["auto", 1, 2, 3]`, `canStore(storage?)`, `readSave(slot, storage?)`, `writeSave(slot, save, storage?) -> boolean`, `listSaves(storage?) -> [{ slot, status: "empty" | "ok" | "unreadable", summary }]`, `slotListing(slot, save)` (saves.js); `loadSettings(storage?) -> { music, effects }`, `saveSettings(settings, storage?) -> boolean` (settings.js).

- [ ] **Step 1: Write the failing tests**

`game/js/saves.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { SAVE_SLOTS, canStore, readSave, writeSave, listSaves, slotListing } from "./saves.js";
import { createGameState, createSave } from "./simulate.js";

function fakeStorage() {
  const items = new Map();
  return {
    getItem: (k) => (items.has(k) ? items.get(k) : null),
    setItem: (k, v) => items.set(k, String(v)),
    removeItem: (k) => items.delete(k),
    items,
  };
}
// What a browser that blocks site data (or is out of space) does.
const blocked = {
  getItem() { throw new Error("blocked"); },
  setItem() { throw new Error("blocked"); },
  removeItem() { throw new Error("blocked"); },
};

test("a save written to a slot reads back the same", () => {
  const storage = fakeStorage();
  const save = createSave(createGameState(3));
  assert.equal(writeSave(2, save, storage), true);
  assert.deepEqual(readSave(2, storage), save);
  assert.equal(readSave(1, storage), null);
});

test("the menu's list has every slot, empty, readable or not", () => {
  const storage = fakeStorage();
  writeSave("auto", createSave(createGameState(4)), storage);
  storage.setItem("td_save_1", "{not json");
  storage.setItem("td_save_3", JSON.stringify({ version: 999 }));
  const list = listSaves(storage);
  assert.deepEqual(list.map((e) => e.slot), SAVE_SLOTS);
  assert.deepEqual(list.map((e) => e.status), ["ok", "unreadable", "empty", "unreadable"]);
  assert.equal(list[0].summary.level, 4);
});

test("with storage blocked nothing throws: there's just nothing to list or load, and saving says it failed", () => {
  assert.equal(canStore(blocked), false);
  assert.equal(writeSave(1, createSave(createGameState(1)), blocked), false);
  assert.equal(readSave(1, blocked), null);
  assert.deepEqual(listSaves(blocked).map((e) => e.status), ["empty", "empty", "empty", "empty"]);
  assert.equal(canStore(null), false);
  assert.equal(writeSave(1, {}, null), false);
  assert.deepEqual(listSaves(null).map((e) => e.status), ["empty", "empty", "empty", "empty"]);
  assert.equal(canStore(fakeStorage()), true);
});

test("slotListing describes a save already read (as the server's file holds them)", () => {
  assert.deepEqual(slotListing(1, null), { slot: 1, status: "empty", summary: null });
  assert.equal(slotListing(1, { version: 1, level: "x" }).status, "unreadable");
  assert.equal(slotListing("auto", createSave(createGameState(2))).summary.level, 2);
});
```

`game/js/settings.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadSettings, saveSettings } from "./settings.js";

function fakeStorage() {
  const items = new Map();
  return { getItem: (k) => (items.has(k) ? items.get(k) : null), setItem: (k, v) => items.set(k, String(v)), removeItem: (k) => items.delete(k) };
}

test("music and effects are on until switched off, and stay as they were left", () => {
  const storage = fakeStorage();
  assert.deepEqual(loadSettings(storage), { music: true, effects: true });
  assert.equal(saveSettings({ music: false, effects: true }, storage), true);
  assert.deepEqual(loadSettings(storage), { music: false, effects: true });
});

test("damaged or unavailable settings fall back to everything on", () => {
  const storage = fakeStorage();
  storage.setItem("td_settings", "{oops");
  assert.deepEqual(loadSettings(storage), { music: true, effects: true });
  storage.setItem("td_settings", "null");
  assert.deepEqual(loadSettings(storage), { music: true, effects: true });
  assert.deepEqual(loadSettings(null), { music: true, effects: true });
  assert.equal(saveSettings({ music: false, effects: false }, null), false);
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd game && node --test js/saves.test.js js/settings.test.js` — Expected: FAIL (modules not found).

- [ ] **Step 3: Implement**

Append to `game/js/util.js`:

```js
// The browser's localStorage -- or null where there isn't one (Node, or a
// browser blocking site data, where even reading the property can throw).
export function browserStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}
```

`game/js/saves.js`:

```js
// Saved games kept in the browser, for solo play (the co-op game at home
// keeps its own on the server's PC: server-saves.js). One localStorage key
// per slot -- the autosave and three manual ones -- so one damaged slot
// can't take the others with it. Every access is guarded: storage can be
// missing or refuse to work (private browsing, blocked site data, full),
// and the game has to carry on without it. `storage` is a parameter so the
// tests can pass a stand-in.
import { browserStorage } from "./util.js";
import { saveSummary } from "./simulate.js";

export const SAVE_SLOTS = ["auto", 1, 2, 3];
const KEY_PREFIX = "td_save_";

// Whether this browser will keep a save at all (tried with a real write).
export function canStore(storage = browserStorage()) {
  if (!storage) return false;
  try {
    storage.setItem(`${KEY_PREFIX}probe`, "1");
    storage.removeItem(`${KEY_PREFIX}probe`);
    return true;
  } catch {
    return false;
  }
}

// The save in `slot`, or null: empty, unreadable, or no storage.
export function readSave(slot, storage = browserStorage()) {
  try {
    const raw = storage ? storage.getItem(KEY_PREFIX + slot) : null;
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// Keeps `save` in `slot`; false if the browser wouldn't.
export function writeSave(slot, save, storage = browserStorage()) {
  if (!storage) return false;
  try {
    storage.setItem(KEY_PREFIX + slot, JSON.stringify(save));
    return true;
  } catch {
    return false;
  }
}

// One slot as the menu lists it, from a save already read: status
// "empty", "ok" (with simulate.js's saveSummary) or "unreadable". Also
// used by server-saves.js for the server's file.
export function slotListing(slot, save) {
  if (save == null) return { slot, status: "empty", summary: null };
  const summary = saveSummary(save);
  return summary ? { slot, status: "ok", summary } : { slot, status: "unreadable", summary: null };
}

// Every slot, as the menu lists them.
export function listSaves(storage = browserStorage()) {
  return SAVE_SLOTS.map((slot) => {
    let raw = null;
    try {
      raw = storage ? storage.getItem(KEY_PREFIX + slot) : null;
    } catch {
      raw = null;
    }
    if (!raw) return slotListing(slot, null);
    try {
      return slotListing(slot, JSON.parse(raw));
    } catch {
      return { slot, status: "unreadable", summary: null };
    }
  });
}
```

`game/js/settings.js`:

```js
// Sound settings, per user request: music and sound effects switched on
// and off separately (the 🔊 button still mutes everything at once).
// Remembered in this browser -- each device keeps its own.
import { browserStorage } from "./util.js";

const KEY = "td_settings";

export function loadSettings(storage = browserStorage()) {
  try {
    const saved = JSON.parse((storage && storage.getItem(KEY)) || "{}");
    return { music: saved.music !== false, effects: saved.effects !== false };
  } catch {
    return { music: true, effects: true };
  }
}

export function saveSettings(settings, storage = browserStorage()) {
  if (!storage) return false;
  try {
    storage.setItem(KEY, JSON.stringify({ music: Boolean(settings.music), effects: Boolean(settings.effects) }));
    return true;
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Run the tests**

Run: `cd game && node --test js/saves.test.js js/settings.test.js` — Expected: PASS. Then `cd game && node --test` — all pass.

- [ ] **Step 5: Commit**

```bash
git add game/js/util.js game/js/saves.js game/js/saves.test.js game/js/settings.js game/js/settings.test.js
git commit -m "Browser storage for saved games and sound settings"
```

---

### Task 4: The co-op server saves, loads and resumes

**Files:**
- Create: `game/server-saves.js`, `game/server-saves.test.js`
- Modify: `game/server.js`
- Modify: `game/.gitignore`, `game/.vercelignore`

**Interfaces:**
- Consumes: `SAVE_SLOTS`, `slotListing` (Task 3); `canSaveNow`, `createSave`, `restoreSave` (Task 1); `createSaveScheduler` (Task 2).
- Produces: `readSaveFile(file) -> object`, `writeSaveSlot(file, slot, save) -> Promise`, `listSaveFile(file) -> Promise<listing[]>`; server actions `{type: "save", slot: 1|2|3} -> { ok, queued }` and `{type: "load", slot: "auto"|1|2|3} -> { ok }`; `GET /api/saves -> listing[]`; env `DATA_DIR`.

- [ ] **Step 1: Write the failing tests** — `game/server-saves.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { readSaveFile, writeSaveSlot, listSaveFile } from "./server-saves.js";
import { createGameState, createSave } from "./js/simulate.js";

async function tempSavesFile() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "td-saves-"));
  return { file: path.join(dir, "data", "saves.json"), cleanup: () => rm(dir, { recursive: true, force: true }) };
}

test("the server keeps each slot's save in its file", async () => {
  const { file, cleanup } = await tempSavesFile();
  try {
    await writeSaveSlot(file, "auto", createSave(createGameState(3)));
    await writeSaveSlot(file, 2, createSave(createGameState(4)));
    const data = await readSaveFile(file);
    assert.equal(data.auto.level, 3);
    assert.equal(data[2].level, 4);
    const list = await listSaveFile(file);
    assert.deepEqual(list.map((e) => [e.slot, e.status]), [["auto", "ok"], [1, "empty"], [2, "ok"], [3, "empty"]]);
  } finally {
    await cleanup();
  }
});

test("two saves made at once both land", async () => {
  const { file, cleanup } = await tempSavesFile();
  try {
    await Promise.all([writeSaveSlot(file, 1, createSave(createGameState(1))), writeSaveSlot(file, 3, createSave(createGameState(2)))]);
    const data = await readSaveFile(file);
    assert.equal(data[1].level, 1);
    assert.equal(data[3].level, 2);
  } finally {
    await cleanup();
  }
});

test("a missing or damaged saves file reads as no saves, without throwing", async () => {
  const { file, cleanup } = await tempSavesFile();
  try {
    assert.deepEqual(await readSaveFile(file), {});
    await writeSaveSlot(file, 1, createSave(createGameState(1)));
    for (const junk of ["{not json", "[1,2]", "null"]) {
      await writeFile(file, junk);
      assert.deepEqual(await readSaveFile(file), {});
      assert.deepEqual((await listSaveFile(file)).map((e) => e.status), ["empty", "empty", "empty", "empty"]);
    }
    await writeFile(file, JSON.stringify({ auto: { version: 1, level: 77 } }));
    assert.equal((await listSaveFile(file))[0].status, "unreadable");
  } finally {
    await cleanup();
  }
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd game && node --test server-saves.test.js` — Expected: FAIL (module not found).

- [ ] **Step 3: Implement** — `game/server-saves.js`:

```js
// Saved games for the co-op game at home: one JSON file on the PC that
// runs server.js -- { auto, 1, 2, 3 } -- so a save outlives restarting the
// server (per user request: restarting it used to lose the match). Each
// write goes to a temporary file first, then renamed into place, so a
// crash mid-write can't leave the file half-written; and writes queue up
// one behind another, so two at once (an autosave and a player's save)
// can't drop each other's slot.
import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import path from "node:path";
import { SAVE_SLOTS, slotListing } from "./js/saves.js";

// Everything in the file, or {} if it's missing or damaged.
export async function readSaveFile(file) {
  try {
    const data = JSON.parse(await readFile(file, "utf-8"));
    return data && typeof data === "object" && !Array.isArray(data) ? data : {};
  } catch {
    return {};
  }
}

let queue = Promise.resolve();

export function writeSaveSlot(file, slot, save) {
  const write = queue.then(async () => {
    const data = await readSaveFile(file);
    data[slot] = save;
    await mkdir(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    await writeFile(tmp, JSON.stringify(data));
    await rename(tmp, file);
  });
  queue = write.catch(() => {});
  return write;
}

// Every slot, as the menu lists them (saves.js's shape).
export async function listSaveFile(file) {
  const data = await readSaveFile(file);
  return SAVE_SLOTS.map((slot) => slotListing(slot, data[slot] ?? null));
}
```

Then `game/server.js`:

1. Imports — the simulate.js import list gains `canSaveNow, createSave, restoreSave`, and add:

```js
import { createSaveScheduler } from "./js/autosave.js";
import { readSaveFile, writeSaveSlot, listSaveFile } from "./server-saves.js";
```

2. After `const GAME_DIR = ...`:

```js
// This host's runtime files: the shared ranking and the saved games.
// DATA_DIR lets a test instance keep its own, away from the family's.
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(GAME_DIR, "data");
const SAVES_PATH = path.join(DATA_DIR, "saves.json");
```

and change `LEADERBOARD_PATH` to `path.join(DATA_DIR, "leaderboard.json")`.

3. Replace `let state = createGameState();` with:

```js
// Saves are written as the game goes (autosave.js): the autosave between
// waves, and a save asked for mid-wave once the wave is over. Writing is
// asynchronous here, so a failure is only logged.
const saves = createSaveScheduler((slot, save) => {
  writeSaveSlot(SAVES_PATH, slot, save).catch((err) => console.error(`Couldn't save (slot ${slot}):`, err.message));
  return true;
});

// Per user request, the game picks up where it was: restarting the server
// (to update the game, say) resumes the last autosave -- paused, for
// whoever reconnects -- instead of starting over.
const resumed = restoreSave((await readSaveFile(SAVES_PATH)).auto);
let state = resumed || createGameState();
saves.reset(state, { saved: Boolean(resumed) });
if (resumed) console.log(`Resumed the saved game: level ${state.level}, wave ${state.waveIndex + 1} (paused).`);
```

4. In the tick, call `saves.tick(state);` right before `stepSimulation(state, dt);`.

5. `ACTION_HANDLERS` — `restart` also calls `saves.reset(state);` after creating the new state; `nextLevel` is unchanged; add:

```js
  // Saved games (data/saves.json). A save asked for mid-wave is made when
  // the wave ends; loading changes the game for everyone connected, like
  // restart does.
  save: async (body) => {
    const slot = Number(body.slot);
    if (![1, 2, 3].includes(slot)) return { ok: false, reason: "bad-slot" };
    if (state.gameOver || state.win || state.levelComplete) return { ok: false, reason: "game-over" };
    if (!canSaveNow(state)) {
      saves.request(slot, state);
      return { ok: true, queued: true };
    }
    try {
      await writeSaveSlot(SAVES_PATH, slot, createSave(state));
      return { ok: true, queued: false };
    } catch {
      return { ok: false, reason: "write-failed" };
    }
  },
  load: async (body) => {
    const slot = body.slot === "auto" ? "auto" : Number(body.slot);
    const restored = restoreSave((await readSaveFile(SAVES_PATH))[slot]);
    if (!restored) return { ok: false, reason: "unreadable" };
    state = restored;
    saves.reset(state); // «Continuar» now means this game
    return { ok: true };
  },
```

6. In the `/api/action` handler: `result = handler ? await handler(body) : { ok: false, reason: "unknown-action" };`

7. Before the `/api/leaderboard` routes:

```js
  if (urlPath === "/api/saves" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(await listSaveFile(SAVES_PATH)));
    return;
  }
```

8. `game/.gitignore`: add `data/saves.json` and `data/saves.json.tmp`. `game/.vercelignore`: add `data`, `server-saves.js`, `server-saves.test.js`.

- [ ] **Step 4: Run the tests**

Run: `cd game && node --test` — Expected: all pass.

- [ ] **Step 5: Check the server by hand** (test port and a temporary data folder — never 8420):

```bash
cd game && mkdir -p /tmp/td-data && PORT=8431 DATA_DIR=/tmp/td-data node server.js
```

In another shell:

```bash
curl -s -X POST -H "Content-Type: application/json" -d '{"type":"restart","level":2}' http://127.0.0.1:8431/api/action
curl -s http://127.0.0.1:8431/api/saves
curl -s -X POST -H "Content-Type: application/json" -d '{"type":"save","slot":1}' http://127.0.0.1:8431/api/action
```

Expected: the saves list shows `auto` as `ok` (level 2) right after the restart; the save answers `{"ok":true,"queued":true}` mid-wave (or `queued:false` between waves). Stop the server and start it again with the same command: it prints «Resumed the saved game: level 2, wave N (paused).», and `GET /api/state` shows `"paused":true`. `POST {"type":"load","slot":"auto"}` answers `{"ok":true}`.

- [ ] **Step 6: Commit**

```bash
git add game/server-saves.js game/server-saves.test.js game/server.js game/.gitignore game/.vercelignore
git commit -m "Co-op server: saves on its PC, resumes the last autosave on restart"
```

---

### Task 5: Menus, pause menu, sound settings — wired into the game

**Files:**
- Create: `game/js/menu.js`, `game/js/menu.test.js`
- Modify: `game/index.html`, `game/style.css`, `game/js/audio.js`, `game/js/main.js`

**Interfaces:**
- Consumes: everything above.
- Produces: `describeSave(summary) -> string`; `createMenu(root, handlers) -> { openMain(), openPause(), openNewGame(), close(), back(), isOpen() }` with `handlers = { networked, listSaves(), canStore(), canSaveNow(), hasGame(), getSettings(), onContinue(), onNewGame(level), onLoad(slot), onSave(slot), onRecords(), onQuitToMain(), onResume(), onSettingsChange(settings) }`; audio `setMusicOn(on)`, `setEffectsOn(on)`.

- [ ] **Step 1: Write the failing test** — `game/js/menu.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { describeSave } from "./menu.js";

test("a save is listed as level, wave, lives, money and when", () => {
  const text = describeSave({ level: 4, wave: 12, lives: 15, money: 320, savedAt: "2026-10-08T18:30:00.000Z" });
  assert.match(text, /^Nivel 4 · Oleada 12 · ❤ 15 · \$320 · \d\d\/\d\d \d\d:\d\d$/);
  assert.equal(describeSave({ level: 1, wave: 1, lives: 20, money: 150, savedAt: null }), "Nivel 1 · Oleada 1 · ❤ 20 · $150");
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd game && node --test js/menu.test.js` — Expected: FAIL (module not found).

- [ ] **Step 3: Implement `game/js/menu.js`:**

```js
// The main menu and the in-game pause menu, per user request (see
// docs/2026-10-08-menu-y-guardado-design.md): one overlay, #menu, holding
// every screen, opened either as the main menu (its home screen, over a
// darkened map) or as the pause menu. This module only shows screens and
// reports what the player picked; main.js does the starting, loading and
// saving, through `handlers`:
//   networked           -- the co-op game at home (server.js)
//   listSaves()         -- Promise of [{ slot, status, summary }] (saves.js)
//   canStore()          -- whether saves can be kept here at all
//   canSaveNow()        -- between waves (otherwise a save waits)
//   hasGame()           -- a solo game is going on behind the menu
//   getSettings()       -- { music, effects }
//   onContinue(), onNewGame(level), onLoad(slot), onSave(slot),
//   onRecords(), onQuitToMain(), onResume(), onSettingsChange(settings)

const SLOT_NAMES = { auto: "Autoguardado", 1: "Hueco 1", 2: "Hueco 2", 3: "Hueco 3" };
const pad = (n) => String(n).padStart(2, "0");

// "Nivel 4 · Oleada 12 · ❤ 15 · $320 · 08/10 18:30": a save as the menu
// lists it, the date in this device's own time.
export function describeSave(summary) {
  const when = summary.savedAt ? new Date(summary.savedAt) : null;
  const date =
    when && !Number.isNaN(when.getTime())
      ? ` · ${pad(when.getDate())}/${pad(when.getMonth() + 1)} ${pad(when.getHours())}:${pad(when.getMinutes())}`
      : "";
  return `Nivel ${summary.level} · Oleada ${summary.wave} · ❤ ${summary.lives} · $${summary.money}${date}`;
}

export function createMenu(root, handlers) {
  const titleEl = root.querySelector(".menu-title");
  const screens = [...root.querySelectorAll(".menu-screen")];
  const confirmEl = root.querySelector(".menu-confirm");
  const confirmText = root.querySelector(".menu-confirm-text");
  let context = null; // "main" or "pause" while open
  let current = null;
  let history = [];
  let autosaveExists = false;
  let answerConfirm = null;

  function open(ctx, screen) {
    context = ctx;
    history = [];
    current = null;
    root.classList.remove("hidden");
    root.classList.toggle("main", ctx === "main");
    titleEl.textContent = ctx === "main" ? "TOWER DEFENSE" : "MENÚ";
    document.body.classList.add("menu-open");
    show(screen, false);
  }

  function close() {
    context = null;
    root.classList.add("hidden");
    document.body.classList.remove("menu-open");
    settleConfirm(false);
  }

  function show(name, remember = true) {
    if (remember && current) history.push(current);
    current = name;
    for (const el of screens) el.classList.toggle("hidden", el.dataset.screen !== name);
    if (name === "home") renderHome();
    else if (name === "load" || name === "save") renderSlots(name);
    else if (name === "settings") renderSettings();
    else if (name === "multiplayer") renderMultiplayer();
  }

  // "Volver", or Esc: answers a question still open with "No", else goes
  // back a screen, else (on the pause menu's own screen) closes it.
  function back() {
    if (answerConfirm) return settleConfirm(false);
    if (history.length) return show(history.pop(), false);
    if (context === "pause") {
      close();
      handlers.onResume();
    }
  }

  // A yes/no question over the current screen; resolves true for "Sí".
  function confirm(message) {
    settleConfirm(false);
    confirmText.textContent = message;
    confirmEl.classList.remove("hidden");
    return new Promise((resolve) => {
      answerConfirm = resolve;
    });
  }

  function settleConfirm(answer) {
    if (!answerConfirm) return;
    const resolve = answerConfirm;
    answerConfirm = null;
    confirmEl.classList.add("hidden");
    resolve(answer);
  }

  async function renderHome() {
    const cont = root.querySelector('[data-do="continue"]');
    if (handlers.networked) {
      cont.textContent = "Volver a la partida";
      cont.classList.remove("hidden");
      return;
    }
    cont.textContent = "Continuar";
    cont.classList.add("hidden");
    const list = await handlers.listSaves();
    autosaveExists = list.some((e) => e.slot === "auto" && e.status === "ok");
    if (current === "home") cont.classList.toggle("hidden", !autosaveExists);
  }

  async function renderSlots(mode) {
    const screen = root.querySelector(`.menu-screen[data-screen="${mode}"]`);
    const listEl = screen.querySelector(".save-list");
    const note = screen.querySelector(".menu-note");
    listEl.textContent = "";
    if (!handlers.canStore()) note.textContent = "Este navegador no permite guardar partidas.";
    else if (mode === "save" && !handlers.canSaveNow()) note.textContent = "Estás en mitad de una oleada: se guardará al terminarla.";
    else note.textContent = "";
    const list = await handlers.listSaves();
    if (current !== mode) return; // the player moved on while the list loaded
    for (const entry of list) {
      if (mode === "save" && entry.slot === "auto") continue;
      const row = document.createElement("div");
      row.className = "save-row";
      const name = document.createElement("span");
      name.className = "save-row-name";
      name.textContent = SLOT_NAMES[entry.slot];
      const desc = document.createElement("span");
      desc.className = "save-row-desc";
      if (entry.status === "ok") {
        desc.textContent = describeSave(entry.summary);
      } else {
        desc.textContent = entry.status === "empty" ? "Vacío" : "No se puede cargar";
        desc.classList.add("empty");
      }
      const button = document.createElement("button");
      if (mode === "load") {
        button.textContent = "Cargar";
        button.disabled = entry.status !== "ok";
        button.addEventListener("click", () => chooseLoad(entry.slot));
      } else {
        button.textContent = "Guardar aquí";
        button.disabled = !handlers.canStore();
        button.addEventListener("click", () => chooseSave(entry));
      }
      row.append(name, desc, button);
      listEl.append(row);
    }
  }

  function renderSettings() {
    const settings = handlers.getSettings();
    for (const box of root.querySelectorAll("input[data-setting]")) box.checked = Boolean(settings[box.dataset.setting]);
  }

  function renderMultiplayer() {
    root.querySelector(".lan-info").textContent = handlers.networked
      ? `Ya estáis jugando en red. Los demás dispositivos de casa pueden unirse abriendo ${location.origin}`
      : "Para jugar en red en casa, el juego tiene que abrirse desde el ordenador que hace de servidor.";
    root.querySelector('[data-do="continue-lan"]').classList.toggle("hidden", !handlers.networked);
  }

  async function chooseLevel(level) {
    if (handlers.networked) {
      if (!(await confirm("Esto empezará una partida nueva para todos los jugadores. ¿Seguir?"))) return;
    } else if (handlers.hasGame() || autosaveExists) {
      if (!(await confirm("La partida nueva sustituirá a la de «Continuar». ¿Empezar?"))) return;
    }
    handlers.onNewGame(level);
  }

  async function chooseLoad(slot) {
    if (handlers.networked) {
      if (!(await confirm("Esto cambiará la partida para todos los jugadores. ¿Cargar?"))) return;
    } else if (context === "pause") {
      if (!(await confirm("Se perderá lo jugado desde el último guardado. ¿Cargar esta partida?"))) return;
    }
    handlers.onLoad(slot);
  }

  async function chooseSave(entry) {
    if (entry.status !== "empty") {
      if (!(await confirm(`Ya hay una partida en el ${SLOT_NAMES[entry.slot].toLowerCase()}. ¿Sobrescribirla?`))) return;
    }
    handlers.onSave(entry.slot);
    back();
  }

  async function quitToMain() {
    if (!handlers.networked) {
      if (!(await confirm("Lo jugado se conserva hasta la última oleada terminada. ¿Salir al menú principal?"))) return;
    }
    handlers.onQuitToMain();
  }

  function doAction(name) {
    if (name === "continue" || name === "continue-lan") handlers.onContinue();
    else if (name === "records") handlers.onRecords();
    else if (name === "resume") {
      close();
      handlers.onResume();
    } else if (name === "quit") quitToMain();
  }

  root.addEventListener("click", (evt) => {
    const target = evt.target;
    if (target.closest(".menu-confirm-yes")) return settleConfirm(true);
    if (target.closest(".menu-confirm-no")) return settleConfirm(false);
    const go = target.closest("[data-go]");
    if (go) return show(go.dataset.go);
    const act = target.closest("[data-do]");
    if (act) return doAction(act.dataset.do);
    const levelBtn = target.closest(".start-level-btn");
    if (levelBtn) return chooseLevel(Number(levelBtn.dataset.level));
    if (target.closest(".menu-back")) back();
  });

  for (const box of root.querySelectorAll("input[data-setting]")) {
    box.addEventListener("change", () => {
      const settings = {};
      for (const b of root.querySelectorAll("input[data-setting]")) settings[b.dataset.setting] = b.checked;
      handlers.onSettingsChange(settings);
    });
  }

  return {
    openMain: () => open("main", "home"),
    openPause: () => open("pause", "pause"),
    // After a finished game: straight to choosing how to play the next one.
    openNewGame: () => {
      open("main", "home");
      show("mode");
    },
    close,
    back,
    isOpen: () => context !== null,
  };
}
```

- [ ] **Step 4: Run the test**

Run: `cd game && node --test js/menu.test.js` — Expected: PASS.

- [ ] **Step 5: Markup** — in `game/index.html`, replace the whole `<div id="start-menu" class="hidden">…</div>` block with:

```html
      <div id="menu" class="hidden">
        <div class="menu-panel">
          <div class="menu-title">TOWER DEFENSE</div>
          <div class="menu-screen" data-screen="home">
            <button class="menu-btn hidden" data-do="continue">Continuar</button>
            <button class="menu-btn" data-go="mode">Nueva partida</button>
            <button class="menu-btn" data-go="load">Cargar partida</button>
            <button class="menu-btn" data-go="multiplayer">Multijugador</button>
            <button class="menu-btn" data-do="records">Récords</button>
            <button class="menu-btn" data-go="settings">Ajustes</button>
          </div>
          <div class="menu-screen hidden" data-screen="pause">
            <button class="menu-btn" data-do="resume">Seguir</button>
            <button class="menu-btn" data-go="save">Guardar partida</button>
            <button class="menu-btn" data-go="load">Cargar partida</button>
            <button class="menu-btn" data-go="mode">Nueva partida</button>
            <button class="menu-btn" data-go="settings">Ajustes</button>
            <button class="menu-btn" data-do="quit">Salir al menú principal</button>
          </div>
          <div class="menu-screen hidden" data-screen="mode">
            <div class="menu-subtitle">¿Cómo quieres jugar?</div>
            <div class="menu-choices">
              <button class="menu-choice" data-go="levels">
                <span class="menu-choice-name">Defender</span>
                <span class="menu-choice-desc">Construye torres y protege la base</span>
              </button>
              <button class="menu-choice" disabled>
                <span class="menu-choice-name">Atacar</span>
                <span class="menu-choice-desc">Próximamente</span>
              </button>
            </div>
            <button class="menu-back">Volver</button>
          </div>
          <div class="menu-screen hidden" data-screen="levels">
            <div class="menu-subtitle">Elige nivel</div>
            <div id="start-menu-levels">
              <button class="start-level-btn" data-level="1">
                <span class="start-level-name">Nivel 1</span>
                <span class="start-level-subtitle">Campo</span>
              </button>
              <button class="start-level-btn" data-level="2">
                <span class="start-level-name">Nivel 2</span>
                <span class="start-level-subtitle">Ciudad</span>
              </button>
              <button class="start-level-btn" data-level="3">
                <span class="start-level-name">Nivel 3</span>
                <span class="start-level-subtitle">Base (mapa grande)</span>
              </button>
              <button class="start-level-btn" data-level="4">
                <span class="start-level-name">Nivel 4</span>
                <span class="start-level-subtitle">Ciudad en ruinas (mapa grande)</span>
              </button>
            </div>
            <button class="menu-back">Volver</button>
          </div>
          <div class="menu-screen hidden" data-screen="load">
            <div class="menu-subtitle">Cargar partida</div>
            <div class="menu-note"></div>
            <div class="save-list"></div>
            <button class="menu-back">Volver</button>
          </div>
          <div class="menu-screen hidden" data-screen="save">
            <div class="menu-subtitle">Guardar partida</div>
            <div class="menu-note"></div>
            <div class="save-list"></div>
            <button class="menu-back">Volver</button>
          </div>
          <div class="menu-screen hidden" data-screen="multiplayer">
            <div class="menu-subtitle">Multijugador</div>
            <div class="menu-options">
              <div class="menu-option">
                <div class="menu-option-name">En casa (red local)</div>
                <div class="menu-option-desc lan-info"></div>
                <button class="menu-btn hidden" data-do="continue-lan">Volver a la partida</button>
              </div>
              <div class="menu-option soon">
                <div class="menu-option-name">2 jugadores en este PC</div>
                <div class="menu-option-desc">Próximamente</div>
              </div>
              <div class="menu-option soon">
                <div class="menu-option-name">En línea</div>
                <div class="menu-option-desc">Próximamente: salas con código para invitar a amigos</div>
              </div>
            </div>
            <button class="menu-back">Volver</button>
          </div>
          <div class="menu-screen hidden" data-screen="settings">
            <div class="menu-subtitle">Ajustes</div>
            <label class="menu-toggle"><input type="checkbox" data-setting="music" /> Música</label>
            <label class="menu-toggle"><input type="checkbox" data-setting="effects" /> Efectos de sonido</label>
            <button class="menu-back">Volver</button>
          </div>
        </div>
        <div class="menu-confirm hidden">
          <div class="menu-confirm-box">
            <div class="menu-confirm-text"></div>
            <div class="menu-confirm-buttons">
              <button class="menu-confirm-yes">Sí</button>
              <button class="menu-confirm-no">No</button>
            </div>
          </div>
        </div>
      </div>
      <div id="toast" class="hidden"></div>
```

and in `#top-controls` replace `<button id="reset-btn" title="Reiniciar partida">⟲</button>` with `<button id="menu-btn" title="Menú (Esc)">☰</button>`.

- [ ] **Step 6: Styles** — in `game/style.css`:
  - In `#stats-overlay`, change `z-index: 12;` to `z-index: 30;` (Récords opens over the menu).
  - Replace the `#start-menu`, `#start-menu.hidden`, `#start-menu-modal` and `#start-menu-title` rules (keep `#start-menu-levels` and every `.start-level-*` rule) with:

```css
/* Main menu and pause menu (js/menu.js), per user request: one overlay
   with every screen -- the main menu over a darkened map, the pause menu
   over the game. Same holographic language as the other panels: dark
   panel, cyan edge, yellow titles, olive buttons. */
#menu {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.72);
  font-family: sans-serif;
  z-index: 20;
}
#menu.main {
  background: linear-gradient(rgba(0, 0, 0, 0.55), rgba(0, 0, 0, 0.82)), url(assets/map_bg_level4.jpg) center / cover;
}
#menu.hidden { display: none; }
.menu-panel {
  min-width: 420px;
  padding: 24px 34px;
  background: rgba(6, 10, 12, 0.92);
  border: 1px solid #6fd8e6;
  border-radius: 6px;
  box-shadow: 0 0 24px rgba(111, 216, 230, 0.5), inset 0 0 30px rgba(0, 0, 0, 0.7);
  text-align: center;
  color: #dffcff;
}
.menu-title {
  font-size: 40px;
  font-weight: bold;
  letter-spacing: 6px;
  color: #ffe27a;
  text-shadow: 0 0 14px rgba(255, 226, 122, 0.7);
  margin-bottom: 16px;
}
.menu-screen.hidden { display: none; }
.menu-subtitle {
  font-size: 20px;
  font-weight: bold;
  color: #ffe27a;
  margin-bottom: 14px;
}
.menu-btn {
  display: block;
  width: 290px;
  height: 44px;
  margin: 10px auto;
  font-size: 18px;
  font-weight: bold;
  letter-spacing: 0.5px;
  cursor: pointer;
  color: #f2e9c9;
  border: none;
  border-radius: 4px;
  background: linear-gradient(#5c6a3f, #3a4326);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.25), inset 0 -2px 3px rgba(0, 0, 0, 0.5);
}
.menu-btn:hover { filter: brightness(1.2); }
.menu-btn.hidden { display: none; }
.menu-back {
  display: block;
  margin: 16px auto 0;
  padding: 8px 24px;
  font-size: 15px;
  cursor: pointer;
  color: #dffcff;
  background: #163238;
  border: 1px solid #6fd8e6;
  border-radius: 4px;
}
.menu-back:hover { filter: brightness(1.2); }
.menu-choices { display: flex; gap: 20px; justify-content: center; }
.menu-choice {
  width: 240px;
  padding: 22px 16px;
  cursor: pointer;
  color: #dffcff;
  background: #102226;
  border: 1px solid #6fd8e6;
  border-radius: 6px;
}
.menu-choice:hover:not(:disabled) { filter: brightness(1.25); }
.menu-choice:disabled { cursor: not-allowed; opacity: 0.45; }
.menu-choice-name { display: block; font-size: 22px; font-weight: bold; color: #ffe27a; margin-bottom: 6px; }
.menu-choice-desc { display: block; font-size: 14px; }
.menu-note { min-height: 18px; margin-bottom: 8px; font-size: 14px; color: #a9e8b0; }
.save-list { display: flex; flex-direction: column; gap: 8px; min-width: 560px; }
.save-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  text-align: left;
  background: #102226;
  border: 1px solid #2c5a62;
  border-radius: 4px;
}
.save-row-name { width: 120px; font-weight: bold; color: #ffe27a; }
.save-row-desc { flex: 1; font-size: 14px; }
.save-row-desc.empty { color: #7d9aa0; font-style: italic; }
.save-row button {
  padding: 6px 14px;
  font-weight: bold;
  cursor: pointer;
  color: #f2e9c9;
  border: none;
  border-radius: 4px;
  background: linear-gradient(#5c6a3f, #3a4326);
}
.save-row button:disabled { cursor: not-allowed; filter: grayscale(0.7) brightness(0.6); }
.menu-options { display: flex; flex-direction: column; gap: 10px; min-width: 480px; text-align: left; }
.menu-option { padding: 10px 14px; background: #102226; border: 1px solid #2c5a62; border-radius: 4px; }
.menu-option.soon { opacity: 0.5; }
.menu-option-name { margin-bottom: 4px; font-weight: bold; color: #ffe27a; }
.menu-option-desc { font-size: 14px; }
.menu-option .menu-btn { margin: 10px 0 0; }
.menu-toggle {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 260px;
  margin: 12px auto;
  font-size: 18px;
  text-align: left;
  cursor: pointer;
}
.menu-toggle input { width: 22px; height: 22px; cursor: pointer; }
.menu-confirm {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.6);
}
.menu-confirm.hidden { display: none; }
.menu-confirm-box {
  max-width: 460px;
  padding: 22px 26px;
  font-size: 17px;
  color: #dffcff;
  background: #060a0c;
  border: 1px solid #ffe27a;
  border-radius: 6px;
  box-shadow: 0 0 24px rgba(255, 226, 122, 0.35);
}
.menu-confirm-buttons { display: flex; gap: 14px; justify-content: center; margin-top: 18px; }
.menu-confirm-buttons button {
  min-width: 110px;
  height: 38px;
  font-size: 16px;
  font-weight: bold;
  cursor: pointer;
  color: #f2e9c9;
  border: none;
  border-radius: 4px;
  background: linear-gradient(#5c6a3f, #3a4326);
}
.menu-confirm-buttons .menu-confirm-no { color: #dffcff; background: #163238; border: 1px solid #6fd8e6; }
/* The game's own controls stay out of the way while a menu is open. */
body.menu-open #top-controls,
body.menu-open #build-menu,
body.menu-open #nav-controls { display: none; }

/* Short messages ("Partida guardada en el hueco 2"...). */
#toast {
  position: absolute;
  left: 50%;
  top: 64px;
  transform: translateX(-50%);
  padding: 10px 20px;
  font-family: sans-serif;
  font-size: 16px;
  color: #dffcff;
  background: rgba(6, 10, 12, 0.92);
  border: 1px solid #6fd8e6;
  border-radius: 6px;
  z-index: 50;
  pointer-events: none;
  transition: opacity 0.3s;
}
#toast.hidden { opacity: 0; }
```

- [ ] **Step 7: Sound settings** — `game/js/audio.js`:

after `let muted = false;` add

```js
// Per user request, music and sound effects can each be switched off for
// good from the settings menu (settings.js remembers them), on top of the
// 🔊 button muting everything at once.
let musicOn = true;
let effectsOn = true;
export function setMusicOn(on) {
  musicOn = on;
  syncMusicMute();
}
export function setEffectsOn(on) {
  effectsOn = on;
}
```

change `syncMusicMute` to `if (musicEl) musicEl.muted = muted || !musicOn;`, and in `playSound` change `if (muted) return;` to `if (muted || !effectsOn) return;`.

- [ ] **Step 8: Wire it into `game/js/main.js`:**

1. Imports — add to the simulate.js list: `canSaveNow, restoreSave`; add:

```js
import { createSaveScheduler } from "./autosave.js";
import { readSave, writeSave, listSaves, canStore } from "./saves.js";
import { loadSettings, saveSettings } from "./settings.js";
import { createMenu } from "./menu.js";
```

and the audio.js import gains `setMusicOn, setEffectsOn`.

2. Replace the whole «Level-select start screen» section (from its comment block through `resetBtn.addEventListener("click", restartToLevelSelect);`) with:

```js
// --- Menus, saved games, settings ----------------------------------------
// Per user request (docs/2026-10-08-menu-y-guardado-design.md): a main
// menu first, a pause menu during play (☰ or Esc), saving and loading.
// `started` gates stepSimulation in LOCAL mode only: a fresh
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
  // Forces loop()'s "state.level changed" check to re-fire even for the
  // SAME level number (replaying level 3 after a loss, loading another
  // level-3 game) so the camera recenters on the new game.
  lastCameraLevel = null;
  gameEndOverlay.classList.add("hidden");
  gameEndShown = false;
}

function startNewGame(level) {
  if (networked) {
    postAction({ type: "restart", level });
  } else {
    state = createGameState(level);
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
    const restored = restoreSave(readSave(slot));
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
  showToast(result.done ? savedMessage(slot, result.result) : "Se guardará al terminar la oleada");
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
  networked: false, // set for real in boot(), before the menu first opens
  listSaves: listSavesForMenu,
  canStore: () => networked || canStore(),
  canSaveNow: () => canSaveNow(state),
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
```

`createMenu` reads `handlers.networked` when it renders, so make it a getter instead of a value: replace `networked: false, // set for real in boot()...` with

```js
  get networked() {
    return networked;
  },
```

3. In `gameEndCloseBtn`'s click handler, replace `restartToLevelSelect();` with `backToNewGame();`.

4. In the keydown handler, replace the body of the `if (key === "r") { … }` branch's last call `restartToLevelSelect();` with `backToNewGame();`, and add at the top of the handler (after `const key = evt.key.toLowerCase();`):

```js
  if (key === "escape") {
    // Esc first lets go of a tower or wall picked to build; otherwise it
    // opens the pause menu, or (in a menu) goes back a screen.
    if (selectedBuildType) {
      selectedBuildType = null;
    } else if (menu.isOpen()) {
      menu.back();
    } else {
      openPauseMenu();
    }
    return;
  }
  if (menu.isOpen()) return; // no panning or R under a menu
```

5. In `boot()`, replace `showStartMenu();` with `menu.openMain();`.

6. In `loop()`, replace

```js
  if (!networked && started) {
    stepSimulation(state, dt);
  }
```

with

```js
  if (!networked && started) {
    // Before stepping: a level's start is only between waves until its
    // first tick spawns the opening units.
    saveScheduler.tick(state, (slot, ok) => showToast(savedMessage(slot, ok)));
    stepSimulation(state, dt);
  }
```

- [ ] **Step 9: Run every test**

Run: `cd game && node --test` — Expected: all pass.

- [ ] **Step 10: Check it in the browser** (static server on 8421 for solo; `PORT=8431 DATA_DIR=<temp>` for co-op):
  - First screen: the main menu, «TOWER DEFENSE», no «Continuar» on a clean browser.
  - Nueva partida → ¿Cómo quieres jugar? (Atacar greyed) → Elige nivel → the game starts.
  - Esc and ☰ open the pause menu (game paused); Seguir/Esc close it; a ⏸-paused game stays paused.
  - Guardar partida mid-wave → toast «Se guardará al terminar la oleada», and the slot shows up when the wave ends; between waves → «Partida guardada en el hueco N».
  - Salir al menú principal → «Continuar» appears; it brings back the last wave boundary, paused.
  - Cargar partida lists autosave + 3 slots with level/wave/lives/money/date; loading works from the main and the pause menu (with confirmation in the pause menu).
  - Ajustes: music and effects switch off and stay off after reloading.
  - Récords opens over the menu.
  - Co-op (8431): joins straight into the game; ☰ doesn't pause anybody; «Volver a la partida»; saving/loading through the server; Multijugador shows the address.
  - Close the browser tab afterwards (the music keeps playing in a hidden pane).

- [ ] **Step 11: Commit**

```bash
git add game/index.html game/style.css game/js/menu.js game/js/menu.test.js game/js/audio.js game/js/main.js
git commit -m "Main menu, pause menu and saved games in the game; music and effects settings"
```
