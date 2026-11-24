// The duel minigame's five arenas, one a league (docs/2026-11-22-duelo-
// design.md §3): what the fight needs to know of them -- their size, where
// each side may deploy, and the obstacles. Their pictures are the screen's
// business.
//
// An arena is as big as levels 1 and 2, so it fits the screen without a
// camera. The left side deploys in the left zone and the right side in the
// right one; the middle is nobody's.

export const ARENA = { width: 1200, height: 750 };

export const mirrorX = (x) => ARENA.width - x;

const LEFT_ZONE = { x0: 40, x1: 480, y0: 60, y1: 690 };

export const ZONES = {
  left: LEFT_ZONE,
  right: { x0: mirrorX(LEFT_ZONE.x1), x1: mirrorX(LEFT_ZONE.x0), y0: LEFT_ZONE.y0, y1: LEFT_ZONE.y1 },
};

// Obstacles are circles ({ x, y, r }): they stop units and shots, so they
// are cover. An arena is written as what stands on the middle line plus
// its left half; the right half is the left one mirrored, so that neither
// side has the better ground.
// `art`: its picture has been made (tools/blender/maps/duel<id>_layout.py):
// the ground, and what stands up on it, drawn over the units. An arena
// without it yet is drawn plain.
function arena(id, league, { middle = [], left = [], art = false }) {
  const circle = ([x, y, r]) => ({ x, y, r });
  const obstacles = [
    ...middle.map(circle),
    ...left.map(circle),
    ...left.map(([x, y, r]) => circle([mirrorX(x), y, r])),
  ];
  return {
    id,
    league,
    obstacles,
    image: art ? `assets/maps/duel${id}.jpg` : null,
    foreground: art ? `assets/maps/duel${id}_fg.webp` : null,
  };
}

const MID = ARENA.width / 2;

export const DUEL_ARENAS = [
  // A sand pit: one mound in the middle and a palisade before each side.
  arena(1, "Arena", { middle: [[MID, 375, 38]], left: [[440, 190, 26], [440, 560, 26]], art: true }),
  // A scrapyard: two heaps on the middle line leave three lanes, and a
  // container shelters each side's centre.
  arena(2, "Hierro", { middle: [[MID, 210, 34], [MID, 540, 34]], left: [[350, 375, 30]] }),
  // A foundry yard: crucibles at each side's flanks and one on each side
  // of the middle.
  arena(3, "Bronce", { left: [[300, 210, 28], [300, 540, 28], [530, 375, 30]] }),
  // A snowed-in base: a rock in the middle, two before each side and one
  // deep in its zone.
  arena(4, "Plata", { middle: [[MID, 375, 30]], left: [[470, 240, 24], [470, 510, 24], [210, 375, 26]] }),
  // A palace courtyard: a fountain in the middle and columns round it.
  arena(5, "Oro", { middle: [[MID, 375, 24]], left: [[400, 150, 22], [400, 600, 22], [505, 375, 22]] }),
];

// The arena with this number; the first one for a number that isn't one
// (a saved value gone wrong).
export function arenaOf(id) {
  return DUEL_ARENAS.find((a) => a.id === id) || DUEL_ARENAS[0];
}
