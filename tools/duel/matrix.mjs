// How armies of one kind of unit do against each other, at the same money:
//   node matrix.mjs <game dir> [budget ...]
// A row's army against each column's, over the five arenas and both sides:
// the share of fights the row wins.
import { pathToFileURL } from "node:url";
import path from "node:path";

const game = path.resolve(process.argv[2]);
const budgets = process.argv.slice(3).map(Number);
const load = (file) => import(pathToFileURL(path.join(game, "js", file)).href);
const { createDuelState, buyUnit, setReady, stepDuel, upgradeUnit, upgradeCost, SKILLS, STEP, DUEL_UNITS, DUEL_ORDER, UNIT_CAP } = await load("duel.js");

// An army for this money: as many of `type` as it buys (12 at most), and
// with what is left, soldiers.
function armyOf(type, budget) {
  const army = [];
  let money = budget;
  while (army.length < UNIT_CAP && money >= DUEL_UNITS[type].price) {
    army.push(type);
    money -= DUEL_UNITS[type].price;
  }
  while (army.length < UNIT_CAP && money >= DUEL_UNITS.soldier.price) {
    army.push("soldier");
    money -= DUEL_UNITS.soldier.price;
  }
  return army;
}

// What is left of the money after the army goes into upgrades of its main
// unit, the cheapest level each time: what a player with a full army does.
function spend(s, side, army, budget) {
  s.sides[side].money = budget;
  for (const type of army) buyUnit(s, side, type);
  const main = army[0];
  for (let guard = 0; guard < 40; guard++) {
    let pick = null;
    for (const skill of SKILLS) {
      const cost = upgradeCost(s, side, main, skill);
      if (cost !== null && cost <= s.sides[side].money && (!pick || cost < pick.cost)) pick = { skill, cost };
    }
    if (!pick) break;
    upgradeUnit(s, side, main, pick.skill);
  }
}

function fight(left, right, arena, seed) {
  const s = createDuelState({ arena, seed });
  spend(s, "left", left, BUDGET);
  spend(s, "right", right, BUDGET);
  setReady(s, "left");
  setReady(s, "right");
  let ticks = 0;
  while (s.phase === "combat") {
    stepDuel(s, STEP);
    ticks++;
  }
  return { winner: s.lastRound.winner, reason: s.lastRound.reason, seconds: ticks * STEP };
}

let BUDGET = 0;
for (const budget of budgets.length ? budgets : [100, 200, 350]) {
  BUDGET = budget;
  console.log(`\n$${budget}:  ` + DUEL_ORDER.map((t) => `${t.slice(0, 6)}(${armyOf(t, budget).filter((u) => u === t).length})`.padEnd(11)).join(""));
  for (const a of DUEL_ORDER) {
    const row = [];
    let total = 0;
    for (const b of DUEL_ORDER) {
      if (a === b) {
        row.push("   -      ");
        continue;
      }
      let wins = 0;
      let n = 0;
      let time = 0;
      for (let arena = 1; arena <= 5; arena++) {
        for (const flip of [false, true]) {
          const r = flip ? fight(armyOf(b, budget), armyOf(a, budget), arena, arena * 7 + 1) : fight(armyOf(a, budget), armyOf(b, budget), arena, arena * 7);
          if (r.winner === (flip ? "right" : "left")) wins++;
          n++;
          time += r.seconds;
        }
      }
      total += wins / n;
      row.push(`${String(Math.round((100 * wins) / n)).padStart(3)}% ${String(Math.round(time / n)).padStart(2)}s  `);
    }
    console.log(`${a.padEnd(11)} ${row.join("")}  mean ${Math.round((100 * total) / 4)}%`);
  }
}
