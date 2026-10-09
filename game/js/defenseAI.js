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
import { upgradeCost, canUpgrade, UPGRADE_DEFS } from "./upgrades.js";
import { towerDps } from "./ai.js";
import { attackMapOf, pointAlong, routeLength } from "./roadGraph.js";
import { entrySafePoints, ENTRY_SAFE_ROAD, BASE_APPROACH } from "./entryRoads.js";

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
const BASE_PULL = 2;
const BASE_PULL_REACH = 600; // px from the base over which that pull fades out

// The entries' safe stretch (entryRoads.js): simulate.js refuses any tower
// or range upgrade that would reach it, and the plan below leaves those
// options out from the start.
export { ENTRY_SAFE_ROAD, BASE_APPROACH };

// The level's roads as points every SAMPLE_STEP px, each worth 1 per road
// to the base it lies on -- a stretch several roads share is worth more --
// and the extra streets half, all worth up to 1 + BASE_PULL times as much
// the nearer the base they are (every attacker has to come that way in the
// end: bot games on level 3, whose roads only meet at the fortress, were won
// in round 2 through whichever approach the towers had left open); and, for
// each build slot, which points each tower type would have in range. Worked
// out once per level.
const plans = new WeakMap();
function planOf(level) {
  if (plans.has(level)) return plans.get(level);
  const samples = [];
  const { base } = attackMapOf(level);
  const add = (line, weight) => {
    const len = routeLength(line);
    for (let s = SAMPLE_STEP / 2; s < len; s += SAMPLE_STEP) {
      const p = pointAlong(line, s);
      const pull = 1 + BASE_PULL * Math.max(0, 1 - Math.hypot(p.x - base.x, p.y - base.y) / BASE_PULL_REACH);
      samples.push({ x: p.x, y: p.y, weight: weight * pull });
    }
  };
  for (const route of attackMapOf(level).routes) add(route, 1);
  for (const street of level.streets || []) add(street, 0.5);
  const safe = entrySafePoints(level);
  const reach = level.buildSlots.map((slot) => {
    const byType = {};
    for (const [type, def] of Object.entries(TOWER_TYPES)) {
      // A tower of this type here would reach the entries' safe road: not allowed.
      if (safe.some((p) => Math.hypot(p.x - slot.x, p.y - slot.y) <= def.range)) {
        byType[type] = null;
        continue;
      }
      byType[type] = [];
      samples.forEach((p, k) => {
        if (Math.hypot(p.x - slot.x, p.y - slot.y) <= def.range) byType[type].push(k);
      });
    }
    return byType;
  });
  const plan = { samples, reach, safe };
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

// How much further than its own reach from an attacking unit a new tower
// must go up: closer, it would be shot down while being built (bot games:
// Difficult, chasing the army, lost most of what it built in battle).
const BUILD_CLEARANCE = 20;

// New towers it could build, best first: for each type it can afford and
// still add, each free slot out of the army's reach, its worth -- the road
// in the type's range, each point counting less the better it's covered
// already -- times the type's firepower per dollar.
function buildOptions(state, plan, w) {
  const cover = coverage(state, plan.samples);
  const army = state.enemies.filter((u) => u.alive);
  const counts = {};
  for (const t of state.towers) if (t.hp > 0) counts[t.type] = (counts[t.type] || 0) + 1;
  const options = [];
  for (const [type, def] of Object.entries(TOWER_TYPES)) {
    if (def.cost > state.economy.money || (counts[type] || 0) >= def.maxCount) continue;
    const perDollar = (def.damage * def.projectilesPerShot) / def.fireRate / def.cost;
    levelData(state.level).buildSlots.forEach((slot, i) => {
      if (state.towers.some((t) => t.hp > 0 && Math.hypot(t.x - slot.x, t.y - slot.y) < 20)) return;
      if (army.some((u) => Math.hypot(u.x - slot.x, u.y - slot.y) <= u.fireRange + BUILD_CLEARANCE)) return;
      if (!plan.reach[i][type]) return; // it would reach an entry's road (ENTRY_SAFE_ROAD)
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
      // A longer reach mustn't take it over an entry's safe road either.
      if (skill === "range") {
        const range = TOWER_TYPES[t.type].range * UPGRADE_DEFS.range.mult ** (t.level.range + 1);
        if (plan.safe.some((p) => Math.hypot(p.x - t.x, p.y - t.y) <= range)) continue;
      }
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
// first distance ahead where blocks can go and a finished tower can fire on
// the units held up there (a wall no tower covers is just shot down: bot
// games had the defence pay for ~45 of those a game).
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
    const covered = state.towers.some((t) => t.hp > 0 && !(t.buildTimeRemaining > 0) && Math.hypot(t.x - p.x, t.y - p.y) <= t.range);
    if (!covered) continue;
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
