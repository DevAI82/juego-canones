import { test } from "node:test";
import assert from "node:assert/strict";
import { DUEL_GRADES, gradeStart, planTurn, playTurn } from "./duelAI.js";
import {
  SIDES,
  DUEL_UNITS,
  UNIT_CAP,
  STEP,
  ROUND_END_TIME,
  createDuelState,
  buyUnit,
  setReady,
  stepDuel,
  duelView,
} from "./duel.js";
import { ARENA, ZONES, arenaOf } from "./duelArenas.js";

// Dice for the tests: the same numbers every time.
function dice(seed = 1) {
  let n = seed;
  return () => {
    n = (n * 1664525 + 1013904223) % 4294967296;
    return n / 4294967296;
  };
}

const levelsOf = (free) => Object.values(free).reduce((sum, skills) => sum + Object.values(skills).reduce((a, b) => a + b, 0), 0);

// The round's fight and its result, to the next purchase (or the end).
function finishRound(state) {
  let ticks = 0;
  while (state.phase === "combat" || state.phase === "roundEnd") {
    stepDuel(state, STEP);
    assert.ok(++ticks < (60 + ROUND_END_TIME + 1) / STEP);
  }
}

// A duel in round 2's purchase, the right side having fielded `rival` in
// round 1 and the left side having `money`.
function secondRound(rival, money) {
  const s = createDuelState({ left: { money: 1000 }, right: { money: 1000 } });
  buyUnit(s, "left", "buggy");
  for (const type of rival) buyUnit(s, "right", type);
  setReady(s, "left");
  setReady(s, "right");
  finishRound(s);
  assert.equal(s.phase, "buy");
  s.sides.left.money = money;
  return s;
}

const bought = (actions) => actions.filter((a) => a.type === "buy").map((a) => a.unit);

test("there are five grades, each starting with more than the one before", () => {
  assert.equal(DUEL_GRADES.length, 5);
  let before = null;
  for (let grade = 1; grade <= 5; grade++) {
    const start = gradeStart(grade, 3);
    assert.equal(start.money, DUEL_GRADES[grade - 1].money);
    assert.equal(levelsOf(start.free), DUEL_GRADES[grade - 1].freeLevels);
    if (before) {
      assert.ok(start.money >= before.money && levelsOf(start.free) >= levelsOf(before.free));
      assert.ok(start.money > before.money || levelsOf(start.free) > levelsOf(before.free), `grade ${grade} starts with more`);
    }
    before = start;
    // It is what a duel takes for a side.
    const s = createDuelState({ right: start });
    assert.equal(s.sides.right.money, start.money);
  }
  assert.deepEqual(gradeStart(1, 3), { money: 95, free: {} }, "the first grade starts with a little less than a new player");
  assert.deepEqual(DUEL_GRADES.map((g) => g.money), [95, 135, 165, 190, 220]);
  assert.deepEqual(DUEL_GRADES.map((g) => g.freeLevels), [0, 3, 5, 7, 10]);
  assert.deepEqual(gradeStart(4, 9), gradeStart(4, 9));
});

test("after its turn the computer is ready, with an army it could pay for, in its zone", () => {
  for (let grade = 1; grade <= 5; grade++) {
    for (let arena = 1; arena <= 5; arena++) {
      for (const side of SIDES) {
        const s = createDuelState({ arena, seed: grade * 10 + arena, [side]: gradeStart(grade, arena) });
        const start = s.sides[side].money;
        const actions = playTurn(s, side, grade);
        const mine = s.sides[side];
        assert.equal(mine.ready, true);
        assert.ok(mine.money >= 0 && mine.money <= start);
        assert.ok(mine.army.length >= 1 && mine.army.length <= UNIT_CAP);
        assert.ok(actions.length >= 1);
        const z = ZONES[side];
        for (const u of mine.army) {
          const r = DUEL_UNITS[u.type].radius;
          assert.ok(u.x - r >= z.x0 && u.x + r <= z.x1 && u.y - r >= z.y0 && u.y + r <= z.y1, `grade ${grade}, arena ${arena}: in its zone`);
          for (const o of arenaOf(arena).obstacles) assert.ok(Math.hypot(o.x - u.x, o.y - u.y) >= o.r + r, "off the obstacles");
          for (const v of mine.army) {
            if (v !== u) assert.ok(Math.hypot(v.x - u.x, v.y - u.y) >= r + DUEL_UNITS[v.type].radius, "apart");
          }
        }
      }
    }
  }
});

test("the plan is made of actions the duel accepts, by place in the army", () => {
  const s = createDuelState({ left: gradeStart(5, 1) });
  const plan = planTurn(duelView(s, "left"), "left", 5, dice());
  assert.ok(plan.length > 0);
  for (const action of plan) {
    assert.ok(["buy", "upgrade", "place"].includes(action.type));
    if (action.type === "place") assert.ok(Number.isInteger(action.index) && action.index >= 0);
  }
  // Planning changed nothing in the duel itself.
  assert.deepEqual(s.sides.left.army, []);
  assert.equal(s.sides.left.money, gradeStart(5, 1).money);
});

test("it can't see what the rival buys in the same purchase", () => {
  const a = createDuelState({ right: { money: 1000 } });
  buyUnit(a, "right", "tank");
  const b = createDuelState({ right: { money: 1000 } });
  for (let i = 0; i < 10; i++) buyUnit(b, "right", "soldier");
  assert.deepEqual(planTurn(duelView(a, "left"), "left", 5, dice(4)), planTurn(duelView(b, "left"), "left", 5, dice(4)));
});

test("the top grade buys against the army the rival fielded last", () => {
  for (let seed = 1; seed <= 10; seed++) {
    const soldiers = secondRound(Array(10).fill("soldier"), 200);
    const vsSoldiers = bought(planTurn(duelView(soldiers, "left"), "left", 5, dice(seed)));
    assert.ok(vsSoldiers.includes("rocket"), `seed ${seed}: a rocket against a crowd of soldiers (${vsSoldiers})`);

    const tanks = secondRound(["tank", "tank", "tank"], 200);
    const vsTanks = bought(planTurn(duelView(tanks, "left"), "left", 5, dice(seed)));
    assert.ok(vsTanks.length > 0);
    assert.ok(!vsTanks.includes("soldier"), `seed ${seed}: no soldiers against tanks (${vsTanks})`);
  }
});

test("the first grade pays no attention to the rival", () => {
  const soldiers = secondRound(Array(10).fill("soldier"), 200);
  const tanks = secondRound(["tank", "tank", "tank"], 200);
  assert.deepEqual(
    bought(planTurn(duelView(soldiers, "left"), "left", 1, dice(2))),
    bought(planTurn(duelView(tanks, "left"), "left", 1, dice(2))),
  );
});

test("from the second round the higher grades put money in upgrades", () => {
  const s = secondRound(["tank"], 400);
  const plan = planTurn(duelView(s, "left"), "left", 5, dice());
  assert.ok(plan.some((a) => a.type === "upgrade"));
  const low = planTurn(duelView(s, "left"), "left", 1, dice());
  assert.ok(!low.some((a) => a.type === "upgrade"));
});

test("with a formation, the armour stands before the rockets", () => {
  for (const side of SIDES) {
    for (let arena = 1; arena <= 5; arena++) {
      const s = createDuelState({ arena, [side]: { money: 400 } });
      for (const type of ["rocket", "tank", "rocket", "tank", "soldier", "buggy"]) buyUnit(s, side, type);
      playTurn(s, side, 5);
      const army = s.sides[side].army;
      const fromMiddle = (u) => Math.abs(u.x - ARENA.width / 2);
      const tanks = army.filter((u) => u.type === "tank").map(fromMiddle);
      const rockets = army.filter((u) => u.type === "rocket").map(fromMiddle);
      assert.ok(tanks.length >= 2 && rockets.length >= 2);
      assert.ok(Math.max(...tanks) < Math.min(...rockets), `${side}, arena ${arena}: tanks ${tanks}, rockets ${rockets}`);
    }
  }
});

test("the top grade beats the first one most of the time, and every duel ends", () => {
  let wins = 0;
  const duels = 20;
  for (let seed = 1; seed <= duels; seed++) {
    // Turn about on each side, so that the side is no part of it.
    const top = seed % 2 ? "left" : "right";
    const low = top === "left" ? "right" : "left";
    const s = createDuelState({ arena: 1 + (seed % 5), seed, [top]: gradeStart(5, seed), [low]: gradeStart(1, seed) });
    while (s.phase !== "over") {
      assert.equal(s.phase, "buy");
      playTurn(s, top, 5);
      playTurn(s, low, 1);
      finishRound(s);
      assert.ok(s.round <= 5);
    }
    if (s.winner === top) wins++;
  }
  assert.ok(wins >= duels * 0.8, `grade 5 won ${wins} of ${duels}`);
});

// ------------------------------------------------------------ the grades, tuned

test("against rockets the top grade sends fast units, and no tanks", () => {
  for (let seed = 1; seed <= 10; seed++) {
    const rockets = secondRound(["rocket", "rocket", "rocket"], 200);
    const buys = bought(planTurn(duelView(rockets, "left"), "left", 5, dice(seed)));
    assert.ok(buys.includes("motorcycle") || buys.includes("buggy"), `seed ${seed}: fast units against rockets (${buys})`);
    assert.ok(!buys.includes("tank"), `seed ${seed}: no tanks against rockets (${buys})`);
  }
});

test("each grade beats the one before it more often than not", () => {
  for (let grade = 2; grade <= 5; grade++) {
    let wins = 0;
    const duels = 20;
    for (let seed = 1; seed <= duels; seed++) {
      const top = seed % 2 ? "left" : "right";
      const low = top === "left" ? "right" : "left";
      const s = createDuelState({ arena: 1 + (seed % 5), seed, [top]: gradeStart(grade, seed), [low]: gradeStart(grade - 1, seed) });
      while (s.phase !== "over") {
        playTurn(s, top, grade);
        playTurn(s, low, grade - 1);
        finishRound(s);
      }
      if (s.winner === top) wins++;
    }
    assert.ok(wins > duels / 2, `grade ${grade} won ${wins} of ${duels} against grade ${grade - 1}`);
  }
});
