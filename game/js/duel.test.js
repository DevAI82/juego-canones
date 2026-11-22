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
} from "./duel.js";
import { UNIT_PRICES, UNIT_ORDER } from "./attack.js";
import { ZONES, arenaOf } from "./duelArenas.js";

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
