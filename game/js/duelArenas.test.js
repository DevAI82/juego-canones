import { test } from "node:test";
import assert from "node:assert/strict";
import { ARENA, ZONES, DUEL_ARENAS, arenaOf, mirrorX } from "./duelArenas.js";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const gameDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("there are five arenas, one a league, in order", () => {
  assert.deepEqual(DUEL_ARENAS.map((a) => a.id), [1, 2, 3, 4, 5]);
  assert.deepEqual(DUEL_ARENAS.map((a) => a.league), ["Arena", "Hierro", "Bronce", "Plata", "Oro"]);
});

test("the two zones mirror each other and leave the middle free", () => {
  assert.equal(ZONES.right.x0, mirrorX(ZONES.left.x1));
  assert.equal(ZONES.right.x1, mirrorX(ZONES.left.x0));
  assert.equal(ZONES.right.y0, ZONES.left.y0);
  assert.equal(ZONES.right.y1, ZONES.left.y1);
  assert.ok(ZONES.left.x1 < ARENA.width / 2);
});

test("every arena has 3 to 7 obstacles, inside it and apart from each other", () => {
  for (const arena of DUEL_ARENAS) {
    const obs = arena.obstacles;
    assert.ok(obs.length >= 3 && obs.length <= 7, `arena ${arena.id} has ${obs.length}`);
    for (const o of obs) {
      assert.ok(o.x - o.r >= 0 && o.x + o.r <= ARENA.width && o.y - o.r >= 0 && o.y + o.r <= ARENA.height, `arena ${arena.id}: inside`);
    }
    for (let i = 0; i < obs.length; i++) {
      for (let j = i + 1; j < obs.length; j++) {
        const gap = Math.hypot(obs[i].x - obs[j].x, obs[i].y - obs[j].y) - obs[i].r - obs[j].r;
        // Wide enough for the biggest unit to pass between two of them.
        assert.ok(gap >= 48, `arena ${arena.id}: obstacles ${i} and ${j} are ${gap} apart`);
      }
    }
  }
});

test("every obstacle has its mirror image: neither side has the better ground", () => {
  for (const arena of DUEL_ARENAS) {
    for (const o of arena.obstacles) {
      const twin = arena.obstacles.find((p) => p.x === mirrorX(o.x) && p.y === o.y && p.r === o.r);
      assert.ok(twin, `arena ${arena.id}: obstacle at ${o.x},${o.y} has no twin`);
    }
  }
});

test("each zone keeps room to deploy an army", () => {
  for (const arena of DUEL_ARENAS) {
    for (const zone of Object.values(ZONES)) {
      let places = 0;
      let free = 0;
      for (let x = zone.x0 + 20; x <= zone.x1 - 20; x += 40) {
        for (let y = zone.y0 + 20; y <= zone.y1 - 20; y += 40) {
          places++;
          if (arena.obstacles.every((o) => Math.hypot(o.x - x, o.y - y) > o.r + 16)) free++;
        }
      }
      assert.ok(free / places >= 0.6, `arena ${arena.id}: ${free} of ${places} places free`);
    }
  }
});

test("an unknown arena is the first one", () => {
  assert.equal(arenaOf(3).id, 3);
  assert.equal(arenaOf(99).id, 1);
  assert.equal(arenaOf(undefined).id, 1);
});

test("an arena with its picture made has its ground and its foreground in the game", () => {
  assert.equal(arenaOf(1).image, "assets/maps/duel1.jpg");
  assert.equal(arenaOf(1).foreground, "assets/maps/duel1_fg.webp");
  for (const arena of DUEL_ARENAS) {
    // Both or neither: an arena without them is drawn plain (duelDraw.js).
    assert.equal(Boolean(arena.image), Boolean(arena.foreground), `arena ${arena.id}`);
    for (const file of [arena.image, arena.foreground]) {
      if (file) assert.ok(existsSync(path.join(gameDir, file)), `${file} is missing`);
    }
  }
});
