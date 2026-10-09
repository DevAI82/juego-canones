// The attack mode (docs/2026-10-09-modo-atacante-design.md): the player
// commands an army against a defence run by the computer (defenseAI.js).
// DOM-free like simulate.js, whose pieces it reuses: the defence's towers,
// wall blocks and money and the base's lives (state.economy) are the
// defence game's own, and the army's units are the defence game's enemy
// units (enemy.js) -- same stats, sprites and driving -- moved by the
// player's orders instead of along a fixed road.
import { assignId } from "./ids.js";
import { levelData, narrowsOf, solidSegmentsOf, MAX_LEVEL } from "./levels.js";
import { createEnemy, stepEnemy, ENEMY_TYPES, FOOTPRINT } from "./enemy.js";
import { loseLife } from "./economy.js";
import { pushOutOfPolygons } from "./map.js";
import {
  createGameState,
  separateEnemies,
  fireTowers,
  fireUnits,
  stepShots,
  clearDestroyed,
  SAVE_VERSION,
  boardForSave,
  restoreBoard,
} from "./simulate.js";
import { attackMapOf, roadRoute, spreadStops, pointAlong, routeLength, routePrefix } from "./roadGraph.js";
import { DIFFICULTIES, AI_PERIOD, aiPrepare, aiStep } from "./defenseAI.js";
import { createFog, updateFog, saveFog, restoreFog, SIGHT, ENTRY_SIGHT } from "./fog.js";

export const ROUNDS = 15;
export const ROUND_TIME = 60;
export const UNIT_CAP = 60;
// Seconds between the units bought during a round coming in.
export const SPAWN_INTERVAL = 0.5;
// The attacker's pay besides each round's: a share of the damage done to
// towers and wall blocks, and a bonus for each unit that gets into the base.
export const DAMAGE_REWARD = 0.25;
// Wall blocks pay this share of that rate per point of damage: a block is
// cheap health ($15 for 150 points) and at the full rate one destroyed paid
// the attacker 2.5 times its price (bot games: a defence building walls
// funded the army that shot them down).
export const WALL_REWARD_SHARE = 0.2;
export const ENTRY_REWARD = 20;
// A right-click this close to the base sends the units into it.
export const BASE_CLICK_RADIUS = 60;
// What the defence earns for each unit it destroys: this share of the
// defence game's bounty for that type (enemy.js). Tuned with bot games
// (plan C): an army is dozens of kills a round, and with the whole bounty
// the defence's money ran away with the game -- at these prices the bot
// won 17 % of its games on Easy.
export const BOUNTY_SHARE = 0.25;
// How close to the map's edge a unit may get.
const MAP_MARGIN = 10;

// What the attacker is paid as round `round` starts (round 1's: when the
// preparation starts). Tuned with bot games, like the prices below (plan
// C; the design's first values were $150 + $25 a round and $15, $25, $35,
// $90 and $120 -- the bot lost almost every game even on Easy).
export function roundIncome(round) {
  return 250 + 50 * (round - 1);
}

// The shop, cheapest first.
export const UNIT_ORDER = ["soldier", "motorcycle", "buggy", "tank", "rocket"];
export const UNIT_PRICES = { soldier: 10, motorcycle: 15, buggy: 20, tank: 50, rocket: 70 };

// Five upgrades per unit type, five levels each, level k costing
// baseCost x k; each level multiplies one stat. Units carry no magazine,
// so the towers' ammo upgrade becomes rate of fire (time between shots).
export const UNIT_UPGRADES = {
  damage: { levels: 5, baseCost: 60, mult: 1.25 },
  range: { levels: 5, baseCost: 40, mult: 1.15 },
  armor: { levels: 5, baseCost: 60, mult: 1 / 0.85 },
  rate: { levels: 5, baseCost: 60, mult: 0.85 },
  speed: { levels: 5, baseCost: 40, mult: 1.06 },
};

export function unitUpgradeCost(skill, currentLevel) {
  return UNIT_UPGRADES[skill].baseCost * (currentLevel + 1);
}

function freshUpgrades() {
  const out = {};
  for (const type of UNIT_ORDER) out[type] = { damage: 0, range: 0, armor: 0, rate: 0, speed: 0 };
  return out;
}

// A unit's stats at its type's upgrade levels, from the defence game's
// stats for that type. Armor raises maximum health and, as with a tower's,
// adds the extra to the health the unit has now.
export function applyUnitUpgrades(u, levels) {
  const def = ENEMY_TYPES[u.type];
  const up = UNIT_UPGRADES;
  u.speed = def.speed * u.jitter * up.speed.mult ** levels.speed;
  u.fireDamage = def.fireDamage * up.damage.mult ** levels.damage;
  u.fireRange = def.fireRange * up.range.mult ** levels.range;
  u.fireCooldown = def.fireCooldown * up.rate.mult ** levels.rate;
  const maxHp = Math.round(def.hp * up.armor.mult ** levels.armor);
  u.hp += maxHp - u.maxHp;
  u.maxHp = maxHp;
}

// A unit of the army standing at (x, y), facing `angle`, waiting for orders.
function createUnit(state, type, x, y, angle) {
  const u = createEnemy(type, [{ x, y }]);
  // createEnemy gives each unit its own speed, +/-10%: kept through upgrades.
  u.jitter = u.speed / ENEMY_TYPES[type].speed;
  u.bounty = Math.round(ENEMY_TYPES[type].bounty * BOUNTY_SHARE);
  u.angle = angle;
  u.v = 0;
  u.order = null;
  applyUnitUpgrades(u, state.attack.upgrades[type]);
  return assignId(u);
}

const playing = (state) => state.mode === "attack" && !state.gameOver;
const mapOf = (state) => attackMapOf(levelData(state.level));

// What the attacker's fog shows: what the units and the map's entries see.
function refreshFog(state) {
  const viewers = state.enemies.filter((u) => u.alive).map((u) => ({ x: u.x, y: u.y, r: SIGHT[u.type] }));
  for (const e of mapOf(state).entries) viewers.push({ x: e.x, y: e.y, r: ENTRY_SIGHT });
  updateFog(state.attack.fog, viewers, [...state.towers, ...state.walls]);
}

// A new attack on `level` against a defence of `difficulty` ("easy",
// "normal" or "hard"), in preparation: round 1's money paid, no clock
// running and -- unless aiSetup is false (a loaded game brings its own
// towers; tests want an empty map) -- the defence's first towers up.
export function createAttackState(level = 1, difficulty = "normal", { aiSetup = true } = {}) {
  const state = createGameState(level);
  const L = levelData(state.level);
  const diff = DIFFICULTIES[difficulty] ? difficulty : "normal";
  state.mode = "attack";
  state.spawnQueue = [];
  state.economy.money = DIFFICULTIES[diff].startMoney;
  state.attack = {
    difficulty: diff,
    phase: "prep",
    round: 1,
    roundLeft: ROUND_TIME,
    roundJustStarted: false,
    money: roundIncome(1),
    upgrades: freshUpgrades(),
    entry: 0,
    queue: [],
    spawnTimer: 0,
    aiTimer: AI_PERIOD,
    winner: null,
    stats: { moneySpent: 0, moneyEarned: 0, livesTaken: 0 },
    fog: createFog(L.worldWidth, L.worldHeight),
  };
  if (aiSetup) aiPrepare(state, diff);
  refreshFog(state);
  return state;
}

// Gives a unit an order and the route to carry it out.
function giveRoute(u, order, route) {
  u.order = order;
  u.path = route;
  u.waypointIndex = 0;
}

// Leaves a unit standing where it is, with no order.
function stopUnit(u) {
  u.order = null;
  u.path = [{ x: u.x, y: u.y }];
  u.waypointIndex = 0;
  u.v = 0;
  u.blockedBy = null;
}

// Bought units line up along the active entry's road, from PARK_START px
// in, three abreast (the road's middle and its two sides), clear of the
// units already there (or on their way there) -- a group kept compact
// stays inside the stretch the defence may not reach (defenseAI.js's
// ENTRY_SAFE_ROAD), where two abreast it ran on past it.
const PARK_START = 40;
const PARK_GAP = 6;

function parkingSpot(state, route, type) {
  const [len, wid] = FOOTPRINT[type];
  const others = state.enemies
    .filter((u) => u.alive)
    .map((u) => {
      const rest = u.order ? u.path[u.path.length - 1] : u;
      return { x: rest.x, y: rest.y, len: FOOTPRINT[u.type][0], wid: FOOTPRINT[u.type][1] };
    });
  const total = routeLength(route);
  for (let s = PARK_START; s <= total; s += 4) {
    const at = pointAlong(route, s);
    for (const side of [0, 1, -1]) {
      const off = side * (wid + 4);
      const p = { x: at.x - at.uy * off, y: at.y + at.ux * off };
      const clash = others.some((o) => {
        const dx = o.x - p.x;
        const dy = o.y - p.y;
        const along = Math.abs(dx * at.ux + dy * at.uy);
        const across = Math.abs(dy * at.ux - dx * at.uy);
        return along < (len + o.len) / 2 + PARK_GAP && across < (wid + o.wid) / 2 + 1;
      });
      if (!clash) return { x: p.x, y: p.y, s };
    }
  }
  const at = pointAlong(route, PARK_START);
  return { x: at.x, y: at.y, s: PARK_START };
}

// A new unit at the active entry. In preparation, with the clock stopped,
// it's put straight in its place along the entry's road; during a round it
// comes in at the entry and drives there.
function spawnUnit(state, type) {
  const entry = mapOf(state).entries[state.attack.entry];
  const spot = parkingSpot(state, entry.route, type);
  if (state.attack.phase === "prep") {
    const at = pointAlong(entry.route, spot.s);
    state.enemies.push(createUnit(state, type, spot.x, spot.y, Math.atan2(at.uy, at.ux)));
    return;
  }
  const start = pointAlong(entry.route, 0);
  const u = createUnit(state, type, entry.x, entry.y, Math.atan2(start.uy, start.ux));
  state.enemies.push(u);
  giveRoute(u, { kind: "move" }, [...routePrefix(entry.route, spot.s), { x: spot.x, y: spot.y }]);
}

// The units bought during a round, one every SPAWN_INTERVAL.
function spawnFromQueue(state, dt) {
  const a = state.attack;
  a.spawnTimer = Math.max(0, a.spawnTimer - dt);
  if (a.spawnTimer > 1e-6 || !a.queue.length) return;
  spawnUnit(state, a.queue.shift());
  a.spawnTimer = SPAWN_INTERVAL;
}

// Where the army comes in (one of the map's entries, attackMapOf).
export function setEntry(state, index) {
  if (!playing(state)) return { ok: false, reason: "game-over" };
  if (!Number.isInteger(index) || index < 0 || index >= mapOf(state).entries.length) return { ok: false, reason: "no-such-entry" };
  state.attack.entry = index;
  return { ok: true };
}

// The shop: `count` units of `type`, or as many as the money and the cap
// allow. In preparation they're there at once; during a round they come
// in one by one.
export function buyUnits(state, type, count = 1) {
  if (!playing(state)) return { ok: false, reason: "game-over" };
  const price = UNIT_PRICES[type];
  if (!price) return { ok: false, reason: "unknown-type" };
  const a = state.attack;
  const room = UNIT_CAP - state.enemies.length - a.queue.length;
  if (room <= 0) return { ok: false, reason: "cap" };
  const n = Math.min(count, room, Math.floor(a.money / price));
  if (n <= 0) return { ok: false, reason: "cant-afford" };
  a.money -= n * price;
  a.stats.moneySpent += n * price;
  for (let i = 0; i < n; i++) {
    if (a.phase === "prep") spawnUnit(state, type);
    else a.queue.push(type);
  }
  if (a.phase === "prep") refreshFog(state);
  return { ok: true, bought: n };
}

// One level of one upgrade for every unit of a type, now and to come.
export function upgradeUnitType(state, type, skill) {
  if (!playing(state)) return { ok: false, reason: "game-over" };
  const def = UNIT_UPGRADES[skill];
  const levels = state.attack.upgrades[type];
  if (!def || !levels) return { ok: false, reason: "unknown" };
  if (levels[skill] >= def.levels) return { ok: false, reason: "maxed" };
  const cost = unitUpgradeCost(skill, levels[skill]);
  if (state.attack.money < cost) return { ok: false, reason: "cant-afford" };
  state.attack.money -= cost;
  state.attack.stats.moneySpent += cost;
  levels[skill]++;
  for (const u of state.enemies) if (u.alive && u.type === type) applyUnitUpgrades(u, levels);
  return { ok: true };
}

// «¡Al ataque!»: the end of the preparation and the start of round 1.
export function startAttack(state) {
  if (!playing(state)) return { ok: false, reason: "game-over" };
  if (state.attack.phase !== "prep") return { ok: false, reason: "already-started" };
  state.attack.phase = "battle";
  state.attack.roundJustStarted = true;
  state.paused = false;
  return { ok: true };
}

function unitsOf(state, ids) {
  const wanted = new Set(ids);
  return state.enemies.filter((u) => u.alive && wanted.has(u.id));
}

// A tower or wall block of the defence still standing, by id.
function structureById(state, id) {
  return state.towers.find((t) => t.id === id && t.hp > 0) || state.walls.find((w) => w.id === id && w.hp > 0) || null;
}

// Right-click on the ground: the units drive to the road point nearest
// (x, y), spread out along the road there (roadGraph.js's spreadStops),
// and stop -- or, a click that close to the base, go into it.
export function orderMove(state, ids, x, y) {
  if (!playing(state)) return { ok: false, reason: "game-over" };
  const units = unitsOf(state, ids);
  if (!units.length) return { ok: false, reason: "no-units" };
  const { graph, base } = mapOf(state);
  if (Math.hypot(x - base.x, y - base.y) <= BASE_CLICK_RADIUS) return orderEnter(state, ids);
  const sizes = units.map((u) => ({ x: u.x, y: u.y, len: FOOTPRINT[u.type][0], wid: FOOTPRINT[u.type][1] }));
  const stops = spreadStops(graph, { x, y }, sizes);
  units.forEach((u, i) => giveRoute(u, { kind: "move" }, stops[i].route));
  return { ok: true, stops: stops.map((p) => ({ x: p.x, y: p.y })) };
}

// Right-click on a tower or wall block: each unit drives along the road
// until it has it in range, stops there and fires at it until it's down.
export function orderAttack(state, ids, structureId) {
  if (!playing(state)) return { ok: false, reason: "game-over" };
  const units = unitsOf(state, ids);
  if (!units.length) return { ok: false, reason: "no-units" };
  const target = structureById(state, structureId);
  if (!target) return { ok: false, reason: "no-such-structure" };
  const { graph } = mapOf(state);
  for (const u of units) giveRoute(u, { kind: "attack", targetId: target.id }, roadRoute(graph, u, target));
  return { ok: true, target: { x: target.x, y: target.y } };
}

// Into the base: each unit that gets there takes the lives it's worth.
export function orderEnter(state, ids) {
  if (!playing(state)) return { ok: false, reason: "game-over" };
  const units = unitsOf(state, ids);
  if (!units.length) return { ok: false, reason: "no-units" };
  const { graph, base } = mapOf(state);
  for (const u of units) giveRoute(u, { kind: "enter" }, roadRoute(graph, u, base));
  return { ok: true, target: { x: base.x, y: base.y } };
}

// The S key: stop where they are.
export function orderStop(state, ids) {
  if (!playing(state)) return { ok: false, reason: "game-over" };
  const units = unitsOf(state, ids);
  if (!units.length) return { ok: false, reason: "no-units" };
  for (const u of units) stopUnit(u);
  return { ok: true };
}

function endGame(state, winner) {
  if (state.gameOver) return;
  state.gameOver = true;
  state.attack.winner = winner;
}

// A unit gets into the base: it's gone, the base loses its lives, the
// attacker is paid -- and with the base at 0 lives, the attacker has won.
function enterBase(state, u) {
  u.alive = false;
  const before = state.economy.lives;
  const fell = loseLife(state.economy, u.damage);
  state.attack.stats.livesTaken += before - state.economy.lives;
  state.attack.money += ENTRY_REWARD;
  state.attack.stats.moneyEarned += ENTRY_REWARD;
  if (fell) endGame(state, "attacker");
}

// The army's turn to move. A unit with no order stands still (nothing
// moves without an order). One sent against a structure brakes to a stop
// once it has it in range; one that reaches the end of its route stops
// there -- or, sent into the base, goes in. A wall block across the road
// holds a unit up (enemy.js), and it fires at it (fireUnits).
function moveUnits(state, dt) {
  const L = levelData(state.level);
  const walls = solidSegmentsOf(L);
  const gates = narrowsOf(L);
  for (const u of state.enemies) {
    const order = u.order;
    if (!order) {
      u.v = 0;
      u.blockedBy = null;
      continue;
    }
    const target = order.kind === "attack" ? structureById(state, order.targetId) : null;
    const inRange = Boolean(target) && Math.hypot(target.x - u.x, target.y - u.y) <= u.fireRange;
    const { reachedEnd, blockedBy } = stepEnemy(u, dt, { others: state.enemies, hold: inRange, walls, gates, barriers: state.walls, turnFirst: true });
    u.blockedBy = blockedBy ?? null;
    if (!reachedEnd) continue;
    if (order.kind === "enter") enterBase(state, u);
    else if (!inRange) stopUnit(u);
  }
  // The ones that went into the base leave the field (no bounty for them).
  state.enemies = state.enemies.filter((u) => u.alive);
  separateEnemies(state.enemies, dt, walls);
  if (L.water) for (const u of state.enemies) pushOutOfPolygons(u, L.water, L.worldWidth, L.worldHeight);
  // Nobody drives off the map: shoved about in a crowd at an entry (the
  // entries are just inside the edge), a unit could end up where the
  // player can neither see nor select it.
  for (const u of state.enemies) {
    u.x = Math.max(MAP_MARGIN, Math.min(L.worldWidth - MAP_MARGIN, u.x));
    u.y = Math.max(MAP_MARGIN, Math.min(L.worldHeight - MAP_MARGIN, u.y));
  }
}

// What a unit fires at: the structure it was sent against, once it's in
// range; otherwise -- no order, on its way, or not there yet -- the best
// tower in range (enemy.js's stepEnemyFire).
function targetsOf(state, u) {
  if (u.order?.kind !== "attack") return state.towers;
  const target = structureById(state, u.order.targetId);
  return target && Math.hypot(target.x - u.x, target.y - u.y) <= u.fireRange ? [target] : state.towers;
}

// One tick of an attack. In preparation nothing happens. During the
// rounds the clock runs; each round's start pays both sides and the
// defence spends (as it also does every AI_PERIOD s); the units bought come
// in; the army carries out its orders; towers and units fire, the attacker
// earning a share of the damage done to the defence; and the game ends
// when the base falls (the attacker wins) or round 15 runs out (the base
// wins).
export function stepAttack(state, dt) {
  if (!playing(state) || state.paused) return;
  const a = state.attack;
  a.roundJustStarted = false;
  if (a.phase !== "battle") return;

  a.roundLeft -= dt;
  if (a.roundLeft <= 0) {
    if (a.round >= ROUNDS) {
      endGame(state, "defense");
      return;
    }
    a.round++;
    a.roundLeft += ROUND_TIME;
    a.roundJustStarted = true;
    a.money += roundIncome(a.round);
    state.economy.money += DIFFICULTIES[a.difficulty].perRound;
    aiStep(state, a.difficulty);
    a.aiTimer = AI_PERIOD;
  } else {
    a.aiTimer -= dt;
    if (a.aiTimer <= 0) {
      a.aiTimer += AI_PERIOD;
      aiStep(state, a.difficulty);
    }
  }

  spawnFromQueue(state, dt);
  moveUnits(state, dt);
  if (state.gameOver) return;
  fireTowers(state, dt);
  fireUnits(state, dt, (u) => targetsOf(state, u));
  stepShots(state, dt, (structure, damage) => {
    const pay = damage * DAMAGE_REWARD * (structure.kind === "wall" ? WALL_REWARD_SHARE : 1);
    a.money += pay;
    a.stats.moneyEarned += pay;
  });
  clearDestroyed(state);
  for (const u of state.enemies) if (u.order?.kind === "attack" && !structureById(state, u.order.targetId)) stopUnit(u);
  refreshFog(state);
}

// --- Saved games (design §6) -------------------------------------------
// An attack is saved as each round starts (and in preparation): the moment
// the money's been paid and the defence has spent. Orders aren't saved --
// a loaded game starts paused at the start of its round, its army standing
// where it was.

export function canSaveAttack(state) {
  return !state.gameOver && (state.attack.phase === "prep" || state.attack.roundJustStarted);
}

// Which moment a save would capture (autosave.js writes one per moment).
export function attackSaveMoment(state) {
  return `attack:${state.level}:${state.attack.round}:${state.attack.phase}`;
}

export function createAttackSave(state, now = new Date()) {
  const a = state.attack;
  return {
    version: SAVE_VERSION,
    mode: "attack",
    savedAt: now.toISOString(),
    level: state.level,
    difficulty: a.difficulty,
    phase: a.phase,
    round: a.round,
    money: a.money,
    upgrades: JSON.parse(JSON.stringify(a.upgrades)),
    entry: a.entry,
    queue: [...a.queue],
    units: state.enemies.filter((u) => u.alive).map((u) => ({ type: u.type, x: u.x, y: u.y, hp: u.hp, angle: u.angle })),
    defense: { money: state.economy.money, lives: state.economy.lives },
    ...boardForSave(state),
    attackStats: { ...a.stats },
    fog: saveFog(a.fog),
  };
}

const num = (v, fallback) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const objectOr = (v) => (v && typeof v === "object" ? v : {});

function readableAttack(save) {
  return (
    Boolean(save) &&
    typeof save === "object" &&
    save.version === SAVE_VERSION &&
    save.mode === "attack" &&
    Number.isInteger(save.level) &&
    save.level >= 1 &&
    save.level <= MAX_LEVEL
  );
}

// The attack a save describes, paused at the start of its round with its
// army standing still; null if it isn't an attack save this version can
// read. A damaged field takes its default instead of breaking the load.
export function restoreAttackSave(save) {
  if (!readableAttack(save)) return null;
  const state = createAttackState(save.level, save.difficulty, { aiSetup: false });
  const a = state.attack;
  a.phase = save.phase === "battle" ? "battle" : "prep";
  // It stands at the start of its round: a save can be made at once, and
  // the autosave moves on to the game just loaded.
  a.roundJustStarted = a.phase === "battle";
  a.round = clamp(Math.floor(num(save.round, 1)), 1, ROUNDS);
  a.money = Math.max(0, num(save.money, roundIncome(1)));
  const upgrades = objectOr(save.upgrades);
  for (const type of UNIT_ORDER) {
    const saved = objectOr(upgrades[type]);
    for (const [skill, def] of Object.entries(UNIT_UPGRADES)) a.upgrades[type][skill] = clamp(Math.floor(num(saved[skill], 0)), 0, def.levels);
  }
  if (Number.isInteger(save.entry) && save.entry >= 0 && save.entry < mapOf(state).entries.length) a.entry = save.entry;
  const defense = objectOr(save.defense);
  state.economy.money = Math.max(0, num(defense.money, DIFFICULTIES[a.difficulty].startMoney));
  state.economy.lives = clamp(Math.floor(num(defense.lives, state.economy.lives)), 1, state.economy.lives);
  restoreBoard(state, save);
  for (const saved of Array.isArray(save.units) ? save.units : []) {
    if (state.enemies.length >= UNIT_CAP) break;
    if (!saved || !UNIT_PRICES[saved.type]) continue;
    const x = num(saved.x, NaN);
    const y = num(saved.y, NaN);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    const u = createUnit(state, saved.type, x, y, num(saved.angle, 0));
    u.hp = clamp(num(saved.hp, u.maxHp), 1, u.maxHp);
    state.enemies.push(u);
  }
  const room = UNIT_CAP - state.enemies.length;
  a.queue = (Array.isArray(save.queue) ? save.queue : []).filter((t) => UNIT_PRICES[t]).slice(0, room);
  const stats = objectOr(save.attackStats);
  for (const key of Object.keys(a.stats)) a.stats[key] = Math.max(0, num(stats[key], 0));
  restoreFog(a.fog, save.fog);
  refreshFog(state);
  state.paused = true;
  return state;
}

// What the menu lists for an attack save (null: it can't be loaded).
export function attackSaveSummary(save) {
  if (!readableAttack(save)) return null;
  const defense = objectOr(save.defense);
  return {
    mode: "attack",
    level: save.level,
    round: clamp(Math.floor(num(save.round, 1)), 1, ROUNDS),
    difficulty: DIFFICULTIES[save.difficulty] ? save.difficulty : "normal",
    lives: clamp(Math.floor(num(defense.lives, 20)), 1, 20),
    money: Math.max(0, Math.floor(num(save.money, 0))),
    savedAt: typeof save.savedAt === "string" ? save.savedAt : null,
  };
}
