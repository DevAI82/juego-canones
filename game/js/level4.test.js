import { test } from "node:test";
import assert from "node:assert/strict";
import { createGameState, startNextLevel, stepSimulation, canPlaceWall } from "./simulate.js";
import { distanceToPath, offsetPath, crossesWall, pointInPolygon } from "./map.js";
import { MAX_LEVEL, LEVELS, narrowsOf, solidSegmentsOf } from "./levels.js";
import { WAVES, buildSpawnQueue } from "./waves.js";

const L = LEVELS[4];
const wet = (p) => L.water.some((poly) => pointInPolygon(p, poly));

function seededRandom(t, seed) {
  t.mock.method(Math, "random", () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  });
}

test("level 4 is the last level, a big scrolling map like level 3's, and clearing level 3 leads to it", () => {
  assert.equal(MAX_LEVEL, 4);
  assert.equal(L.worldWidth, 2048);
  assert.equal(L.worldHeight, 2048);
  const s = createGameState(3);
  s.levelComplete = true;
  assert.equal(startNextLevel(s).level, 4);
});

test("every level 4 road starts off the map and ends at the HQ's door", () => {
  assert.ok(L.paths.length >= 6);
  for (const path of L.paths) {
    const start = path[0];
    assert.ok(start.x < 0 || start.y < 0 || start.x > L.worldWidth || start.y > L.worldHeight, `starts on the map at ${start.x},${start.y}`);
    assert.deepEqual(path.at(-1), L.soldierExit);
  }
});

test("no lane of any level 4 road runs into the river or the sea", () => {
  const shores = solidSegmentsOf(L);
  for (const [i, path] of L.paths.entries()) {
    for (const off of [-24, -12, 0, 12, 24]) {
      const lane = offsetPath(path, off, narrowsOf(L));
      for (let k = 0; k < lane.length - 1; k++) {
        assert.ok(!crossesWall(lane[k], lane[k + 1], shores), `road ${i}, lane ${off}: segment ${k} crosses a shore`);
        assert.ok(!wet(lane[k]), `road ${i}, lane ${off}: point ${k} is in the water`);
      }
    }
  }
});

test("the two bridges are level 4's narrows, with water on both sides of them", () => {
  const narrows = narrowsOf(L);
  assert.ok(narrows.length >= 6);
  for (const p of narrows) assert.ok(!wet(p), `bridge point ${p.x},${p.y} is in the water`);
  // Between each bridge's points (its ends are on the banks), river both sides.
  for (let i = 0; i + 1 < narrows.length; i++) {
    const [a, b] = [narrows[i], narrows[i + 1]];
    if (Math.hypot(b.x - a.x, b.y - a.y) > 150) continue; // that's the next bridge
    const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    assert.ok(!wet(m) && wet({ x: m.x, y: m.y - 30 }) && wet({ x: m.x, y: m.y + 30 }), `no river either side of ${m.x},${m.y}`);
  }
  // The west-bank roads cross the river on them.
  for (const path of [L.paths[0], L.paths[1]]) assert.ok(narrows.some((n) => path.some((p) => p.x === n.x && p.y === n.y)));
});

test("level 4's build slots keep off the roads and the water", () => {
  assert.ok(L.buildSlots.length > 100);
  for (const slot of L.buildSlots) {
    assert.ok(!wet(slot), `slot ${slot.x},${slot.y} is in the water`);
    for (const path of L.paths) assert.ok(distanceToPath(path, slot.x, slot.y) >= 60, `slot ${slot.x},${slot.y} is on a road`);
  }
});

test("walls can't be built on the river, but can be on a bridge", () => {
  const s = createGameState(4);
  s.economy.money = 1000;
  assert.equal(canPlaceWall(s, 450, 400).reason, "water");
  assert.equal(canPlaceWall(s, 1700, 300).reason, "water"); // the sea
  assert.equal(canPlaceWall(s, 450, 163).ok, true); // the north bridge's deck
});

test("soldiers on level 4 take the roads too", () => {
  const s = createGameState(4);
  s.spawnQueue = Array.from({ length: 40 }, () => ({ type: "soldier", time: 0 }));
  stepSimulation(s, 0.001);
  assert.equal(s.enemies.length, 40);
  for (const e of s.enemies) {
    assert.ok(e.pathIndex >= 0 && e.pathIndex < L.paths.length);
    for (const p of e.path) assert.ok(distanceToPath(L.paths[e.pathIndex], p.x, p.y) <= 17);
  }
});

test("on level 4 the biggest wave gets all the way through, nobody going into the water or getting stuck", (t) => {
  seededRandom(t, 5);
  const s = createGameState(4);
  s.waveIndex = WAVES.length - 1; // the biggest wave
  s.spawnQueue = buildSpawnQueue(s.waveIndex);
  s.economy.lives = 1e9;
  const lastMoved = new Map();
  let longestStop = 0;
  let inWater = 0;
  let time = 0;
  // Up to 6 minutes of game time; it normally clears in under 2.5.
  for (let i = 0; i < 7200 && (s.enemies.length || s.spawnQueue.length); i++) {
    const before = new Map(s.enemies.map((e) => [e.id, { x: e.x, y: e.y }]));
    stepSimulation(s, 0.05);
    time += 0.05;
    if (s.spawnQueue.length === 0) s.waveIndex = WAVES.length - 1; // clearing it mustn't start another wave
    for (const e of s.enemies) {
      const b = before.get(e.id);
      if (!b || Math.hypot(e.x - b.x, e.y - b.y) > 0.2) lastMoved.set(e.id, time);
      longestStop = Math.max(longestStop, time - lastMoved.get(e.id));
      if (wet(e)) inWater++;
    }
  }
  assert.equal(s.enemies.length, 0, `${s.enemies.length} enemies still on the field`);
  assert.equal(inWater, 0);
  // Queueing onto a bridge holds a unit up for a second or two at most.
  assert.ok(longestStop < 5, `someone stood still for ${longestStop.toFixed(1)}s`);
});
