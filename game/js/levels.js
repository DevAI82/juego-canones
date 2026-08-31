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
  },
  2: {
    paths: [LEVEL2_LEFT_PATH, LEVEL2_RIGHT_PATH],
    // Soldiers roam anywhere between an entry and exit point regardless
    // of which branch vehicles take -- the left branch's start and the
    // shared tail's end are as good a representative pair as any.
    soldierEntry: LEVEL2_LEFT_PATH[0],
    soldierExit: LEVEL2_SHARED_TAIL.at(-1),
    mapImage: "assets/map_bg_level2.png",
  },
};

export function levelData(level) {
  return LEVELS[level] || LEVELS[1];
}
