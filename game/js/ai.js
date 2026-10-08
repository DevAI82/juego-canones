// Enemy decision-making, DOM-free so simulate.js runs it identically in
// solo play and on the LAN co-op server. Per user request ("mejorar la
// inteligencia de los enemigos"): enemies used to pick a road at random,
// wander at random (soldiers) and always shoot the nearest tower. Now:
//   - vehicles take the road the defense covers least (chooseRoute), and
//     escorts take the same road as the tank/rocket they escort;
//   - soldiers pick the least covered of several random routes, so they
//     flank around defended ground instead of walking through it;
//   - everyone focuses fire on the weakest tower in range, and on towers
//     still under construction (pickTowerTarget);
//   - rocket trucks stop out of the towers' reach and shell them from
//     there (holdsForSiege);
//   - soldiers sprint when shot at.
// Every choice keeps some randomness on purpose -- fully predictable
// enemies would all pile onto one road and be trivially walled off.

import { distanceToPath } from "./map.js";

// Sampling step along a path when measuring how much of it towers cover.
const COVERAGE_STEP = 24;

// A tower's damage output per second -- how dangerous it is to pass by.
export function towerDps(t) {
  return (t.damage * (t.projectilesPerShot || 1)) / t.fireRate;
}

// How much firepower a route runs through: for every COVERAGE_STEP of its
// length, the summed dps of each tower whose range covers that point
// (units: dps x px -- only ever compared between routes). Towers still
// under construction count too: they'll be shooting by the time the
// enemy gets there.
export function routeThreat(path, towers) {
  if (!towers.length) return 0;
  let threat = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i];
    const b = path[i + 1];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const steps = Math.max(1, Math.round(len / COVERAGE_STEP));
    for (let s = 0; s < steps; s++) {
      const f = (s + 0.5) / steps;
      const x = a.x + (b.x - a.x) * f;
      const y = a.y + (b.y - a.y) * f;
      for (const t of towers) {
        if (t.hp > 0 && Math.hypot(t.x - x, t.y - y) <= t.range) threat += towerDps(t) * (len / steps);
      }
    }
  }
  return threat;
}

// Softmin temperature: about three basic towers' worth of road coverage
// (each ~20 dps over a ~250px chord of its range circle). A route that
// much more dangerous than the safest one gets about a third of its
// weight, before EXPLORE's flat share is added on top.
//
// This and EXPLORE are deliberately soft. Headless bot games (same bot,
// old AI vs new) showed a sharper choice -- nearly every vehicle on the
// weakest road -- turning level 3 from a comfortable win into a loss
// by wave ~12; at these values the enemies clearly favour weak spots
// while the overall difficulty only rises moderately.
export const ROUTE_THREAT_SCALE = 15000;

// Share of picks made uniformly at random regardless of threat, so even a
// heavily defended road still sees traffic.
const EXPLORE = 0.4;

// Picks an index into `costs`, favouring low cost: a softmin with
// temperature `scale`, blended with EXPLORE. `rand` is injectable so
// tests can be deterministic.
export function softminPick(costs, scale, rand = Math.random) {
  const n = costs.length;
  const min = Math.min(...costs);
  const weights = costs.map((c) => Math.exp(-(c - min) / scale));
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rand();
  for (let i = 0; i < n; i++) {
    r -= (1 - EXPLORE) * (weights[i] / total) + EXPLORE / n;
    if (r <= 0) return i;
  }
  return n - 1;
}

// Each of the player's wall blocks (walls.js) across a route counts as
// this much extra threat -- about a basic tower's worth: whatever drives
// into one is stuck there under fire until it shoots its way through.
const BARRIER_THREAT = 6000;
const BARRIER_REACH = 36; // px from a route's line that a block still gets in the way

export function routeBlockage(path, barriers) {
  let n = 0;
  for (const w of barriers) if (w.hp > 0 && distanceToPath(path, w.x, w.y) < BARRIER_REACH) n++;
  return n * BARRIER_THREAT;
}

// Index of the route to take among `paths`, weighted toward the ones the
// towers cover least and the player's walls (`barriers`) don't block.
export function chooseRoute(paths, towers, rand = Math.random, barriers = []) {
  if (paths.length === 1) return 0;
  return softminPick(paths.map((p) => routeThreat(p, towers) + routeBlockage(p, barriers)), ROUTE_THREAT_SCALE, rand);
}

// How many random routes (map.js's randomPath) a soldier weighs before
// picking one with chooseRoute.
export const SOLDIER_ROUTE_CANDIDATES = 3;

// Which tower an enemy shoots at, among those in its fireRange: the one
// closest to falling (lowest hp fraction), with towers still under
// construction moved up the list -- so a group of enemies focuses fire
// instead of spreading it, and a tower placed in their path gets punished
// before it can shoot back. Distance only breaks near-ties.
export function pickTowerTarget(enemy, towers) {
  let best = null;
  let bestScore = Infinity;
  for (const t of towers) {
    if (t.hp <= 0) continue;
    const d = Math.hypot(t.x - enemy.x, t.y - enemy.y);
    if (d <= enemy.fireRange) {
      const hpFrac = t.maxHp ? t.hp / t.maxHp : 1;
      const building = t.buildTimeRemaining > 0 ? 0.5 : 0;
      const score = hpFrac - building + (d / enemy.fireRange) * 0.25;
      if (score < bestScore) {
        best = t;
        bestScore = score;
      }
    }
  }
  return best;
}

// Rocket trucks out-range every tower but the laser. One that has a tower
// in its sights from a spot no finished tower can reach stops there and
// shells it -- for at most ROCKET_SIEGE_TIME seconds over its whole life,
// so a siege is a threat the player has to answer (a laser, or range
// upgrades) but can never stall a wave indefinitely. Never while still
// near the map edge, where the player couldn't see what's hitting them.
export const ROCKET_SIEGE_TIME = 6;
const SIEGE_EDGE_MARGIN = 40;

export function holdsForSiege(e, towers, dt, worldWidth, worldHeight) {
  e.holding = false;
  if (e.type !== "rocket" || !(e.siegeLeft > 0)) return false;
  if (e.x < SIEGE_EDGE_MARGIN || e.y < SIEGE_EDGE_MARGIN) return false;
  if (e.x > worldWidth - SIEGE_EDGE_MARGIN || e.y > worldHeight - SIEGE_EDGE_MARGIN) return false;
  if (!pickTowerTarget(e, towers)) return false;
  const covered = towers.some((t) => t.hp > 0 && !(t.buildTimeRemaining > 0) && Math.hypot(t.x - e.x, t.y - e.y) <= t.range);
  if (covered) return false;
  e.siegeLeft = Math.max(0, e.siegeLeft - dt);
  e.holding = true;
  return true;
}

// A soldier that gets hit breaks into a short sprint to get out of the
// line of fire (enemy.js's damageEnemy/stepEnemy), then needs to recover
// before it can sprint again: SOLDIER_SPRINT_COOLDOWN counts from the
// start of the sprint. Without the cooldown, soldiers under steady fire
// sprinted nonstop, and they were already what leaks most on the open
// maps -- the bot games lost a third of their waves on level 2.
export const SOLDIER_SPRINT_TIME = 1;
export const SOLDIER_SPRINT_MULT = 1.3;
export const SOLDIER_SPRINT_COOLDOWN = 3;
