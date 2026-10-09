import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createAttackState,
  stepAttack,
  startAttack,
  buyUnits,
  orderMove,
  orderAttack,
  orderEnter,
  orderStop,
  roundIncome,
  ROUND_TIME,
  ROUNDS,
  DAMAGE_REWARD,
  ENTRY_REWARD,
  BASE_CLICK_RADIUS,
  BOUNTY_SHARE,
} from "./attack.js";
import { DIFFICULTIES, AI_PERIOD } from "./defenseAI.js";
import { attackMapOf, nearestRoadPoint } from "./roadGraph.js";
import { isVisible } from "./fog.js";
import { createTower } from "./tower.js";
import { wallCell } from "./walls.js";
import { assignId } from "./ids.js";
import { LEVELS } from "./levels.js";

// An attack on level 2 against a defence with no towers and no money:
// nothing shoots unless a test puts a tower down.
function empty(level = 2) {
  const s = createAttackState(level, "normal", { aiSetup: false });
  s.economy.money = 0;
  return s;
}

function run(s, seconds, dt = 0.05) {
  for (let t = 0; t < seconds - 1e-9; t += dt) stepAttack(s, dt);
}

function runUntil(s, done, limit, dt = 0.05) {
  for (let t = 0; t < limit && !done(); t += dt) stepAttack(s, dt);
  return done();
}

const ids = (s) => s.enemies.map((u) => u.id);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// A finished tower of the defence at (x, y).
function tower(s, type, x, y) {
  const t = assignId(createTower(type, x, y));
  t.buildTimeRemaining = 0;
  s.towers.push(t);
  return t;
}

test("the attacker's pay: a quarter of the damage done, $20 a unit into the base; a click this close to the base goes in", () => {
  assert.equal(DAMAGE_REWARD, 0.25);
  assert.equal(ENTRY_REWARD, 20);
  assert.equal(BASE_CLICK_RADIUS, 60);
});

test("a unit sent somewhere waits for «¡Al ataque!», then drives there along the roads and stops, leaving the base alone", () => {
  const s = empty();
  buyUnits(s, "soldier");
  const [u] = s.enemies;
  const spot = { x: 457, y: 191 };
  const before = { x: u.x, y: u.y };
  assert.equal(orderMove(s, ids(s), spot.x, spot.y).ok, true);
  run(s, 5);
  assert.ok(dist(u, before) < 1e-9);
  assert.equal(s.attack.roundLeft, ROUND_TIME);
  startAttack(s);
  assert.ok(runUntil(s, () => u.order === null, 30));
  assert.ok(dist(u, spot) < 35, `stopped ${Math.round(dist(u, spot))}px away`);
  assert.ok(nearestRoadPoint(attackMapOf(LEVELS[2]).graph, u.x, u.y).dist < 30);
  assert.equal(s.economy.lives, 20);
});

test("a group sent to one spot spreads out along the road there", () => {
  const s = empty();
  buyUnits(s, "soldier", 6);
  const spot = { x: 457, y: 191 };
  assert.equal(orderMove(s, ids(s), spot.x, spot.y).stops.length, 6);
  startAttack(s);
  assert.ok(runUntil(s, () => s.enemies.every((u) => u.order === null), 40));
  for (const u of s.enemies) assert.ok(dist(u, spot) < 120);
  for (let i = 0; i < 6; i++) for (let j = i + 1; j < 6; j++) assert.ok(dist(s.enemies[i], s.enemies[j]) > 10);
});

test("a click far from any road sends the units to the nearest street", () => {
  const s = empty();
  buyUnits(s, "motorcycle");
  const [u] = s.enemies;
  const target = nearestRoadPoint(attackMapOf(LEVELS[2]).graph, 300, 600);
  orderMove(s, ids(s), 300, 600);
  assert.equal(u.order.kind, "move");
  startAttack(s);
  assert.ok(runUntil(s, () => u.order === null, 60));
  assert.ok(dist(u, target) < 60);
});

test("a unit sent into the base goes in: the base loses its lives and the attacker earns $20", () => {
  const s = empty();
  buyUnits(s, "buggy");
  const money = s.attack.money;
  assert.equal(orderEnter(s, ids(s)).ok, true);
  startAttack(s);
  assert.ok(runUntil(s, () => s.enemies.length === 0, 50));
  assert.equal(s.economy.lives, 19);
  assert.equal(s.attack.money, money + ENTRY_REWARD);
  assert.equal(s.attack.stats.livesTaken, 1);
  assert.equal(s.stats.kills.buggy, 0); // it went in, it wasn't destroyed
  assert.equal(s.economy.money, 0); // so no bounty for the defence
});

test("a right-click on or near the base is an order to go in", () => {
  const s = empty();
  buyUnits(s, "soldier");
  const { base } = attackMapOf(LEVELS[2]);
  orderMove(s, ids(s), base.x + 30, base.y);
  assert.equal(s.enemies[0].order.kind, "enter");
});

test("units sent against a tower stop once it's in range, fire until it falls, then wait", () => {
  const s = empty();
  s.attack.money = 1000;
  buyUnits(s, "rocket");
  const [rocket] = s.enemies;
  const t = tower(s, "basic", 600, 300);
  assert.equal(orderAttack(s, ids(s), t.id).ok, true);
  startAttack(s);
  const money = s.attack.money;
  assert.ok(runUntil(s, () => s.towers.length === 0, 90));
  assert.ok(rocket.alive);
  const d = dist(rocket, t);
  assert.ok(d <= rocket.fireRange + 5 && d > t.range, `fired from ${Math.round(d)}px`);
  assert.equal(s.attack.money, money + t.maxHp * DAMAGE_REWARD);
  assert.equal(s.stats.towersLost, 1);
  run(s, 0.5);
  assert.equal(rocket.order, null);
  const at = { x: rocket.x, y: rocket.y };
  run(s, 2);
  assert.ok(dist(rocket, at) < 2);
});

test("if their target is destroyed by something else on the way, the units stop and wait", () => {
  const s = empty();
  buyUnits(s, "soldier", 2);
  const t = tower(s, "basic", 820, 380);
  orderAttack(s, ids(s), t.id);
  startAttack(s);
  run(s, 2);
  t.hp = 0;
  run(s, 0.1);
  assert.ok(s.enemies.every((u) => u.order === null));
  const at = s.enemies.map((u) => ({ x: u.x, y: u.y }));
  run(s, 2);
  s.enemies.forEach((u, i) => assert.ok(dist(u, at[i]) < 3));
});

test("a tower too far from every road: the units get as close as the roads allow, then wait", () => {
  const s = empty();
  buyUnits(s, "soldier");
  const [u] = s.enemies;
  const t = tower(s, "basic", 330, 560);
  orderAttack(s, ids(s), t.id);
  startAttack(s);
  assert.ok(runUntil(s, () => u.order === null, 60));
  assert.ok(u.alive);
  assert.equal(t.hp, t.maxHp);
  assert.ok(dist(u, t) > u.fireRange);
});

test("stop: the units stop where they are; a new order replaces the old one", () => {
  const s = empty();
  buyUnits(s, "buggy");
  const [u] = s.enemies;
  orderMove(s, ids(s), 762, 245);
  startAttack(s);
  run(s, 2);
  assert.deepEqual(orderStop(s, ids(s)), { ok: true });
  const at = { x: u.x, y: u.y };
  run(s, 2);
  assert.ok(dist(u, at) < 2);
  assert.equal(u.order, null);
  orderMove(s, ids(s), 305, 157);
  assert.ok(runUntil(s, () => u.order === null, 30));
  assert.ok(dist(u, { x: 305, y: 157 }) < 60);
});

test("units with no orders stay put but fire at towers in range", () => {
  const s = empty();
  buyUnits(s, "tank");
  const [u] = s.enemies;
  const t = tower(s, "basic", u.x + 100, u.y);
  startAttack(s);
  const at = { x: u.x, y: u.y };
  run(s, 4);
  assert.ok(t.hp < t.maxHp);
  assert.ok(dist(u, at) < 3);
  assert.equal(u.order, null);
});

test("wall blocks across the road hold the units up until they shoot their way through, paying a quarter of the damage", () => {
  const s = empty();
  buyUnits(s, "tank");
  const [u] = s.enemies;
  const walls = [112, 144, 176].map((y) => {
    const cell = wallCell(304, y);
    const w = assignId({ kind: "wall", x: cell.x, y: cell.y, hp: 20, maxHp: 150 });
    s.walls.push(w);
    return w;
  });
  orderMove(s, ids(s), 457, 191);
  startAttack(s);
  const money = s.attack.money;
  assert.ok(runUntil(s, () => u.order === null, 120));
  assert.ok(dist(u, { x: 457, y: 191 }) < 60);
  const damage = walls.reduce((sum, w) => sum + (20 - Math.max(0, w.hp)), 0);
  assert.ok(damage >= 20);
  assert.equal(s.attack.money, money + damage * DAMAGE_REWARD);
});

test("each round's start pays the attacker 150 + 25 per round gone and the defence its budget", () => {
  const s = empty();
  startAttack(s);
  const spent = s.stats.moneySpent;
  run(s, ROUND_TIME + 0.5, 0.25);
  assert.equal(s.attack.round, 2);
  assert.equal(s.attack.money, roundIncome(1) + roundIncome(2));
  assert.equal(s.economy.money + (s.stats.moneySpent - spent), DIFFICULTIES.normal.perRound);
  assert.ok(Math.abs(s.attack.roundLeft - (ROUND_TIME - 0.5)) < 1e-6);
});

test("the defence also spends during a round", () => {
  const s = empty();
  startAttack(s);
  s.economy.money = 200;
  run(s, AI_PERIOD + 0.5, 0.25);
  assert.ok(s.towers.length >= 1);
});

test("the base at 0 lives: the attacker wins and the game stops", () => {
  const s = empty();
  s.economy.lives = 1;
  buyUnits(s, "motorcycle");
  orderEnter(s, ids(s));
  startAttack(s);
  assert.ok(runUntil(s, () => s.gameOver, 60));
  assert.equal(s.attack.winner, "attacker");
  assert.equal(s.economy.lives, 0);
  assert.equal(s.attack.stats.livesTaken, 1);
  const left = s.attack.roundLeft;
  run(s, 2);
  assert.equal(s.attack.roundLeft, left);
  assert.deepEqual(buyUnits(s, "soldier"), { ok: false, reason: "game-over" });
  assert.deepEqual(orderStop(s, []), { ok: false, reason: "game-over" });
});

test("when round 15 runs out with the base still standing, the base wins", () => {
  const s = empty();
  startAttack(s);
  s.attack.round = ROUNDS;
  s.attack.roundLeft = 1;
  run(s, 1.5);
  assert.equal(s.gameOver, true);
  assert.equal(s.attack.winner, "defense");
});

test("orders need units of one's own, and a target that's there", () => {
  const s = empty();
  assert.deepEqual(orderMove(s, [987654], 100, 100), { ok: false, reason: "no-units" });
  buyUnits(s, "soldier");
  assert.deepEqual(orderAttack(s, ids(s), 987654), { ok: false, reason: "no-such-structure" });
});

test("the fog follows the army", () => {
  const s = empty();
  buyUnits(s, "motorcycle");
  orderMove(s, ids(s), 762, 245);
  assert.ok(!isVisible(s.attack.fog, 762, 245));
  startAttack(s);
  assert.ok(runUntil(s, () => s.enemies[0].order === null, 40));
  assert.ok(isVisible(s.attack.fog, 762, 245));
});

test("nobody drives off the map, even shoved about in a crowd at an entry", () => {
  const s = empty();
  buyUnits(s, "buggy");
  const [u] = s.enemies;
  orderMove(s, ids(s), 457, 191);
  startAttack(s);
  // Right at the corner, heading out at full speed.
  u.x = 2;
  u.y = 2;
  u.angle = (-3 * Math.PI) / 4;
  u.v = u.speed;
  for (let i = 0; i < 20; i++) {
    stepAttack(s, 0.05);
    assert.ok(u.x >= 0 && u.y >= 0 && u.x <= LEVELS[2].worldWidth && u.y <= LEVELS[2].worldHeight, `at (${u.x}, ${u.y})`);
  }
});

test("each unit destroyed pays the defence a share of its bounty", () => {
  const s = empty();
  buyUnits(s, "tank");
  const [u] = s.enemies;
  startAttack(s);
  u.hp = 1;
  tower(s, "basic", u.x + 60, u.y);
  run(s, 3);
  assert.equal(u.alive, false);
  assert.equal(s.economy.money + (s.stats.moneySpent - 0), Math.round(20 * BOUNTY_SHARE));
});
