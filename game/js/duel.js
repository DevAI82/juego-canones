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
// radius (px, how much room it takes: about half the length of its picture,
// so that units stand apart on screen as they do in the fight), splash (px
// round its target).
export const DUEL_ORDER = ["soldier", "motorcycle", "buggy", "tank", "rocket"];
export const DUEL_UNITS = {
  soldier: { price: 10, hp: 30, speed: 45, range: 90, damage: 3, cooldown: 1.0, radius: 8, light: true },
  motorcycle: { price: 15, hp: 34, speed: 110, range: 80, damage: 4, cooldown: 0.8, radius: 11, light: true },
  buggy: { price: 20, hp: 55, speed: 80, range: 110, damage: 5, cooldown: 0.7, radius: 16, light: true },
  tank: { price: 50, hp: 220, speed: 38, range: 130, damage: 16, cooldown: 2.0, radius: 22, armored: true },
  rocket: { price: 70, hp: 90, speed: 34, range: 260, damage: 26, cooldown: 3.0, radius: 22, splash: 45 },
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
    shown: null, // see remember()
  };
}

// `timed`: the purchase has a clock (two players). `left` and `right`:
// { money, free } for a side that doesn't start as everybody does.
export function createDuelState({ arena = 1, seed = 1, timed = false, left, right } = {}) {
  const state = {
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
  remember(state);
  return state;
}

// What a side lets its rival know while both shop: how it stood when the
// purchase began -- the army of the last fight, and its money and upgrades
// before it spent anything (side.shown). What it buys and where it puts it
// stays hidden until the fight.
function remember(state) {
  for (const side of SIDES) {
    const mine = state.sides[side];
    mine.shown = JSON.parse(JSON.stringify({ army: mine.army, money: mine.money, upgrades: mine.upgrades }));
  }
}

// The duel as this side may see it, as a copy: while shopping, the rival
// is as it was when the purchase began; in a fight and after it, all of it.
// It is what the computer opponent decides from, and what the home server
// sends each player.
export function duelView(state, side) {
  const view = JSON.parse(JSON.stringify(state));
  if (state.phase === "buy") {
    const rival = view.sides[otherSide(side)];
    rival.army = rival.shown.army;
    rival.money = rival.shown.money;
    rival.upgrades = rival.shown.upgrades;
  }
  return view;
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
const GRID = 52;
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
// A fight works on its own units (state.units), made from the two armies
// when it starts; the armies themselves are never touched, which is how
// every round starts with them whole.
//
// Neither side may have an advantage from the order things are worked out
// in, so a tick is done in stages, each from what the stage before left:
// everybody decides, then everybody moves, then the shots land together.
// Two mirrored armies therefore fight a mirrored fight.

// A fight's unit, from an army's. `index`: its place in its army's list.
function fightUnit(state, side, unit, index) {
  const def = DUEL_UNITS[unit.type];
  const stats = unitStats(unit.type, state.sides[side].upgrades[unit.type]);
  return {
    id: unit.id,
    side,
    type: unit.type,
    x: unit.x,
    y: unit.y,
    angle: side === "left" ? 0 : Math.PI, // where it faces; each side starts facing the other
    aim: side === "left" ? 0 : Math.PI, // where its gun points
    hp: stats.maxHp,
    maxHp: stats.maxHp,
    speed: stats.speed,
    range: stats.range,
    damage: stats.damage,
    cooldown: stats.cooldown,
    // Seconds until it may shoot. The first shot comes a little sooner or
    // later for each unit of an army, so that they don't fire as one gun;
    // by its place in the list, not by the dice, so that two armies bought
    // alike shoot alike.
    fireTimer: stats.cooldown * (0.25 + 0.5 * ((index * 0.618) % 1)),
    radius: def.radius,
    slot: index,
    targetId: null,
    alive: true,
    moving: false,
    // Which way round an obstacle it is going (+1 or -1) and round which
    // one, so that it doesn't change its mind half-way.
    swerve: 0,
    swerveAt: -1,
  };
}

function startCombat(state) {
  state.phase = "combat";
  state.clock = COMBAT_TIME;
  state.units = [];
  state.shots = [];
  for (const side of SIDES) {
    const mine = state.sides[side];
    mine.earned = 0;
    mine.damage = 0;
    mine.army.forEach((unit, index) => state.units.push(fightUnit(state, side, unit, index)));
  }
  // A side that fields nothing has lost the round already.
  const fielded = (side) => state.sides[side].army.length > 0;
  if (!fielded("left") || !fielded("right")) {
    if (fielded("left")) endRound(state, "left", "empty");
    else if (fielded("right")) endRound(state, "right", "empty");
    else endRound(state, coin(state), "coin");
  }
}

const coin = (state) => (duelRandom(state) < 0.5 ? "left" : "right");

// How near the segment a-b passes to the point p.
function segmentDistance(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length2 = dx * dx + dy * dy;
  const t = length2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length2)) : 0;
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}

// Whether an obstacle stands on the line between these two units.
function lineBlocked(obstacles, a, b) {
  return obstacles.some((o) => segmentDistance(o, a, b) < o.r);
}

// The enemy this unit goes for: the nearest one, but it keeps the one it
// had unless another is clearly nearer -- otherwise two enemies at about
// the same distance would have it turning from one to the other for ever.
const KEEP_TARGET = 0.8;
function pickTarget(u, units, byId) {
  let nearest = null;
  let nearestD = Infinity;
  for (const v of units) {
    if (!v.alive || v.side === u.side) continue;
    const d = Math.hypot(v.x - u.x, v.y - u.y);
    if (d < nearestD) {
      nearest = v;
      nearestD = d;
    }
  }
  const current = u.targetId === null ? null : byId.get(u.targetId);
  if (current && current.alive && nearestD >= KEEP_TARGET * Math.hypot(current.x - u.x, current.y - u.y)) return current;
  return nearest;
}

// The direction (a unit vector) a unit takes towards its target: straight
// at it, or along the edge of the obstacle it is about to run into.
const SWERVE_NEAR = 14; // px from an obstacle's edge at which a unit starts going round it
const SWERVE_SURE = 0.05;
function heading(u, target, obstacles) {
  const dx = target.x - u.x;
  const dy = target.y - u.y;
  const d = Math.hypot(dx, dy) || 1;
  const hx = dx / d;
  const hy = dy / d;
  // The obstacle in its way that is nearest, if it is right before it.
  let block = -1;
  let blockD = Infinity;
  obstacles.forEach((o, i) => {
    const ox = o.x - u.x;
    const oy = o.y - u.y;
    const od = Math.hypot(ox, oy);
    const ahead = ox * hx + oy * hy > 0;
    if (ahead && od - o.r - u.radius < SWERVE_NEAR && segmentDistance(o, u, target) < o.r + u.radius && od < blockD) {
      block = i;
      blockD = od;
    }
  });
  if (block < 0) {
    u.swerve = 0;
    u.swerveAt = -1;
    return { x: hx, y: hy };
  }
  const o = obstacles[block];
  // One of the two directions along the obstacle's edge.
  const tx = -(o.y - u.y) / blockD;
  const ty = (o.x - u.x) / blockD;
  if (u.swerveAt !== block || !u.swerve) {
    const along = tx * hx + ty * hy;
    if (along > SWERVE_SURE) u.swerve = 1;
    else if (along < -SWERVE_SURE) u.swerve = -1;
    // Heading straight at its middle: up the screen or down it by the
    // unit's place in its army, so that an army splits round it. (Up and
    // down, not left and right of the unit: the mirror image of a unit
    // going up is a unit going up.)
    else u.swerve = (ty < 0) === (u.slot % 2 === 0) ? 1 : -1;
    u.swerveAt = block;
  }
  return { x: tx * u.swerve, y: ty * u.swerve };
}

// A hit lands. The shooter's side is paid for the health it takes.
function land(state, hit) {
  const victim = hit.victim;
  if (!victim.alive) return;
  const armoured = DUEL_UNITS[victim.type].armored && DUEL_UNITS[hit.type].light;
  const taken = Math.min(victim.hp, hit.amount * (armoured ? LIGHT_VS_ARMOR : 1));
  victim.hp -= taken;
  const price = DUEL_UNITS[victim.type].price;
  const paid = (price * KILL_SHARE * taken) / victim.maxHp;
  const shooter = state.sides[hit.side];
  shooter.money += paid;
  shooter.earned += paid;
  shooter.damage += paid;
  if (victim.hp <= 1e-9) {
    victim.hp = 0;
    victim.alive = false;
    shooter.destroyed[victim.type] = (shooter.destroyed[victim.type] || 0) + 1;
    shooter.xp += price;
  }
}

const SHOT_SHOWN = 0.4; // s a shot stays in state.shots for the screen

function combatTick(state) {
  const obstacles = arenaOf(state.arena).obstacles;
  const units = state.units;
  const living = units.filter((u) => u.alive);
  const byId = new Map(units.map((u) => [u.id, u]));

  for (const shot of state.shots) shot.age += STEP;
  state.shots = state.shots.filter((shot) => shot.age < SHOT_SHOWN);

  // 1. Everybody decides, from where everybody is now.
  const moves = [];
  const hits = [];
  for (const u of living) {
    u.fireTimer = Math.max(0, u.fireTimer - STEP);
    const target = pickTarget(u, units, byId);
    if (!target) continue;
    u.targetId = target.id;
    const distance = Math.hypot(target.x - u.x, target.y - u.y);
    u.aim = Math.atan2(target.y - u.y, target.x - u.x);
    if (distance <= u.range && !lineBlocked(obstacles, u, target)) {
      // In range, with a clear line: it stands and shoots.
      u.moving = false;
      u.angle = u.aim;
      if (u.fireTimer <= 0) {
        u.fireTimer = u.cooldown;
        hits.push({ side: u.side, type: u.type, victim: target, amount: u.damage });
        const splash = DUEL_UNITS[u.type].splash;
        if (splash) {
          for (const v of living) {
            if (v === target || v.side === u.side) continue;
            if (Math.hypot(v.x - target.x, v.y - target.y) <= splash) {
              hits.push({ side: u.side, type: u.type, victim: v, amount: u.damage * SPLASH_SHARE });
            }
          }
        }
        state.shots.push({ from: { x: u.x, y: u.y }, to: { x: target.x, y: target.y }, type: u.type, side: u.side, age: 0 });
      }
    } else {
      const dir = heading(u, target, obstacles);
      moves.push({ u, dir });
    }
  }

  // 2. Everybody moves.
  for (const { u, dir } of moves) {
    u.moving = true;
    u.angle = Math.atan2(dir.y, dir.x);
    u.x += dir.x * u.speed * STEP;
    u.y += dir.y * u.speed * STEP;
  }

  // 3. Units that overlap push each other apart, half the way each. All
  // the pushes are worked out before any is made.
  const push = new Map(living.map((u) => [u, { x: 0, y: 0 }]));
  for (let i = 0; i < living.length; i++) {
    for (let j = i + 1; j < living.length; j++) {
      const a = living[i];
      const b = living[j];
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      let d = Math.hypot(dx, dy);
      const overlap = a.radius + b.radius - d;
      if (overlap <= 0) continue;
      if (d < 1e-6) {
        // One on top of the other: any direction will do.
        const turn = duelRandom(state) * Math.PI * 2;
        dx = Math.cos(turn);
        dy = Math.sin(turn);
        d = 1;
      }
      const px = ((dx / d) * overlap) / 2;
      const py = ((dy / d) * overlap) / 2;
      push.get(a).x -= px;
      push.get(a).y -= py;
      push.get(b).x += px;
      push.get(b).y += py;
    }
  }
  for (const u of living) {
    u.x += push.get(u).x;
    u.y += push.get(u).y;
    // Out of the obstacles and inside the arena, whatever pushed it.
    for (const o of obstacles) {
      const dx = u.x - o.x;
      const dy = u.y - o.y;
      const d = Math.hypot(dx, dy);
      const least = o.r + u.radius;
      if (d >= least) continue;
      if (d < 1e-6) u.x = o.x + (u.side === "left" ? -least : least);
      else {
        u.x = o.x + (dx / d) * least;
        u.y = o.y + (dy / d) * least;
      }
    }
    u.x = Math.max(u.radius, Math.min(ARENA.width - u.radius, u.x));
    u.y = Math.max(u.radius, Math.min(ARENA.height - u.radius, u.y));
  }

  // 4. The shots land, all together: a unit destroyed in this tick has
  // still fired its own shot.
  for (const hit of hits) land(state, hit);

  // 5. The end of the fight.
  state.clock -= STEP;
  const left = units.some((u) => u.alive && u.side === "left");
  const right = units.some((u) => u.alive && u.side === "right");
  if (left && !right) endRound(state, "left", "wipe");
  else if (right && !left) endRound(state, "right", "wipe");
  else if (!left && !right) endRound(state, ...byDamage(state));
  else if (state.clock <= 1e-9) {
    // Time: the side with more army left, each unit's health counted by
    // its price.
    const worth = (side) =>
      units.reduce((sum, u) => (u.alive && u.side === side ? sum + (u.hp / u.maxHp) * DUEL_UNITS[u.type].price : sum), 0);
    const l = worth("left");
    const r = worth("right");
    if (Math.abs(l - r) > 1e-9) endRound(state, l > r ? "left" : "right", "time");
    else endRound(state, ...byDamage(state));
  }
}

// The winner of a round that is level otherwise, and why: whoever did more
// damage in it, or a toss of the state's coin.
function byDamage(state) {
  const l = state.sides.left.damage;
  const r = state.sides.right.damage;
  if (Math.abs(l - r) > 1e-9) return [l > r ? "left" : "right", "damage"];
  return [coin(state), "coin"];
}

// reason: "wipe" (the other army destroyed), "time" (more army left when
// the time ran out), "damage" (level, and it did more damage), "coin"
// (level in everything) or "empty" (the other side fielded nothing).
function endRound(state, winner, reason) {
  const income = {};
  for (const side of SIDES) {
    income[side] = ROUND_INCOME + (side === winner ? WIN_BONUS : 0);
    state.sides[side].money += income[side];
  }
  state.wins[winner] += 1;
  state.lastRound = { round: state.round, winner, reason, income };
  if (state.wins[winner] >= ROUNDS_TO_WIN) {
    state.phase = "over";
    state.winner = winner;
    state.clock = null;
  } else {
    state.phase = "roundEnd";
    state.clock = ROUND_END_TIME;
  }
}

function nextRound(state) {
  state.round += 1;
  state.phase = "buy";
  state.clock = state.timed ? BUY_TIME : null;
  state.units = [];
  state.shots = [];
  for (const side of SIDES) state.sides[side].ready = false;
  remember(state);
}

function tick(state) {
  if (state.phase === "combat") combatTick(state);
  else if (state.phase === "roundEnd") {
    state.clock -= STEP;
    if (state.clock <= 1e-9) nextRound(state);
  } else if (state.phase === "buy" && state.clock !== null) {
    // Two players: when the time to shop runs out the fight starts, ready
    // or not.
    state.clock -= STEP;
    if (state.clock <= 1e-9) startCombat(state);
  }
}

// Moves the duel `dt` seconds on, in ticks of STEP; what doesn't make a
// whole tick waits for the next call. At most a few ticks a call: after a
// long freeze (a hidden browser tab) the duel picks up where it was rather
// than racing through what it missed.
const MAX_TICKS = 8;
export function stepDuel(state, dt) {
  if (state.phase === "over") return;
  state.acc += dt;
  let ticks = 0;
  while (state.acc >= STEP - 1e-9 && ticks < MAX_TICKS && state.phase !== "over") {
    state.acc -= STEP;
    tick(state);
    ticks++;
  }
  if (state.acc >= STEP - 1e-9) state.acc = 0;
  if (state.acc < 0) state.acc = 0;
}
