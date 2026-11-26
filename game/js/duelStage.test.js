import { test } from "node:test";
import assert from "node:assert/strict";
import { ARENA } from "./duelArenas.js";
import { STEP, buyUnit, setReady, duelView } from "./duel.js";
import { fightChart } from "./duelSongs.js";
import { TRACKS } from "./duelTracks.js";
import { HIT_WINDOW, createMusicalDuel, stepMusicalDuel, songClock } from "./duelRhythm.js";
import { TRACK } from "./duelRhythmDraw.js";
import { STAGE, stagePlaces, stagedView, armyHealth, danger } from "./duelStage.js";

// (As the musical duel's other tests: on the song written as notes.)
for (const id of Object.keys(TRACKS)) delete TRACKS[id];

function fight({ left = ["tank"], right = ["tank"], bots = {}, seed = 7 } = {}) {
  const s = createMusicalDuel({ arena: 1, seed, bots, left: { money: 5000 }, right: { money: 5000 } });
  for (const type of left) assert.ok(buyUnit(s, "left", type).ok, type);
  for (const type of right) assert.ok(buyUnit(s, "right", type).ok, type);
  setReady(s, "left");
  setReady(s, "right");
  stepMusicalDuel(s, STEP);
  return s;
}
const firstMiss = (s) => {
  const t = fightChart(1).notes[0].t + HIT_WINDOW + 3 * STEP;
  for (let i = 0; songClock(s) < t && i < 1e5; i++) stepMusicalDuel(s, STEP);
};
const TWELVE = ["tank", "tank", "rocket", "buggy", "buggy", "motorcycle", "motorcycle", "soldier", "soldier", "soldier", "tank", "buggy"];

test("the armies are shown either side of the track, clear of it and of the screen's edges", () => {
  assert.ok(STAGE.left.x0 >= 0 && STAGE.left.x1 <= TRACK.x0 - 10);
  assert.ok(STAGE.right.x0 >= TRACK.x1 + 10 && STAGE.right.x1 <= ARENA.width);
  assert.equal(STAGE.left.x1 - STAGE.left.x0, STAGE.right.x1 - STAGE.right.x0, "as much room for each");
  const s = fight({ left: TWELVE, right: ["soldier"] });
  const places = stagePlaces(s.units);
  for (const u of s.units) {
    const at = places.get(u.id);
    const strip = STAGE[u.side];
    const reach = u.radius * at.scale;
    assert.ok(at.x - reach >= strip.x0 && at.x + reach <= strip.x1, `${u.type} ${u.id} at ${at.x}`);
    assert.ok(at.y - reach >= STAGE.y0 && at.y + reach <= STAGE.y1, `${u.type} ${u.id} at y ${at.y}`);
  }
});

test("they are drawn bigger than they stand, and none on top of another", () => {
  const s = fight({ left: TWELVE, right: ["tank", "soldier"] });
  const places = stagePlaces(s.units);
  for (const u of s.units) assert.ok(places.get(u.id).scale >= 1.5, `${u.type}: ${places.get(u.id).scale}`);
  for (const a of s.units) {
    for (const b of s.units) {
      if (a.id >= b.id || a.side !== b.side) continue;
      const pa = places.get(a.id);
      const pb = places.get(b.id);
      assert.ok(Math.hypot(pa.x - pb.x, pa.y - pb.y) >= 60, `${a.id} and ${b.id} are ${Math.hypot(pa.x - pb.x, pa.y - pb.y)} apart`);
    }
  }
  // A small army is not stretched over the whole strip.
  const two = stagePlaces(fight({ left: ["tank", "tank"] }).units);
  const ys = [...two.values()].filter((p) => p.x < ARENA.width / 2).map((p) => p.y);
  assert.ok(Math.abs(ys[0] - ys[1]) <= 160);
});

test("what stands in front is shown nearest the track", () => {
  const s = fight({ left: TWELVE, right: TWELVE });
  const places = stagePlaces(s.units);
  const mid = ARENA.width / 2;
  for (const side of ["left", "right"]) {
    const army = s.units.filter((u) => u.side === side);
    const front = [...army].sort((a, b) => Math.abs(a.x - mid) - Math.abs(b.x - mid))[0];
    const back = [...army].sort((a, b) => Math.abs(b.x - mid) - Math.abs(a.x - mid))[0];
    assert.ok(Math.abs(places.get(front.id).x - mid) < Math.abs(places.get(back.id).x - mid), side);
  }
});

test("a unit keeps its place when another falls", () => {
  const s = fight({ left: ["tank", "tank", "tank", "tank", "tank", "tank"], right: ["soldier", "soldier", "soldier"], bots: { left: 1 } });
  const before = stagePlaces(s.units);
  firstMiss(s);
  assert.ok(s.units.some((u) => u.side === "right" && !u.alive), "one fell");
  const after = stagePlaces(s.units);
  for (const u of s.units) assert.deepEqual(after.get(u.id), before.get(u.id));
});

test("the view to draw has the armies and their shots where they are shown", () => {
  const s = fight({ left: ["tank"], right: ["soldier", "soldier"], bots: { left: 1 } });
  firstMiss(s);
  const view = duelView(s, "left");
  const staged = stagedView(view);
  const places = stagePlaces(view.units);
  assert.equal(staged.units.length, view.units.length);
  for (const u of staged.units) {
    const at = places.get(u.id);
    assert.deepEqual([u.x, u.y, u.scale], [at.x, at.y, at.scale]);
  }
  assert.equal(staged.shots.length, 1);
  const [shot] = staged.shots;
  assert.deepEqual(shot.from, { x: places.get(shot.fromId).x, y: places.get(shot.fromId).y });
  assert.deepEqual(shot.to, { x: places.get(shot.toId).x, y: places.get(shot.toId).y });
  assert.ok(shot.from.x < TRACK.x0 && shot.to.x > TRACK.x1, "it crosses the track");
  // The duel itself is as it was.
  assert.notDeepEqual(view.shots[0].from, shot.from);
  assert.equal(staged.musical, view.musical);
  assert.equal(staged.phase, view.phase);
});

test("an army's health is what it has left of what it started the round with", () => {
  const s = fight({ left: ["tank", "tank", "tank", "tank", "tank", "tank"], right: ["soldier", "soldier", "soldier"], bots: { left: 1 } });
  assert.equal(armyHealth(s, "left"), 1);
  assert.equal(armyHealth(s, "right"), 1);
  firstMiss(s);
  // Two soldiers of three fell to that volley (duelRhythm.test.js).
  assert.ok(Math.abs(armyHealth(s, "right") - 1 / 3) < 1e-9);
  assert.equal(armyHealth(s, "left"), 1);
  assert.equal(armyHealth({ units: [] }, "left"), 0);
});

test("the danger an army is in: none with half its health, all of it with none", () => {
  assert.equal(danger(1), 0);
  assert.equal(danger(0.5), 0);
  assert.ok(danger(0.4) > 0 && danger(0.4) < danger(0.2));
  assert.equal(danger(0), 1);
});
