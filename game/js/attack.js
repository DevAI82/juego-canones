// The attack mode (docs/2026-10-09-modo-atacante-design.md): the player
// commands an army against a defence run by the computer (defenseAI.js).
// DOM-free like simulate.js, whose pieces it reuses: the defence's towers,
// wall blocks and money and the base's lives (state.economy) are the
// defence game's own, and the army's units are the defence game's enemy
// units (enemy.js) -- same stats, sprites and driving -- moved by the
// player's orders instead of along a fixed road.
import { assignId } from "./ids.js";
import { levelData } from "./levels.js";
import { createEnemy, ENEMY_TYPES, FOOTPRINT } from "./enemy.js";
import { createGameState } from "./simulate.js";
import { attackMapOf, pointAlong, routeLength, routePrefix } from "./roadGraph.js";
import { DIFFICULTIES, AI_PERIOD, aiPrepare } from "./defenseAI.js";
import { createFog, updateFog, SIGHT, ENTRY_SIGHT } from "./fog.js";

export const ROUNDS = 15;
export const ROUND_TIME = 60;
export const UNIT_CAP = 60;
// Seconds between the units bought during a round coming in.
export const SPAWN_INTERVAL = 0.5;

// What the attacker is paid as round `round` starts (round 1's: when the
// preparation starts).
export function roundIncome(round) {
  return 150 + 25 * (round - 1);
}

// The shop, cheapest first.
export const UNIT_ORDER = ["soldier", "motorcycle", "buggy", "tank", "rocket"];
export const UNIT_PRICES = { soldier: 15, motorcycle: 25, buggy: 35, tank: 90, rocket: 120 };

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
// in, each side of the road in turn, clear of the units already there (or
// on their way there).
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
    for (const side of [1, -1]) {
      const off = side * (wid / 2 + 2);
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

// One tick of an attack: nothing happens in preparation; during the rounds
// the clock runs and the units bought come in.
export function stepAttack(state, dt) {
  if (!playing(state) || state.paused) return;
  const a = state.attack;
  a.roundJustStarted = false;
  if (a.phase !== "battle") return;
  a.roundLeft -= dt;
  spawnFromQueue(state, dt);
}
