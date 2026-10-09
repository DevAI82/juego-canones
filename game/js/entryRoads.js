// The entries' safe stretch (docs/2026-10-09-modo-atacante-design.md §3.8;
// docs/2026-10-09-uno-contra-otro-design.md §6): in an attack the army must
// have somewhere to come in, so no tower may be built where it would reach
// the first ENTRY_SAFE_ROAD px of an entry's road -- where bought units
// arrive and line up -- nor have its range upgraded into it. Without it,
// units were shot as they arrived, before they could be given an order
// (bot games: whole armies lost while gathering). The stretch always ends
// BASE_APPROACH px of road short of the base, though, so the base's own
// approaches can be guarded: level 3's southern road is only 533 px long,
// and a full stretch from it reached inside the fortress (bot games:
// Normal lost almost every game there).
//
// It binds every defender alike: simulate.js's canPlaceTower and
// upgradeTower check it in an attack, whether the computer (defenseAI.js)
// or a person is defending.
import { attackMapOf, pointAlong, routeLength } from "./roadGraph.js";

export const ENTRY_SAFE_ROAD = 320;
export const BASE_APPROACH = 400;
const STEP = 20; // px between the points of the stretch that are checked

// Points along each entry's safe stretch, worked out once per level.
const cache = new WeakMap();
export function entrySafePoints(level) {
  if (cache.has(level)) return cache.get(level);
  const points = [];
  for (const { route } of attackMapOf(level).entries) {
    const end = Math.min(ENTRY_SAFE_ROAD, routeLength(route) - BASE_APPROACH);
    for (let s = 0; s <= end; s += STEP) points.push(pointAlong(route, s));
  }
  cache.set(level, points);
  return points;
}

// Whether something at (x, y) reaching `range` px would reach a safe stretch.
export function reachesEntryRoad(level, x, y, range) {
  return entrySafePoints(level).some((p) => Math.hypot(p.x - x, p.y - y) <= range);
}
