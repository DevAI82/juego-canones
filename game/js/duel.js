// The duel minigame (docs/2026-11-22-duelo-design.md): two small armies,
// bought, upgraded and placed by their players, fight by themselves in an
// arena, round after round; the first side to win three rounds wins.
//
// This file is the whole game without a screen: a state (a plain object
// that survives JSON), the players' actions on it, and stepDuel, which
// moves it forward in time. It never looks at the clock or at Math.random:
// time comes in through stepDuel, cut into steps of the same length, and
// the few rolls of the dice come from a seed kept in the state. The same
// actions on the same seed therefore always give the same fight, which is
// what lets tests check it, bots play thousands of duels to tune it, and
// two computers agree on a fight by sending each other only what they
// bought.
import { ARENA, ZONES, arenaOf } from "./duelArenas.js";

export const SIDES = ["left", "right"];
export const otherSide = (side) => (side === "left" ? "right" : "left");

export const START_MONEY = 100;
export const UNIT_CAP = 12; // units a side
export const ROUNDS_TO_WIN = 3;
export const ROUND_INCOME = 50; // to each side after a round
export const WIN_BONUS = 25; // more to the round's winner
// Destroying a unit pays this share of its price in all, paid hit by hit
// in proportion to the health taken.
export const KILL_SHARE = 0.5;
export const COMBAT_TIME = 60; // s a fight lasts at most
// The purchase has a clock only between two players (state.timed).
export const BUY_TIME_FIRST = 45;
export const BUY_TIME = 30;
export const ROUND_END_TIME = 4; // s the round's result stays on screen
export const STEP = 1 / 30; // s of a tick of the fight

// The shop, cheapest first: the attack mode's units at its prices
// (duel.test.js holds them together). Their other numbers are the duel's
// own: the attack mode's are meant against towers, and unit against unit
// ten soldiers would roll over two tanks. Each unit has a part to play:
//   soldier     cheap and many; falls fast to splash damage
//   motorcycle  very fast: soon among the rival's back line; little health
//   buggy       the all-rounder: good rate of fire and speed
//   tank        armoured: light weapons (the three above) do it half damage
//   rocket      long range and splash damage; slow, and frail up close
// hp, speed (px/s), range (px), damage a shot, cooldown (s between shots),
// radius (px, how much room it takes), splash (px round its target).
export const DUEL_ORDER = ["soldier", "motorcycle", "buggy", "tank", "rocket"];
export const DUEL_UNITS = {
  soldier: { price: 10, hp: 30, speed: 45, range: 90, damage: 3, cooldown: 1.0, radius: 7 },
  motorcycle: { price: 15, hp: 34, speed: 110, range: 80, damage: 4, cooldown: 0.8, radius: 9 },
  buggy: { price: 20, hp: 55, speed: 80, range: 110, damage: 5, cooldown: 0.7, radius: 11 },
  tank: { price: 50, hp: 220, speed: 38, range: 130, damage: 16, cooldown: 2.0, radius: 15, armored: true },
  rocket: { price: 70, hp: 90, speed: 34, range: 260, damage: 26, cooldown: 3.0, radius: 14, splash: 45 },
};
export const LIGHT_VS_ARMOR = 0.5; // a light weapon's damage on an armoured unit
export const SPLASH_SHARE = 0.6; // of a splash weapon's damage, to the others near its target

// Five skills a unit type, five levels each, the attack mode's effects.
// Level k costs baseCost x k and multiplies one number once more: armour
// raises health, rate shortens the wait between shots.
export const SKILLS = ["damage", "range", "armor", "rate", "speed"];
export const DUEL_UPGRADES = {
  damage: { levels: 5, baseCost: 20, mult: 1.25 },
  range: { levels: 5, baseCost: 15, mult: 1.15 },
  armor: { levels: 5, baseCost: 20, mult: 1 / 0.85 },
  rate: { levels: 5, baseCost: 20, mult: 0.85 },
  speed: { levels: 5, baseCost: 15, mult: 1.06 },
};

const refuse = (reason) => ({ ok: false, reason });

// ------------------------------------------------------------ the state

// The next number of the state's own dice, from 0 up to (not including) 1
// (the "mulberry32" generator: small, and all it needs to remember is one
// whole number, state.rng).
export function duelRandom(state) {
  state.rng = (state.rng + 0x6d2b79f5) | 0;
  let t = state.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// A side at the start of a duel. `free`: skill levels it starts with
// (free[type][skill], from a profile's points or the computer's grade);
// what makes no sense in it is left out.
function freshSide({ money = START_MONEY, free = {} } = {}) {
  const upgrades = {};
  for (const type of DUEL_ORDER) {
    upgrades[type] = {};
    for (const skill of SKILLS) {
      const level = Math.floor(Number(free?.[type]?.[skill]) || 0);
      upgrades[type][skill] = Math.max(0, Math.min(DUEL_UPGRADES[skill].levels, level));
    }
  }
  return {
    money,
    upgrades,
    ready: false,
    // The army its player has bought and placed: { id, type, x, y, round }
    // (round: the one it was bought in). It lasts the whole duel; a fight
    // works on copies (state.units), so every round it starts whole.
    army: [],
    // This round's fight: money earned and damage done, both in money.
    earned: 0,
    damage: 0,
    // The whole duel: enemy units destroyed, by type, and their prices
    // added up -- the experience the profile gets.
    destroyed: {},
    xp: 0,
  };
}

// `timed`: the purchase has a clock (two players). `left` and `right`:
// { money, free } for a side that doesn't start as everybody does.
export function createDuelState({ arena = 1, seed = 1, timed = false, left, right } = {}) {
  return {
    mode: "duel",
    arena: arenaOf(arena).id,
    timed: Boolean(timed),
    phase: "buy", // "buy" -> "combat" -> "roundEnd" -> "buy" ... -> "over"
    round: 1,
    clock: timed ? BUY_TIME_FIRST : null, // s left of the phase; null: no clock
    wins: { left: 0, right: 0 },
    sides: { left: freshSide(left), right: freshSide(right) },
    units: [], // the fight's units
    shots: [], // what the screen draws of the shots; no part in the result
    lastRound: null,
    winner: null,
    rng: seed | 0,
    nextId: 1,
    acc: 0, // time not yet turned into ticks
  };
}

// A unit type's numbers at these upgrade levels.
export function unitStats(type, levels) {
  const def = DUEL_UNITS[type];
  const up = DUEL_UPGRADES;
  return {
    maxHp: Math.round(def.hp * up.armor.mult ** levels.armor),
    speed: def.speed * up.speed.mult ** levels.speed,
    range: def.range * up.range.mult ** levels.range,
    damage: def.damage * up.damage.mult ** levels.damage,
    cooldown: def.cooldown * up.rate.mult ** levels.rate,
  };
}

// What the next level of this skill costs this side; null at the top.
export function upgradeCost(state, side, type, skill) {
  const level = state.sides[side].upgrades[type][skill];
  if (level >= DUEL_UPGRADES[skill].levels) return null;
  return DUEL_UPGRADES[skill].baseCost * (level + 1);
}

// ------------------------------------------------------------ placing

const PLACE_GAP = 2; // px kept between a placed unit and what is beside it

function insideZone(side, x, y, radius) {
  const z = ZONES[side];
  return x - radius >= z.x0 && x + radius <= z.x1 && y - radius >= z.y0 && y + radius <= z.y1;
}

function isClear(state, side, x, y, radius, ignoreId) {
  for (const o of arenaOf(state.arena).obstacles) {
    if (Math.hypot(o.x - x, o.y - y) < o.r + radius + PLACE_GAP) return false;
  }
  for (const u of state.sides[side].army) {
    if (u.id === ignoreId) continue;
    if (Math.hypot(u.x - x, u.y - y) < DUEL_UNITS[u.type].radius + radius + PLACE_GAP) return false;
  }
  return true;
}

// Whether a unit of this radius may stand at (x, y) on this side: inside
// its zone, off the obstacles and off the side's other units (`ignoreId`:
// the unit being moved, which doesn't block itself).
export function canPlace(state, side, x, y, radius, ignoreId = null) {
  return insideZone(side, x, y, radius) && isClear(state, side, x, y, radius, ignoreId);
}

// Where a new unit goes: the free place nearest the middle of its side's
// zone, on a grid wide enough for the biggest unit. The player then drags
// it where they want it.
const GRID = 44;
function freePlace(state, side, radius) {
  const z = ZONES[side];
  const cx = (z.x0 + z.x1) / 2;
  const cy = (z.y0 + z.y1) / 2;
  const places = [];
  for (let x = z.x0 + GRID / 2; x <= z.x1 - GRID / 2; x += GRID) {
    for (let y = z.y0 + GRID / 2; y <= z.y1 - GRID / 2; y += GRID) {
      places.push({ x, y, d: Math.hypot(x - cx, y - cy) });
    }
  }
  // By distance, then by place, so that the order never depends on how a
  // browser happens to sort equal distances.
  places.sort((a, b) => a.d - b.d || a.y - b.y || a.x - b.x);
  return places.find((p) => canPlace(state, side, p.x, p.y, radius)) || null;
}

// ------------------------------------------------------------ the actions
// Each returns { ok: true, ... } or { ok: false, reason }, and changes
// nothing when it refuses.

// Why this side may not shop right now, or null.
function shopClosed(state, side) {
  if (state.phase !== "buy") return "phase";
  if (state.sides[side].ready) return "ready";
  return null;
}

export function buyUnit(state, side, type) {
  const closed = shopClosed(state, side);
  if (closed) return refuse(closed);
  const def = DUEL_UNITS[type];
  if (!def) return refuse("type");
  const mine = state.sides[side];
  if (mine.army.length >= UNIT_CAP) return refuse("cap");
  if (mine.money < def.price) return refuse("money");
  const place = freePlace(state, side, def.radius);
  if (!place) return refuse("room");
  mine.money -= def.price;
  const unit = { id: state.nextId++, type, x: place.x, y: place.y, round: state.round };
  mine.army.push(unit);
  return { ok: true, unit };
}

// A unit bought in this same purchase gives its whole price back (a slip
// of the finger costs nothing); an older one, half.
export function sellUnit(state, side, id) {
  const closed = shopClosed(state, side);
  if (closed) return refuse(closed);
  const mine = state.sides[side];
  const index = mine.army.findIndex((u) => u.id === id);
  if (index < 0) return refuse("unit");
  const unit = mine.army[index];
  const price = DUEL_UNITS[unit.type].price;
  const refund = unit.round === state.round ? price : price / 2;
  mine.army.splice(index, 1);
  mine.money += refund;
  return { ok: true, refund };
}

export function moveUnit(state, side, id, x, y) {
  const closed = shopClosed(state, side);
  if (closed) return refuse(closed);
  const unit = state.sides[side].army.find((u) => u.id === id);
  if (!unit) return refuse("unit");
  const radius = DUEL_UNITS[unit.type].radius;
  if (!insideZone(side, x, y, radius)) return refuse("zone");
  if (!isClear(state, side, x, y, radius, id)) return refuse("blocked");
  unit.x = x;
  unit.y = y;
  return { ok: true };
}

// One more level of a skill for every unit of this type the side has or
// buys later.
export function upgradeUnit(state, side, type, skill) {
  const closed = shopClosed(state, side);
  if (closed) return refuse(closed);
  if (!DUEL_UNITS[type]) return refuse("type");
  if (!DUEL_UPGRADES[skill]) return refuse("skill");
  const cost = upgradeCost(state, side, type, skill);
  if (cost === null) return refuse("max");
  const mine = state.sides[side];
  if (mine.money < cost) return refuse("money");
  mine.money -= cost;
  mine.upgrades[type][skill] += 1;
  return { ok: true, level: mine.upgrades[type][skill], cost };
}

// «¡Listo!»: this side has finished shopping. It can take it back while
// the other side hasn't said it too; when both have, the fight starts.
export function setReady(state, side, ready = true) {
  if (state.phase !== "buy") return refuse("phase");
  state.sides[side].ready = Boolean(ready);
  if (SIDES.every((s) => state.sides[s].ready)) startCombat(state);
  return { ok: true };
}

// ------------------------------------------------------------ the fight

function startCombat(state) {
  state.phase = "combat";
  state.clock = COMBAT_TIME;
}

// Kept for the fight (Task 3): the arena's size, for keeping units in it.
export const DUEL_ARENA = ARENA;
