import { test } from "node:test";
import assert from "node:assert/strict";
import { entrySafePoints, reachesEntryRoad, ENTRY_SAFE_ROAD, BASE_APPROACH } from "./entryRoads.js";
import { attackMapOf, pointAlong, routeLength } from "./roadGraph.js";
import { LEVELS } from "./levels.js";
import { TOWER_TYPES } from "./tower.js";
import { createGameState, canPlaceTower, placeTower, upgradeTower } from "./simulate.js";
import { createAttackState } from "./attack.js";

// A build slot of `level` whose basic tower would reach an entry's safe
// stretch, and one whose tower wouldn't.
function slots(level) {
  const L = LEVELS[level];
  const range = TOWER_TYPES.basic.range;
  return {
    near: L.buildSlots.find((s) => reachesEntryRoad(L, s.x, s.y, range)),
    far: L.buildSlots.find((s) => !reachesEntryRoad(L, s.x, s.y, range * 1.15 ** 5)),
  };
}

test("an entry's safe stretch: its road's first 320 px, but never its last 400", () => {
  assert.equal(ENTRY_SAFE_ROAD, 320);
  assert.equal(BASE_APPROACH, 400);
  for (const level of [1, 2, 3, 4]) {
    const L = LEVELS[level];
    const points = entrySafePoints(L);
    assert.ok(points.length > 0);
    for (const { route } of attackMapOf(L).entries) {
      const len = routeLength(route);
      const start = pointAlong(route, 0);
      assert.ok(reachesEntryRoad(L, start.x, start.y, 1), `level ${level}: an entry's first point is in it`);
      const end = pointAlong(route, len - BASE_APPROACH + 30);
      if (len - BASE_APPROACH + 30 > ENTRY_SAFE_ROAD + 30) assert.equal(reachesEntryRoad(L, end.x, end.y, 1), false);
    }
  }
  // Level 3's southern road is only 533 px long: its stretch is 133 px.
  const short = attackMapOf(LEVELS[3]).entries.find((e) => routeLength(e.route) < 600);
  const past = pointAlong(short.route, 200);
  assert.equal(reachesEntryRoad(LEVELS[3], past.x, past.y, 1), false);
});

test("in an attack, no tower may go up where it would reach an entry's safe stretch -- whoever defends", () => {
  for (const level of [1, 2, 3, 4]) {
    const { near, far } = slots(level);
    assert.ok(near && far, `level ${level} has both kinds of slot`);
    const s = createAttackState(level, "normal", { aiSetup: false });
    s.economy.money = 1000;
    assert.deepEqual(canPlaceTower(s, "basic", near.x, near.y), { ok: false, reason: "entry-road" });
    assert.equal(placeTower(s, "basic", near.x, near.y).reason, "entry-road");
    assert.equal(canPlaceTower(s, "basic", far.x, far.y).ok, true);
  }
});

test("a defence game builds there as it always did", () => {
  const { near } = slots(2);
  const s = createGameState(2);
  s.economy.money = 1000;
  assert.equal(canPlaceTower(s, "basic", near.x, near.y).ok, true);
});

test("in an attack, a range upgrade that would reach an entry's safe stretch is refused", () => {
  // A slot just out of a basic tower's reach of the stretch, but in reach
  // of it with the range upgraded to the top.
  const L = LEVELS[2];
  const range = TOWER_TYPES.basic.range;
  const edge = L.buildSlots.find((sl) => !reachesEntryRoad(L, sl.x, sl.y, range) && reachesEntryRoad(L, sl.x, sl.y, range * 1.15 ** 5));
  assert.ok(edge, "level 2 has such a slot");
  const s = createAttackState(2, "normal", { aiSetup: false });
  s.economy.money = 5000;
  const { towerId } = placeTower(s, "basic", edge.x, edge.y);
  const t = s.towers.find((x) => x.id === towerId);
  let refused = null;
  for (let i = 0; i < 5 && !refused; i++) {
    const r = upgradeTower(s, towerId, "range");
    if (!r.ok) refused = r;
  }
  assert.deepEqual(refused, { ok: false, reason: "entry-road" });
  assert.equal(reachesEntryRoad(L, t.x, t.y, t.range), false);
  const d = createGameState(2);
  d.economy.money = 5000;
  const id = placeTower(d, "basic", edge.x, edge.y).towerId;
  for (let i = 0; i < 5; i++) assert.equal(upgradeTower(d, id, "range").ok, true);
});
