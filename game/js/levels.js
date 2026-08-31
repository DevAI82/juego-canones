// Per-level map data: which road(s) vehicles follow, where soldiers can
// roam between, and which background image to draw. Kept separate from
// map.js's generic path utilities (offsetPath/distanceToPath/drawMap work
// on whatever path array they're given, level-agnostic) and from the
// level 1 trench's own waypoints, which stay in map.js as PATH for
// backward compatibility with anything that imported it directly.
import { PATH as LEVEL1_PATH, CANVAS_WIDTH, CANVAS_HEIGHT } from "./map.js";

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

// Level 3: a large scrollable base-defense map, per user request ("un
// mapa grande, que se pueda hacer scroll... cada carretera la pueden usar
// los enemigos"). Unlike levels 1/2 (whose map image IS the 1200x750
// viewport), this map ships at its own real 2048x2048 size (see
// map_bg_level3.jpg / tools/extract_assets.py's extract_map_level3) and
// main.js scrolls a 1200x750 camera window over it instead of squashing
// the whole thing to fit -- see worldWidth/worldHeight below, read by
// main.js to size that camera's scroll bounds.
//
// The image (AI-generated -- see the conversation for why: the user's own
// reference images turned out to be Command & Conquer 3 game assets,
// which aren't ours to ship) shows a walled garden compound in the
// bottom-left corner -- that's the base -- fed by three separate roads
// converging on it from the north, east and west, exactly matching the
// user's ask that "cada carretera la pueden usar los enemigos" and that
// the garden is "dónde tienen que dirigirse los enemigos". Traced by
// overlaying a labeled pixel grid on the generated image (see the
// conversation) and reading waypoints off it directly -- there's no
// user-drawn reference for this level the way levels 1/2 had, so exact
// road-pixel tracing isn't the point the way it was there; these
// waypoints just have to read as plausible routes through the scene.
const LEVEL3_WORLD_SIZE = 2048;

// The north and east approaches both funnel through the same central
// crossroads and then down the same final stretch into the compound's
// north-east gate -- mirrors level 2's fork-then-shared-tail structure.
const LEVEL3_SHARED_TAIL = [
  { x: 1000, y: 980 },
  { x: 900, y: 1080 },
  { x: 800, y: 1180 },
  { x: 720, y: 1280 },
  { x: 620, y: 1380 },
  { x: 520, y: 1460 },
  { x: 430, y: 1540 },
  { x: 400, y: 1620 },
];

const LEVEL3_NORTH_PATH = [
  { x: 1550, y: -30 },
  { x: 1500, y: 150 },
  { x: 1420, y: 320 },
  { x: 1330, y: 470 },
  { x: 1220, y: 620 },
  { x: 1100, y: 780 },
  ...LEVEL3_SHARED_TAIL,
];

const LEVEL3_EAST_PATH = [
  { x: 2090, y: 1550 },
  { x: 1830, y: 1560 },
  { x: 1600, y: 1500 },
  { x: 1380, y: 1440 },
  { x: 1150, y: 1350 },
  { x: 950, y: 1250 },
  ...LEVEL3_SHARED_TAIL.slice(2), // rejoins the tail at (800, 1180)
];

// Fully independent third approach, entering from the west and reaching
// the compound's own south gate -- not a branch of the shared tail, a
// genuinely separate road so all three stay useful throughout a wave
// instead of two of them just being cosmetic variants of one chokepoint.
const LEVEL3_WEST_PATH = [
  { x: -30, y: 120 },
  { x: 0, y: 130 },
  { x: 120, y: 200 },
  { x: 250, y: 270 },
  { x: 380, y: 350 },
  { x: 470, y: 430 },
  { x: 350, y: 600 },
  { x: 200, y: 800 },
  { x: 100, y: 1000 },
  { x: 60, y: 1300 },
  { x: 60, y: 1600 },
  { x: 150, y: 1850 },
  { x: 300, y: 1930 },
  { x: 430, y: 1900 },
];

// Generated as a staggered grid (130px spacing) across the whole
// 2048x2048 map, kept only where it clears every road by 55px+ AND
// doesn't land on a rooftop or the compound's moat (sampled from the
// image's own pixel colors -- low-saturation gray/slate patches and
// dark blue-tinted patches respectively). No hand-drawn reference exists
// for this level the way levels 1/2 had, so this reproduces the same
// "dense, even, road-avoiding" coverage those got by hand, automatically
// -- see the conversation for the generation script.
const LEVEL3_BUILD_SLOTS = [
  { x: 40, y: 40 }, { x: 170, y: 40 }, { x: 430, y: 40 }, { x: 690, y: 40 }, { x: 820, y: 40 }, { x: 1210, y: 40 },
  { x: 235, y: 170 }, { x: 495, y: 170 }, { x: 625, y: 170 }, { x: 1795, y: 170 }, { x: 1925, y: 170 }, { x: 40, y: 300 },
  { x: 430, y: 300 }, { x: 560, y: 300 }, { x: 690, y: 300 }, { x: 950, y: 300 }, { x: 1080, y: 300 }, { x: 1210, y: 300 },
  { x: 1600, y: 300 }, { x: 1990, y: 300 }, { x: 105, y: 430 }, { x: 235, y: 430 }, { x: 365, y: 430 }, { x: 625, y: 430 },
  { x: 755, y: 430 }, { x: 885, y: 430 }, { x: 1015, y: 430 }, { x: 1275, y: 430 }, { x: 1665, y: 430 }, { x: 1795, y: 430 },
  { x: 170, y: 560 }, { x: 300, y: 560 }, { x: 560, y: 560 }, { x: 690, y: 560 }, { x: 820, y: 560 }, { x: 1340, y: 560 },
  { x: 1730, y: 560 }, { x: 1860, y: 560 }, { x: 1990, y: 560 }, { x: 105, y: 690 }, { x: 495, y: 690 }, { x: 625, y: 690 },
  { x: 885, y: 690 }, { x: 1405, y: 690 }, { x: 1665, y: 690 }, { x: 1795, y: 690 }, { x: 300, y: 820 }, { x: 430, y: 820 },
  { x: 560, y: 820 }, { x: 690, y: 820 }, { x: 820, y: 820 }, { x: 950, y: 820 }, { x: 1340, y: 820 }, { x: 1470, y: 820 },
  { x: 1600, y: 820 }, { x: 1730, y: 820 }, { x: 235, y: 950 }, { x: 365, y: 950 }, { x: 495, y: 950 }, { x: 625, y: 950 },
  { x: 885, y: 950 }, { x: 1275, y: 950 }, { x: 1795, y: 950 }, { x: 170, y: 1080 }, { x: 430, y: 1080 }, { x: 560, y: 1080 },
  { x: 690, y: 1080 }, { x: 1210, y: 1080 }, { x: 1340, y: 1080 }, { x: 235, y: 1210 }, { x: 365, y: 1210 }, { x: 495, y: 1210 },
  { x: 1015, y: 1210 }, { x: 1145, y: 1210 }, { x: 1275, y: 1210 }, { x: 1405, y: 1210 }, { x: 1535, y: 1210 }, { x: 1665, y: 1210 },
  { x: 1795, y: 1210 }, { x: 1925, y: 1210 }, { x: 300, y: 1340 }, { x: 430, y: 1340 }, { x: 820, y: 1340 }, { x: 950, y: 1340 },
  { x: 1470, y: 1340 }, { x: 1600, y: 1340 }, { x: 1730, y: 1340 }, { x: 1860, y: 1340 }, { x: 1990, y: 1340 }, { x: 235, y: 1470 },
  { x: 365, y: 1470 }, { x: 625, y: 1470 }, { x: 755, y: 1470 }, { x: 885, y: 1470 }, { x: 1145, y: 1470 }, { x: 1795, y: 1470 },
  { x: 1925, y: 1470 }, { x: 170, y: 1600 }, { x: 690, y: 1600 }, { x: 950, y: 1600 }, { x: 1080, y: 1600 }, { x: 1210, y: 1600 },
  { x: 1730, y: 1600 }, { x: 235, y: 1730 }, { x: 365, y: 1730 }, { x: 495, y: 1730 }, { x: 625, y: 1730 }, { x: 885, y: 1730 },
  { x: 1015, y: 1730 }, { x: 1145, y: 1730 }, { x: 1275, y: 1730 }, { x: 1535, y: 1730 }, { x: 1665, y: 1730 }, { x: 1795, y: 1730 },
  { x: 1925, y: 1730 }, { x: 40, y: 1860 }, { x: 300, y: 1860 }, { x: 560, y: 1860 }, { x: 690, y: 1860 }, { x: 950, y: 1860 },
  { x: 1210, y: 1860 }, { x: 1470, y: 1860 }, { x: 1600, y: 1860 }, { x: 1730, y: 1860 }, { x: 1990, y: 1860 }, { x: 105, y: 1990 },
  { x: 235, y: 1990 }, { x: 365, y: 1990 }, { x: 495, y: 1990 }, { x: 625, y: 1990 }, { x: 755, y: 1990 }, { x: 885, y: 1990 },
  { x: 1015, y: 1990 }, { x: 1145, y: 1990 }, { x: 1275, y: 1990 }, { x: 1535, y: 1990 }, { x: 1665, y: 1990 }, { x: 1795, y: 1990 },
  { x: 1925, y: 1990 },
];

export const MAX_LEVEL = 3;

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
    // Every level carries its own world size explicitly (rather than
    // main.js falling back to the viewport's own CANVAS_WIDTH/HEIGHT
    // whenever it's absent) so the camera-scroll code has one thing to
    // read regardless of level -- here it's just the viewport itself,
    // i.e. this level never scrolls.
    worldWidth: CANVAS_WIDTH,
    worldHeight: CANVAS_HEIGHT,
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
    worldWidth: CANVAS_WIDTH,
    worldHeight: CANVAS_HEIGHT,
  },
  3: {
    paths: [LEVEL3_NORTH_PATH, LEVEL3_EAST_PATH, LEVEL3_WEST_PATH],
    // The north branch's start and the shared tail's end (the garden's
    // north-east gate) -- same representative-pair convention as level 2;
    // soldiers roam the whole world regardless (see map.js's randomPath).
    soldierEntry: LEVEL3_NORTH_PATH[0],
    soldierExit: LEVEL3_SHARED_TAIL.at(-1),
    mapImage: "assets/map_bg_level3.jpg",
    buildSlots: LEVEL3_BUILD_SLOTS,
    worldWidth: LEVEL3_WORLD_SIZE,
    worldHeight: LEVEL3_WORLD_SIZE,
  },
};

export function levelData(level) {
  return LEVELS[level] || LEVELS[1];
}
