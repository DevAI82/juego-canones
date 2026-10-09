# Attack mode, plan A: the core — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Everything the attack mode needs below the screen — a road network for every map (with new streets on maps 3 and 4), the attack rules (army, shop, upgrades, orders, rounds, money, winning), the computer's defence, the attacker's fog of war and attack saves — DOM-free and tested, with whole games played headless by a bot.

**Architecture:** The attack mode reuses the defence game's pieces instead of forking them: the defence's towers, wall blocks, money and the base's lives are `simulate.js`'s own (`state.economy`, `state.towers`, `state.walls`), and the army's units are `enemy.js`'s enemy units (same stats, driving and firing), steered by the player's orders along routes that `roadGraph.js` works out on each map's network of roads and streets. `attack.js` owns the attack rules and its own tick (`stepAttack`), built from building blocks split out of `stepSimulation`. `defenseAI.js` defends using only `simulate.js`'s public actions. `fog.js` is the attacker's fog. `modes.js` picks the defence or attack version of the tick and of saving, so the autosave scheduler and the browser's save list serve both modes.

**Tech Stack:** Vanilla JS ES modules, Node's built-in test runner (`node --test` from `game/`). No new dependencies.

**Spec:** [docs/2026-10-09-modo-atacante-design.md](2026-10-09-modo-atacante-design.md)

This is plan A of three for part 2 of the roadmap: **A** (this one) the core; **B** controls, interface and drawing (selection, groups, mouse orders, shop, upgrade panel, HUD, fog overlay, menu, end screen); **C** balance with bots and the final browser run. Nothing in plan A changes what the player sees: the menu's «Atacar» stays greyed out until plan B.

## Global Constraints

- The defence game (the game as it is) behaves exactly as before: the whole existing suite stays green and `stepSimulation`'s behaviour doesn't change.
- Initial values, from the spec (tuned later in plan C): 15 rounds of 60 s; attacker income at the start of round *n*: $150 + $25 × (*n* − 1), round 1's paid when preparation starts; 25 % of the damage done to towers and walls; $20 per unit that gets into the base.
- Unit prices: soldier $15, motorcycle $25, buggy $35, tank $90, rocket $120. Cap: 60 units, counting the ones bought and still waiting to come in. Units bought during a round come in 0.5 s apart. No per-wave scaling in attack mode.
- Unit upgrades, 5 levels each, all units of the type (deployed and future): damage ×1.25 ($60 × *k*), range ×1.15 ($40 × *k*), armor (max health) ×1/0.85 ($60 × *k*), rate (time between shots) ×0.85 ($60 × *k*), speed ×1.06 ($40 × *k*).
- The base has 20 lives; a unit getting in takes its own (soldier, motorcycle, buggy 1; tank, rocket 2). The attacker wins at 0 lives before round 15 ends; otherwise the base wins.
- Defence: easy $250 + $60/round; normal $350 + $90/round; hard $450 + $120/round and walls. It also earns each destroyed unit's bounty. It only uses `placeTower`, `upgradeTower`, `repairStructure`, `placeWall`, and never one they would turn down.
- Fog: 32 px grid; sight motorcycle 240, buggy 200, soldier 150, tank 170, rocket 160; entries always see 150. Towers and wall blocks are remembered as last seen. Only the attacker has fog.
- Units only move along roads and streets; nothing moves without an order.
- DOM-free modules, no new dependencies, comments that explain why (the code is read by a learner).
- Commit locally only (no push, no deploy). Never touch the family's LAN server on port 8420.

## Rulings this plan takes where the spec leaves room

1. **Preparation is frozen.** Nothing moves or fires and no clock runs. Units bought in preparation are set straight down along the active entry's road; orders given then are carried out from «¡Al ataque!». (Letting units drive about with no clock would let the army walk up to the base for free.)
2. **The defence gets its per-round budget at the start of rounds 2–15**; its starting money is round 1's — the same as the attacker, whose round 1 money is paid in preparation.
3. **Units bought during a round drive from the entry to the first free place along its road** and wait there, instead of piling up on the entry point.
4. **Entries are 20 px inside the map** (the defence game's roads start off the map). **Level 1's base is where its trench leaves the map** (20 px inside the right-hand edge): the defence game's end point is off the map.
5. **Only an «enter» order goes into the base**: a unit driving past it on a move order doesn't.

## Review Focus

1. **A click far from any road** (a rooftop, the river, the middle of a block): units go to the nearest street, never off-road — test in Task 6.
2. **A target destroyed by something else while units are on their way to it**: they stop and wait, nothing freezes or throws — test in Task 6.
3. **A crowded entry** (60 units bought at once in preparation): every unit gets a place along the road, nothing throws — test in Task 5.
4. **Damaged, hand-edited or wrong-mode saves** (an attack save offered to the defence loader and the other way round): rejected or repaired field by field, never a broken game — tests in Task 7.
5. **The moment a round starts** (paused right then, or a save asked for mid-round): one autosave per round start, a requested save made at the next round start — tests in Task 7.

---

## File Structure

```
game/
├── js/ids.js                (create) one id counter for everything in a game
├── js/ids.test.js           (create)
├── js/simulate.js           (modify) ids from ids.js; stepSimulation's end split into exported fireTowers/fireUnits/stepShots/clearDestroyed; separateEnemies exported; boardForSave/restoreBoard; defence saves tagged mode "defense", attack saves refused
├── js/simulate-steps.test.js (create) the split-out steps
├── js/levels.js             (modify) extra streets for levels 3 and 4
├── js/roadGraph.js          (create) road network, routes, spread stops, entries and base
├── js/roadGraph.test.js     (create)
├── js/defenseAI.js          (create) the computer's defence
├── js/defenseAI.test.js     (create)
├── js/fog.js                (create) the attacker's fog of war
├── js/fog.test.js           (create)
├── js/attack.js             (create) attack rules, tick and saves
├── js/attack.test.js        (create) state, shop, upgrades, arrivals
├── js/attack-orders.test.js (create) orders, battle, rounds, money, end
├── js/attack-save.test.js   (create) attack saves, modes, autosave
├── js/modes.js              (create) defence/attack dispatch of the tick and saves
├── js/autosave.js           (modify) through modes.js
├── js/saves.js              (modify) slotListing through modes.js
├── js/menu.js               (modify) describeSave says «Defensa» or «Ataque»
├── js/menu.test.js          (modify)
├── js/attackBot.js          (create) a simple attacker for headless games
├── js/attack-game.test.js   (create) whole games, headless
└── .vercelignore            (modify) js/attackBot.js
```

Test command for every task: `node --test` from `game/` (the whole suite; it must stay green).

---

### Task 1: One id counter, and the defence tick in reusable pieces

**Files:**
- Create: `game/js/ids.js`, `game/js/ids.test.js`, `game/js/simulate-steps.test.js`
- Modify: `game/js/simulate.js`

**Interfaces:**
- Produces: `assignId(obj) → obj` (ids.js); from simulate.js: `separateEnemies(enemies, dt, walls)`, `fireTowers(state, dt)`, `fireUnits(state, dt, targetsFor = () => state.towers)`, `stepShots(state, dt, onStructureHit = null)` (calls `onStructureHit(structure, damageDone)` for every hit on a tower or wall block), `clearDestroyed(state)`.

- [ ] **Step 1: Write the failing tests**

`game/js/ids.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { assignId } from "./ids.js";
import { createGameState, placeTower } from "./simulate.js";
import { LEVELS } from "./levels.js";

test("everything in a game gets its id from one counter, whichever module makes it", () => {
  const before = assignId({});
  const s = createGameState(1);
  const slot = LEVELS[1].buildSlots[0];
  const { towerId } = placeTower(s, "basic", slot.x, slot.y);
  const after = assignId({});
  assert.ok(before.id < towerId && towerId < after.id);
});

test("assignId stamps the object and hands it back", () => {
  const obj = {};
  assert.equal(assignId(obj), obj);
  assert.equal(typeof obj.id, "number");
});
```

`game/js/simulate-steps.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { createGameState, stepShots, fireUnits } from "./simulate.js";
import { createTower } from "./tower.js";
import { createProjectile } from "./projectile.js";
import { createEnemy } from "./enemy.js";

test("a shot landing on a tower or a wall block reports the damage it actually did", () => {
  const s = createGameState(1);
  const tower = Object.assign(createTower("basic", 100, 100), { id: 9001, hp: 4 });
  const wall = { id: 9002, kind: "wall", x: 300, y: 300, hp: 150, maxHp: 150 };
  s.towers.push(tower);
  s.walls.push(wall);
  s.projectiles.push(createProjectile(100, 100, tower, 10, 400), createProjectile(300, 300, wall, 10, 400));
  const hits = [];
  stepShots(s, 0.1, (target, damage) => hits.push([target.id, damage]));
  assert.deepEqual(hits, [
    [9001, 4],
    [9002, 10],
  ]);
  assert.equal(tower.hp, 0);
  assert.equal(wall.hp, 140);
});

test("units fire only at what targetsFor allows them", () => {
  const s = createGameState(1);
  // Left to itself the tank would pick `weak` (the weakest tower in range).
  const weak = Object.assign(createTower("basic", 130, 100), { id: 9101, hp: 10, buildTimeRemaining: 0 });
  const other = Object.assign(createTower("basic", 100, 160), { id: 9102, buildTimeRemaining: 0 });
  s.towers.push(weak, other);
  const tank = createEnemy("tank", [{ x: 100, y: 100 }]);
  tank.fireTimer = 0;
  s.enemies.push(tank);
  fireUnits(s, 0.1, () => [other]);
  assert.equal(s.projectiles.length, 1);
  assert.equal(s.projectiles[0].target, other);
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `node --test js/ids.test.js js/simulate-steps.test.js` (from `game/`)
Expected: FAIL — `Cannot find module .../js/ids.js`, and `stepShots`/`fireUnits` not exported by simulate.js.

- [ ] **Step 3: Write `game/js/ids.js`**

```js
// Every object in a game -- towers, wall blocks, units, shots,
// explosions -- gets its id from this one counter, shared by the defence
// game (simulate.js) and the attack mode (attack.js), so no two things in
// a game ever share an id (orders and selections pick units and towers by
// id).
let nextId = 1;

export function assignId(obj) {
  obj.id = nextId++;
  return obj;
}
```

- [ ] **Step 4: Split the end of `stepSimulation` into exported steps**

In `game/js/simulate.js`:

1. After `import { WALL, wallCell, segmentNearBlock } from "./walls.js";` add:

```js
import { assignId } from "./ids.js";
```

2. Delete the counter that now lives in ids.js:

```js
let nextId = 1;
function assignId(obj) {
  obj.id = nextId++;
  return obj;
}
```

3. `function separateEnemies(enemies, dt, walls) {` becomes `export function separateEnemies(enemies, dt, walls) {`.

4. In `stepSimulation`, replace everything from the towers' firing loop (`  for (const t of state.towers) {` / `    const shot = stepTower(t, state.enemies, dt);`) down to the function's end (`  nextWaveIfDone(state);` / `}`) with:

```js
  fireTowers(state, dt);
  fireUnits(state, dt);
  stepShots(state, dt);
  clearDestroyed(state);

  nextWaveIfDone(state);
}

// The rest of a tick, in pieces the attack mode (attack.js) runs too.

// The towers' turn: each one aims at a unit in its range and fires.
export function fireTowers(state, dt) {
  for (const t of state.towers) {
    const shot = stepTower(t, state.enemies, dt);
    if (shot) {
      // Rounds leave from the tip of the turret's barrel, not its center.
      const muzzleX = t.x + Math.cos(t.angle) * MUZZLE_OFFSET;
      const muzzleY = t.y + Math.sin(t.angle) * MUZZLE_OFFSET;

      if (t.type === "laser") {
        // A railgun beam travels instantly from the muzzle to the target
        damageEnemy(shot.target, shot.damage);
        state.beams.push(assignId({ x1: muzzleX, y1: muzzleY, x2: shot.target.x, y2: shot.target.y, age: 0, duration: 0.15 }));
      } else {
        for (let i = 0; i < shot.projectilesPerShot; i++) {
          // Offset each shot perpendicular to the barrel for double cannons
          const spread = shot.projectilesPerShot > 1 ? (i - (shot.projectilesPerShot - 1) / 2) * 12 : 0;
          const px = muzzleX - Math.sin(t.angle) * spread;
          const py = muzzleY + Math.cos(t.angle) * spread;
          state.projectiles.push(assignId(createProjectile(px, py, shot.target, shot.damage, 420, "shell", "cannon")));
        }
      }
    }
  }
}

// The units' turn: each one fires at the best target in its range among
// targetsFor(unit) -- every tower, unless the attack mode narrows it to the
// one a unit was sent against -- or first at a wall block holding it up.
export function fireUnits(state, dt, targetsFor = () => state.towers) {
  for (const e of state.enemies) {
    const shot = stepEnemyFire(e, targetsFor(e), dt, state.walls);
    if (shot) {
      // Tank/rocket fire the same tank-shell sprite as the player's cannon
      // towers (per user request); the lighter infantry/vehicle weapons
      // (soldier, buggy, motorcycle) keep the small tracer streak. Sound is
      // its own three-way split per user request (machinegun for the light
      // units, cannon for the tank, missile for the rocket launcher) --
      // rocket shares the tank's "shell" visual but not its sound.
      const style = e.type === "tank" || e.type === "rocket" ? "shell" : "tracer";
      const sound = e.type === "tank" ? "cannon" : e.type === "rocket" ? "missile" : "machinegun";
      state.projectiles.push(assignId(createProjectile(shot.x, shot.y, shot.target, shot.damage, 300, style, sound)));
    }
  }
}

// Shots in flight move on and land; explosions and laser beams fade.
// onStructureHit(structure, damage), if given, hears of every hit on a
// tower or wall block and how much health it actually took off (the
// attack mode pays the attacker a share of it).
export function stepShots(state, dt, onStructureHit = null) {
  for (const p of state.projectiles) {
    if (!stepProjectile(p, dt)) continue;
    const before = p.target.hp;
    if (p.target.kind === "wall") {
      p.target.hp = Math.max(0, p.target.hp - p.damage);
    } else if ("maxHp" in p.target && "range" in p.target) {
      damageTower(p.target, p.damage);
    } else {
      damageEnemy(p.target, p.damage);
      continue;
    }
    if (onStructureHit) onStructureHit(p.target, before - p.target.hp);
  }
  state.projectiles = state.projectiles.filter((p) => p.alive);
  for (const ex of state.explosions) ex.age += dt;
  state.explosions = state.explosions.filter((ex) => ex.age < ex.duration);
  for (const bm of state.beams) bm.age += dt;
  state.beams = state.beams.filter((bm) => bm.age < bm.duration);
}

// What was destroyed this tick leaves the field: towers (counted as lost)
// and wall blocks go up in explosions, and each unit killed pays its
// bounty to the defence.
export function clearDestroyed(state) {
  // Counted here, before the filter removes them, so a tower that died in
  // combat this tick is tallied -- sellStructure() removes towers by its own
  // reference filter instead, so a voluntary sale never lands here.
  for (const t of state.towers) {
    if (t.hp > 0) continue;
    state.stats.towersLost++;
    state.explosions.push(assignId(createExplosion(t.x, t.y, "tower")));
  }
  state.towers = state.towers.filter((t) => t.hp > 0);
  for (const w of state.walls) if (w.hp <= 0) state.explosions.push(assignId(createExplosion(w.x, w.y, "wall")));
  state.walls = state.walls.filter((w) => w.hp > 0);

  const killedEnemies = state.enemies.filter((e) => !e.alive);
  for (const e of killedEnemies) {
    earn(state.economy, e.bounty);
    state.stats.kills[e.type] = (state.stats.kills[e.type] || 0) + 1;
    state.explosions.push(assignId(createExplosion(e.x, e.y, e.type, e.angle)));
  }
  state.enemies = state.enemies.filter((e) => e.alive);
}
```

- [ ] **Step 5: Run the whole suite**

Run: `node --test` (from `game/`)
Expected: PASS — the 4 new tests and every existing one (the split is a pure refactor of the defence tick).

- [ ] **Step 6: Commit**

```bash
git add game/js/ids.js game/js/ids.test.js game/js/simulate-steps.test.js game/js/simulate.js
git commit -m "One id counter for the whole game; the defence tick split into steps the attack mode can reuse"
```

---

### Task 2: The road network of every map, with new streets on maps 3 and 4

**Files:**
- Create: `game/js/roadGraph.js`, `game/js/roadGraph.test.js`
- Modify: `game/js/levels.js` (a `streets` list on levels 3 and 4)

**Interfaces:**
- Consumes: `distToSegment(x, y, x1, y1, x2, y2)` (map.js); `LEVELS[n].paths`, `.worldWidth`, `.worldHeight`, and the new `.streets` (levels.js).
- Produces (roadGraph.js):
  - `EDGE_INSET` (20)
  - `buildRoadGraph(polylines) → { nodes: [{x,y}], edges: [{a, b, len}], adj: [[{to, edge}]] }`
  - `nearestRoadPoint(graph, x, y) → { x, y, edge, t, dist }`
  - `roadRoute(graph, from, to) → [{x,y}, ...]` (starts at `from`, ends at the road point nearest `to`)
  - `routeLength(points)`, `pointAlong(points, s) → { x, y, ux, uy }`, `routePrefix(points, s) → points`
  - `spreadStops(graph, spot, units, gap = 6) → [{ x, y, route }]` for `units: [{ x, y, len, wid }]`
  - `attackMapOf(level) → { graph, entries: [{ x, y, route }], base: { x, y }, routes }` (memoized per level object)

- [ ] **Step 1: Write the failing tests**

`game/js/roadGraph.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildRoadGraph,
  nearestRoadPoint,
  roadRoute,
  routeLength,
  pointAlong,
  routePrefix,
  spreadStops,
  attackMapOf,
  EDGE_INSET,
} from "./roadGraph.js";
import { LEVELS, MAX_LEVEL } from "./levels.js";

const P = (pairs) => pairs.map(([x, y]) => ({ x, y }));
const near = (a, b, tol = 1) => Math.hypot(a.x - b.x, a.y - b.y) <= tol;

test("two roads that cross get a junction where they cross", () => {
  const g = buildRoadGraph([P([[0, 50], [100, 50]]), P([[50, 0], [50, 100]])]);
  const j = g.nodes.findIndex((n) => near(n, { x: 50, y: 50 }));
  assert.ok(j >= 0);
  assert.equal(g.adj[j].length, 4);
  const route = roadRoute(g, { x: 0, y: 50 }, { x: 50, y: 0 });
  assert.ok(route.some((p) => near(p, { x: 50, y: 50 })));
  assert.equal(Math.round(routeLength(route)), 100);
});

test("a street ending on a road joins it there", () => {
  const g = buildRoadGraph([P([[0, 0], [200, 0]]), P([[100, 150], [100, 5]])]);
  const route = roadRoute(g, { x: 0, y: 0 }, { x: 100, y: 150 });
  assert.ok(route.some((p) => near(p, { x: 100, y: 5 })));
  assert.ok(Math.abs(routeLength(route) - 245) < 1.5);
});

test("points of different roads this close together are one junction", () => {
  const g = buildRoadGraph([P([[0, 0], [100, 0]]), P([[108, 6], [200, 6]])]);
  assert.equal(g.nodes.length, 3);
  assert.ok(routeLength(roadRoute(g, { x: 0, y: 0 }, { x: 200, y: 6 })) < 205);
});

test("the road point nearest a click is where it projects onto the closest road", () => {
  const g = buildRoadGraph([P([[0, 0], [100, 0]]), P([[0, 100], [100, 100]])]);
  const p = nearestRoadPoint(g, 40, 30);
  assert.ok(near(p, { x: 40, y: 0 }));
  assert.equal(Math.round(p.dist), 30);
});

test("the way somewhere follows the roads, not a straight line", () => {
  const g = buildRoadGraph([P([[0, 0], [100, 0], [100, 100]])]);
  const route = roadRoute(g, { x: 0, y: 0 }, { x: 100, y: 100 });
  assert.deepEqual(
    route.map((p) => [Math.round(p.x), Math.round(p.y)]),
    [
      [0, 0],
      [100, 0],
      [100, 100],
    ],
  );
});

test("pointAlong and routePrefix walk a route by distance", () => {
  const r = P([[0, 0], [100, 0], [100, 100]]);
  assert.deepEqual(pointAlong(r, 150), { x: 100, y: 50, ux: 0, uy: 1 });
  assert.deepEqual(pointAlong(r, 999), { x: 100, y: 100, ux: 0, uy: 1 });
  assert.deepEqual(routePrefix(r, 150), P([[0, 0], [100, 0], [100, 50]]));
});

test("a group sent to one spot lines up along the road, alternating sides, without overlapping", () => {
  const g = buildRoadGraph([P([[0, 0], [1000, 0]])]);
  const units = [0, 1, 2, 3, 4, 5].map((k) => ({ x: 600 + k * 30, y: 0, len: 18, wid: 22 }));
  const stops = spreadStops(g, { x: 200, y: 40 }, units);
  // They come from the right, so they line up from the spot rightwards.
  for (const s of stops) assert.ok(s.x >= 199 && s.x < 400, `stop at x=${s.x}`);
  const sides = stops.map((s) => Math.sign(s.y));
  assert.deepEqual(sides.slice(0, 4), [sides[0], -sides[0], sides[0], -sides[0]]);
  for (let i = 0; i < stops.length; i++) {
    for (let j = i + 1; j < stops.length; j++) {
      const a = stops[i];
      const b = stops[j];
      assert.ok(Math.abs(a.x - b.x) >= 18 || Math.abs(a.y - b.y) >= 22, `stops ${i} and ${j} overlap`);
    }
  }
  for (const s of stops) assert.ok(near(s.route.at(-1), s));
});

test("every level's road network is all one piece, and the base can be reached from every entry", () => {
  for (let level = 1; level <= MAX_LEVEL; level++) {
    const { graph, entries, base } = attackMapOf(LEVELS[level]);
    const seen = new Set([0]);
    const todo = [0];
    while (todo.length) {
      for (const { to } of graph.adj[todo.pop()]) {
        if (!seen.has(to)) {
          seen.add(to);
          todo.push(to);
        }
      }
    }
    assert.equal(seen.size, graph.nodes.length, `level ${level}: the network is in pieces`);
    for (const e of entries) assert.ok(near(roadRoute(graph, e, base).at(-1), base), `level ${level}: no way from an entry to the base`);
  }
});

test("each road comes in at an entry just inside the map, and the base is inside it too (level 1's road runs off the edge)", () => {
  for (let level = 1; level <= MAX_LEVEL; level++) {
    const L = LEVELS[level];
    const { entries, base } = attackMapOf(L);
    assert.equal(entries.length, L.paths.length);
    for (const p of [...entries, base]) {
      assert.ok(p.x >= EDGE_INSET - 1 && p.y >= EDGE_INSET - 1, `level ${level}: (${p.x},${p.y}) outside`);
      assert.ok(p.x <= L.worldWidth - EDGE_INSET + 1 && p.y <= L.worldHeight - EDGE_INSET + 1, `level ${level}: (${p.x},${p.y}) outside`);
    }
  }
  assert.ok(near(attackMapOf(LEVELS[1]).base, { x: LEVELS[1].worldWidth - EDGE_INSET, y: 143 }, 3));
  assert.deepEqual(attackMapOf(LEVELS[3]).base, LEVELS[3].soldierExit);
});

test("the new streets of levels 3 and 4 are part of their networks", () => {
  for (const level of [3, 4]) {
    const { graph } = attackMapOf(LEVELS[level]);
    assert.ok(LEVELS[level].streets.length >= 3);
    for (const street of LEVELS[level].streets) {
      for (const p of street) assert.ok(nearestRoadPoint(graph, p.x, p.y).dist < 2, `level ${level}: (${p.x},${p.y}) off the network`);
    }
  }
  // Level 3: the east street crosses the north-east highway.
  const g3 = attackMapOf(LEVELS[3]).graph;
  const crossing = g3.nodes.findIndex((n) => near(n, { x: 1810, y: 243 }, 3));
  assert.ok(crossing >= 0 && g3.adj[crossing].length === 4);
  // Level 4: the diagonal avenue is a way from the north street to the south avenue.
  const g4 = attackMapOf(LEVELS[4]).graph;
  assert.ok(routeLength(roadRoute(g4, { x: 850, y: 1190 }, { x: 505, y: 1790 })) < 760);
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `node --test js/roadGraph.test.js`
Expected: FAIL — `Cannot find module .../js/roadGraph.js`.

- [ ] **Step 3: Write `game/js/roadGraph.js`**

```js
// The road network of a map, for the attack mode (docs/2026-10-09-modo-
// atacante-design.md): the army only ever drives along roads and streets,
// so every order turns into a route along them. The network is the
// level's roads (levels.js's paths, the ones the defence game's enemies
// take) and its extra streets, joined wherever they meet or cross.
// DOM-free, like the simulation.
import { distToSegment } from "./map.js";

// Points of different roads closer than this are one junction.
const MERGE_DIST = 16;
// A road's point this close to another road's stretch joins it there --
// a street ending on an avenue.
const SNAP_DIST = 12;
// How far inside the map's edge the roads are cut off: the army comes in
// there (the defence game's enemies start off the map), and on level 1
// the base is there (its trench runs off the right-hand edge).
export const EDGE_INSET = 20;

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// Where along segment a-b (0 at a, 1 at b) point p's nearest point is.
function along(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  return len2 === 0 ? 0 : ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
}

// Where segments a-b and c-d cross, strictly inside both (t along a-b, u
// along c-d), or null.
function crossing(a, b, c, d) {
  const rx = b.x - a.x;
  const ry = b.y - a.y;
  const sx = d.x - c.x;
  const sy = d.y - c.y;
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-9) return null;
  const qx = c.x - a.x;
  const qy = c.y - a.y;
  const t = (qx * sy - qy * sx) / den;
  const u = (qx * ry - qy * rx) / den;
  const eps = 1e-6;
  if (t <= eps || t >= 1 - eps || u <= eps || u >= 1 - eps) return null;
  return { x: a.x + rx * t, y: a.y + ry * t, t, u };
}

// The stretch a-b cut at some junctions ([t, node] each): a -> ... -> b.
function chain(a, b, cuts) {
  const out = [];
  let prev = a;
  for (const [, n] of [...cuts].sort((p, q) => p[0] - q[0])) {
    if (n !== prev) out.push([prev, n]);
    prev = n;
  }
  if (prev !== b) out.push([prev, b]);
  return out;
}

// The network of some roads (each a list of points): its junctions
// (nodes), the stretches of road between them (edges, with their length)
// and, for each node, the edges leaving it.
export function buildRoadGraph(polylines) {
  const nodes = [];
  const nodeAt = (p) => {
    let best = -1;
    let bestD = MERGE_DIST;
    nodes.forEach((n, i) => {
      const d = dist(n, p);
      if (d < bestD) {
        best = i;
        bestD = d;
      }
    });
    if (best >= 0) return best;
    nodes.push({ x: p.x, y: p.y });
    return nodes.length - 1;
  };

  let pairs = [];
  for (const line of polylines) {
    let prev = null;
    for (const p of line) {
      const n = nodeAt(p);
      if (prev !== null && prev !== n) pairs.push([prev, n]);
      prev = n;
    }
  }
  // A point of one road lying on another road's stretch joins it there.
  pairs = pairs.flatMap(([a, b]) => {
    const cuts = [];
    nodes.forEach((n, i) => {
      if (i === a || i === b) return;
      const t = along(n, nodes[a], nodes[b]);
      if (t > 0 && t < 1 && distToSegment(n.x, n.y, nodes[a].x, nodes[a].y, nodes[b].x, nodes[b].y) < SNAP_DIST) cuts.push([t, i]);
    });
    return chain(a, b, cuts);
  });
  // Two stretches crossing each other get a junction where they cross.
  const cuts = pairs.map(() => []);
  for (let i = 0; i < pairs.length; i++) {
    for (let j = i + 1; j < pairs.length; j++) {
      const [a, b] = pairs[i];
      const [c, d] = pairs[j];
      if (a === c || a === d || b === c || b === d) continue;
      const hit = crossing(nodes[a], nodes[b], nodes[c], nodes[d]);
      if (!hit) continue;
      const n = nodeAt(hit);
      cuts[i].push([hit.t, n]);
      cuts[j].push([hit.u, n]);
    }
  }
  pairs = pairs.flatMap(([a, b], i) => chain(a, b, cuts[i]));

  // Roads sharing a stretch give it once.
  const edges = [];
  const adj = nodes.map(() => []);
  const seen = new Set();
  for (const [a, b] of pairs) {
    const key = a < b ? `${a}-${b}` : `${b}-${a}`;
    if (a === b || seen.has(key)) continue;
    seen.add(key);
    adj[a].push({ to: b, edge: edges.length });
    adj[b].push({ to: a, edge: edges.length });
    edges.push({ a, b, len: dist(nodes[a], nodes[b]) });
  }
  return { nodes, edges, adj };
}

// The point of the network nearest (x, y): on edge `edge`, a fraction `t`
// of the way from its node a to its node b, `dist` px away.
export function nearestRoadPoint(graph, x, y) {
  let best = null;
  graph.edges.forEach((e, i) => {
    const A = graph.nodes[e.a];
    const B = graph.nodes[e.b];
    const t = Math.max(0, Math.min(1, along({ x, y }, A, B)));
    const px = A.x + (B.x - A.x) * t;
    const py = A.y + (B.y - A.y) * t;
    const d = Math.hypot(px - x, py - y);
    if (!best || d < best.dist) best = { x: px, y: py, edge: i, t, dist: d };
  });
  return best;
}

// Shortest distances along the network (Dijkstra) from some starting
// nodes, each [node, distance already covered to reach it].
function shortest(graph, starts) {
  const n = graph.nodes.length;
  const best = new Array(n).fill(Infinity);
  const prev = new Array(n).fill(-1);
  const heap = []; // [distance, node], smallest first
  const push = (d, node) => {
    heap.push([d, node]);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heap[p][0] <= heap[i][0]) break;
      [heap[p], heap[i]] = [heap[i], heap[p]];
      i = p;
    }
  };
  const pop = () => {
    const top = heap[0];
    const last = heap.pop();
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i], heap[m]];
        i = m;
      }
    }
    return top;
  };
  for (const [node, d] of starts) {
    if (d < best[node]) {
      best[node] = d;
      push(d, node);
    }
  }
  while (heap.length) {
    const [d, u] = pop();
    if (d > best[u]) continue;
    for (const { to, edge } of graph.adj[u]) {
      const nd = d + graph.edges[edge].len;
      if (nd < best[to]) {
        best[to] = nd;
        prev[to] = u;
        push(nd, to);
      }
    }
  }
  return { best, prev };
}

// The way from `from` to `to` by road: from where `from` stands onto the
// nearest road, along the network's shortest route, to the road point
// nearest `to`. A list of points, starting at `from`.
export function roadRoute(graph, from, to) {
  const s = nearestRoadPoint(graph, from.x, from.y);
  const e = nearestRoadPoint(graph, to.x, to.y);
  const pts = [{ x: from.x, y: from.y }, { x: s.x, y: s.y }];
  if (s.edge !== e.edge) {
    const E = graph.edges[s.edge];
    const F = graph.edges[e.edge];
    const { best, prev } = shortest(graph, [
      [E.a, s.t * E.len],
      [E.b, (1 - s.t) * E.len],
    ]);
    let node = best[F.a] + e.t * F.len <= best[F.b] + (1 - e.t) * F.len ? F.a : F.b;
    const via = [];
    for (; node !== -1; node = prev[node]) via.push(graph.nodes[node]);
    pts.push(...via.reverse());
  }
  pts.push({ x: e.x, y: e.y });
  const out = [];
  for (const p of pts) {
    const last = out[out.length - 1];
    if (!last || dist(p, last) > 0.5) out.push({ x: p.x, y: p.y });
  }
  return out;
}

export function routeLength(points) {
  let len = 0;
  for (let i = 1; i < points.length; i++) len += dist(points[i - 1], points[i]);
  return len;
}

// The point `s` px along a route (held at its ends), and the route's
// direction there (unit vector ux, uy).
export function pointAlong(points, s) {
  let ux = 1;
  let uy = 0;
  let left = Math.max(0, s);
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const len = dist(a, b);
    if (len === 0) continue;
    ux = (b.x - a.x) / len;
    uy = (b.y - a.y) / len;
    if (left <= len) return { x: a.x + ux * left, y: a.y + uy * left, ux, uy };
    left -= len;
  }
  const end = points[points.length - 1];
  return { x: end.x, y: end.y, ux, uy };
}

// A route's first `s` px.
export function routePrefix(points, s) {
  const out = [{ x: points[0].x, y: points[0].y }];
  let left = s;
  for (let i = 1; i < points.length && left > 0; i++) {
    const a = points[i - 1];
    const b = points[i];
    const len = dist(a, b);
    if (len >= left) {
      out.push({ x: a.x + ((b.x - a.x) * left) / len, y: a.y + ((b.y - a.y) * left) / len });
      break;
    }
    out.push({ x: b.x, y: b.y });
    left -= len;
  }
  return out;
}

// Where each of a group sent to one spot stops: on the road, one behind
// another along the way they come in and alternating sides of it, rather
// than all piling onto the spot (the design's «se reparten a lo largo de
// la calle»). units: [{ x, y, len, wid }] (len, wid: each one's size).
// Returns, in the same order, { x, y, route }: the stop and the way there.
export function spreadStops(graph, spot, units, gap = 6) {
  const target = nearestRoadPoint(graph, spot.x, spot.y);
  // Units coming in along the same road line up together: grouped by the
  // direction they come from, as seen from the spot.
  const groups = new Map();
  units.forEach((u, i) => {
    const back = roadRoute(graph, u, target).reverse();
    const length = routeLength(back);
    let key = "here";
    if (length >= 1) {
      const p = pointAlong(back, Math.min(30, length));
      key = (((Math.round(Math.atan2(p.y - target.y, p.x - target.x) / (Math.PI / 4)) % 8) + 8) % 8).toString();
    }
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ i, back, length });
  });
  const stops = new Array(units.length);
  for (const [key, members] of groups) {
    if (key === "here") {
      for (const { i } of members) stops[i] = { x: units[i].x, y: units[i].y, route: [{ x: units[i].x, y: units[i].y }] };
      continue;
    }
    // The nearest go to the front; the line runs back along the longest
    // way in, so everyone fits on it.
    members.sort((a, b) => a.length - b.length);
    const line = members[members.length - 1].back;
    const offset = Math.max(...members.map(({ i }) => units[i].wid)) / 2 + 1;
    const taken = { 1: [], [-1]: [] }; // per side: stretches of the line in use
    let side = 1;
    for (const { i } of members) {
      const len = units[i].len + gap;
      let best = null;
      for (const s of [side, -side]) {
        let at = len / 2;
        for (const [a, b] of [...taken[s]].sort((p, q) => p[0] - q[0])) if (at + len / 2 > a && at - len / 2 < b) at = b + len / 2;
        if (!best || at < best.at) best = { s, at };
      }
      taken[best.s].push([best.at - len / 2, best.at + len / 2]);
      side = -best.s;
      const p = pointAlong(line, best.at);
      const stop = { x: p.x - p.uy * offset * best.s, y: p.y + p.ux * offset * best.s };
      const route = roadRoute(graph, units[i], stop);
      if (dist(route[route.length - 1], stop) > 0.5) route.push(stop);
      stops[i] = { x: stop.x, y: stop.y, route };
    }
  }
  return stops;
}

// The stretch of a path inside the map (`inside`): from where it comes in
// to where it leaves, or its end.
function clipped(path, inside) {
  const out = [];
  for (let i = 0; i < path.length; i++) {
    const p = path[i];
    if (inside(p)) {
      if (!out.length && i > 0) out.push(edgePoint(path[i - 1], p, inside));
      out.push({ x: p.x, y: p.y });
    } else if (out.length) {
      out.push(edgePoint(p, path[i - 1], inside));
      break;
    }
  }
  return out;
}

// Where the segment from `outP` (outside) to `inP` (inside) comes in.
function edgePoint(outP, inP, inside) {
  let a = outP;
  let b = inP;
  for (let k = 0; k < 30; k++) {
    const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    if (inside(m)) b = m;
    else a = m;
  }
  return { x: Math.round(b.x), y: Math.round(b.y) };
}

// The attack mode's view of a level: the road network (its roads, cut off
// EDGE_INSET inside the map, and its streets), the entries (where each
// road comes into the map; the army appears there, `route` being that
// road from there on) and the base (where the roads end). Worked out once
// per level.
const maps = new WeakMap();
export function attackMapOf(level) {
  if (maps.has(level)) return maps.get(level);
  const inside = (p) =>
    p.x >= EDGE_INSET && p.y >= EDGE_INSET && p.x <= level.worldWidth - EDGE_INSET && p.y <= level.worldHeight - EDGE_INSET;
  const routes = level.paths.map((path) => clipped(path, inside)).filter((r) => r.length >= 2);
  const graph = buildRoadGraph([...routes, ...(level.streets || [])]);
  const entries = [];
  for (const route of routes) {
    if (!entries.some((e) => dist(e, route[0]) < 30)) entries.push({ x: route[0].x, y: route[0].y, route });
  }
  const end = routes[0][routes[0].length - 1];
  const map = { graph, entries, base: { x: end.x, y: end.y }, routes };
  maps.set(level, map);
  return map;
}
```

- [ ] **Step 4: Add the streets to `game/js/levels.js`**

Right before `export const MAX_LEVEL = 4;` add:

```js
// Streets that show on the map but that the defence game's enemies never
// use. In attack mode (docs/2026-10-09-modo-atacante-design.md) the army
// can drive along them too: roadGraph.js joins them to the roads where
// they meet or cross. Traced over the map images.
const LEVEL3_STREETS = [
  // The avenue across the top of the town, from the north road's corner
  // to the north-east highway.
  P([[498, 196], [700, 195], [900, 195], [1100, 195], [1300, 195], [1500, 195], [1700, 195], [1849, 195]]),
  // The long street down the east side, from that avenue to the
  // south-east highway (crossing the north-east one on the way).
  P([[1810, 195], [1810, 400], [1810, 600], [1810, 800], [1810, 1000], [1808, 1200], [1808, 1400], [1808, 1600], [1810, 1795]]),
  // The dirt road east of the fortress, from the north-east approach
  // down to the south road.
  P([[785, 1280], [830, 1380], [850, 1500], [850, 1700], [852, 1850], [860, 1935]]),
  // The lane north of the fortress, from the west road to the north road.
  P([[67, 1150], [150, 1165], [250, 1162], [350, 1160], [468, 1161]]),
];

const LEVEL4_STREETS = [
  // The loop round the south of the building site, from the south avenue
  // up to the HQ's door.
  P([[500, 1630], [476, 1632], [420, 1630], [350, 1624], [290, 1612], [276, 1585], [290, 1550], [306, 1520], [322, 1492]]),
  // The north street's eastern half, on past the corner where the road to
  // the HQ turns south.
  P([[568, 1158], [650, 1160], [750, 1172], [850, 1190]]),
  // The diagonal avenue from there down to the south avenue.
  P([[850, 1190], [842, 1260], [808, 1340], [753, 1420], [699, 1500], [644, 1580], [589, 1660], [562, 1700], [538, 1750], [505, 1790]]),
];
```

and in `LEVELS`, give level 3 `streets: LEVEL3_STREETS,` (after its `wall: LEVEL3_WALL,`) and level 4 `streets: LEVEL4_STREETS,` (after its `foreground: LEVEL4_FOREGROUND,`).

- [ ] **Step 5: Run the whole suite**

Run: `node --test`
Expected: PASS — the 10 road network tests and every existing one.

- [ ] **Step 6: Commit**

```bash
git add game/js/roadGraph.js game/js/roadGraph.test.js game/js/levels.js
git commit -m "Road network of every map for the attack mode, with new streets on maps 3 and 4"
```

---

### Task 3: The computer's defence

**Files:**
- Create: `game/js/defenseAI.js`, `game/js/defenseAI.test.js`

**Interfaces:**
- Consumes: from simulate.js `canPlaceTower`, `placeTower`, `upgradeTower`, `repairStructure`, `repairCost`, `canPlaceWall`, `placeWall`, `WALL`; `TOWER_TYPES` (tower.js); `upgradeCost`, `canUpgrade` (upgrades.js); `towerDps` (ai.js); `attackMapOf`, `pointAlong`, `routeLength` (Task 2). The army is `state.enemies` (each with `x, y, alive, path, waypointIndex`).
- Produces: `DIFFICULTIES` (`{ easy|normal|hard: { startMoney, perRound, walls, choice, army } }`), `AI_PERIOD` (8 s), `aiStep(state, difficulty, { rand } = {}) → log`, `aiPrepare(state, difficulty, opts) → log` — log entries are simulate.js's results with an `action` ("repair" | "build" | "upgrade" | "wall").

- [ ] **Step 1: Write the failing tests**

`game/js/defenseAI.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { aiStep, aiPrepare, DIFFICULTIES, AI_PERIOD } from "./defenseAI.js";
import { createGameState } from "./simulate.js";
import { createEnemy } from "./enemy.js";
import { LEVELS } from "./levels.js";
import { attackMapOf } from "./roadGraph.js";

const best = () => 0; // always takes the best option

function defence(level, money) {
  const s = createGameState(level);
  s.economy.money = money;
  return s;
}

// Units standing still around (x, y), as the attacker's army would.
function army(s, x, y, n) {
  for (let i = 0; i < n; i++) s.enemies.push(createEnemy("soldier", [{ x: x + (i % 4) * 15, y: y + Math.floor(i / 4) * 15 }]));
}

test("the difficulties' money: $250 + $60, $350 + $90, $450 + $120 a round; walls only on Difficult", () => {
  const { easy, normal, hard } = DIFFICULTIES;
  assert.deepEqual([easy.startMoney, easy.perRound, easy.walls], [250, 60, false]);
  assert.deepEqual([normal.startMoney, normal.perRound, normal.walls], [350, 90, false]);
  assert.deepEqual([hard.startMoney, hard.perRound, hard.walls], [450, 120, true]);
  assert.ok(AI_PERIOD > 0);
});

test("in preparation the defence builds its first towers on build slots by the roads, with all its money, ready to fire", () => {
  for (const level of [1, 2, 3, 4]) {
    const s = defence(level, DIFFICULTIES.normal.startMoney);
    const log = aiPrepare(s, "normal", { rand: best });
    assert.ok(s.towers.length >= 3, `level ${level}: ${s.towers.length} towers`);
    assert.ok(log.length && log.every((r) => r.ok), `level ${level}: ${JSON.stringify(log.filter((r) => !r.ok))}`);
    for (const t of s.towers) {
      assert.ok(LEVELS[level].buildSlots.some((sl) => sl.x === t.x && sl.y === t.y));
      assert.equal(t.buildTimeRemaining, 0);
    }
    assert.ok(s.economy.money < 50, `level ${level}: $${s.economy.money} left`);
  }
});

test("each decision repairs badly damaged towers first", () => {
  const s = defence(2, 400);
  aiPrepare(s, "normal", { rand: best });
  const t = s.towers[0];
  t.hp = Math.floor(t.maxHp * 0.3);
  s.economy.money = 300;
  const log = aiStep(s, "normal", { rand: best });
  assert.equal(log[0].action, "repair");
  assert.equal(log[0].ok, true);
  assert.equal(t.hp, t.maxHp);
});

test("it builds where the attacker's army is", () => {
  // Level 2's two roads meet before the base: an army on one of them draws
  // the new tower to that side.
  const chosen = (spot) => {
    const s = defence(2, 90);
    army(s, spot.x, spot.y, 12);
    aiStep(s, "hard", { rand: best });
    assert.equal(s.towers.length, 1);
    return s.towers[0];
  };
  const left = { x: 609, y: 221 };
  const right = { x: 1020, y: 257 };
  const d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const forLeft = chosen(left);
  const forRight = chosen(right);
  assert.ok(d(forLeft, left) < d(forLeft, right), `tower at (${forLeft.x},${forLeft.y})`);
  assert.ok(d(forRight, right) < d(forRight, left), `tower at (${forRight.x},${forRight.y})`);
});

test("on Difficult it walls the road ahead of the army's leading unit; on Easy it never builds walls", () => {
  const run = (difficulty) => {
    const s = defence(2, 300);
    s.enemies.push(createEnemy("tank", attackMapOf(LEVELS[2]).routes[0]));
    return { s, log: aiStep(s, difficulty, { rand: best }) };
  };
  const hard = run("hard");
  assert.ok(hard.s.walls.length >= 1);
  assert.ok(hard.log.every((r) => r.ok));
  const tank = hard.s.enemies[0];
  for (const w of hard.s.walls) {
    const d = Math.hypot(w.x - tank.x, w.y - tank.y);
    assert.ok(d > 100 && d < 340, `a wall ${Math.round(d)}px from the tank`);
  }
  assert.equal(run("easy").s.walls.length, 0);
});

test("over a game's worth of decisions every action it takes is one the game accepts", () => {
  for (const level of [3, 4]) {
    const s = defence(level, DIFFICULTIES.hard.startMoney);
    const log = aiPrepare(s, "hard");
    const { routes } = attackMapOf(LEVELS[level]);
    for (let round = 0; round < 10; round++) {
      s.economy.money += 300;
      s.enemies.push(createEnemy("buggy", routes[round % routes.length]));
      for (const t of s.towers) t.hp = Math.max(1, t.hp - 40);
      log.push(...aiStep(s, "hard"));
    }
    assert.ok(log.length > 10);
    assert.deepEqual(log.filter((r) => !r.ok), []);
  }
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `node --test js/defenseAI.test.js`
Expected: FAIL — `Cannot find module .../js/defenseAI.js`.

- [ ] **Step 3: Write `game/js/defenseAI.js`**

```js
// The computer's defence in attack mode (docs/2026-10-09-modo-atacante-
// design.md §3.8). It plays by the defence game's own rules: everything it
// does goes through the actions a human defender's clicks use
// (simulate.js's placeTower, upgradeTower, repairStructure, placeWall),
// each checked first, so it never tries one they'd turn down and can't do
// anything a player couldn't. It sees its whole ground, as any defender
// does; only the attacker has fog.
import { levelData } from "./levels.js";
import { canPlaceTower, placeTower, upgradeTower, repairStructure, repairCost, canPlaceWall, placeWall, WALL } from "./simulate.js";
import { TOWER_TYPES } from "./tower.js";
import { upgradeCost, canUpgrade } from "./upgrades.js";
import { towerDps } from "./ai.js";
import { attackMapOf, pointAlong, routeLength } from "./roadGraph.js";

// Its money, and how well it chooses: it picks at random among its
// `choice` best options (1: always the best) and weighs the road where the
// army is `army` times as much as an easier defence would.
export const DIFFICULTIES = {
  easy: { startMoney: 250, perRound: 60, walls: false, choice: 3, army: 0.5 },
  normal: { startMoney: 350, perRound: 90, walls: false, choice: 2, army: 1 },
  hard: { startMoney: 450, perRound: 120, walls: true, choice: 1, army: 1.5 },
};

// Seconds between its decisions during a round (it also decides as each
// round starts).
export const AI_PERIOD = 8;

const SAMPLE_STEP = 40; // px between the road points it weighs
const ARMY_RADIUS = 250; // road points this close to a unit, or to where one is heading, are in use
const REPAIR_BELOW = 0.6; // share of its health below which a tower gets repaired
const MAX_ACTIONS = 8; // builds and upgrades per decision
const MIN_WORTH = 3; // road a new tower must cover (in points' worth) to be worth building
const UPGRADE_SKILLS = ["damage", "fireRate", "range", "armor"];
const WALL_AHEAD = [160, 200, 240, 280]; // px ahead of the leading unit where it tries walls
const MAX_WALLS = 12;

// The level's roads as points every SAMPLE_STEP px, each worth 1 per road
// to the base it lies on -- a stretch several roads share is worth more --
// and the extra streets half; and, for each build slot, which points each
// tower type would have in range. Worked out once per level.
const plans = new WeakMap();
function planOf(level) {
  if (plans.has(level)) return plans.get(level);
  const samples = [];
  const add = (line, weight) => {
    const len = routeLength(line);
    for (let s = SAMPLE_STEP / 2; s < len; s += SAMPLE_STEP) {
      const p = pointAlong(line, s);
      samples.push({ x: p.x, y: p.y, weight });
    }
  };
  for (const route of attackMapOf(level).routes) add(route, 1);
  for (const street of level.streets || []) add(street, 0.5);
  const reach = level.buildSlots.map((slot) => {
    const byType = {};
    for (const [type, def] of Object.entries(TOWER_TYPES)) {
      byType[type] = [];
      samples.forEach((p, k) => {
        if (Math.hypot(p.x - slot.x, p.y - slot.y) <= def.range) byType[type].push(k);
      });
    }
    return byType;
  });
  const plan = { samples, reach };
  plans.set(level, plan);
  return plan;
}

// What each road point is worth right now: its own worth, raised where the
// attacker's units are and where they're heading.
function weights(state, samples, diff) {
  const army = [];
  for (const u of state.enemies) {
    if (!u.alive) continue;
    army.push(u);
    if (u.path && u.path.length > 1) army.push(u.path[u.path.length - 1]);
  }
  return samples.map((p) => {
    let near = 0;
    for (const a of army) if (Math.hypot(a.x - p.x, a.y - p.y) < ARMY_RADIUS) near++;
    return p.weight * (1 + (diff.army * near) / 4);
  });
}

// How well each road point is covered already: the firepower of the
// towers that reach it, in basic towers' worth.
function coverage(state, samples) {
  return samples.map((p) => {
    let c = 0;
    for (const t of state.towers) if (t.hp > 0 && Math.hypot(t.x - p.x, t.y - p.y) <= t.range) c += towerDps(t) / 20;
    return c;
  });
}

// New towers it could build, best first: for each type it can afford and
// still add, each free slot's worth -- the road in the type's range, each
// point counting less the better it's covered already -- times the type's
// firepower per dollar.
function buildOptions(state, plan, w) {
  const cover = coverage(state, plan.samples);
  const counts = {};
  for (const t of state.towers) if (t.hp > 0) counts[t.type] = (counts[t.type] || 0) + 1;
  const options = [];
  for (const [type, def] of Object.entries(TOWER_TYPES)) {
    if (def.cost > state.economy.money || (counts[type] || 0) >= def.maxCount) continue;
    const perDollar = (def.damage * def.projectilesPerShot) / def.fireRate / def.cost;
    levelData(state.level).buildSlots.forEach((slot, i) => {
      if (state.towers.some((t) => t.hp > 0 && Math.hypot(t.x - slot.x, t.y - slot.y) < 20)) return;
      let worth = 0;
      for (const k of plan.reach[i][type]) worth += w[k] / (1 + cover[k]);
      if (worth >= MIN_WORTH) options.push({ type, slot, value: worth * perDollar });
    });
  }
  return options.sort((a, b) => b.value - a.value);
}

// Upgrades it could buy now, best first: for the towers that see the most
// of the road (weighted by the army), the most worth per dollar.
function upgradeOptions(state, plan, w) {
  const options = [];
  for (const t of state.towers) {
    if (t.hp <= 0) continue;
    let exposure = 0;
    plan.samples.forEach((p, k) => {
      if (Math.hypot(t.x - p.x, t.y - p.y) <= t.range) exposure += w[k];
    });
    if (exposure <= 0) continue;
    for (const skill of UPGRADE_SKILLS) {
      if (!canUpgrade(t, skill)) continue;
      const cost = upgradeCost(skill, t.level[skill]);
      if (cost <= state.economy.money) options.push({ tower: t, skill, value: exposure / cost });
    }
  }
  return options.sort((a, b) => b.value - a.value);
}

// The first `count` options that pass `valid`.
function firstValid(options, count, valid) {
  const out = [];
  for (const o of options) {
    if (out.length >= count) break;
    if (valid(o)) out.push(o);
  }
  return out;
}

// Difficult only: a wall across the road ahead of the attacking unit
// nearest the base, to hold the army up in the towers' fire -- at the
// first distance ahead where blocks can go.
function wallAhead(state, log) {
  const { base } = attackMapOf(levelData(state.level));
  let lead = null;
  let leadDist = Infinity;
  for (const u of state.enemies) {
    if (!u.alive || !u.path || !u.path[u.waypointIndex + 1]) continue;
    const d = Math.hypot(u.x - base.x, u.y - base.y);
    if (d < leadDist) {
      lead = u;
      leadDist = d;
    }
  }
  if (!lead) return;
  const ahead = [{ x: lead.x, y: lead.y }, ...lead.path.slice(lead.waypointIndex + 1)];
  const length = routeLength(ahead);
  for (const d of WALL_AHEAD) {
    if (d > length - 40) return;
    const p = pointAlong(ahead, d);
    let placed = 0;
    for (const k of [0, 1, -1]) {
      if (state.walls.length >= MAX_WALLS) return;
      const x = p.x - p.uy * k * WALL.size;
      const y = p.y + p.ux * k * WALL.size;
      if (!canPlaceWall(state, x, y).ok) continue;
      log.push({ action: "wall", ...placeWall(state, x, y) });
      placed++;
    }
    if (placed) return;
  }
}

// One decision: repairs, then (on Difficult) a wall in the army's way, then
// new towers where they cover the most road and army, then upgrades for
// the towers that see the most of it -- until it runs out of money or of
// things worth buying. `rand` picks among its best options (tests pass one
// that always takes the best). Returns what it did.
export function aiStep(state, difficulty, { rand = Math.random } = {}) {
  const diff = DIFFICULTIES[difficulty] || DIFFICULTIES.normal;
  const plan = planOf(levelData(state.level));
  const w = weights(state, plan.samples, diff);
  const log = [];
  const exposure = (t) => plan.samples.reduce((sum, p, k) => sum + (Math.hypot(t.x - p.x, t.y - p.y) <= t.range ? w[k] : 0), 0);
  const damaged = state.towers.filter((t) => t.hp > 0 && t.hp < t.maxHp * REPAIR_BELOW).sort((a, b) => exposure(b) - exposure(a));
  for (const t of damaged) {
    const cost = repairCost(t);
    if (cost > 0 && cost <= state.economy.money) log.push({ action: "repair", ...repairStructure(state, t.id) });
  }
  if (diff.walls) wallAhead(state, log);
  for (let n = 0; n < MAX_ACTIONS; n++) {
    const builds = firstValid(buildOptions(state, plan, w), diff.choice, (o) => canPlaceTower(state, o.type, o.slot.x, o.slot.y).ok);
    if (builds.length) {
      const o = builds[Math.floor(rand() * builds.length)];
      log.push({ action: "build", ...placeTower(state, o.type, o.slot.x, o.slot.y) });
      continue;
    }
    const upgrades = upgradeOptions(state, plan, w).slice(0, diff.choice);
    if (upgrades.length) {
      const o = upgrades[Math.floor(rand() * upgrades.length)];
      log.push({ action: "upgrade", ...upgradeTower(state, o.tower.id, o.skill) });
      continue;
    }
    break;
  }
  return log;
}

// The defence's opening: its first towers, bought with its starting money
// where they cover the most road, already built when the attack begins.
export function aiPrepare(state, difficulty, opts) {
  const log = aiStep(state, difficulty, opts);
  for (const t of state.towers) t.buildTimeRemaining = 0;
  return log;
}
```

- [ ] **Step 4: Run the whole suite**

Run: `node --test`
Expected: PASS (6 new tests).

- [ ] **Step 5: Commit**

```bash
git add game/js/defenseAI.js game/js/defenseAI.test.js
git commit -m "The computer's defence for the attack mode: builds, upgrades, repairs and walls by the defence game's rules"
```

---

### Task 4: The attacker's fog of war

**Files:**
- Create: `game/js/fog.js`, `game/js/fog.test.js`

**Interfaces:**
- Produces: `FOG_CELL` (32), `SIGHT` (`{ soldier: 150, motorcycle: 240, buggy: 200, tank: 170, rocket: 160 }`), `ENTRY_SIGHT` (150), `createFog(width, height) → { cols, rows, explored: Uint8Array, visible: Uint8Array, memory: { [key]: snapshot } }`, `updateFog(fog, viewers: [{x, y, r}], structures)`, `isVisible(fog, x, y)`, `isExplored(fog, x, y)`, `structureKey(s)` (`"tower:x,y"` / `"wall:x,y"`), `knownStructure(fog, s)`, `saveFog(fog) → { explored: hexString, memory: [snapshot] }`, `restoreFog(fog, saved)`. A tower snapshot: `{ kind: "tower", type, x, y, hp, maxHp, level, angle, building }`; a wall's: `{ kind: "wall", x, y, hp, maxHp }`.

- [ ] **Step 1: Write the failing tests**

`game/js/fog.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FOG_CELL,
  SIGHT,
  ENTRY_SIGHT,
  createFog,
  updateFog,
  isVisible,
  isExplored,
  structureKey,
  knownStructure,
  saveFog,
  restoreFog,
} from "./fog.js";

const tower = (x, y) => ({ id: 1, type: "basic", x, y, hp: 80, maxHp: 80, angle: 0, level: { damage: 0, range: 0, fireRate: 0, armor: 0, ammo: 0 }, buildTimeRemaining: 0 });
const eyes = (x, y, r = 150) => [{ x, y, r }];

test("the fog's grid and sights are the design's", () => {
  assert.equal(FOG_CELL, 32);
  assert.deepEqual(SIGHT, { soldier: 150, motorcycle: 240, buggy: 200, tank: 170, rocket: 160 });
  assert.equal(ENTRY_SIGHT, 150);
  const fog = createFog(2048, 2048);
  assert.equal(fog.cols * fog.rows, 64 * 64);
});

test("what the units see is explored and in sight while they're near it; once they leave it turns grey", () => {
  const fog = createFog(640, 640);
  updateFog(fog, eyes(100, 100), []);
  assert.ok(isVisible(fog, 100, 100) && isExplored(fog, 100, 100));
  assert.ok(isVisible(fog, 200, 150));
  assert.ok(!isVisible(fog, 400, 400) && !isExplored(fog, 400, 400));
  updateFog(fog, eyes(500, 500, 100), []);
  assert.ok(!isVisible(fog, 100, 100) && isExplored(fog, 100, 100));
  assert.ok(!isVisible(fog, -10, 50) && !isExplored(fog, 9999, 50));
});

test("towers are remembered as they were when last seen", () => {
  const fog = createFog(640, 640);
  const t = tower(112, 112);
  updateFog(fog, eyes(100, 100), [t]);
  assert.equal(fog.memory[structureKey(t)].hp, 80);
  updateFog(fog, [], [t]);
  t.hp = 20;
  t.level.damage = 2;
  updateFog(fog, [], [t]);
  assert.equal(fog.memory[structureKey(t)].hp, 80);
  assert.equal(fog.memory[structureKey(t)].level.damage, 0);
  updateFog(fog, eyes(100, 100), [t]);
  assert.equal(fog.memory[structureKey(t)].hp, 20);
  assert.equal(fog.memory[structureKey(t)].level.damage, 2);
});

test("a tower built in a grey area isn't known until the units come back", () => {
  const fog = createFog(640, 640);
  updateFog(fog, eyes(100, 100), []);
  updateFog(fog, [], []);
  const t = tower(112, 112);
  updateFog(fog, [], [t]);
  assert.equal(knownStructure(fog, t), false);
  updateFog(fog, eyes(100, 100), [t]);
  assert.equal(knownStructure(fog, t), true);
  updateFog(fog, [], [t]);
  assert.equal(knownStructure(fog, t), true);
});

test("a destroyed tower stays remembered until its ground is seen again; a wall block too", () => {
  const fog = createFog(640, 640);
  const t = tower(112, 112);
  const w = { id: 2, kind: "wall", x: 176, y: 112, hp: 150, maxHp: 150 };
  updateFog(fog, eyes(100, 100), [t, w]);
  assert.deepEqual(fog.memory[structureKey(w)], { kind: "wall", x: 176, y: 112, hp: 150, maxHp: 150 });
  updateFog(fog, [], [t, w]);
  t.hp = 0;
  updateFog(fog, [], [w]);
  assert.ok(fog.memory[structureKey(t)]);
  updateFog(fog, eyes(100, 100), [w]);
  assert.equal(fog.memory[structureKey(t)], undefined);
  assert.ok(fog.memory[structureKey(w)]);
});

test("explored ground and remembered towers survive a save", () => {
  const fog = createFog(2048, 2048);
  updateFog(fog, [{ x: 300, y: 1700, r: 240 }, { x: 1500, y: 200, r: 150 }], [tower(310, 1690)]);
  updateFog(fog, [], []);
  const copy = createFog(2048, 2048);
  restoreFog(copy, JSON.parse(JSON.stringify(saveFog(fog))));
  assert.deepEqual([...copy.explored], [...fog.explored]);
  assert.deepEqual(copy.memory, fog.memory);
  assert.ok(![...copy.visible].some(Boolean));
});

test("a damaged fog save is ignored rather than breaking the load", () => {
  const fog = createFog(640, 640);
  restoreFog(fog, { explored: "zz", memory: [null, 3, { kind: "tower" }, { kind: "tower", type: "basic", x: 50, y: 60, hp: 80, maxHp: 80 }] });
  restoreFog(fog, null);
  restoreFog(fog, "nonsense");
  assert.ok(![...fog.explored].some(Boolean));
  assert.deepEqual(Object.keys(fog.memory), ["tower:50,60"]);
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `node --test js/fog.test.js`
Expected: FAIL — `Cannot find module .../js/fog.js`.

- [ ] **Step 3: Write `game/js/fog.js`**

```js
// The attacker's fog of war (docs/2026-10-09-modo-atacante-design.md
// §3.10, per user request «con niebla gris»), on a grid of FOG_CELL px
// squares, each either never seen (black), seen before (grey: the ground
// darkened and the defence's towers drawn as they were when last seen) or
// in sight now. Only the attacker has fog: the computer's defence sees
// its whole ground, as any defender does. DOM-free; attack.js updates it
// every tick and keeps it in saves, main.js draws it.
export const FOG_CELL = 32;
// How far each unit type sees, and what the map's entries always show.
export const SIGHT = { soldier: 150, motorcycle: 240, buggy: 200, tank: 170, rocket: 160 };
export const ENTRY_SIGHT = 150;

export function createFog(width, height) {
  const cols = Math.ceil(width / FOG_CELL);
  const rows = Math.ceil(height / FOG_CELL);
  return { cols, rows, explored: new Uint8Array(cols * rows), visible: new Uint8Array(cols * rows), memory: {} };
}

function cellAt(fog, x, y) {
  const c = Math.floor(x / FOG_CELL);
  const r = Math.floor(y / FOG_CELL);
  return c < 0 || r < 0 || c >= fog.cols || r >= fog.rows ? -1 : r * fog.cols + c;
}

export function isVisible(fog, x, y) {
  const i = cellAt(fog, x, y);
  return i >= 0 && fog.visible[i] === 1;
}

export function isExplored(fog, x, y) {
  const i = cellAt(fog, x, y);
  return i >= 0 && fog.explored[i] === 1;
}

// Remembered structures are keyed by kind and place -- not by id, so the
// memory still matches after a saved game is loaded (everything gets new
// ids then) -- and a tower or block only ever stands on its own spot.
export function structureKey(s) {
  return `${s.kind === "wall" ? "wall" : "tower"}:${s.x},${s.y}`;
}

function snapshot(s) {
  if (s.kind === "wall") return { kind: "wall", x: s.x, y: s.y, hp: s.hp, maxHp: s.maxHp };
  return {
    kind: "tower",
    type: s.type,
    x: s.x,
    y: s.y,
    hp: s.hp,
    maxHp: s.maxHp,
    level: { ...s.level },
    angle: s.angle || 0,
    building: s.buildTimeRemaining > 0,
  };
}

// The fog as `viewers` ([{ x, y, r }]: units and entries) see the ground
// now: their circles are in sight and explored; the defence's
// `structures` (towers and wall blocks) in sight are remembered as they
// are, and a remembered one whose ground is in sight but that's no longer
// there is forgotten.
export function updateFog(fog, viewers, structures) {
  fog.visible.fill(0);
  for (const v of viewers) {
    const c0 = Math.max(0, Math.floor((v.x - v.r) / FOG_CELL));
    const c1 = Math.min(fog.cols - 1, Math.floor((v.x + v.r) / FOG_CELL));
    const r0 = Math.max(0, Math.floor((v.y - v.r) / FOG_CELL));
    const r1 = Math.min(fog.rows - 1, Math.floor((v.y + v.r) / FOG_CELL));
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const dx = (c + 0.5) * FOG_CELL - v.x;
        const dy = (r + 0.5) * FOG_CELL - v.y;
        if (dx * dx + dy * dy > v.r * v.r) continue;
        fog.visible[r * fog.cols + c] = 1;
        fog.explored[r * fog.cols + c] = 1;
      }
    }
  }
  const standing = new Set();
  for (const s of structures) {
    if (!(s.hp > 0)) continue;
    const key = structureKey(s);
    standing.add(key);
    if (isVisible(fog, s.x, s.y)) fog.memory[key] = snapshot(s);
  }
  for (const [key, m] of Object.entries(fog.memory)) {
    if (!standing.has(key) && isVisible(fog, m.x, m.y)) delete fog.memory[key];
  }
}

// Whether the attacker knows of this structure: in sight now, or
// remembered from before.
export function knownStructure(fog, s) {
  return isVisible(fog, s.x, s.y) || Boolean(fog.memory[structureKey(s)]);
}

// For a save: the explored cells as a hex string (4 cells a digit) and the
// remembered structures.
export function saveFog(fog) {
  let explored = "";
  for (let i = 0; i < fog.explored.length; i += 4) {
    let v = 0;
    for (let k = 0; k < 4; k++) if (fog.explored[i + k]) v |= 1 << k;
    explored += v.toString(16);
  }
  return { explored, memory: Object.values(fog.memory).map((m) => JSON.parse(JSON.stringify(m))) };
}

// Back from a save, into a fresh fog of the same map. A damaged part is
// left out rather than breaking the load.
export function restoreFog(fog, saved) {
  if (!saved || typeof saved !== "object") return;
  const hex = saved.explored;
  if (typeof hex === "string" && hex.length === Math.ceil(fog.explored.length / 4) && /^[0-9a-f]*$/.test(hex)) {
    for (let i = 0; i < fog.explored.length; i++) fog.explored[i] = (parseInt(hex[i >> 2], 16) >> (i & 3)) & 1;
  }
  for (const m of Array.isArray(saved.memory) ? saved.memory : []) {
    if (!m || typeof m !== "object" || (m.kind !== "tower" && m.kind !== "wall")) continue;
    if (!Number.isFinite(m.x) || !Number.isFinite(m.y)) continue;
    fog.memory[structureKey(m)] = m;
  }
}
```

- [ ] **Step 4: Run the whole suite**

Run: `node --test`
Expected: PASS (7 new tests).

- [ ] **Step 5: Commit**

```bash
git add game/js/fog.js game/js/fog.test.js
git commit -m "Fog of war for the attacker: explored, in sight, and the towers remembered as last seen"
```

---

### Task 5: Attack rules — the state, the shop, upgrades and arrivals

**Files:**
- Create: `game/js/attack.js`, `game/js/attack.test.js`

**Interfaces:**
- Consumes: `assignId` (Task 1); `createGameState` (simulate.js); `createEnemy`, `ENEMY_TYPES`, `FOOTPRINT` (enemy.js); `levelData` (levels.js); `attackMapOf`, `pointAlong`, `routeLength`, `routePrefix` (Task 2); `DIFFICULTIES`, `AI_PERIOD`, `aiPrepare` (Task 3); `createFog`, `updateFog`, `SIGHT`, `ENTRY_SIGHT` (Task 4).
- Produces: `ROUNDS`, `ROUND_TIME`, `UNIT_CAP`, `SPAWN_INTERVAL`, `roundIncome(n)`, `UNIT_ORDER`, `UNIT_PRICES`, `UNIT_UPGRADES`, `unitUpgradeCost(skill, level)`, `applyUnitUpgrades(unit, levels)`, `createAttackState(level, difficulty, { aiSetup = true } = {})`, `setEntry(state, i)`, `buyUnits(state, type, count = 1) → { ok, bought } | { ok: false, reason }`, `upgradeUnitType(state, type, skill)`, `startAttack(state)`, `stepAttack(state, dt)` (this task: clock and arrivals; Task 6 completes it). An attack state is a `createGameState` state plus `mode: "attack"` and `attack: { difficulty, phase: "prep"|"battle", round, roundLeft, roundJustStarted, money, upgrades: { [type]: { damage, range, armor, rate, speed } }, entry, queue: [type], spawnTimer, aiTimer, winner, stats: { moneySpent, moneyEarned, livesTaken }, fog }`; the army is `state.enemies`, each unit with `order` (null | `{ kind: "move" }` | `{ kind: "attack", targetId }` | `{ kind: "enter" }`) and `jitter`.

- [ ] **Step 1: Write the failing tests**

`game/js/attack.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createAttackState,
  stepAttack,
  startAttack,
  buyUnits,
  upgradeUnitType,
  setEntry,
  roundIncome,
  unitUpgradeCost,
  UNIT_PRICES,
  UNIT_ORDER,
  UNIT_CAP,
  ROUNDS,
  ROUND_TIME,
  SPAWN_INTERVAL,
} from "./attack.js";
import { DIFFICULTIES } from "./defenseAI.js";
import { attackMapOf, nearestRoadPoint } from "./roadGraph.js";
import { isVisible, isExplored } from "./fog.js";
import { LEVELS } from "./levels.js";

// An attack against a defence with no towers and no money: nothing shoots.
function empty(level = 2) {
  const s = createAttackState(level, "normal", { aiSetup: false });
  s.economy.money = 0;
  return s;
}

function run(s, seconds, dt = 0.05) {
  for (let t = 0; t < seconds - 1e-9; t += dt) stepAttack(s, dt);
}

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

test("the design's numbers: 15 rounds of a minute, the round's pay, the shop, the cap, the arrivals", () => {
  assert.equal(ROUNDS, 15);
  assert.equal(ROUND_TIME, 60);
  assert.equal(roundIncome(1), 150);
  assert.equal(roundIncome(4), 225);
  assert.deepEqual(UNIT_ORDER, ["soldier", "motorcycle", "buggy", "tank", "rocket"]);
  assert.deepEqual(UNIT_PRICES, { soldier: 15, motorcycle: 25, buggy: 35, tank: 90, rocket: 120 });
  assert.equal(UNIT_CAP, 60);
  assert.equal(SPAWN_INTERVAL, 0.5);
  assert.deepEqual(
    ["damage", "range", "armor", "rate", "speed"].map((skill) => [unitUpgradeCost(skill, 0), unitUpgradeCost(skill, 4)]),
    [
      [60, 300],
      [40, 200],
      [60, 300],
      [60, 300],
      [40, 200],
    ],
  );
});

test("an attack begins in preparation: round 1, that round's money already paid, no clock running", () => {
  const s = empty();
  assert.equal(s.mode, "attack");
  assert.equal(s.attack.phase, "prep");
  assert.equal(s.attack.round, 1);
  assert.equal(s.attack.money, 150);
  assert.equal(s.enemies.length, 0);
  run(s, 5);
  assert.equal(s.attack.roundLeft, ROUND_TIME);
  assert.deepEqual(startAttack(s), { ok: true });
  assert.equal(s.attack.phase, "battle");
  run(s, 5);
  assert.ok(Math.abs(s.attack.roundLeft - (ROUND_TIME - 5)) < 1e-6);
  assert.deepEqual(startAttack(s), { ok: false, reason: "already-started" });
});

test("the defence sets up its first towers before the attack, spending its difficulty's money", () => {
  const easy = createAttackState(3, "easy");
  const hard = createAttackState(3, "hard");
  for (const [s, difficulty] of [
    [easy, "easy"],
    [hard, "hard"],
  ]) {
    assert.ok(s.towers.length >= 2);
    assert.ok(s.towers.every((t) => t.buildTimeRemaining === 0));
    assert.ok(s.stats.moneySpent >= DIFFICULTIES[difficulty].startMoney * 0.8);
  }
  assert.ok(hard.stats.moneySpent > easy.stats.moneySpent);
  assert.equal(createAttackState(2, "nonsense", { aiSetup: false }).attack.difficulty, "normal");
});

test("buying in preparation: the price is paid and the units stand along the active entry's road, waiting for orders", () => {
  const s = empty(2);
  assert.deepEqual(buyUnits(s, "soldier", 3), { ok: true, bought: 3 });
  assert.equal(s.attack.money, 150 - 3 * 15);
  assert.equal(s.attack.stats.moneySpent, 45);
  const { entries, graph } = attackMapOf(LEVELS[2]);
  assert.equal(s.enemies.length, 3);
  for (const u of s.enemies) {
    assert.equal(u.type, "soldier");
    assert.equal(u.order, null);
    assert.ok(dist(u, entries[0]) < 150);
    assert.ok(nearestRoadPoint(graph, u.x, u.y).dist < 20);
  }
  for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) assert.ok(dist(s.enemies[i], s.enemies[j]) > 15);
});

test("buying more than the money allows buys what it can; with too little, nothing", () => {
  const s = empty(2);
  assert.deepEqual(buyUnits(s, "tank", 5), { ok: true, bought: 1 });
  assert.equal(s.attack.money, 60);
  assert.deepEqual(buyUnits(s, "rocket"), { ok: false, reason: "cant-afford" });
  assert.deepEqual(buyUnits(s, "dragon"), { ok: false, reason: "unknown-type" });
});

test("no more than 60 units, counting the ones still waiting to come in", () => {
  const s = empty(2);
  s.attack.money = 10000;
  assert.equal(buyUnits(s, "soldier", 50).bought, 50);
  startAttack(s);
  assert.equal(buyUnits(s, "soldier", 20).bought, 10);
  assert.equal(s.attack.queue.length, 10);
  assert.deepEqual(buyUnits(s, "soldier"), { ok: false, reason: "cap" });
});

test("a crowded entry: sixty units bought at once in preparation each get their own place on the road", () => {
  const s = empty(2);
  s.attack.money = 10000;
  assert.equal(buyUnits(s, "soldier", 60).bought, 60);
  const { graph } = attackMapOf(LEVELS[2]);
  for (const u of s.enemies) assert.ok(nearestRoadPoint(graph, u.x, u.y).dist < 20);
  for (let i = 0; i < 60; i++) {
    for (let j = i + 1; j < 60; j++) assert.ok(dist(s.enemies[i], s.enemies[j]) > 15, `units ${i} and ${j} on top of each other`);
  }
});

test("units bought during a round come in one by one, half a second apart, at the active entry", () => {
  const s = empty(2);
  startAttack(s);
  assert.deepEqual(setEntry(s, 1), { ok: true });
  buyUnits(s, "buggy", 3);
  stepAttack(s, 0.05);
  assert.equal(s.enemies.length, 1);
  run(s, 0.6);
  assert.equal(s.enemies.length, 2);
  run(s, 0.6);
  assert.equal(s.enemies.length, 3);
  const last = s.enemies[2];
  assert.ok(dist(last, attackMapOf(LEVELS[2]).entries[1]) < 40);
  assert.equal(last.order.kind, "move"); // on its way to its place along the road
});

test("an upgrade costs $60, then $120..., and strengthens every unit of the type, out there or still to come", () => {
  const s = empty();
  s.attack.money = 1000;
  buyUnits(s, "tank", 2);
  const [a] = s.enemies;
  a.hp -= 30;
  assert.deepEqual(upgradeUnitType(s, "tank", "armor"), { ok: true });
  assert.equal(s.attack.money, 1000 - 2 * 90 - 60);
  assert.equal(a.maxHp, Math.round(120 / 0.85));
  assert.equal(a.hp, 90 + Math.round(120 / 0.85) - 120);
  assert.deepEqual(upgradeUnitType(s, "tank", "damage"), { ok: true });
  assert.equal(s.attack.money, 1000 - 2 * 90 - 60 - 60);
  buyUnits(s, "tank");
  const fresh = s.enemies.at(-1);
  assert.equal(fresh.fireDamage, 5 * 1.25);
  assert.equal(fresh.maxHp, Math.round(120 / 0.85));
  assert.equal(fresh.hp, fresh.maxHp);
  assert.equal(a.fireDamage, 5 * 1.25);
  assert.equal(s.attack.stats.moneySpent, 3 * 90 + 60 + 60);
});

test("range, rate and speed upgrades; five levels at most", () => {
  const s = empty();
  s.attack.money = 100000;
  buyUnits(s, "soldier");
  const [u] = s.enemies;
  const speed0 = u.speed;
  for (const skill of ["range", "rate", "speed"]) assert.equal(upgradeUnitType(s, "soldier", skill).ok, true);
  assert.equal(u.fireRange, 90 * 1.15);
  assert.equal(u.fireCooldown, 1.2 * 0.85);
  assert.ok(Math.abs(u.speed - speed0 * 1.06) < 1e-9);
  for (let i = 1; i < 5; i++) upgradeUnitType(s, "soldier", "range");
  assert.deepEqual(upgradeUnitType(s, "soldier", "range"), { ok: false, reason: "maxed" });
  assert.equal(s.attack.upgrades.soldier.range, 5);
  assert.deepEqual(upgradeUnitType(s, "soldier", "flying"), { ok: false, reason: "unknown" });
  s.attack.money = 0;
  assert.deepEqual(upgradeUnitType(s, "soldier", "damage"), { ok: false, reason: "cant-afford" });
});

test("the active entry can be any of the map's entries", () => {
  const s = empty(4);
  assert.deepEqual(setEntry(s, 6), { ok: true });
  assert.equal(s.attack.entry, 6);
  for (const bad of [7, -1, 1.5, "2"]) assert.equal(setEntry(s, bad).ok, false);
});

test("the map's entries are always in sight, the rest starts unexplored, and units see around them", () => {
  const s = empty(3);
  const { entries } = attackMapOf(LEVELS[3]);
  for (const e of entries) assert.ok(isVisible(s.attack.fog, e.x, e.y));
  assert.ok(!isExplored(s.attack.fog, 1024, 1024));
  buyUnits(s, "motorcycle");
  const [u] = s.enemies;
  assert.ok(isVisible(s.attack.fog, u.x + 200, u.y));
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `node --test js/attack.test.js`
Expected: FAIL — `Cannot find module .../js/attack.js`.

- [ ] **Step 3: Write `game/js/attack.js`**

```js
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
```

- [ ] **Step 4: Run the whole suite**

Run: `node --test`
Expected: PASS (12 new tests).

- [ ] **Step 5: Commit**

```bash
git add game/js/attack.js game/js/attack.test.js
git commit -m "Attack mode rules: the army's shop, unit upgrades, entries and arrivals, the defence's opening"
```

---

### Task 6: Attack rules — orders, the battle, rounds, money and the end

**Files:**
- Modify: `game/js/attack.js`
- Create: `game/js/attack-orders.test.js`

**Interfaces:**
- Consumes: Task 5's internals (`giveRoute`, `stopUnit`, `spawnFromQueue`, `refreshFog`, `mapOf`, `playing`); `stepEnemy`, `FOOTPRINT` (enemy.js); `loseLife` (economy.js); `pushOutOfPolygons` (map.js); `narrowsOf`, `solidSegmentsOf` (levels.js); `separateEnemies`, `fireTowers`, `fireUnits`, `stepShots`, `clearDestroyed` (Task 1); `roadRoute`, `spreadStops` (Task 2); `aiStep` (Task 3).
- Produces: `DAMAGE_REWARD` (0.25), `ENTRY_REWARD` (20), `BASE_CLICK_RADIUS` (60), `orderMove(state, ids, x, y) → { ok, stops }`, `orderAttack(state, ids, structureId) → { ok, target }`, `orderEnter(state, ids) → { ok, target }`, `orderStop(state, ids)`, and the complete `stepAttack(state, dt)`. When a game ends: `state.gameOver = true` and `state.attack.winner` is `"attacker"` or `"defense"`.

- [ ] **Step 1: Write the failing tests**

`game/js/attack-orders.test.js`:

```js
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
```

- [ ] **Step 2: Run them to see them fail**

Run: `node --test js/attack-orders.test.js`
Expected: FAIL — `orderMove`/`DAMAGE_REWARD`... not exported by attack.js.

- [ ] **Step 3: Complete `game/js/attack.js`**

Replace its import block with:

```js
import { assignId } from "./ids.js";
import { levelData, narrowsOf, solidSegmentsOf } from "./levels.js";
import { createEnemy, stepEnemy, ENEMY_TYPES, FOOTPRINT } from "./enemy.js";
import { loseLife } from "./economy.js";
import { pushOutOfPolygons } from "./map.js";
import { createGameState, separateEnemies, fireTowers, fireUnits, stepShots, clearDestroyed } from "./simulate.js";
import { attackMapOf, roadRoute, spreadStops, pointAlong, routeLength, routePrefix } from "./roadGraph.js";
import { DIFFICULTIES, AI_PERIOD, aiPrepare, aiStep } from "./defenseAI.js";
import { createFog, updateFog, SIGHT, ENTRY_SIGHT } from "./fog.js";
```

After `export const SPAWN_INTERVAL = 0.5;` add:

```js
// The attacker's pay besides each round's: a share of the damage done to
// towers and wall blocks, and a bonus for each unit that gets into the base.
export const DAMAGE_REWARD = 0.25;
export const ENTRY_REWARD = 20;
// A right-click this close to the base sends the units into it.
export const BASE_CLICK_RADIUS = 60;
```

Replace the Task 5 `stepAttack` (its comment and body) with:

```js
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
    const { reachedEnd, blockedBy } = stepEnemy(u, dt, { others: state.enemies, hold: inRange, walls, gates, barriers: state.walls });
    u.blockedBy = blockedBy ?? null;
    if (!reachedEnd) continue;
    if (order.kind === "enter") enterBase(state, u);
    else if (!inRange) stopUnit(u);
  }
  // The ones that went into the base leave the field (no bounty for them).
  state.enemies = state.enemies.filter((u) => u.alive);
  separateEnemies(state.enemies, dt, walls);
  if (L.water) for (const u of state.enemies) pushOutOfPolygons(u, L.water, L.worldWidth, L.worldHeight);
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
    a.money += damage * DAMAGE_REWARD;
    a.stats.moneyEarned += damage * DAMAGE_REWARD;
  });
  clearDestroyed(state);
  for (const u of state.enemies) if (u.order?.kind === "attack" && !structureById(state, u.order.targetId)) stopUnit(u);
  refreshFog(state);
}
```

- [ ] **Step 4: Run the whole suite**

Run: `node --test`
Expected: PASS (17 new tests, and Task 5's still green).

- [ ] **Step 5: Commit**

```bash
git add game/js/attack.js game/js/attack-orders.test.js
git commit -m "Attack mode battle: move, attack, enter and stop orders; rounds, the attacker's pay, winning and losing"
```

---

### Task 7: Attack saves, one loop and one save list for both modes

**Files:**
- Modify: `game/js/simulate.js`, `game/js/attack.js`, `game/js/autosave.js`, `game/js/saves.js`, `game/js/menu.js`, `game/js/menu.test.js`
- Create: `game/js/modes.js`, `game/js/attack-save.test.js`

**Interfaces:**
- Consumes: `saveFog`, `restoreFog` (Task 4); attack.js internals (`createUnit`, `refreshFog`, `mapOf`, `freshUpgrades`).
- Produces: from simulate.js `boardForSave(state) → { stats, towers, walls }` and `restoreBoard(state, save)`; defence saves now carry `mode: "defense"` and simulate.js refuses saves of any other mode. From attack.js `canSaveAttack(state)`, `attackSaveMoment(state)`, `createAttackSave(state, now)`, `restoreAttackSave(save)` (paused, at the start of its round, army idle), `attackSaveSummary(save) → { mode: "attack", level, round, difficulty, lives, money, savedAt }`. From modes.js `stepGame`, `canSaveGame`, `gameSaveMoment`, `createGameSave`, `restoreGameSave`, `gameSaveSummary` (defence summaries gain `mode: "defense"`). `describeSave` starts with «Defensa · » or «Ataque · ».

- [ ] **Step 1: Write the failing tests**

`game/js/attack-save.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createAttackState,
  stepAttack,
  startAttack,
  buyUnits,
  upgradeUnitType,
  setEntry,
  canSaveAttack,
  createAttackSave,
  restoreAttackSave,
  attackSaveSummary,
  ROUND_TIME,
} from "./attack.js";
import { createGameState, createSave, restoreSave, saveSummary } from "./simulate.js";
import { stepGame, canSaveGame, gameSaveMoment, createGameSave, restoreGameSave, gameSaveSummary } from "./modes.js";
import { createSaveScheduler } from "./autosave.js";
import { slotListing } from "./saves.js";
import { describeSave } from "./menu.js";

function empty(level = 2) {
  const s = createAttackState(level, "normal", { aiSetup: false });
  s.economy.money = 0;
  return s;
}

function run(s, seconds, dt = 0.05) {
  for (let t = 0; t < seconds - 1e-9; t += dt) stepAttack(s, dt);
}

const roundTrip = (save) => JSON.parse(JSON.stringify(save));

// An attack on level 3 against a Difficult defence, in round 3: towers, an
// upgraded army out on the map (one tank hurt), two buggies still to come
// in, some lives already taken.
function attackInProgress() {
  const s = createAttackState(3, "hard");
  s.attack.money = 2000;
  setEntry(s, 2);
  buyUnits(s, "tank", 2);
  buyUnits(s, "soldier", 4);
  upgradeUnitType(s, "tank", "armor");
  upgradeUnitType(s, "soldier", "speed");
  upgradeUnitType(s, "soldier", "speed");
  startAttack(s);
  buyUnits(s, "buggy", 2);
  s.enemies[0].hp -= 50;
  s.attack.round = 3;
  s.economy.lives = 17;
  s.economy.money = 123;
  s.attack.stats.livesTaken = 3;
  s.stats.kills.soldier = 5;
  s.towers[0].hp = 30;
  return s;
}

test("an attack saved as a round starts loads back the same: map, difficulty, round, money, upgrades, army, defence, fog", () => {
  const s = attackInProgress();
  const save = roundTrip(createAttackSave(s, new Date("2026-10-09T20:00:00Z")));
  assert.equal(save.mode, "attack");
  const loaded = restoreAttackSave(save);
  assert.equal(loaded.mode, "attack");
  assert.equal(loaded.level, 3);
  assert.equal(loaded.attack.difficulty, "hard");
  assert.equal(loaded.attack.phase, "battle");
  assert.equal(loaded.attack.round, 3);
  assert.equal(loaded.attack.roundLeft, ROUND_TIME);
  assert.equal(loaded.attack.money, s.attack.money);
  assert.deepEqual(loaded.attack.upgrades, s.attack.upgrades);
  assert.equal(loaded.attack.entry, 2);
  assert.deepEqual(loaded.attack.queue, ["buggy", "buggy"]);
  const unit = (u) => [u.type, Math.round(u.x), Math.round(u.y), u.hp, u.maxHp];
  assert.deepEqual(loaded.enemies.map(unit), s.enemies.map(unit));
  assert.ok(loaded.enemies.every((u) => u.order === null));
  assert.equal(loaded.enemies[0].maxHp, Math.round(120 / 0.85));
  assert.equal(loaded.economy.lives, 17);
  assert.equal(loaded.economy.money, 123);
  const tower = (t) => [t.type, t.x, t.y, t.hp, JSON.stringify(t.level)];
  assert.deepEqual(loaded.towers.map(tower), s.towers.map(tower));
  assert.deepEqual(loaded.stats, s.stats);
  assert.deepEqual(loaded.attack.stats, s.attack.stats);
  assert.deepEqual([...loaded.attack.fog.explored], [...s.attack.fog.explored]);
  assert.equal(loaded.paused, true);
  const ids = new Set([...loaded.enemies, ...loaded.towers].map((o) => o.id));
  assert.equal(ids.size, loaded.enemies.length + loaded.towers.length);
});

test("a loaded attack waits paused at its round's start, and its army stands still until it's given orders", () => {
  const loaded = restoreAttackSave(roundTrip(createAttackSave(attackInProgress())));
  const at = loaded.enemies.map((u) => ({ x: u.x, y: u.y }));
  run(loaded, 1);
  assert.equal(loaded.attack.roundLeft, ROUND_TIME);
  loaded.paused = false;
  run(loaded, 1);
  loaded.enemies.slice(0, at.length).forEach((u, i) => assert.ok(Math.hypot(u.x - at[i].x, u.y - at[i].y) < 3));
});

test("an attack saved in preparation loads back in preparation", () => {
  const s = empty(2);
  buyUnits(s, "soldier", 3);
  const loaded = restoreAttackSave(roundTrip(createAttackSave(s)));
  assert.equal(loaded.attack.phase, "prep");
  assert.equal(loaded.enemies.length, 3);
  assert.deepEqual(startAttack(loaded), { ok: true });
  assert.equal(loaded.paused, false);
});

test("defence saves and attack saves each load only as what they are; saves from before the attack mode still load", () => {
  const attack = roundTrip(createAttackSave(empty(2)));
  const defence = roundTrip(createSave(createGameState(2)));
  assert.equal(defence.mode, "defense");
  assert.equal(restoreSave(attack), null);
  assert.equal(saveSummary(attack), null);
  assert.equal(restoreAttackSave(defence), null);
  assert.equal(restoreGameSave(attack).mode, "attack");
  assert.equal(restoreGameSave(defence).level, 2);
  const old = { ...defence };
  delete old.mode;
  assert.equal(restoreGameSave(old).level, 2);
});

test("damaged attack saves are refused, or mended field by field", () => {
  const good = roundTrip(createAttackSave(attackInProgress()));
  for (const bad of [null, 7, "x", {}, { ...good, version: 99 }, { ...good, level: 9 }, { ...good, level: "3" }]) {
    assert.equal(restoreAttackSave(bad), null);
    assert.equal(attackSaveSummary(bad), null);
  }
  const s = restoreAttackSave({
    ...good,
    difficulty: "insane",
    phase: "lunch",
    round: 99,
    money: -5,
    entry: 42,
    queue: ["buggy", "dragon"],
    upgrades: { tank: { armor: 99, damage: "lots" } },
    units: [null, { type: "ufo", x: 1, y: 1 }, { type: "tank", x: "a" }, { type: "soldier", x: 600, y: 300, hp: 9999 }],
    defense: { lives: -3 },
    fog: "nope",
  });
  assert.equal(s.attack.difficulty, "normal");
  assert.equal(s.attack.phase, "prep");
  assert.equal(s.attack.round, 15);
  assert.equal(s.attack.money, 0);
  assert.equal(s.attack.entry, 0);
  assert.deepEqual(s.attack.queue, ["buggy"]);
  assert.equal(s.attack.upgrades.tank.armor, 5);
  assert.equal(s.attack.upgrades.tank.damage, 0);
  assert.equal(s.enemies.length, 1);
  assert.equal(s.enemies[0].hp, s.enemies[0].maxHp);
  assert.equal(s.economy.lives, 1);
});

test("the save list tells a defence game from an attack", () => {
  const attack = createAttackSave(attackInProgress(), new Date("2026-10-09T18:30:00.000Z"));
  assert.deepEqual(attackSaveSummary(attack), {
    mode: "attack",
    level: 3,
    round: 3,
    difficulty: "hard",
    lives: 17,
    money: Math.floor(attack.money),
    savedAt: "2026-10-09T18:30:00.000Z",
  });
  const defence = createSave(createGameState(1), new Date("2026-10-09T18:30:00.000Z"));
  assert.equal(gameSaveSummary(attack).mode, "attack");
  assert.equal(gameSaveSummary(defence).mode, "defense");
  assert.equal(slotListing(1, attack).summary.mode, "attack");
  assert.match(describeSave(attackSaveSummary(attack)), /^Ataque · Nivel 3 · Ronda 3 · Difícil · ❤ 17 · \$\d+ · \d\d\/\d\d \d\d:\d\d$/);
  assert.match(describeSave(gameSaveSummary(defence)), /^Defensa · Nivel 1 · Oleada 1 · ❤ 20 · \$150 · /);
});

test("the game loop and saving go the defence way or the attack way, by the game's mode", () => {
  const d = createGameState(1);
  stepGame(d, 1);
  assert.equal(d.waveClock, 1);
  const a = empty(2);
  assert.equal(canSaveGame(a), true);
  startAttack(a);
  stepGame(a, 1);
  assert.equal(a.attack.roundLeft, ROUND_TIME - 1);
  assert.equal(canSaveGame(createGameState(1)), true);
  assert.equal(canSaveGame(a), false);
  assert.equal(canSaveAttack(a), false);
  assert.equal(gameSaveMoment(a), "attack:2:1:battle");
  assert.equal(createGameSave(a).mode, "attack");
  assert.equal(createGameSave(createGameState(1)).mode, "defense");
});

test("in attack mode the autosave is made in preparation, at «¡Al ataque!» and as each round starts; a save asked for mid-round is made when the next one starts", () => {
  const writes = [];
  const scheduler = createSaveScheduler((slot, save) => {
    writes.push([slot, save.phase, save.round]);
    return true;
  });
  const s = empty(2);
  scheduler.reset(s);
  scheduler.tick(s);
  scheduler.tick(s);
  assert.deepEqual(writes, [["auto", "prep", 1]]);
  startAttack(s);
  scheduler.tick(s);
  stepAttack(s, 0.5);
  scheduler.tick(s);
  assert.deepEqual(writes.slice(1), [["auto", "battle", 1]]);
  assert.deepEqual(scheduler.request(2, s), { done: false });
  for (let t = 0; t < 61; t += 0.5) {
    scheduler.tick(s);
    stepAttack(s, 0.5);
  }
  scheduler.tick(s);
  assert.deepEqual(writes.slice(2), [
    ["auto", "battle", 2],
    [2, "battle", 2],
  ]);
});

test("paused right as a round starts: the autosave is made once", () => {
  const writes = [];
  const scheduler = createSaveScheduler((slot) => {
    writes.push(slot);
    return true;
  });
  const s = empty(2);
  startAttack(s);
  scheduler.reset(s);
  s.paused = true;
  for (let i = 0; i < 5; i++) {
    scheduler.tick(s);
    stepAttack(s, 0.1);
  }
  assert.deepEqual(writes, ["auto"]);
});
```

In `game/js/menu.test.js`, the describeSave test becomes:

```js
test("a save is listed as defence or attack, level, wave or round, lives, money and when", () => {
  const text = describeSave({ mode: "defense", level: 4, wave: 12, lives: 15, money: 320, savedAt: "2026-10-08T18:30:00.000Z" });
  assert.match(text, /^Defensa · Nivel 4 · Oleada 12 · ❤ 15 · \$320 · \d\d\/\d\d \d\d:\d\d$/);
  assert.equal(describeSave({ level: 1, wave: 1, lives: 20, money: 150, savedAt: null }), "Defensa · Nivel 1 · Oleada 1 · ❤ 20 · $150");
  assert.equal(
    describeSave({ mode: "attack", level: 2, round: 7, difficulty: "easy", lives: 9, money: 85, savedAt: null }),
    "Ataque · Nivel 2 · Ronda 7 · Fácil · ❤ 9 · $85",
  );
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `node --test js/attack-save.test.js js/menu.test.js`
Expected: FAIL — `Cannot find module .../js/modes.js`; describeSave without «Defensa · ».

- [ ] **Step 3: Saves in `game/js/simulate.js`: the shared board, and only defence saves**

Replace `createSave` with:

```js
// What both kinds of game keep the same way in a save: the defence's
// towers and wall blocks, and the game's stats (attack.js saves them too).
export function boardForSave(state) {
  return {
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

export function createSave(state, now = new Date()) {
  return {
    version: SAVE_VERSION,
    mode: "defense",
    savedAt: now.toISOString(),
    level: state.level,
    waveIndex: state.waveIndex,
    totalWavesCleared: state.totalWavesCleared,
    money: state.economy.money,
    lives: state.economy.lives,
    ...boardForSave(state),
  };
}
```

In `readableLevel`, refuse other modes' saves (a save with no mode is a defence save from before the attack mode):

```js
function readableLevel(save) {
  if (!save || typeof save !== "object" || save.version !== SAVE_VERSION) return null;
  if (save.mode != null && save.mode !== "defense") return null;
  return Number.isInteger(save.level) && save.level >= 1 && save.level <= MAX_LEVEL ? save.level : null;
}
```

In `restoreSave`, replace everything from `  const stats = save.stats && typeof save.stats === "object" ? save.stats : {};` down to (not including) `  return state;` with:

```js
  restoreBoard(state, save);
```

and after `restoreSave` add `restoreBoard`, holding the code that came out of it:

```js
// Puts a save's stats, towers and wall blocks into `state`, a fresh game of
// the save's level. Every tower is rebuilt from its type with its upgrades
// applied again level by level, so a save made before a balance change
// loads with today's values -- and stays where it stood even if that's no
// longer a build slot. Everything gets a fresh id (assignId, like anything
// placed in play), so nothing can clash with what comes later.
export function restoreBoard(state, save) {
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
}
```

(The tower-rebuilding part of `restoreSave`'s own comment now lives on `restoreBoard`; trim `restoreSave`'s comment to: «The game a save describes, ready to play: paused in the countdown before its next wave (restoreBoard brings back its towers, walls and stats). Fields it doesn't know are ignored, missing ones take their defaults; null if it isn't a defence save this version can read.»)

- [ ] **Step 4: Attack saves in `game/js/attack.js`**

Add to its imports:

```js
import { SAVE_VERSION, boardForSave, restoreBoard } from "./simulate.js";
import { MAX_LEVEL } from "./levels.js";
import { saveFog, restoreFog } from "./fog.js";
```

(merging them into the existing `./simulate.js`, `./levels.js` and `./fog.js` import lines), and at the end of the file:

```js
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
```

- [ ] **Step 5: Write `game/js/modes.js`**

```js
// The two ways to play -- defending (simulate.js) and attacking
// (attack.js) -- share one game loop and one set of saved games: these
// pick each step's defence or attack version by the game's mode. A game
// without a mode is a defence game (all of them, before the attack mode).
import { stepSimulation, canSaveNow, saveMoment, createSave, restoreSave, saveSummary } from "./simulate.js";
import { stepAttack, canSaveAttack, attackSaveMoment, createAttackSave, restoreAttackSave, attackSaveSummary } from "./attack.js";

const attacking = (state) => state.mode === "attack";
const attackSave = (save) => Boolean(save) && typeof save === "object" && save.mode === "attack";

export function stepGame(state, dt) {
  if (attacking(state)) stepAttack(state, dt);
  else stepSimulation(state, dt);
}

export function canSaveGame(state) {
  return attacking(state) ? canSaveAttack(state) : canSaveNow(state);
}

export function gameSaveMoment(state) {
  return attacking(state) ? attackSaveMoment(state) : saveMoment(state);
}

export function createGameSave(state, now = new Date()) {
  return attacking(state) ? createAttackSave(state, now) : createSave(state, now);
}

export function restoreGameSave(save) {
  return attackSave(save) ? restoreAttackSave(save) : restoreSave(save);
}

export function gameSaveSummary(save) {
  if (attackSave(save)) return attackSaveSummary(save);
  const summary = saveSummary(save);
  return summary && { mode: "defense", ...summary };
}
```

- [ ] **Step 6: The autosave and the save list through `modes.js`**

In `game/js/autosave.js`, replace `import { canSaveNow, saveMoment, createSave } from "./simulate.js";` with `import { canSaveGame, gameSaveMoment, createGameSave } from "./modes.js";`, rename the calls inside (`canSaveNow` → `canSaveGame`, `saveMoment` → `gameSaveMoment`, `createSave` → `createGameSave`), and in its header comment change «Saves are only ever made between waves (simulate.js's canSaveNow), so:» to «Saves are only ever made at a quiet moment -- between waves in a defence game, as a round starts in an attack (modes.js's canSaveGame) -- so:».

In `game/js/saves.js`, replace `import { saveSummary } from "./simulate.js";` with `import { gameSaveSummary } from "./modes.js";`, call `gameSaveSummary(save)` in `slotListing`, and in its comment say «(with modes.js's gameSaveSummary: a defence or an attack save)».

- [ ] **Step 7: `describeSave` in `game/js/menu.js`**

Replace it with:

```js
const DIFFICULTY_NAMES = { easy: "Fácil", normal: "Normal", hard: "Difícil" };

// "Defensa · Nivel 4 · Oleada 12 · ❤ 15 · $320 · 08/10 18:30" or "Ataque ·
// Nivel 3 · Ronda 5 · Difícil · ❤ 12 · $240 · ...": a save as the menu
// lists it, the date in this device's own time. A summary without a mode
// is a defence game's.
export function describeSave(summary) {
  const when = summary.savedAt ? new Date(summary.savedAt) : null;
  const date =
    when && !Number.isNaN(when.getTime())
      ? ` · ${pad(when.getDate())}/${pad(when.getMonth() + 1)} ${pad(when.getHours())}:${pad(when.getMinutes())}`
      : "";
  if (summary.mode === "attack") {
    const difficulty = DIFFICULTY_NAMES[summary.difficulty] || DIFFICULTY_NAMES.normal;
    return `Ataque · Nivel ${summary.level} · Ronda ${summary.round} · ${difficulty} · ❤ ${summary.lives} · $${summary.money}${date}`;
  }
  return `Defensa · Nivel ${summary.level} · Oleada ${summary.wave} · ❤ ${summary.lives} · $${summary.money}${date}`;
}
```

- [ ] **Step 8: Run the whole suite**

Run: `node --test`
Expected: PASS (9 new tests, the changed menu test, and every existing save, autosave and server-save test still green).

- [ ] **Step 9: Commit**

```bash
git add game/js/simulate.js game/js/attack.js game/js/modes.js game/js/autosave.js game/js/saves.js game/js/menu.js game/js/menu.test.js game/js/attack-save.test.js
git commit -m "Attack games save and load; one game loop and one save list for defence and attack"
```

---

### Task 8: Whole games, headless

**Files:**
- Create: `game/js/attackBot.js`, `game/js/attack-game.test.js`
- Modify: `game/.vercelignore`

**Interfaces:**
- Consumes: `createAttackState`, `stepAttack`, `startAttack`, `buyUnits`, `setEntry`, `orderEnter` (Tasks 5–6); `attackMapOf`, `roadRoute`, `nearestRoadPoint` (Task 2); `routeThreat` (ai.js).
- Produces: `botRound(state)`, `sendIn(state)`, `playBotGame(level, difficulty, { dt = 0.1, onTick = null } = {}) → finished state` (plan C's balance runs use them).

- [ ] **Step 1: Write the failing test**

`game/js/attack-game.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { playBotGame } from "./attackBot.js";
import { attackMapOf, nearestRoadPoint } from "./roadGraph.js";
import { ROUNDS } from "./attack.js";
import { LEVELS } from "./levels.js";

test("whole attack games play out on every map: the army keeps to the roads and the game ends with a winner", () => {
  for (const level of [1, 2, 3, 4]) {
    const { graph } = attackMapOf(LEVELS[level]);
    let ticks = 0;
    let worst = 0;
    const s = playBotGame(level, "normal", {
      onTick(state) {
        if (++ticks % 20) return;
        for (const u of state.enemies) {
          assert.ok(Number.isFinite(u.x) && Number.isFinite(u.y));
          worst = Math.max(worst, nearestRoadPoint(graph, u.x, u.y).dist);
        }
      },
    });
    assert.equal(s.gameOver, true);
    assert.ok(["attacker", "defense"].includes(s.attack.winner));
    assert.ok(s.attack.round <= ROUNDS);
    assert.ok(worst < 60, `level ${level}: a unit ${Math.round(worst)}px off the road`);
    assert.ok(s.attack.stats.moneySpent > 0 && s.stats.towersBuilt > 0);
  }
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `node --test js/attack-game.test.js`
Expected: FAIL — `Cannot find module .../js/attackBot.js`.

- [ ] **Step 3: Write `game/js/attackBot.js`**

```js
// A simple attacker for headless games -- the tests' whole games and the
// balance runs of the design's §9: as each round starts it buys an army
// with its money, picks the entry whose way to the base the towers cover
// least, and sends everything it has into the base.
import { levelData } from "./levels.js";
import { attackMapOf, roadRoute } from "./roadGraph.js";
import { routeThreat } from "./ai.js";
import { createAttackState, stepAttack, startAttack, buyUnits, setEntry, orderEnter } from "./attack.js";

// The entry whose road to the base runs past the least firepower.
function safestEntry(state) {
  const { graph, entries, base } = attackMapOf(levelData(state.level));
  let best = 0;
  let bestThreat = Infinity;
  entries.forEach((e, i) => {
    const threat = routeThreat(roadRoute(graph, e, base), state.towers);
    if (threat < bestThreat) {
      best = i;
      bestThreat = threat;
    }
  });
  return best;
}

// Sends every unit standing idle into the base.
export function sendIn(state) {
  const idle = state.enemies.filter((u) => u.alive && !u.order).map((u) => u.id);
  if (idle.length) orderEnter(state, idle);
}

// The bot's turn as a round starts: at the safest entry, a tank or two to
// soak up fire (from round 3), buggies with half of the rest of the money,
// soldiers with what's left -- and everyone in.
export function botRound(state) {
  const a = state.attack;
  setEntry(state, safestEntry(state));
  if (a.round >= 3) buyUnits(state, "tank", Math.floor(a.money / 300));
  buyUnits(state, "buggy", Math.floor(a.money / 2 / 35));
  buyUnits(state, "soldier", 60);
  sendIn(state);
}

// A whole game, the bot against the computer's defence; onTick(state)
// after every step. Returns the finished game.
export function playBotGame(level, difficulty, { dt = 0.1, onTick = null } = {}) {
  const state = createAttackState(level, difficulty);
  botRound(state);
  startAttack(state);
  let sinceSend = 0;
  while (!state.gameOver) {
    stepAttack(state, dt);
    if (onTick) onTick(state);
    if (state.attack.roundJustStarted) botRound(state);
    sinceSend += dt;
    if (sinceSend >= 1) {
      sinceSend = 0;
      sendIn(state);
    }
  }
  return state;
}
```

- [ ] **Step 4: Keep the bot out of the web deploy**

Append `js/attackBot.js` to `game/.vercelignore`.

- [ ] **Step 5: Run the whole suite**

Run: `node --test`
Expected: PASS. If the whole-games test alone takes more than ~20 s, ledger it (plan C may move it to a balance script) — it must still pass.

- [ ] **Step 6: Commit**

```bash
git add game/js/attackBot.js game/js/attack-game.test.js game/.vercelignore
git commit -m "Whole attack games played headless by a simple bot on every map"
```
