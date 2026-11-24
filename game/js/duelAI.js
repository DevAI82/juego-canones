// The computer opponent of the duel minigame (docs/2026-11-22-duelo-
// design.md §7). It plays a side with the very actions a person has --
// buy, upgrade, place, «¡Listo!» -- and decides them from what a person
// would see (duel.js's duelView): its own side, and of the rival only the
// army it fielded in the last fight.
//
// It has five grades, one a league. A higher grade starts with more (money
// and free skill levels), buys against what the rival fielded, puts money
// in upgrades and sets its army in a formation.
import {
  DUEL_ORDER,
  DUEL_UNITS,
  SKILLS,
  UNIT_CAP,
  otherSide,
  buyUnit,
  moveUnit,
  upgradeUnit,
  upgradeCost,
  setReady,
  duelView,
  duelRandom,
} from "./duel.js";
import { ZONES } from "./duelArenas.js";

// money: what it starts the duel with. freeLevels: skill levels it starts
// with. counter: how much the rival's last army weighs in what it buys
// (0: not at all; 1: fully). upgradeShare: the part of its money it keeps
// for upgrades from the second round. formation: whether it arranges its
// army (armour in front, rockets at the back) or leaves it as bought.
//
// Tuned with simulated careers (docs/2026-11-24-duelo-equilibrio-plan.md):
// a player who buys with some sense, starting each duel with what their
// profile has earned by then, wins about nine duels in ten in the first
// league and fewer in each one after -- about seven, six, five and, in the
// last, four or five; one who buys carelessly, from seven in ten down to
// three. A whole career, up to champion, is some 25 to 35 duels.
export const DUEL_GRADES = [
  { money: 95, freeLevels: 0, counter: 0, upgradeShare: 0, formation: false },
  { money: 135, freeLevels: 3, counter: 0.3, upgradeShare: 0.1, formation: false },
  { money: 165, freeLevels: 5, counter: 0.6, upgradeShare: 0.2, formation: true },
  { money: 190, freeLevels: 7, counter: 0.8, upgradeShare: 0.25, formation: true },
  { money: 220, freeLevels: 10, counter: 1, upgradeShare: 0.3, formation: true },
];

const gradeOf = (grade) => DUEL_GRADES[Math.max(1, Math.min(DUEL_GRADES.length, Math.floor(grade) || 1)) - 1];

// The skills a grade's free levels go to, in turn; the seed says where in
// the list it starts, so that the computer isn't the same every duel.
const FREE_PICKS = [
  ["tank", "armor"],
  ["rocket", "damage"],
  ["buggy", "rate"],
  ["tank", "damage"],
  ["soldier", "damage"],
  ["motorcycle", "speed"],
  ["rocket", "range"],
  ["buggy", "damage"],
];

// What a computer of this grade starts a duel with: its side's options
// for duel.js's createDuelState.
export function gradeStart(grade, seed = 0) {
  const { money, freeLevels } = gradeOf(grade);
  const free = {};
  const n = FREE_PICKS.length;
  const first = (((Math.floor(seed) || 0) % n) + n) % n;
  for (let i = 0; i < freeLevels; i++) {
    const [type, skill] = FREE_PICKS[(first + i) % n];
    free[type] = { ...free[type], [skill]: (free[type]?.[skill] || 0) + 1 };
  }
  return { money, free };
}

// ------------------------------------------------------------ what to buy

// How much it likes each unit, before looking at the rival.
const BASE_WEIGHT = { soldier: 1, motorcycle: 1, buggy: 1.2, tank: 1.2, rocket: 1 };
const JITTER = 0.6; // how much the dice move a careless grade's likings
const OWN_LEVELS = 0.1; // more liking for a unit, a skill level it already has

// The part of an army's price that is in each type of unit.
function shares(army) {
  const value = Object.fromEntries(DUEL_ORDER.map((type) => [type, 0]));
  let total = 0;
  for (const u of army) {
    value[u.type] += DUEL_UNITS[u.type].price;
    total += DUEL_UNITS[u.type].price;
  }
  if (total > 0) for (const type of DUEL_ORDER) value[type] /= total;
  return value;
}

// How much it wants each unit this turn, as parts of 1.
function likings(view, side, grade, random) {
  const { counter } = grade;
  const mine = view.sides[side];
  const rival = shares(view.sides[otherSide(side)].army);
  const weight = {};
  for (const type of DUEL_ORDER) {
    // The dice are thrown for every unit and every grade, used or not, so
    // that a grade's turn doesn't depend on things it may not see.
    const roll = random() * 2 - 1;
    const levels = SKILLS.reduce((sum, skill) => sum + mine.upgrades[type][skill], 0);
    weight[type] = BASE_WEIGHT[type] * (1 + roll * JITTER * (1 - counter)) * (1 + OWN_LEVELS * levels);
  }
  // Against what the rival fielded, as the units beat each other (duel.js):
  // tanks for anything light, rockets for tanks (and for crowds of
  // soldiers), fast units for rockets -- and less of whatever the rival's
  // army eats: nothing light against armour, no tanks against rockets, few
  // rockets against fast units.
  const light = rival.motorcycle + rival.buggy;
  weight.rocket *= (1 + counter * (1.5 * rival.soldier + 3 * rival.tank)) * (1 - 0.8 * counter * light);
  weight.tank *= (1 + counter * 2 * (rival.soldier + light)) * (1 - 0.9 * counter * rival.rocket);
  weight.motorcycle *= (1 + counter * 3 * rival.rocket) * (1 - counter * rival.tank);
  weight.buggy *= (1 + counter * 2 * rival.rocket) * (1 - counter * rival.tank);
  weight.soldier *= (1 - counter * rival.tank) * (1 - 0.5 * counter * rival.rocket);
  const total = DUEL_ORDER.reduce((sum, type) => sum + weight[type], 0);
  for (const type of DUEL_ORDER) weight[type] /= total;
  return weight;
}

const UNWANTED = 0.02; // a unit it likes less than this, it doesn't buy

// ------------------------------------------------------------ where to stand

// A formation is three lines: armour in front (nearest the rival), the
// rest behind it with the motorcycles on the wings, rockets at the back.
const LINE_OF = { tank: 0, soldier: 1, buggy: 1, motorcycle: 1, rocket: 2 };
const LINE_DEPTH = [0, 70, 170]; // px behind the front of the zone
const LINE_GAP = 8; // px between two units of a line

// Where each unit of the army should stand: [{ unit, x, y }], front line
// first.
function formation(view, side) {
  const z = ZONES[side];
  const back = side === "left" ? -1 : 1; // the way from the front to the back
  const front = side === "left" ? z.x1 : z.x0;
  const middle = (z.y0 + z.y1) / 2;
  const spots = [];
  for (let line = 0; line < LINE_DEPTH.length; line++) {
    let units = view.sides[side].army.filter((u) => LINE_OF[u.type] === line);
    if (line === 1) {
      // Motorcycles on the wings: half above the others, half below.
      const bikes = units.filter((u) => u.type === "motorcycle");
      const others = units.filter((u) => u.type !== "motorcycle");
      const half = Math.ceil(bikes.length / 2);
      units = [...bikes.slice(0, half), ...others, ...bikes.slice(half)];
    }
    if (units.length === 0) continue;
    const widest = Math.max(...units.map((u) => DUEL_UNITS[u.type].radius));
    const step = 2 * widest + LINE_GAP;
    units.forEach((unit, k) => {
      const radius = DUEL_UNITS[unit.type].radius;
      spots.push({
        unit,
        x: front + back * (radius + 4 + LINE_DEPTH[line]),
        y: middle + (k - (units.length - 1) / 2) * step,
        back,
      });
    });
  }
  return spots;
}

// Places near a spot to try when it is taken or on an obstacle: sideways
// first, and never forwards, so that the lines keep their order.
const NEARBY = [];
for (const dx of [0, 14, 28, 40]) {
  for (const dy of [0, 14, -14, 28, -28, 42, -42, 56, -56, 70, -70]) NEARBY.push({ dx, dy });
}
NEARBY.sort((a, b) => Math.abs(a.dx) + Math.abs(a.dy) - (Math.abs(b.dx) + Math.abs(b.dy)));

// ------------------------------------------------------------ a turn

// The computer's whole turn of shopping, as a list of actions:
//   { type: "buy", unit }             a unit of that type
//   { type: "upgrade", unit, skill }
//   { type: "place", index, x, y }    the index-th unit of its army there
// decided from `view` alone (duelView(state, side)) and `random` (a
// function giving numbers from 0 to 1). The view is used as scratch paper:
// the actions are tried on it as they are decided, so it comes back
// changed.
export function planTurn(view, side, grade, random) {
  const g = gradeOf(grade);
  const mine = view.sides[side];
  const actions = [];
  const want = likings(view, side, g, random);

  // Units: towards an army whose price is shared out as it likes them,
  // buying each time the unit it is furthest short of.
  const forUpgrades = view.round >= 2 ? mine.money * g.upgradeShare : 0;
  let budget = mine.money - forUpgrades;
  const value = Object.fromEntries(DUEL_ORDER.map((type) => [type, 0]));
  for (const u of mine.army) value[u.type] += DUEL_UNITS[u.type].price;
  const worth = mine.army.reduce((sum, u) => sum + DUEL_UNITS[u.type].price, 0) + budget;
  while (mine.army.length < UNIT_CAP) {
    let best = null;
    let bestShort = -Infinity;
    for (const type of DUEL_ORDER) {
      const price = DUEL_UNITS[type].price;
      if (want[type] <= UNWANTED || price > budget) continue;
      const short = want[type] * worth - value[type];
      if (short > bestShort) {
        best = type;
        bestShort = short;
      }
    }
    if (!best || !buyUnit(view, side, best).ok) break;
    actions.push({ type: "buy", unit: best });
    value[best] += DUEL_UNITS[best].price;
    budget -= DUEL_UNITS[best].price;
  }

  // Upgrades, for the units it has most money in, the cheapest level each
  // time. With a full army there is nothing else to spend on.
  if (g.upgradeShare > 0) {
    let allowance = mine.army.length >= UNIT_CAP ? mine.money : Math.min(forUpgrades, mine.money);
    const ranked = DUEL_ORDER.filter((type) => value[type] > 0).sort((a, b) => value[b] - value[a]).slice(0, 2);
    for (let guard = 0; guard < 50; guard++) {
      let pick = null;
      for (const type of ranked) {
        for (const skill of ["damage", "armor", "rate", "range", "speed"]) {
          const cost = upgradeCost(view, side, type, skill);
          if (cost === null || cost > allowance) continue;
          if (!pick || cost < pick.cost) pick = { type, skill, cost };
        }
      }
      if (!pick || !upgradeUnit(view, side, pick.type, pick.skill).ok) break;
      actions.push({ type: "upgrade", unit: pick.type, skill: pick.skill });
      allowance -= pick.cost;
    }
  }

  // The formation. A unit's place may still be taken by one that hasn't
  // moved yet, so the list is gone through a few times.
  if (g.formation) {
    let pending = formation(view, side);
    for (let pass = 0; pass < 4 && pending.length > 0; pass++) {
      const later = [];
      for (const spot of pending) {
        const placed = NEARBY.some(({ dx, dy }) => {
          const x = spot.x + spot.back * dx;
          const y = spot.y + dy;
          if (!moveUnit(view, side, spot.unit.id, x, y).ok) return false;
          actions.push({ type: "place", index: mine.army.indexOf(spot.unit), x, y });
          return true;
        });
        if (!placed) later.push(spot);
      }
      pending = later;
    }
  }
  return actions;
}

// Plays the computer's turn of a duel's purchase: plans it from what this
// side may see, does it, and says «¡Listo!». Returns the actions the duel
// accepted.
export function playTurn(state, side, grade) {
  const plan = planTurn(duelView(state, side), side, grade, () => duelRandom(state));
  const done = [];
  for (const action of plan) {
    let result;
    if (action.type === "buy") result = buyUnit(state, side, action.unit);
    else if (action.type === "upgrade") result = upgradeUnit(state, side, action.unit, action.skill);
    else {
      const unit = state.sides[side].army[action.index];
      result = unit ? moveUnit(state, side, unit.id, action.x, action.y) : { ok: false };
    }
    if (result.ok) done.push(action);
  }
  setReady(state, side);
  return done;
}
