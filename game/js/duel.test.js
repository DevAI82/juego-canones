import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SIDES,
  otherSide,
  DUEL_ORDER,
  DUEL_UNITS,
  SKILLS,
  DUEL_UPGRADES,
  START_MONEY,
  UNIT_CAP,
  BUY_TIME_FIRST,
  createDuelState,
  upgradeCost,
  unitStats,
  buyUnit,
  sellUnit,
  moveUnit,
  upgradeUnit,
  setReady,
  canPlace,
  stepDuel,
  duelView,
  STEP,
  COMBAT_TIME,
  BUY_TIME,
  ROUND_END_TIME,
  ROUND_INCOME,
  WIN_BONUS,
  KILL_SHARE,
  ROUNDS_TO_WIN,
} from "./duel.js";
import { UNIT_PRICES, UNIT_ORDER } from "./attack.js";
import { ARENA, ZONES, arenaOf } from "./duelArenas.js";

const inZone = (side, u) => {
  const z = ZONES[side];
  return u.x >= z.x0 && u.x <= z.x1 && u.y >= z.y0 && u.y <= z.y1;
};

// A duel whose two sides have this much money.
function rich(money = 1000, options = {}) {
  return createDuelState({ ...options, left: { money }, right: { money } });
}

// ------------------------------------------------------------ the shop

test("the duel sells the attack mode's units at the attack mode's prices", () => {
  assert.deepEqual(DUEL_ORDER, UNIT_ORDER);
  for (const type of DUEL_ORDER) assert.equal(DUEL_UNITS[type].price, UNIT_PRICES[type], type);
  assert.deepEqual(SIDES, ["left", "right"]);
  assert.equal(otherSide("left"), "right");
  assert.equal(otherSide("right"), "left");
});

test("a duel starts with the purchase of round 1: $100 each, no units, no clock", () => {
  const s = createDuelState();
  assert.equal(s.mode, "duel");
  assert.equal(s.phase, "buy");
  assert.equal(s.round, 1);
  assert.equal(s.clock, null);
  assert.equal(s.winner, null);
  assert.deepEqual(s.wins, { left: 0, right: 0 });
  for (const side of SIDES) {
    assert.equal(s.sides[side].money, START_MONEY);
    assert.equal(START_MONEY, 100);
    assert.deepEqual(s.sides[side].army, []);
    assert.equal(s.sides[side].ready, false);
    for (const type of DUEL_ORDER) for (const skill of SKILLS) assert.equal(s.sides[side].upgrades[type][skill], 0);
  }
});

test("between two players the purchase has a clock", () => {
  const s = createDuelState({ timed: true });
  assert.equal(s.clock, BUY_TIME_FIRST);
  assert.equal(BUY_TIME_FIRST, 45);
});

test("a side can start with more money and free skill levels", () => {
  const s = createDuelState({ left: { money: 130, free: { tank: { damage: 2 } } } });
  assert.equal(s.sides.left.money, 130);
  assert.equal(s.sides.left.upgrades.tank.damage, 2);
  assert.equal(s.sides.right.money, 100);
  assert.equal(s.sides.right.upgrades.tank.damage, 0);
  // The next level costs what it would after buying the first two.
  assert.equal(upgradeCost(s, "left", "tank", "damage"), 60);
  assert.equal(upgradeCost(s, "right", "tank", "damage"), 20);
});

test("free levels that make no sense are ignored or cut to the top", () => {
  const s = createDuelState({ left: { free: { tank: { damage: 9, range: -2, bogus: 3 }, plane: { damage: 1 } } } });
  assert.equal(s.sides.left.upgrades.tank.damage, 5);
  assert.equal(s.sides.left.upgrades.tank.range, 0);
  assert.equal(s.sides.left.upgrades.tank.bogus, undefined);
  assert.equal(s.sides.left.upgrades.plane, undefined);
});

test("buying a unit takes its price and puts it in the buyer's zone", () => {
  const s = createDuelState({ arena: 4 });
  const bought = buyUnit(s, "left", "tank");
  assert.equal(bought.ok, true);
  assert.equal(s.sides.left.money, 50);
  assert.equal(s.sides.left.army.length, 1);
  const tank = s.sides.left.army[0];
  assert.equal(tank.id, bought.unit.id);
  assert.equal(tank.type, "tank");
  assert.ok(inZone("left", tank));

  assert.equal(buyUnit(s, "right", "buggy").ok, true);
  assert.equal(s.sides.right.money, 80);
  assert.ok(inZone("right", s.sides.right.army[0]));
  assert.notEqual(s.sides.right.army[0].id, tank.id);
});

test("a full army stands clear of the obstacles and of itself, in every arena", () => {
  for (let arena = 1; arena <= 5; arena++) {
    const s = rich(1000, { arena });
    for (const side of SIDES) {
      for (let i = 0; i < UNIT_CAP; i++) assert.equal(buyUnit(s, side, i % 2 ? "tank" : "rocket").ok, true);
      const army = s.sides[side].army;
      for (const u of army) {
        const r = DUEL_UNITS[u.type].radius;
        assert.ok(inZone(side, u), `arena ${arena}: in the zone`);
        for (const o of arenaOf(arena).obstacles) assert.ok(Math.hypot(o.x - u.x, o.y - u.y) >= o.r + r, `arena ${arena}: off the obstacles`);
        for (const v of army) {
          if (v !== u) assert.ok(Math.hypot(v.x - u.x, v.y - u.y) >= r + DUEL_UNITS[v.type].radius, `arena ${arena}: apart`);
        }
      }
    }
  }
});

test("a purchase is refused for an unknown unit, for lack of money and past 12 units", () => {
  const s = createDuelState();
  assert.deepEqual(buyUnit(s, "left", "plane"), { ok: false, reason: "type" });
  assert.equal(buyUnit(s, "left", "rocket").ok, true); // $30 left
  assert.deepEqual(buyUnit(s, "left", "tank"), { ok: false, reason: "money" });
  assert.equal(s.sides.left.money, 30);
  assert.equal(s.sides.left.army.length, 1);

  const full = rich();
  assert.equal(UNIT_CAP, 12);
  for (let i = 0; i < 12; i++) assert.equal(buyUnit(full, "left", "soldier").ok, true);
  assert.deepEqual(buyUnit(full, "left", "soldier"), { ok: false, reason: "cap" });
  assert.equal(full.sides.left.army.length, 12);
});

test("selling gives the whole price back in the same purchase and half later", () => {
  const s = createDuelState();
  const { unit } = buyUnit(s, "left", "tank");
  assert.deepEqual(sellUnit(s, "left", unit.id), { ok: true, refund: 50 });
  assert.equal(s.sides.left.money, 100);
  assert.deepEqual(s.sides.left.army, []);

  const old = buyUnit(s, "left", "tank").unit;
  old.round = 0; // as if bought in an earlier round
  assert.deepEqual(sellUnit(s, "left", old.id), { ok: true, refund: 25 });
  assert.equal(s.sides.left.money, 75);

  assert.deepEqual(sellUnit(s, "left", 9999), { ok: false, reason: "unit" });
  // Nobody sells the other side's units.
  const theirs = buyUnit(s, "right", "soldier").unit;
  assert.deepEqual(sellUnit(s, "left", theirs.id), { ok: false, reason: "unit" });
});

test("a unit is moved to a free place of its own zone, and nowhere else", () => {
  const s = createDuelState({ arena: 1 }); // obstacle at 440,190 r 26
  const tank = buyUnit(s, "left", "tank").unit;
  const buggy = buyUnit(s, "left", "buggy").unit;

  assert.deepEqual(moveUnit(s, "left", tank.id, 100, 100), { ok: true });
  assert.deepEqual({ x: tank.x, y: tank.y }, { x: 100, y: 100 });

  assert.deepEqual(moveUnit(s, "left", tank.id, 600, 375), { ok: false, reason: "zone" });
  assert.deepEqual(moveUnit(s, "left", tank.id, 800, 375), { ok: false, reason: "zone" });
  assert.deepEqual(moveUnit(s, "left", tank.id, 440, 195), { ok: false, reason: "blocked" });
  assert.deepEqual(moveUnit(s, "left", tank.id, buggy.x + 5, buggy.y), { ok: false, reason: "blocked" });
  assert.deepEqual({ x: tank.x, y: tank.y }, { x: 100, y: 100 }, "a refused move leaves the unit where it was");

  // Its own place doesn't block it: a small nudge is fine.
  assert.deepEqual(moveUnit(s, "left", tank.id, 104, 100), { ok: true });
  assert.deepEqual(moveUnit(s, "left", 9999, 100, 300), { ok: false, reason: "unit" });
  assert.equal(canPlace(s, "left", 200, 400, 10), true);
  assert.equal(canPlace(s, "left", 440, 190, 10), false);
});

test("an upgrade costs its base times the level and stops at five", () => {
  const s = rich(1000);
  assert.deepEqual(DUEL_UPGRADES.damage, { levels: 5, baseCost: 20, mult: 1.25 });
  assert.equal(DUEL_UPGRADES.range.baseCost, 15);
  assert.equal(DUEL_UPGRADES.speed.baseCost, 15);
  let spent = 0;
  for (let level = 1; level <= 5; level++) {
    assert.equal(upgradeCost(s, "left", "tank", "damage"), 20 * level);
    assert.deepEqual(upgradeUnit(s, "left", "tank", "damage"), { ok: true, level, cost: 20 * level });
    spent += 20 * level;
    assert.equal(s.sides.left.money, 1000 - spent);
  }
  assert.equal(upgradeCost(s, "left", "tank", "damage"), null);
  assert.deepEqual(upgradeUnit(s, "left", "tank", "damage"), { ok: false, reason: "max" });
  assert.deepEqual(upgradeUnit(s, "left", "tank", "luck"), { ok: false, reason: "skill" });
  assert.deepEqual(upgradeUnit(s, "left", "plane", "damage"), { ok: false, reason: "type" });
  assert.equal(s.sides.left.upgrades.buggy.damage, 0, "an upgrade is of one type of unit");
  assert.equal(s.sides.right.upgrades.tank.damage, 0, "and of one side");

  const poor = createDuelState({ left: { money: 10 } });
  assert.deepEqual(upgradeUnit(poor, "left", "tank", "range"), { ok: false, reason: "money" });
});

test("upgrades change a unit's numbers as in the attack mode", () => {
  const base = unitStats("tank", { damage: 0, range: 0, armor: 0, rate: 0, speed: 0 });
  const def = DUEL_UNITS.tank;
  assert.deepEqual(base, { maxHp: def.hp, speed: def.speed, range: def.range, damage: def.damage, cooldown: def.cooldown });
  const up = unitStats("tank", { damage: 1, range: 2, armor: 1, rate: 1, speed: 1 });
  assert.equal(up.damage, def.damage * 1.25);
  assert.equal(up.range, def.range * 1.15 * 1.15);
  assert.equal(up.maxHp, Math.round(def.hp / 0.85));
  assert.equal(up.cooldown, def.cooldown * 0.85);
  assert.equal(up.speed, def.speed * 1.06);
});

test("a ready side waits: its other actions are refused until it takes the ready back", () => {
  const s = createDuelState();
  const { unit } = buyUnit(s, "left", "soldier");
  assert.deepEqual(setReady(s, "left"), { ok: true });
  assert.equal(s.sides.left.ready, true);
  assert.equal(s.phase, "buy");
  assert.deepEqual(buyUnit(s, "left", "soldier"), { ok: false, reason: "ready" });
  assert.deepEqual(sellUnit(s, "left", unit.id), { ok: false, reason: "ready" });
  assert.deepEqual(moveUnit(s, "left", unit.id, 100, 100), { ok: false, reason: "ready" });
  assert.deepEqual(upgradeUnit(s, "left", "soldier", "damage"), { ok: false, reason: "ready" });

  assert.deepEqual(setReady(s, "left", false), { ok: true });
  assert.equal(buyUnit(s, "left", "soldier").ok, true);
});

test("the fight starts when both sides are ready, and the shop closes", () => {
  const s = createDuelState();
  buyUnit(s, "left", "tank");
  buyUnit(s, "right", "tank");
  setReady(s, "left");
  setReady(s, "right");
  assert.equal(s.phase, "combat");
  assert.deepEqual(buyUnit(s, "left", "soldier"), { ok: false, reason: "phase" });
  assert.deepEqual(setReady(s, "left", false), { ok: false, reason: "phase" });
});

// ------------------------------------------------------------ the fight

// Lets this much time of the duel go by, a tick at a time.
function run(state, seconds) {
  for (let i = 0; i < Math.round(seconds / STEP); i++) stepDuel(state, STEP);
}

// Runs the fight under way to its end; returns how many ticks it took.
function fight(state, onTick = () => {}) {
  let ticks = 0;
  while (state.phase === "combat") {
    stepDuel(state, STEP);
    onTick(state);
    ticks++;
    assert.ok(ticks <= (COMBAT_TIME + 1) / STEP, "a fight ends within its time");
  }
  return ticks;
}

function bothReady(state) {
  setReady(state, "left");
  setReady(state, "right");
}

// A duel in the middle of a fight between these two armies (lists of unit
// types), as bought.
function fighting(left, right, options = {}) {
  const s = rich(1000, options);
  for (const type of left) assert.equal(buyUnit(s, "left", type).ok, true);
  for (const type of right) assert.equal(buyUnit(s, "right", type).ok, true);
  bothReady(s);
  return s;
}

const unitsOf = (state, side) => state.units.filter((u) => u.side === side);

test("the fight's units are the armies, whole, at their places and with their upgrades", () => {
  const s = rich(1000);
  const tank = buyUnit(s, "left", "tank").unit;
  moveUnit(s, "left", tank.id, 300, 200);
  upgradeUnit(s, "left", "tank", "armor");
  buyUnit(s, "right", "soldier");
  bothReady(s);
  assert.equal(s.phase, "combat");
  assert.equal(s.clock, COMBAT_TIME);
  assert.equal(s.units.length, 2);
  const u = unitsOf(s, "left")[0];
  assert.equal(u.id, tank.id);
  assert.equal(u.type, "tank");
  assert.deepEqual({ x: u.x, y: u.y }, { x: 300, y: 200 });
  assert.equal(u.maxHp, Math.round(DUEL_UNITS.tank.hp / 0.85));
  assert.equal(u.hp, u.maxHp);
  assert.equal(u.alive, true);
  // Each side starts facing the other.
  assert.equal(u.angle, 0);
  assert.equal(unitsOf(s, "right")[0].angle, Math.PI);
});

test("two tanks beat a buggy, and the money of the round is right", () => {
  const s = createDuelState();
  buyUnit(s, "left", "tank");
  buyUnit(s, "left", "tank"); // left: $0
  buyUnit(s, "right", "buggy"); // right: $80
  bothReady(s);
  fight(s);

  assert.equal(s.phase, "roundEnd");
  assert.equal(s.clock, ROUND_END_TIME);
  assert.deepEqual(s.wins, { left: 1, right: 0 });
  assert.equal(s.lastRound.winner, "left");
  assert.equal(s.lastRound.reason, "wipe");
  assert.deepEqual(s.lastRound.income, { left: ROUND_INCOME + WIN_BONUS, right: ROUND_INCOME });

  // Left destroyed a buggy: half its price. Right earned in proportion to
  // the health it took from the tanks.
  const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} is not ${b}`);
  close(s.sides.left.earned, DUEL_UNITS.buggy.price * KILL_SHARE);
  close(s.sides.left.money, 0 + 10 + 50 + 25);
  const taken = unitsOf(s, "left").reduce((sum, u) => sum + (u.maxHp - u.hp) / u.maxHp, 0);
  assert.ok(taken > 0, "the buggy hit something before falling");
  close(s.sides.right.earned, taken * DUEL_UNITS.tank.price * KILL_SHARE);
  close(s.sides.right.money, 80 + s.sides.right.earned + 50);

  assert.deepEqual(s.sides.left.destroyed, { buggy: 1 });
  assert.equal(s.sides.left.xp, 20);
  assert.deepEqual(s.sides.right.destroyed, {});
  assert.equal(s.sides.right.xp, 0);
});

test("a side with no units loses the round at once", () => {
  const s = createDuelState();
  buyUnit(s, "right", "soldier");
  bothReady(s);
  assert.equal(s.phase, "roundEnd");
  assert.equal(s.lastRound.winner, "right");
  assert.equal(s.lastRound.reason, "empty");
  assert.deepEqual(s.wins, { left: 0, right: 1 });
  assert.equal(s.sides.right.money, 90 + 50 + 25);
  assert.equal(s.sides.left.money, 100 + 50);
});

// Two units facing each other 100 px apart in the open (the top of arena
// 3 is bare), `shooter` about to fire.
function faceOff(shooter, victim) {
  const s = fighting([shooter], [victim], { arena: 3 });
  const [a] = unitsOf(s, "left");
  const [b] = unitsOf(s, "right");
  Object.assign(a, { x: 550, y: 120, fireTimer: 0 });
  Object.assign(b, { x: 650, y: 120, fireTimer: 99 });
  return { s, a, b };
}

test("a light weapon does an armoured unit half damage; a tank's gun, all of it", () => {
  const light = faceOff("buggy", "tank");
  stepDuel(light.s, STEP);
  assert.equal(light.b.maxHp - light.b.hp, DUEL_UNITS.buggy.damage / 2);

  const heavy = faceOff("tank", "tank");
  stepDuel(heavy.s, STEP);
  assert.equal(heavy.b.maxHp - heavy.b.hp, DUEL_UNITS.tank.damage);

  const soft = faceOff("buggy", "rocket");
  stepDuel(soft.s, STEP);
  assert.equal(soft.b.maxHp - soft.b.hp, DUEL_UNITS.buggy.damage);
});

test("a shot is drawn, and the shooter waits its cooldown before the next", () => {
  const { s, a, b } = faceOff("tank", "tank");
  stepDuel(s, STEP);
  assert.equal(s.shots.length, 1);
  assert.deepEqual(s.shots[0].from, { x: 550, y: 120 });
  assert.deepEqual(s.shots[0].to, { x: 650, y: 120 });
  assert.equal(s.shots[0].type, "tank");
  assert.equal(s.shots[0].side, "left");
  const after = b.hp;
  run(s, DUEL_UNITS.tank.cooldown - 0.2);
  assert.equal(b.hp, after, "no second shot before the cooldown");
  run(s, 0.4);
  assert.equal(after - b.hp, DUEL_UNITS.tank.damage);
  assert.ok(s.shots.every((shot) => shot.age < 0.5), "old shots are dropped");
  assert.ok(a.alive);
});

test("a rocket also hurts what stands near its target, and nothing farther", () => {
  const s = fighting(["rocket"], ["soldier", "soldier", "soldier"], { arena: 3 });
  const [rocket] = unitsOf(s, "left");
  const [target, near, far] = unitsOf(s, "right");
  Object.assign(rocket, { x: 450, y: 120, fireTimer: 0 });
  Object.assign(target, { x: 650, y: 120, fireTimer: 99 });
  Object.assign(near, { x: 650, y: 150, fireTimer: 99 });
  Object.assign(far, { x: 650, y: 200, fireTimer: 99 });
  stepDuel(s, STEP);
  assert.equal(target.maxHp - target.hp, DUEL_UNITS.rocket.damage);
  assert.ok(Math.abs(near.maxHp - near.hp - DUEL_UNITS.rocket.damage * 0.6) < 1e-9);
  assert.equal(far.hp, far.maxHp);
});

test("an obstacle on the line stops the shots, and the units walk round it", () => {
  const s = fighting(["tank"], ["tank"], { arena: 1 }); // obstacle at 600,375 r 38
  const [a] = unitsOf(s, "left");
  const [b] = unitsOf(s, "right");
  Object.assign(a, { x: 540, y: 375, fireTimer: 0 });
  Object.assign(b, { x: 660, y: 375, fireTimer: 0 });
  stepDuel(s, STEP);
  assert.equal(a.hp, a.maxHp, "in range, but the obstacle is between them");
  assert.equal(b.hp, b.maxHp);
  assert.deepEqual(s.shots, []);
  fight(s);
  assert.equal(s.phase, "roundEnd");
  assert.ok(a.hp < a.maxHp || b.hp < b.maxHp, "they found each other round it");
});

test("units come to their enemies and stop to shoot within range", () => {
  const s = fighting(["tank"], ["tank"], { arena: 3 });
  const [a] = unitsOf(s, "left");
  const [b] = unitsOf(s, "right");
  Object.assign(a, { x: 100, y: 120 });
  Object.assign(b, { x: 1100, y: 120 });
  run(s, 2);
  assert.ok(a.x > 100 + DUEL_UNITS.tank.speed * 1.9, "the left tank drove right");
  assert.ok(b.x < 1100 - DUEL_UNITS.tank.speed * 1.9, "the right tank drove left");
  fight(s);
  const gap = Math.hypot(a.x - b.x, a.y - b.y);
  assert.ok(gap <= DUEL_UNITS.tank.range + 1 && gap > DUEL_UNITS.tank.range - 15, `they stopped at range (${gap})`);
});

test("mirrored armies fight a mirrored fight: neither side moves first", () => {
  const s = rich(1000, { arena: 2 });
  for (const type of ["tank", "buggy", "soldier", "rocket", "motorcycle"]) {
    const mine = buyUnit(s, "left", type).unit;
    const theirs = buyUnit(s, "right", type).unit;
    // The right side's unit stands at the mirror image of the left one's.
    assert.deepEqual(moveUnit(s, "right", theirs.id, ARENA.width - mine.x, mine.y), { ok: true });
  }
  bothReady(s);
  run(s, 12);
  const health = (side) => unitsOf(s, side).map((u) => Math.round(u.hp * 1000) / 1000);
  assert.deepEqual(health("left"), health("right"));
  const round2 = (v) => Math.round(v * 100) / 100;
  assert.deepEqual(
    unitsOf(s, "left").map((u) => [round2(ARENA.width - u.x), round2(u.y)]),
    unitsOf(s, "right").map((u) => [round2(u.x), round2(u.y)]),
  );
});

test("no unit is ever inside an obstacle or outside the arena", () => {
  const mix = ["tank", "rocket", "buggy", "motorcycle", "soldier", "soldier", "tank", "buggy", "motorcycle", "soldier", "rocket", "soldier"];
  for (let arena = 1; arena <= 5; arena++) {
    const s = fighting(mix, mix, { arena });
    const obstacles = arenaOf(arena).obstacles;
    fight(s, () => {
      for (const u of s.units) {
        if (!u.alive) continue;
        const inside = u.x >= u.radius - 0.01 && u.x <= ARENA.width - u.radius + 0.01 && u.y >= u.radius - 0.01 && u.y <= ARENA.height - u.radius + 0.01;
        assert.ok(inside, `arena ${arena}: unit ${u.id} left the arena`);
        for (const o of obstacles) {
          assert.ok(Math.hypot(o.x - u.x, o.y - u.y) >= o.r + u.radius - 0.01, `arena ${arena}: unit ${u.id} is inside an obstacle`);
        }
      }
    });
  }
});

test("when the time runs out, the side with more army left wins", () => {
  const s = fighting(["tank"], ["soldier"], { arena: 3 });
  s.clock = STEP * 2; // far apart: nobody gets a shot in
  fight(s);
  assert.equal(s.lastRound.winner, "left");
  assert.equal(s.lastRound.reason, "time");

  // The same army left on both sides: the one that did more damage.
  const even = fighting(["tank"], ["tank"], { arena: 3 });
  even.sides.right.damage = 3;
  even.clock = STEP * 2;
  fight(even);
  assert.equal(even.lastRound.winner, "right");
  assert.equal(even.lastRound.reason, "damage");

  // And level on that too: a coin, the same one for the same seed.
  const coin = (seed) => {
    const level = fighting(["tank"], ["tank"], { arena: 3, seed });
    level.clock = STEP * 2;
    fight(level);
    assert.equal(level.lastRound.reason, "coin");
    return level.lastRound.winner;
  };
  assert.equal(coin(7), coin(7));
  const winners = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(coin));
  assert.deepEqual([...winners].sort(), ["left", "right"]);
});

test("after the round's result the next purchase starts, the armies whole again", () => {
  const s = createDuelState();
  const tank = buyUnit(s, "left", "tank").unit;
  moveUnit(s, "left", tank.id, 200, 300);
  const soldier = buyUnit(s, "right", "soldier").unit;
  bothReady(s);
  fight(s);
  run(s, ROUND_END_TIME - 0.2);
  assert.equal(s.phase, "roundEnd");
  run(s, 0.3);
  assert.equal(s.phase, "buy");
  assert.equal(s.round, 2);
  assert.equal(s.clock, null);
  assert.deepEqual(s.units, []);
  assert.equal(s.sides.left.ready, false);
  assert.equal(s.sides.right.ready, false);
  assert.deepEqual(s.sides.left.army, [{ id: tank.id, type: "tank", x: 200, y: 300, round: 1 }]);
  assert.deepEqual(s.sides.right.army.map((u) => u.id), [soldier.id], "the destroyed soldier is back");
  // The shop is open again, and what was bought in round 1 now sells at half.
  assert.deepEqual(sellUnit(s, "left", tank.id), { ok: true, refund: 25 });

  bothReady(s);
  assert.equal(s.sides.right.earned, 0, "a new fight counts its own money");
});

test("the first side to win three rounds wins the duel, and then nothing moves", () => {
  const s = createDuelState();
  buyUnit(s, "left", "tank");
  buyUnit(s, "left", "tank");
  buyUnit(s, "right", "soldier");
  let rounds = 0;
  while (s.phase !== "over") {
    assert.equal(s.phase, "buy");
    bothReady(s);
    fight(s);
    rounds++;
    if (s.phase === "roundEnd") run(s, ROUND_END_TIME + 0.1);
    assert.ok(rounds <= 5);
  }
  assert.equal(rounds, ROUNDS_TO_WIN);
  assert.equal(s.winner, "left");
  assert.deepEqual(s.wins, { left: 3, right: 0 });
  assert.equal(s.sides.left.xp, 30);

  const before = JSON.stringify(s);
  run(s, 5);
  assert.equal(JSON.stringify(s), before);
  assert.deepEqual(buyUnit(s, "left", "soldier"), { ok: false, reason: "phase" });
  assert.deepEqual(setReady(s, "left"), { ok: false, reason: "phase" });
});

test("the same seed and the same actions give the same fight", () => {
  const play = (seed) => {
    const mix = ["tank", "rocket", "buggy", "motorcycle", "soldier", "soldier"];
    const s = fighting(mix, [...mix].reverse(), { arena: 4, seed });
    fight(s);
    return JSON.stringify(s);
  };
  assert.equal(play(5), play(5));
});

test("stepDuel takes time in pieces of any size", () => {
  const s = fighting(["tank"], ["tank"], { arena: 3 });
  stepDuel(s, STEP * 3.5);
  assert.ok(Math.abs(s.clock - (COMBAT_TIME - 3 * STEP)) < 1e-9);
  stepDuel(s, STEP * 0.5);
  assert.ok(Math.abs(s.clock - (COMBAT_TIME - 4 * STEP)) < 1e-9);
  // A long freeze of the screen doesn't run a whole fight in one go.
  stepDuel(s, 30);
  assert.ok(s.clock > COMBAT_TIME - 1);
});

test("between two players, the fight starts when the purchase's time runs out", () => {
  const s = createDuelState({ timed: true });
  buyUnit(s, "left", "tank");
  buyUnit(s, "right", "tank");
  setReady(s, "left"); // the right side never says it
  run(s, 44.5);
  assert.equal(s.phase, "buy");
  run(s, 1);
  assert.equal(s.phase, "combat");
  fight(s);
  run(s, ROUND_END_TIME);
  assert.equal(s.phase, "buy");
  assert.equal(BUY_TIME, 30);
  assert.ok(s.clock <= BUY_TIME && s.clock > BUY_TIME - 0.1, "the later purchases get 30 s");
});

// ------------------------------------------------------------ what each side sees

test("while shopping, a side sees the rival as it was when the purchase began", () => {
  const s = rich(300);
  buyUnit(s, "left", "soldier");
  buyUnit(s, "right", "tank");
  upgradeUnit(s, "right", "tank", "damage");
  setReady(s, "right");

  const mine = duelView(s, "left");
  assert.deepEqual(mine.sides.right.army, [], "what the rival buys now is not shown");
  assert.equal(mine.sides.right.money, 300);
  assert.equal(mine.sides.right.upgrades.tank.damage, 0);
  assert.equal(mine.sides.right.ready, true, "that it is ready is no secret");
  assert.equal(mine.sides.left.army.length, 1);
  assert.equal(mine.sides.left.money, 290);

  const theirs = duelView(s, "right");
  assert.equal(theirs.sides.right.army.length, 1);
  assert.equal(theirs.sides.right.upgrades.tank.damage, 1);
  assert.deepEqual(theirs.sides.left.army, []);
  assert.equal(theirs.sides.left.money, 300);
});

test("a view is a copy: changing it leaves the duel alone", () => {
  const s = rich(300);
  buyUnit(s, "left", "soldier");
  const view = duelView(s, "left");
  view.sides.left.money = 0;
  view.sides.left.army[0].x = -50;
  view.sides.right.upgrades.tank.damage = 5;
  assert.equal(s.sides.left.money, 290);
  assert.notEqual(s.sides.left.army[0].x, -50);
  assert.equal(s.sides.right.upgrades.tank.damage, 0);
});

test("in the next purchase the rival's army of the last fight is known, not what it adds", () => {
  const s = rich(300);
  buyUnit(s, "left", "tank");
  const first = buyUnit(s, "right", "tank").unit;
  bothReady(s);
  fight(s);
  if (s.phase === "roundEnd") run(s, ROUND_END_TIME);
  assert.equal(s.phase, "buy");
  const before = s.sides.right.money;
  buyUnit(s, "right", "rocket");
  upgradeUnit(s, "right", "tank", "armor");

  const view = duelView(s, "left");
  assert.deepEqual(view.sides.right.army.map((u) => u.id), [first.id]);
  assert.equal(view.sides.right.money, before);
  assert.equal(view.sides.right.upgrades.tank.armor, 0);
});

test("during the fight and after it, both sides see everything", () => {
  const s = fighting(["tank", "soldier"], ["rocket"], { arena: 2 });
  run(s, 1);
  for (const side of SIDES) assert.deepEqual(duelView(s, side), JSON.parse(JSON.stringify(s)));
  fight(s);
  for (const side of SIDES) assert.deepEqual(duelView(s, side), JSON.parse(JSON.stringify(s)));
});
