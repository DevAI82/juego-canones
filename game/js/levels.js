// Per-level map data: which road(s) vehicles follow, where soldiers can
// roam between, and which background image to draw. Kept separate from
// map.js's generic path utilities (offsetPath/distanceToPath/drawMap work
// on whatever path array they're given, level-agnostic) and from the
// level 1 trench's own waypoints, which stay in map.js as PATH for
// backward compatibility with anything that imported it directly.
import { PATH as LEVEL1_PATH } from "./map.js";

// Level 2's road forks: two separate approaches (one entering from the
// upper-left ruins, one from the upper-right) that merge into a single
// shared road down to the fortified position at the bottom of the map --
// traced from the user's own mapa level 2.jpg. Vehicles are randomly
// assigned one branch or the other at spawn (see simulate.js's
// pathForSpawn), so the fork actually gets used instead of always
// funneling down just one side.
const LEVEL2_SHARED_TAIL = [
  { x: 700, y: 320 },
  { x: 650, y: 360 },
  { x: 615, y: 400 },
  { x: 595, y: 440 },
  { x: 585, y: 475 },
  { x: 575, y: 510 },
  { x: 565, y: 545 },
  { x: 555, y: 580 },
  { x: 550, y: 615 },
  { x: 550, y: 650 },
];

const LEVEL2_LEFT_PATH = [
  { x: -35.2, y: 9.8 },
  { x: 11.7, y: 44.1 },
  { x: 152.3, y: 102.9 },
  { x: 304.7, y: 156.9 },
  { x: 457.0, y: 191.2 },
  { x: 609.4, y: 220.6 },
  { x: 761.7, y: 245.1 },
  { x: 820.3, y: 272.5 },
  ...LEVEL2_SHARED_TAIL,
];

const LEVEL2_RIGHT_PATH = [
  { x: 1289.1, y: 137.3 },
  { x: 1119.1, y: 240.2 },
  { x: 1019.5, y: 256.9 },
  { x: 925.8, y: 276.5 },
  { x: 820.3, y: 313.7 },
  ...LEVEL2_SHARED_TAIL,
];

// Per user request (drawn directly on a screenshot of this level, then
// redrawn on an actual gameplay capture for precision after the first
// pass had drifted too far from their marks): fixed build slots -- a
// chain flanking the fork's inner curve, another following its outer/
// right side down toward the base, and two clusters guarding the base's
// approach. Unlike level 1's free placement (any point
// MIN_PLACEMENT_DIST_FROM_PATH+ off the road), a level with buildSlots
// restricts placement to just these points (see simulate.js's
// canPlaceTower) -- each one was nudged a few px off the user's exact
// marks where needed so every slot clears the road by a safe margin.
const LEVEL2_BUILD_SLOTS = [
  { x: 844, y: 193 }, { x: 600, y: 300 }, { x: 670, y: 282 },
  { x: 674, y: 408 }, { x: 638, y: 476 }, { x: 616, y: 553 },
  { x: 1037, y: 316 }, { x: 958, y: 359 }, { x: 889, y: 393 },
  { x: 827, y: 457 }, { x: 818, y: 543 }, { x: 818, y: 639 },
  { x: 351, y: 493 }, { x: 353, y: 573 }, { x: 419, y: 571 },
  { x: 360, y: 653 },
  { x: 599, y: 631 }, { x: 623, y: 623 }, { x: 542, y: 705 },
  { x: 610, y: 705 }, { x: 665, y: 705 },
];

// Level 1's own build slots, per the same user request applied to the
// original trench map -- their reference drawing covers the whole open
// field densely and fairly evenly, avoiding the road, which a hand-traced
// point list can't really improve on faithfully at that density. Instead
// this is a staggered grid (92px columns, 85px rows, alternating half-
// column offset per row) filtered to keep only points that clear the
// road by 48px+ -- reproducible via distanceToPath rather than ~70
// individually hand-picked coordinates, and it lands on the same dense,
// even coverage the drawing shows.
const LEVEL1_BUILD_SLOTS = [
  { x: 239, y: 55 }, { x: 331, y: 55 }, { x: 423, y: 55 }, { x: 515, y: 55 }, { x: 607, y: 55 },
  { x: 699, y: 55 }, { x: 791, y: 55 }, { x: 883, y: 55 }, { x: 975, y: 55 }, { x: 1067, y: 55 },
  { x: 101, y: 140 }, { x: 377, y: 140 }, { x: 469, y: 140 }, { x: 561, y: 140 }, { x: 653, y: 140 },
  { x: 745, y: 140 }, { x: 837, y: 140 }, { x: 929, y: 140 },
  { x: 55, y: 225 }, { x: 147, y: 225 }, { x: 239, y: 225 }, { x: 791, y: 225 }, { x: 883, y: 225 },
  { x: 1067, y: 225 },
  { x: 101, y: 310 }, { x: 193, y: 310 }, { x: 285, y: 310 }, { x: 377, y: 310 }, { x: 469, y: 310 },
  { x: 561, y: 310 }, { x: 745, y: 310 }, { x: 837, y: 310 }, { x: 1021, y: 310 }, { x: 1113, y: 310 },
  { x: 55, y: 395 }, { x: 147, y: 395 }, { x: 239, y: 395 }, { x: 331, y: 395 }, { x: 699, y: 395 },
  { x: 791, y: 395 }, { x: 975, y: 395 }, { x: 1067, y: 395 },
  { x: 101, y: 480 }, { x: 193, y: 480 }, { x: 285, y: 480 }, { x: 469, y: 480 }, { x: 561, y: 480 },
  { x: 653, y: 480 }, { x: 745, y: 480 }, { x: 929, y: 480 }, { x: 1021, y: 480 }, { x: 1113, y: 480 },
  { x: 55, y: 565 }, { x: 147, y: 565 }, { x: 239, y: 565 }, { x: 331, y: 565 }, { x: 883, y: 565 },
  { x: 975, y: 565 }, { x: 1067, y: 565 },
  { x: 101, y: 650 }, { x: 193, y: 650 }, { x: 285, y: 650 }, { x: 377, y: 650 }, { x: 469, y: 650 },
  { x: 561, y: 650 }, { x: 653, y: 650 }, { x: 745, y: 650 }, { x: 837, y: 650 }, { x: 929, y: 650 },
  { x: 1021, y: 650 }, { x: 1113, y: 650 },
];

export const MAX_LEVEL = 2;

export const LEVELS = {
  1: {
    // Vehicles only have one road here -- wrapped in an array so
    // pathForSpawn's "pick one of this level's paths" logic works the
    // same regardless of how many branches a level has.
    paths: [LEVEL1_PATH],
    soldierEntry: LEVEL1_PATH[0],
    soldierExit: LEVEL1_PATH.at(-1),
    mapImage: "assets/map_bg.png",
    buildSlots: LEVEL1_BUILD_SLOTS,
  },
  2: {
    paths: [LEVEL2_LEFT_PATH, LEVEL2_RIGHT_PATH],
    // Soldiers roam anywhere between an entry and exit point regardless
    // of which branch vehicles take -- the left branch's start and the
    // shared tail's end are as good a representative pair as any.
    soldierEntry: LEVEL2_LEFT_PATH[0],
    soldierExit: LEVEL2_SHARED_TAIL.at(-1),
    mapImage: "assets/map_bg_level2.png",
    buildSlots: LEVEL2_BUILD_SLOTS,
  },
};

export function levelData(level) {
  return LEVELS[level] || LEVELS[1];
}
