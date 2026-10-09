import { test } from "node:test";
import assert from "node:assert/strict";
import { aiStep, aiPrepare, DIFFICULTIES, AI_PERIOD, ENTRY_SAFE_ROAD } from "./defenseAI.js";
import { TOWER_TYPES } from "./tower.js";
import { createGameState } from "./simulate.js";
import { createEnemy } from "./enemy.js";
import { LEVELS } from "./levels.js";
import { attackMapOf, pointAlong } from "./roadGraph.js";

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
  // Two armies far apart on level 3 -- one on the north road, one on the
  // south-east one, both well past the entries' safe stretch: the new tower
  // goes up near whichever is there.
  const chosen = (spot) => {
    const s = defence(3, 90);
    army(s, spot.x, spot.y, 12);
    aiStep(s, "hard", { rand: best });
    assert.equal(s.towers.length, 1);
    return s.towers[0];
  };
  const north = { x: 437, y: 883 };
  const southEast = { x: 1329, y: 1559 };
  const d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const forNorth = chosen(north);
  const forSouthEast = chosen(southEast);
  assert.ok(d(forNorth, north) < d(forNorth, southEast), `tower at (${forNorth.x},${forNorth.y})`);
  assert.ok(d(forSouthEast, southEast) < d(forSouthEast, north), `tower at (${forSouthEast.x},${forSouthEast.y})`);
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

test("the defence leaves the army somewhere to come in: no tower reaches the first stretch of an entry's road", () => {
  for (const level of [1, 2, 3, 4]) {
    const s = defence(level, 5000);
    aiPrepare(s, "hard", { rand: best });
    for (let i = 0; i < 5; i++) {
      s.economy.money += 1000;
      aiStep(s, "hard", { rand: best });
    }
    assert.ok(s.towers.length >= 3);
    for (const { route } of attackMapOf(LEVELS[level]).entries) {
      for (let d = 0; d <= ENTRY_SAFE_ROAD; d += 20) {
        const p = pointAlong(route, d);
        for (const t of s.towers) {
          assert.ok(Math.hypot(t.x - p.x, t.y - p.y) > TOWER_TYPES[t.type].range, `level ${level}: a ${t.type} reaches ${d}px down an entry's road`);
        }
      }
    }
  }
});

test("the defence guards the base's approaches first: every attacker has to pass there", () => {
  // Level 3's five roads only meet at the fortress: with nothing else to go
  // on, the opening towers all stand near the base.
  const s = defence(3, DIFFICULTIES.normal.startMoney);
  aiPrepare(s, "normal", { rand: best });
  const { base } = attackMapOf(LEVELS[3]);
  for (const t of s.towers) assert.ok(Math.hypot(t.x - base.x, t.y - base.y) < 600, `a ${t.type} at (${t.x},${t.y})`);
});
