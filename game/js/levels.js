// Per-level map data: which road(s) vehicles follow, where soldiers can
// roam between, and which background image to draw. Kept separate from
// map.js's generic path utilities (offsetPath/distanceToPath/drawMap work
// on whatever path array they're given, level-agnostic) and from the
// level 1 trench's own waypoints, which stay in map.js as PATH for
// backward compatibility with anything that imported it directly.
import {
  PATH as LEVEL1_PATH,
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  wallSegmentsWithGates,
  distanceToPath,
  pointInPolygon,
} from "./map.js";

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

// The fortress's own wall/moat around the garden compound, per user
// request ("la fortaleza sólo tiene 3 puertas... el resto es un muro que
// NO se debería poder traspasar ni por soldados ni por vehículos").
// Found by isolating the moat's dark-water pixels in the source image by
// color and reading off its corners (see the conversation) -- a
// rectangle with its north-east corner chamfered off, where the map art
// shows a bridge. LEVEL3_GATES are the 3 actual stone bridges crossing
// the moat, located the same way (zooming into the source image at each
// suspected crossing to confirm a bridge is really there).
// Corners found from the moat's dark-water pixels; the NE chamfer's own
// two corners are then adjusted (originally (700, 1480)) to lie exactly
// on the line through the actual gate bridge (635, 1367) found separately
// by zooming into the source image -- wallSegmentsWithGates only cuts a
// gap where a gate is genuinely ON its edge, so the corner and the gate
// have to agree with each other, not just each independently approximate
// the art.
const LEVEL3_WALL_CORNERS = [
  { x: 90, y: 1245 }, // NW
  { x: 490, y: 1245 }, // top edge, before the NE chamfer
  { x: 700, y: 1422 }, // after the NE chamfer
  { x: 810, y: 1930 }, // SE
  { x: 90, y: 1930 }, // SW
];
const LEVEL3_GATE_NE = { x: 635, y: 1367 }; // bridge across the chamfered corner
const LEVEL3_GATE_WEST = { x: 90, y: 1595 }; // bridge across the west wall
const LEVEL3_GATE_SOUTH = { x: 470, y: 1930 }; // bridge across the south wall
const LEVEL3_GATES = [LEVEL3_GATE_NE, LEVEL3_GATE_WEST, LEVEL3_GATE_SOUTH];
const LEVEL3_WALL_SEGMENTS = wallSegmentsWithGates(LEVEL3_WALL_CORNERS, LEVEL3_GATES);
const LEVEL3_WALL = { corners: LEVEL3_WALL_CORNERS, segments: LEVEL3_WALL_SEGMENTS, gates: LEVEL3_GATES };

// Where every road ultimately leads once inside the wall -- the
// courtyard in front of the central building. All 3 vehicle paths below
// end here (each via its own gate, never cutting through solid wall);
// soldiers' free-roamed routes are steered through a gate too, by
// map.js's randomPath (passed LEVEL3_WALL -- see LEVELS[3] below).
const LEVEL3_BASE_INTERIOR = { x: 430, y: 1600 };

// Each of the 3 roads is now a fully independent approach ending at its
// own real gate (no shared tail/fork the way level 2's two branches
// merge) -- per user request that only those 3 marked crossings are
// passable, every vehicle path has to actually go through one of them.
// 5 designated vehicle road routes extracted directly from the user's
// red road traces in "mapas/mapa nivel 3 carreteras.png". Vehicles strictly
// follow these road centerlines and never cross buildings, fields, or walls.
// Every route enters the defended fortress through one of its 3 stone bridge gates:
//
// The last stretch before each gate was re-traced against the map art so
// every road meets its bridge head-on, square to the wall: the traces ran
// alongside the moat into the bridge (and the north road's even dipped
// inside the wall just before it), so vehicles in the outer lanes -- and
// any rounding the corner into the bridge -- cut across solid wall. The
// two north-east roads now meet on the paved square in front of their
// bridge (LEVEL3_NE_APPROACH), the south-east one follows the dirt track
// along the moat to the south bridge, and the north-west one keeps to its
// track down the moat's west side instead of grazing the fortress corner.
const LEVEL3_NE_APPROACH = { x: 674, y: 1321 };

// 1. North Main Highway -> Gate NE (strictly bypasses building via west street)
export const LEVEL3_NORTH_MAIN_PATH = [
  { x: 512, y: -30 },
  { x: 512, y: 32 },
  { x: 498, y: 196 },
  { x: 356, y: 236 },
  { x: 313, y: 274 },
  { x: 467, y: 452 },
  { x: 660, y: 626 },
  { x: 526, y: 716 },
  { x: 469, y: 793 },
  { x: 437, y: 883 },
  { x: 468, y: 1161 },
  { x: 532, y: 1176 },
  { x: 575, y: 1220 },
  { x: 620, y: 1282 },
  LEVEL3_NE_APPROACH,
  LEVEL3_GATE_NE,
  { x: 500, y: 1480 },
  LEVEL3_BASE_INTERIOR,
];

// 2. North-East Highway -> Gate NE (strictly bypasses building via east paved boulevard)
export const LEVEL3_NORTHEAST_PATH = [
  { x: 2048, y: -30 },
  { x: 2007, y: 27 },
  { x: 1939, y: 84 },
  { x: 1795, y: 261 },
  { x: 1568, y: 443 },
  { x: 1393, y: 664 },
  { x: 1244, y: 756 },
  { x: 1142, y: 845 },
  { x: 1047, y: 995 },
  { x: 857, y: 1228 },
  { x: 785, y: 1280 },
  LEVEL3_NE_APPROACH,
  LEVEL3_GATE_NE,
  { x: 500, y: 1480 },
  LEVEL3_BASE_INTERIOR,
];

// 3. North-West Boulevard -> Gate West
export const LEVEL3_NORTHWEST_PATH = [
  { x: -30, y: 24 },
  { x: 45, y: 24 },
  { x: 115, y: 120 },
  { x: 299, y: 273 },
  { x: 197, y: 378 },
  { x: 81, y: 605 },
  { x: 100, y: 1016 },
  { x: 48, y: 1230 },
  { x: 47, y: 1594 },
  LEVEL3_GATE_WEST,
  { x: 250, y: 1600 },
  LEVEL3_BASE_INTERIOR,
];

// 4. South-East Highway -> Gate South
export const LEVEL3_SOUTHEAST_PATH = [
  { x: 2080, y: 2007 },
  { x: 2006, y: 2007 },
  { x: 1722, y: 1700 },
  { x: 1610, y: 1609 },
  { x: 1468, y: 1434 },
  { x: 1329, y: 1559 },
  { x: 1201, y: 1597 },
  { x: 1136, y: 1645 },
  { x: 914, y: 1906 },
  { x: 860, y: 1935 },
  { x: 843, y: 1982 },
  { x: 683, y: 2006 },
  { x: 478, y: 1992 },
  LEVEL3_GATE_SOUTH,
  { x: 430, y: 1750 },
  LEVEL3_BASE_INTERIOR,
];

// 5. South Direct Avenue -> Gate South
export const LEVEL3_SOUTH_PATH = [
  { x: 581, y: 2080 },
  { x: 581, y: 2005 },
  { x: 476, y: 2000 },
  LEVEL3_GATE_SOUTH,
  { x: 430, y: 1750 },
  LEVEL3_BASE_INTERIOR,
];

// Backward-compatibility aliases for tests
export const LEVEL3_NORTH_PATH = LEVEL3_NORTH_MAIN_PATH;
export const LEVEL3_EAST_PATH = LEVEL3_SOUTHEAST_PATH;
export const LEVEL3_WEST_PATH = LEVEL3_NORTHWEST_PATH;

// Dense tactical build slots distributed across the 2048x2048 map and inside the fortress base (589 slots)
const LEVEL3_BUILD_SLOTS = [
  { x: 135, y: 60 }, { x: 210, y: 60 }, { x: 285, y: 60 }, { x: 360, y: 60 }, { x: 435, y: 60 }, { x: 585, y: 60 }, { x: 660, y: 60 }, { x: 735, y: 60 },
  { x: 810, y: 60 }, { x: 885, y: 60 }, { x: 960, y: 60 }, { x: 1035, y: 60 }, { x: 1110, y: 60 }, { x: 1185, y: 60 }, { x: 1260, y: 60 }, { x: 1335, y: 60 },
  { x: 1410, y: 60 }, { x: 1485, y: 60 }, { x: 1560, y: 60 }, { x: 1635, y: 60 }, { x: 1710, y: 60 }, { x: 1785, y: 60 }, { x: 1860, y: 60 }, { x: 60, y: 135 },
  { x: 210, y: 135 }, { x: 285, y: 135 }, { x: 360, y: 135 }, { x: 435, y: 135 }, { x: 585, y: 135 }, { x: 660, y: 135 }, { x: 735, y: 135 }, { x: 810, y: 135 },
  { x: 885, y: 135 }, { x: 960, y: 135 }, { x: 1035, y: 135 }, { x: 1110, y: 135 }, { x: 1185, y: 135 }, { x: 1260, y: 135 }, { x: 1335, y: 135 }, { x: 1410, y: 135 },
  { x: 1485, y: 135 }, { x: 1560, y: 135 }, { x: 1635, y: 135 }, { x: 1710, y: 135 }, { x: 1785, y: 135 }, { x: 60, y: 210 }, { x: 135, y: 210 }, { x: 285, y: 210 },
  { x: 585, y: 210 }, { x: 660, y: 210 }, { x: 735, y: 210 }, { x: 810, y: 210 }, { x: 885, y: 210 }, { x: 960, y: 210 }, { x: 1035, y: 210 }, { x: 1110, y: 210 },
  { x: 1185, y: 210 }, { x: 1260, y: 210 }, { x: 1335, y: 210 }, { x: 1410, y: 210 }, { x: 1485, y: 210 }, { x: 1560, y: 210 }, { x: 1635, y: 210 }, { x: 1710, y: 210 },
  { x: 1785, y: 210 }, { x: 1935, y: 210 }, { x: 60, y: 285 }, { x: 135, y: 285 }, { x: 210, y: 285 }, { x: 435, y: 285 }, { x: 510, y: 285 }, { x: 585, y: 285 },
  { x: 660, y: 285 }, { x: 735, y: 285 }, { x: 810, y: 285 }, { x: 885, y: 285 }, { x: 960, y: 285 }, { x: 1035, y: 285 }, { x: 1110, y: 285 }, { x: 1185, y: 285 },
  { x: 1260, y: 285 }, { x: 1335, y: 285 }, { x: 1410, y: 285 }, { x: 1485, y: 285 }, { x: 1560, y: 285 }, { x: 1635, y: 285 }, { x: 1710, y: 285 }, { x: 1860, y: 285 },
  { x: 1935, y: 285 }, { x: 60, y: 360 }, { x: 135, y: 360 }, { x: 285, y: 360 }, { x: 435, y: 360 }, { x: 510, y: 360 }, { x: 585, y: 360 }, { x: 660, y: 360 },
  { x: 735, y: 360 }, { x: 810, y: 360 }, { x: 885, y: 360 }, { x: 960, y: 360 }, { x: 1035, y: 360 }, { x: 1110, y: 360 }, { x: 1185, y: 360 }, { x: 1260, y: 360 },
  { x: 1335, y: 360 }, { x: 1410, y: 360 }, { x: 1485, y: 360 }, { x: 1560, y: 360 }, { x: 1785, y: 360 }, { x: 1860, y: 360 }, { x: 1935, y: 360 }, { x: 60, y: 435 },
  { x: 210, y: 435 }, { x: 285, y: 435 }, { x: 360, y: 435 }, { x: 510, y: 435 }, { x: 585, y: 435 }, { x: 660, y: 435 }, { x: 735, y: 435 }, { x: 810, y: 435 },
  { x: 885, y: 435 }, { x: 960, y: 435 }, { x: 1035, y: 435 }, { x: 1110, y: 435 }, { x: 1185, y: 435 }, { x: 1260, y: 435 }, { x: 1335, y: 435 }, { x: 1410, y: 435 },
  { x: 1485, y: 435 }, { x: 1635, y: 435 }, { x: 1710, y: 435 }, { x: 1785, y: 435 }, { x: 1860, y: 435 }, { x: 1935, y: 435 }, { x: 60, y: 510 }, { x: 210, y: 510 },
  { x: 285, y: 510 }, { x: 360, y: 510 }, { x: 435, y: 510 }, { x: 585, y: 510 }, { x: 660, y: 510 }, { x: 735, y: 510 }, { x: 810, y: 510 }, { x: 885, y: 510 },
  { x: 960, y: 510 }, { x: 1035, y: 510 }, { x: 1110, y: 510 }, { x: 1185, y: 510 }, { x: 1260, y: 510 }, { x: 1335, y: 510 }, { x: 1410, y: 510 }, { x: 1560, y: 510 },
  { x: 1635, y: 510 }, { x: 1710, y: 510 }, { x: 1785, y: 510 }, { x: 1860, y: 510 }, { x: 1935, y: 510 }, { x: 135, y: 585 }, { x: 210, y: 585 }, { x: 285, y: 585 },
  { x: 360, y: 585 }, { x: 435, y: 585 }, { x: 510, y: 585 }, { x: 735, y: 585 }, { x: 810, y: 585 }, { x: 885, y: 585 }, { x: 960, y: 585 }, { x: 1035, y: 585 },
  { x: 1110, y: 585 }, { x: 1185, y: 585 }, { x: 1260, y: 585 }, { x: 1335, y: 585 }, { x: 1410, y: 585 }, { x: 1560, y: 585 }, { x: 1635, y: 585 }, { x: 1710, y: 585 },
  { x: 1785, y: 585 }, { x: 1860, y: 585 }, { x: 1935, y: 585 }, { x: 135, y: 660 }, { x: 210, y: 660 }, { x: 285, y: 660 }, { x: 360, y: 660 }, { x: 435, y: 660 },
  { x: 510, y: 660 }, { x: 735, y: 660 }, { x: 810, y: 660 }, { x: 885, y: 660 }, { x: 960, y: 660 }, { x: 1035, y: 660 }, { x: 1110, y: 660 }, { x: 1185, y: 660 },
  { x: 1260, y: 660 }, { x: 1335, y: 660 }, { x: 1485, y: 660 }, { x: 1560, y: 660 }, { x: 1635, y: 660 }, { x: 1710, y: 660 }, { x: 1785, y: 660 }, { x: 1860, y: 660 },
  { x: 1935, y: 660 }, { x: 135, y: 735 }, { x: 210, y: 735 }, { x: 285, y: 735 }, { x: 360, y: 735 }, { x: 435, y: 735 }, { x: 585, y: 735 }, { x: 660, y: 735 },
  { x: 735, y: 735 }, { x: 810, y: 735 }, { x: 885, y: 735 }, { x: 960, y: 735 }, { x: 1035, y: 735 }, { x: 1110, y: 735 }, { x: 1185, y: 735 }, { x: 1410, y: 735 },
  { x: 1485, y: 735 }, { x: 1560, y: 735 }, { x: 1635, y: 735 }, { x: 1710, y: 735 }, { x: 1785, y: 735 }, { x: 1860, y: 735 }, { x: 1935, y: 735 }, { x: 135, y: 810 },
  { x: 210, y: 810 }, { x: 285, y: 810 }, { x: 360, y: 810 }, { x: 510, y: 810 }, { x: 585, y: 810 }, { x: 660, y: 810 }, { x: 735, y: 810 }, { x: 810, y: 810 },
  { x: 885, y: 810 }, { x: 960, y: 810 }, { x: 1035, y: 810 }, { x: 1110, y: 810 }, { x: 1260, y: 810 }, { x: 1335, y: 810 }, { x: 1410, y: 810 }, { x: 1485, y: 810 },
  { x: 1560, y: 810 }, { x: 1635, y: 810 }, { x: 1710, y: 810 }, { x: 1785, y: 810 }, { x: 1860, y: 810 }, { x: 1935, y: 810 }, { x: 60, y: 885 }, { x: 135, y: 885 },
  { x: 210, y: 885 }, { x: 285, y: 885 }, { x: 360, y: 885 }, { x: 510, y: 885 }, { x: 585, y: 885 }, { x: 660, y: 885 }, { x: 735, y: 885 }, { x: 810, y: 885 },
  { x: 885, y: 885 }, { x: 960, y: 885 }, { x: 1035, y: 885 }, { x: 1185, y: 885 }, { x: 1260, y: 885 }, { x: 1335, y: 885 }, { x: 1410, y: 885 }, { x: 1485, y: 885 },
  { x: 1560, y: 885 }, { x: 1635, y: 885 }, { x: 1710, y: 885 }, { x: 1785, y: 885 }, { x: 1860, y: 885 }, { x: 1935, y: 885 }, { x: 60, y: 960 }, { x: 135, y: 960 },
  { x: 210, y: 960 }, { x: 285, y: 960 }, { x: 360, y: 960 }, { x: 510, y: 960 }, { x: 585, y: 960 }, { x: 660, y: 960 }, { x: 735, y: 960 }, { x: 810, y: 960 },
  { x: 885, y: 960 }, { x: 960, y: 960 }, { x: 1110, y: 960 }, { x: 1185, y: 960 }, { x: 1260, y: 960 }, { x: 1335, y: 960 }, { x: 1410, y: 960 }, { x: 1485, y: 960 },
  { x: 1560, y: 960 }, { x: 1635, y: 960 }, { x: 1710, y: 960 }, { x: 1785, y: 960 }, { x: 1860, y: 960 }, { x: 1935, y: 960 }, { x: 60, y: 1035 }, { x: 135, y: 1035 },
  { x: 210, y: 1035 }, { x: 285, y: 1035 }, { x: 360, y: 1035 }, { x: 510, y: 1035 }, { x: 585, y: 1035 }, { x: 660, y: 1035 }, { x: 735, y: 1035 }, { x: 810, y: 1035 },
  { x: 885, y: 1035 }, { x: 960, y: 1035 }, { x: 1110, y: 1035 }, { x: 1185, y: 1035 }, { x: 1260, y: 1035 }, { x: 1335, y: 1035 }, { x: 1410, y: 1035 }, { x: 1485, y: 1035 },
  { x: 1560, y: 1035 }, { x: 1635, y: 1035 }, { x: 1710, y: 1035 }, { x: 1785, y: 1035 }, { x: 1860, y: 1035 }, { x: 1935, y: 1035 }, { x: 135, y: 1110 }, { x: 210, y: 1110 },
  { x: 285, y: 1110 }, { x: 360, y: 1110 }, { x: 510, y: 1110 }, { x: 585, y: 1110 }, { x: 660, y: 1110 }, { x: 735, y: 1110 }, { x: 810, y: 1110 }, { x: 885, y: 1110 },
  { x: 1035, y: 1110 }, { x: 1110, y: 1110 }, { x: 1185, y: 1110 }, { x: 1260, y: 1110 }, { x: 1335, y: 1110 }, { x: 1410, y: 1110 }, { x: 1485, y: 1110 }, { x: 1560, y: 1110 },
  { x: 1635, y: 1110 }, { x: 1710, y: 1110 }, { x: 1785, y: 1110 }, { x: 1860, y: 1110 }, { x: 1935, y: 1110 }, { x: 135, y: 1185 }, { x: 210, y: 1185 }, { x: 285, y: 1185 },
  { x: 360, y: 1185 }, { x: 435, y: 1185 }, { x: 660, y: 1185 }, { x: 735, y: 1185 }, { x: 810, y: 1185 }, { x: 960, y: 1185 }, { x: 1035, y: 1185 }, { x: 1110, y: 1185 },
  { x: 1185, y: 1185 }, { x: 1260, y: 1185 }, { x: 1335, y: 1185 }, { x: 1410, y: 1185 }, { x: 1485, y: 1185 }, { x: 1560, y: 1185 }, { x: 1635, y: 1185 }, { x: 1710, y: 1185 },
  { x: 1785, y: 1185 }, { x: 1860, y: 1185 }, { x: 1935, y: 1185 }, { x: 135, y: 1260 }, { x: 210, y: 1260 }, { x: 285, y: 1260 }, { x: 360, y: 1260 }, { x: 435, y: 1260 },
  { x: 510, y: 1260 }, { x: 585, y: 1260 }, { x: 735, y: 1260 }, { x: 885, y: 1260 }, { x: 960, y: 1260 }, { x: 1035, y: 1260 }, { x: 1110, y: 1260 }, { x: 1185, y: 1260 },
  { x: 1260, y: 1260 }, { x: 1335, y: 1260 }, { x: 1410, y: 1260 }, { x: 1485, y: 1260 }, { x: 1560, y: 1260 }, { x: 1635, y: 1260 }, { x: 1710, y: 1260 }, { x: 1785, y: 1260 },
  { x: 1860, y: 1260 }, { x: 1935, y: 1260 }, { x: 135, y: 1335 }, { x: 210, y: 1335 }, { x: 285, y: 1335 }, { x: 360, y: 1335 }, { x: 435, y: 1335 }, { x: 510, y: 1335 },
  { x: 585, y: 1335 }, { x: 810, y: 1335 }, { x: 885, y: 1335 }, { x: 960, y: 1335 }, { x: 1035, y: 1335 }, { x: 1110, y: 1335 }, { x: 1185, y: 1335 }, { x: 1260, y: 1335 },
  { x: 1335, y: 1335 }, { x: 1410, y: 1335 }, { x: 1485, y: 1335 }, { x: 1560, y: 1335 }, { x: 1635, y: 1335 }, { x: 1710, y: 1335 }, { x: 1785, y: 1335 }, { x: 1860, y: 1335 },
  { x: 1935, y: 1335 }, { x: 135, y: 1410 }, { x: 210, y: 1410 }, { x: 285, y: 1410 }, { x: 360, y: 1410 }, { x: 435, y: 1410 }, { x: 510, y: 1410 }, { x: 660, y: 1410 },
  { x: 735, y: 1410 }, { x: 810, y: 1410 }, { x: 885, y: 1410 }, { x: 960, y: 1410 }, { x: 1035, y: 1410 }, { x: 1110, y: 1410 }, { x: 1185, y: 1410 }, { x: 1260, y: 1410 },
  { x: 1335, y: 1410 }, { x: 1410, y: 1410 }, { x: 1560, y: 1410 }, { x: 1635, y: 1410 }, { x: 1710, y: 1410 }, { x: 1785, y: 1410 }, { x: 1860, y: 1410 }, { x: 1935, y: 1410 },
  { x: 135, y: 1485 }, { x: 210, y: 1485 }, { x: 285, y: 1485 }, { x: 360, y: 1485 }, { x: 435, y: 1485 }, { x: 585, y: 1485 }, { x: 660, y: 1485 }, { x: 735, y: 1485 },
  { x: 810, y: 1485 }, { x: 885, y: 1485 }, { x: 960, y: 1485 }, { x: 1035, y: 1485 }, { x: 1110, y: 1485 }, { x: 1185, y: 1485 }, { x: 1260, y: 1485 }, { x: 1335, y: 1485 },
  { x: 1560, y: 1485 }, { x: 1635, y: 1485 }, { x: 1710, y: 1485 }, { x: 1785, y: 1485 }, { x: 1860, y: 1485 }, { x: 1935, y: 1485 }, { x: 135, y: 1560 }, { x: 210, y: 1560 },
  { x: 285, y: 1560 }, { x: 360, y: 1560 }, { x: 510, y: 1560 }, { x: 585, y: 1560 }, { x: 660, y: 1560 }, { x: 735, y: 1560 }, { x: 810, y: 1560 }, { x: 885, y: 1560 },
  { x: 960, y: 1560 }, { x: 1035, y: 1560 }, { x: 1110, y: 1560 }, { x: 1185, y: 1560 }, { x: 1410, y: 1560 }, { x: 1485, y: 1560 }, { x: 1635, y: 1560 }, { x: 1710, y: 1560 },
  { x: 1785, y: 1560 }, { x: 1860, y: 1560 }, { x: 1935, y: 1560 }, { x: 60, y: 1635 }, { x: 135, y: 1635 }, { x: 210, y: 1635 }, { x: 285, y: 1635 }, { x: 360, y: 1635 },
  { x: 510, y: 1635 }, { x: 585, y: 1635 }, { x: 660, y: 1635 }, { x: 735, y: 1635 }, { x: 810, y: 1635 }, { x: 885, y: 1635 }, { x: 960, y: 1635 }, { x: 1035, y: 1635 },
  { x: 1260, y: 1635 }, { x: 1335, y: 1635 }, { x: 1410, y: 1635 }, { x: 1485, y: 1635 }, { x: 1560, y: 1635 }, { x: 1710, y: 1635 }, { x: 1785, y: 1635 }, { x: 1860, y: 1635 },
  { x: 1935, y: 1635 }, { x: 60, y: 1710 }, { x: 135, y: 1710 }, { x: 210, y: 1710 }, { x: 285, y: 1710 }, { x: 360, y: 1710 }, { x: 510, y: 1710 }, { x: 585, y: 1710 },
  { x: 660, y: 1710 }, { x: 735, y: 1710 }, { x: 810, y: 1710 }, { x: 885, y: 1710 }, { x: 960, y: 1710 }, { x: 1035, y: 1710 }, { x: 1185, y: 1710 }, { x: 1260, y: 1710 },
  { x: 1335, y: 1710 }, { x: 1410, y: 1710 }, { x: 1485, y: 1710 }, { x: 1560, y: 1710 }, { x: 1635, y: 1710 }, { x: 1785, y: 1710 }, { x: 1860, y: 1710 }, { x: 1935, y: 1710 },
  { x: 60, y: 1785 }, { x: 135, y: 1785 }, { x: 210, y: 1785 }, { x: 285, y: 1785 }, { x: 360, y: 1785 }, { x: 510, y: 1785 }, { x: 585, y: 1785 }, { x: 660, y: 1785 },
  { x: 735, y: 1785 }, { x: 810, y: 1785 }, { x: 885, y: 1785 }, { x: 960, y: 1785 }, { x: 1110, y: 1785 }, { x: 1185, y: 1785 }, { x: 1260, y: 1785 }, { x: 1335, y: 1785 },
  { x: 1410, y: 1785 }, { x: 1485, y: 1785 }, { x: 1560, y: 1785 }, { x: 1635, y: 1785 }, { x: 1710, y: 1785 }, { x: 1860, y: 1785 }, { x: 1935, y: 1785 }, { x: 60, y: 1860 },
  { x: 135, y: 1860 }, { x: 210, y: 1860 }, { x: 285, y: 1860 }, { x: 360, y: 1860 }, { x: 510, y: 1860 }, { x: 585, y: 1860 }, { x: 660, y: 1860 }, { x: 735, y: 1860 },
  { x: 810, y: 1860 }, { x: 885, y: 1860 }, { x: 1035, y: 1860 }, { x: 1110, y: 1860 }, { x: 1185, y: 1860 }, { x: 1260, y: 1860 }, { x: 1335, y: 1860 }, { x: 1410, y: 1860 },
  { x: 1485, y: 1860 }, { x: 1560, y: 1860 }, { x: 1635, y: 1860 }, { x: 1710, y: 1860 }, { x: 1785, y: 1860 }, { x: 1935, y: 1860 }, { x: 60, y: 1935 }, { x: 135, y: 1935 },
  { x: 210, y: 1935 }, { x: 285, y: 1935 }, { x: 360, y: 1935 }, { x: 435, y: 1935 }, { x: 585, y: 1935 }, { x: 660, y: 1935 }, { x: 735, y: 1935 }, { x: 810, y: 1935 },
  { x: 960, y: 1935 }, { x: 1035, y: 1935 }, { x: 1110, y: 1935 }, { x: 1185, y: 1935 }, { x: 1260, y: 1935 }, { x: 1335, y: 1935 }, { x: 1410, y: 1935 }, { x: 1485, y: 1935 },
  { x: 1560, y: 1935 }, { x: 1635, y: 1935 }, { x: 1710, y: 1935 }, { x: 1785, y: 1935 }, { x: 1860, y: 1935 },
];

// Level 4: a ruined city, per user request ("un entorno plenamente urbano
// de oficinas destruidas... rascacielos fotorrealistas de Manhattan o
// Dubai... mar en un extremo y un río que atraviese el mapa con varios
// puentes"). A 2048x2048 scrolling world like level 3's, also AI-generated
// (mapas/mapa_nivel4_raw.png -> tools/extract_assets.py's
// extract_map_level4): the sea along the north-east, a river from the top
// edge out through the left one, crossed by two bridges. The base is the
// flat-roofed HQ by the park in the bottom-left -- the building with the
// helipad painted on its roof -- and seven roads lead to its door, traced
// on the image's own streets (labelled pixel grids and asphalt-colour
// scans of the image, see the conversation): two from the west over the
// bridges, one from the north down the riverside, one from the north-east
// along the beach, one from the east and two from the south.
const LEVEL4_WORLD_SIZE = 2048;
const P = (pairs) => pairs.map(([x, y]) => ({ x, y }));

// Where every road ends: the HQ's door, on the lane beside its east wall.
const LEVEL4_HQ_DOOR = { x: 322, y: 1492 };

// The two bridges' decks. They're level 4's narrows (narrowsOf), and only
// about two vehicles wide: traffic crosses single file, without overtaking.
const LEVEL4_BRIDGE_NORTH = P([[300, 145], [400, 158], [500, 168], [600, 178]]);
const LEVEL4_BRIDGE_SOUTH = P([[60, 658], [120, 666], [180, 674], [240, 683]]);

// The east bank's avenue, from the north bridge's far end down the river
// to where it meets the riverside road below the white towers...
const LEVEL4_EAST_BANK = P([
  [712, 200], [700, 226], [684, 255], [667, 282], [650, 305], [626, 345], [588, 412], [550, 480],
  [522, 528], [496, 572], [466, 618], [436, 662], [404, 722], [372, 784], [340, 846], [310, 906], [286, 955],
  [268, 1000],
]);
// ...and on down the riverside to the street along the park's south side.
const LEVEL4_RIVERSIDE = P([[250, 1050], [222, 1100], [190, 1150], [152, 1200], [124, 1250], [96, 1300]]);
// That park street, from its west end and from its east end, where the
// roads from the north and the south come onto it...
const LEVEL4_PARK_STREET_WEST = P([[122, 1334], [200, 1338], [250, 1344], [300, 1356], [350, 1369]]);
const LEVEL4_PARK_STREET_EAST = P([[480, 1390], [440, 1386], [395, 1388]]);
// ...and the lane from it down to the HQ's door, which every road ends on:
// the kill zone in front of the base, the way level 3's roads all end in
// its courtyard.
const LEVEL4_LANE_TO_HQ = P([[372, 1400], [352, 1435], [336, 1465]]);
// From the big crossroads south of the park, up the lane along the
// building site's east side to the park street.
const LEVEL4_JUNCTION_TO_PARK_STREET = P([
  [505, 1790], [515, 1722], [500, 1665], [500, 1630], [514, 1575], [522, 1510], [532, 1480], [541, 1450],
  [540, 1412], [515, 1392],
]);
const LEVEL4_RIVERSIDE_TO_HQ = [...LEVEL4_RIVERSIDE, ...LEVEL4_PARK_STREET_WEST, ...LEVEL4_LANE_TO_HQ, LEVEL4_HQ_DOOR];
const LEVEL4_JUNCTION_TO_HQ = [...LEVEL4_JUNCTION_TO_PARK_STREET, ...LEVEL4_PARK_STREET_EAST, ...LEVEL4_LANE_TO_HQ, LEVEL4_HQ_DOOR];
// The avenue from the bottom edge west to that crossroads.
const LEVEL4_SOUTH_EAST_STREET = P([
  [1290, 2028], [1200, 2006], [1100, 1980], [1000, 1962], [900, 1940], [800, 1915], [700, 1866], [620, 1836],
]);
// The big avenue down the east side, from the crossroads by the beach to
// the bottom edge, where it hairpins back onto that street.
const LEVEL4_EAST_AVENUE = P([
  [1850, 935], [1800, 1000], [1757, 1100], [1725, 1200], [1678, 1300], [1618, 1400], [1580, 1500],
  [1545, 1600], [1482, 1700], [1420, 1800], [1367, 1900], [1335, 1980], [1318, 2015],
]);

// 1. From the west, over the north bridge and down the east bank.
export const LEVEL4_NORTH_BRIDGE_PATH = [
  ...P([[-30, 120], [60, 120], [150, 125], [237, 138]]),
  ...LEVEL4_BRIDGE_NORTH,
  ...P([[660, 190]]),
  ...LEVEL4_EAST_BANK,
  ...LEVEL4_RIVERSIDE_TO_HQ,
];

// 2. From the west, over the south bridge -- whose east end, like that
// stretch of the riverside, is hidden behind the lower white tower.
export const LEVEL4_SOUTH_BRIDGE_PATH = [
  ...P([[-30, 645], [10, 651]]),
  ...LEVEL4_BRIDGE_SOUTH,
  ...P([[300, 690], [360, 702], [398, 730]]),
  ...LEVEL4_EAST_BANK.slice(LEVEL4_EAST_BANK.findIndex((p) => p.y > 760)),
  ...LEVEL4_RIVERSIDE_TO_HQ,
];

// 3. From the north, down the avenue to the north bridge's far end and the
// riverside, then left along the park's north side and round its east
// side, reaching the HQ from the other end of the park's south street.
export const LEVEL4_NORTH_PATH = [
  ...P([[822, -30], [820, 0], [795, 50], [768, 100], [740, 150]]),
  ...LEVEL4_EAST_BANK,
  ...P([
    [252, 1045], [270, 1084], [300, 1096], [400, 1106], [480, 1117], [535, 1130], [568, 1158], [586, 1205],
    [590, 1300], [580, 1350], [550, 1382],
  ]),
  ...LEVEL4_PARK_STREET_EAST,
  ...LEVEL4_LANE_TO_HQ,
  LEVEL4_HQ_DOOR,
];

// 4. From the north-east: the coast road along the beach -- behind two
// towers -- to the crossroads by the beach, then the long way round, down
// the east avenue and back west along the south.
export const LEVEL4_COAST_PATH = [
  ...P([
    [970, -30], [970, 0], [962, 100], [955, 200], [965, 260], [990, 310], [1005, 360], [1015, 410], [1040, 460],
    [1090, 515], [1140, 565], [1190, 612], [1240, 650], [1300, 690], [1350, 713], [1400, 740], [1450, 778],
    [1500, 805], [1550, 822], [1600, 840], [1650, 857], [1700, 875], [1750, 893], [1800, 915],
  ]),
  ...LEVEL4_EAST_AVENUE,
  ...LEVEL4_SOUTH_EAST_STREET,
  ...LEVEL4_JUNCTION_TO_HQ,
];

// 5. From the east edge, by the same route from the beach crossroads on.
export const LEVEL4_EAST_PATH = [
  ...P([[2078, 958], [2040, 956], [2000, 946], [1950, 936], [1900, 932]]),
  ...LEVEL4_EAST_AVENUE,
  ...LEVEL4_SOUTH_EAST_STREET,
  ...LEVEL4_JUNCTION_TO_HQ,
];

// 6. From the bottom edge, at the foot of the east avenue.
export const LEVEL4_SOUTH_EAST_PATH = [
  ...P([[1310, 2078], [1312, 2045]]),
  ...LEVEL4_SOUTH_EAST_STREET,
  ...LEVEL4_JUNCTION_TO_HQ,
];

// 7. From the bottom edge, straight up to the crossroads -- the short one.
export const LEVEL4_SOUTH_PATH = [
  ...P([[395, 2078], [405, 2030], [420, 1990], [435, 1940], [460, 1880]]),
  ...LEVEL4_JUNCTION_TO_HQ,
];

const LEVEL4_PATHS = [
  LEVEL4_NORTH_BRIDGE_PATH,
  LEVEL4_SOUTH_BRIDGE_PATH,
  LEVEL4_NORTH_PATH,
  LEVEL4_COAST_PATH,
  LEVEL4_EAST_PATH,
  LEVEL4_SOUTH_EAST_PATH,
  LEVEL4_SOUTH_PATH,
];

// The river, in its three reaches between the bridges, and the sea --
// no walls or towers on them (simulate.js's canPlaceWall, the build slots
// below).
const LEVEL4_WATER = [
  P([
    [340, 0], [750, 0], [734, 30], [723, 60], [700, 90], [700, 130], [672, 168], [640, 168], [600, 162],
    [550, 157], [500, 152], [450, 148], [400, 143], [300, 118], [310, 100], [325, 50],
  ]),
  P([
    [262, 166], [300, 166], [400, 175], [500, 186], [600, 196], [640, 201], [597, 280], [556, 340], [520, 400],
    [495, 460], [467, 520], [447, 560], [423, 600], [402, 640], [400, 662], [300, 666], [240, 659], [180, 651],
    [120, 644], [60, 636], [0, 628], [0, 560], [40, 500], [100, 400], [170, 300], [230, 215],
  ]),
  P([
    [0, 672], [60, 681], [120, 689], [180, 697], [240, 707], [292, 712], [294, 740], [276, 780], [268, 820],
    [259, 860], [222, 900], [218, 940], [199, 980], [177, 1020], [146, 1060], [90, 1100], [95, 1140], [84, 1180],
    [62, 1220], [33, 1260], [20, 1300], [0, 1320],
  ]),
  P([
    [1160, 0], [2048, 0], [2048, 783], [1870, 747], [1710, 697], [1565, 600], [1445, 500], [1345, 400],
    [1245, 300], [1205, 200], [1175, 100],
  ]),
];

// The skyscrapers' outlines on the image, roughly ([x0, y0, x1, y1]): a
// tower placed on one, or right up against one (LEVEL4_SLOT_FACADE_MARGIN),
// would stand on -- or behind -- a facade.
const LEVEL4_SKYSCRAPERS = [
  [510, 330, 700, 745], [288, 645, 525, 1040], [795, 225, 955, 545], [790, 520, 985, 925], [600, 645, 865, 1125],
  [1045, 375, 1210, 810], [1570, 650, 1730, 1072], [975, 945, 1175, 1305], [1385, 895, 1635, 1245],
  [1205, 1105, 1455, 1545], [825, 1265, 1068, 1795],
];
// The helipad painted on the HQ's roof (tools/extract_assets.py's
// paint_helipad), with room round it.
const LEVEL4_HELIPAD = { x: 180, y: 1460, r: 75 };

// Build slots on level 3's 75px grid, wherever a tower can stand -- off
// the water (with a margin) and the skyscrapers, off the HQ's helipad, at
// least LEVEL4_SLOT_ROAD_CLEARANCE off the middle of every road -- and
// near enough one (LEVEL4_SLOT_ROAD_REACH) to be any use...
const LEVEL4_SLOT_ROAD_CLEARANCE = 60;
const LEVEL4_SLOT_FACADE_MARGIN = 30;
const LEVEL4_SLOT_ROAD_REACH = 330;
// ...plus three by hand, in the corners of the HQ's roof round the
// helipad, right over the door: the grid's points there all fall on the
// helipad or too near the street.
const LEVEL4_HQ_ROOF_SLOTS = P([[276, 1418], [213, 1544], [76, 1507]]);

function level4BuildSlots() {
  const slots = [];
  const wet = (x, y) => LEVEL4_WATER.some((poly) => pointInPolygon({ x, y }, poly));
  for (let y = 60; y < LEVEL4_WORLD_SIZE - 30; y += 75) {
    for (let x = 60; x < LEVEL4_WORLD_SIZE - 30; x += 75) {
      if ([[0, 0], [25, 0], [-25, 0], [0, 25], [0, -25]].some(([dx, dy]) => wet(x + dx, y + dy))) continue;
      const m = LEVEL4_SLOT_FACADE_MARGIN;
      if (LEVEL4_SKYSCRAPERS.some(([x0, y0, x1, y1]) => x >= x0 - m && x <= x1 + m && y >= y0 - m && y <= y1 + m)) continue;
      if (Math.hypot(x - LEVEL4_HELIPAD.x, y - LEVEL4_HELIPAD.y) < LEVEL4_HELIPAD.r) continue;
      const road = Math.min(...LEVEL4_PATHS.map((p) => distanceToPath(p, x, y)));
      if (road >= LEVEL4_SLOT_ROAD_CLEARANCE && road <= LEVEL4_SLOT_ROAD_REACH) slots.push({ x, y });
    }
  }
  const clear = slots.filter((s) => LEVEL4_HQ_ROOF_SLOTS.every((r) => Math.hypot(s.x - r.x, s.y - r.y) >= 60));
  return [...clear, ...LEVEL4_HQ_ROOF_SLOTS];
}

// The towers standing in front of roads, cut out of the map
// (tools/extract_assets.py's LEVEL4_TOWERS_IN_FRONT, whose
// LEVEL4_FOREGROUND_BOX puts the image at this x, y): main.js draws it
// over the enemies, so traffic passes behind those towers.
const LEVEL4_FOREGROUND = { image: "assets/map_fg_level4.png", x: 288, y: 328 };

export const MAX_LEVEL = 4;

export const LEVELS = {
  1: {
    paths: [LEVEL1_PATH],
    soldierEntry: LEVEL1_PATH[0],
    soldierExit: LEVEL1_PATH.at(-1),
    mapImage: "assets/map_bg.png",
    buildSlots: LEVEL1_BUILD_SLOTS,
    worldWidth: CANVAS_WIDTH,
    worldHeight: CANVAS_HEIGHT,
  },
  2: {
    paths: [LEVEL2_LEFT_PATH, LEVEL2_RIGHT_PATH],
    soldierEntry: LEVEL2_LEFT_PATH[0],
    soldierExit: LEVEL2_SHARED_TAIL.at(-1),
    mapImage: "assets/map_bg_level2.png",
    buildSlots: LEVEL2_BUILD_SLOTS,
    worldWidth: CANVAS_WIDTH,
    worldHeight: CANVAS_HEIGHT,
  },
  3: {
    paths: [
      LEVEL3_NORTH_MAIN_PATH,
      LEVEL3_NORTHEAST_PATH,
      LEVEL3_NORTHWEST_PATH,
      LEVEL3_SOUTHEAST_PATH,
      LEVEL3_SOUTH_PATH,
    ],
    soldierEntries: [
      LEVEL3_NORTH_MAIN_PATH[0],
      LEVEL3_NORTHEAST_PATH[0],
      LEVEL3_NORTHWEST_PATH[0],
      LEVEL3_SOUTHEAST_PATH[0],
      LEVEL3_SOUTH_PATH[0],
    ],
    soldierEntry: LEVEL3_NORTH_MAIN_PATH[0],
    soldierExit: LEVEL3_BASE_INTERIOR,
    mapImage: "assets/map_bg_level3.jpg",
    buildSlots: LEVEL3_BUILD_SLOTS,
    worldWidth: LEVEL3_WORLD_SIZE,
    worldHeight: LEVEL3_WORLD_SIZE,
    wall: LEVEL3_WALL,
  },
  4: {
    paths: LEVEL4_PATHS,
    // Soldiers can't cut across a city block the way they roam level 3's
    // open ground -- they take the roads too (simulate.js's pathForSpawn).
    soldiersOnRoads: true,
    soldierEntries: LEVEL4_PATHS.map((p) => p[0]),
    soldierEntry: LEVEL4_PATHS[0][0],
    soldierExit: LEVEL4_HQ_DOOR,
    narrows: [...LEVEL4_BRIDGE_NORTH, ...LEVEL4_BRIDGE_SOUTH],
    water: LEVEL4_WATER,
    shores: shoreSegments(LEVEL4_WATER, LEVEL4_WORLD_SIZE),
    mapImage: "assets/map_bg_level4.jpg",
    foreground: LEVEL4_FOREGROUND,
    buildSlots: level4BuildSlots(),
    worldWidth: LEVEL4_WORLD_SIZE,
    worldHeight: LEVEL4_WORLD_SIZE,
  },
};

export function levelData(level) {
  return LEVELS[level] || LEVELS[1];
}

// The edges of a level's water polygons where water meets land (not the
// ones along the world's border), as [a, b] segments like a wall's.
function shoreSegments(water, size) {
  const border = (a, b) => (a.x === b.x && (a.x <= 0 || a.x >= size)) || (a.y === b.y && (a.y <= 0 || a.y >= size));
  const out = [];
  for (const poly of water) {
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      if (!border(a, b)) out.push([a, b]);
    }
  }
  return out;
}

// Everything nothing may move through: level 3's fortress wall, level 4's
// shores (so traffic keeps to the bridges and the banks). Worked out once
// per level.
const solidCache = new Map();
export function solidSegmentsOf(level) {
  if (!solidCache.has(level)) {
    const segs = [...(level.wall ? level.wall.segments : []), ...(level.shores || [])];
    solidCache.set(level, segs.length ? segs : null);
  }
  return solidCache.get(level);
}

// The narrow places on a level's roads -- level 3's gates through its
// fortress wall, level 4's bridges -- where traffic squeezes into single
// file: lanes pinch together (map.js's offsetPath) and nobody overtakes
// (enemy.js's avoidance).
export function narrowsOf(level) {
  return [...(level.wall ? level.wall.gates : []), ...(level.narrows || [])];
}
