// Where a musical duel's armies are shown while they fight (asked by the
// user, 2026-11-26: the track of keys twice as big, the vehicles bigger,
// and what each army gives and takes plain to see while one's eyes are on
// the keys).
//
// The track takes the middle of the arena, so the armies can't be drawn
// where they stand: each is shown in the strip left beside the track, its
// units bigger and in rows, the ones in front (the ones a volley goes for
// first) nearest the track. It is looks only: the fight goes by where the
// units really stand (duelRhythm.js).
//
// No page here: duelScreen.js draws from it.
import { ARENA } from "./duelArenas.js";
import { SIDES } from "./duel.js";

// The two strips. (duelRhythmDraw.js's TRACK lies between them: a test
// holds them clear of it.)
export const STAGE = {
  left: { x0: 6, x1: 286 },
  right: { x0: ARENA.width - 286, x1: ARENA.width - 6 },
  y0: 168, // under the army's bar and its tally
  y1: 738,
};

const ROW = 130; // px between two rows, at most
const COLUMN_AT = [0.26, 0.75]; // how far from the track a column stands, as a share of the strip
// How much bigger than life the units are drawn, by the rows and columns
// there are. (The longest picture, the rocket truck's, is some 72 px: two
// of them side by side must fit the strip.)
const scaleOf = (rows, columns) => (columns === 1 ? (rows <= 4 ? 2 : 1.75) : rows <= 4 ? 1.7 : rows === 5 ? 1.6 : 1.5);

// Each unit's place on the stage: Map of id -> { x, y, scale }. The fallen
// are counted too, so nobody moves when a unit falls.
export function stagePlaces(units) {
  const places = new Map();
  const mid = ARENA.width / 2;
  for (const side of SIDES) {
    const army = units.filter((u) => u.side === side);
    const front = [...army].sort((a, b) => Math.abs(a.x - mid) - Math.abs(b.x - mid) || a.y - b.y || a.id - b.id);
    const columns = army.length > 5 ? 2 : 1;
    const rows = Math.ceil(army.length / columns);
    const scale = scaleOf(rows, columns);
    const strip = STAGE[side];
    const width = strip.x1 - strip.x0;
    const gap = Math.min(ROW, (STAGE.y1 - STAGE.y0) / Math.max(1, rows));
    for (let c = 0; c < columns; c++) {
      // (Down a column as they stand in the arena, top to bottom.)
      const column = front.slice(c * rows, (c + 1) * rows).sort((a, b) => a.y - b.y || a.id - b.id);
      const away = (columns === 1 ? 0.5 : COLUMN_AT[c]) * width;
      const x = side === "left" ? strip.x1 - away : strip.x0 + away;
      column.forEach((u, r) => {
        const y = (STAGE.y0 + STAGE.y1) / 2 + (r - (column.length - 1) / 2) * gap;
        places.set(u.id, { x, y, scale });
      });
    }
  }
  return places;
}

// The duel's view with its armies, and the shots between them, where they
// are shown: what the screen hands duelDraw.js during a musical fight.
export function stagedView(view) {
  const places = stagePlaces(view.units);
  const moved = (at, id) => {
    const place = places.get(id);
    return place ? { x: place.x, y: place.y } : at;
  };
  return {
    ...view,
    units: view.units.map((u) => ({ ...u, ...places.get(u.id) })),
    shots: view.shots.map((shot) => ({ ...shot, from: moved(shot.from, shot.fromId), to: moved(shot.to, shot.toId) })),
  };
}

// What an army has left of the health it started the round with, 0 to 1.
export function armyHealth(view, side) {
  const army = view.units.filter((u) => u.side === side);
  const whole = army.reduce((sum, u) => sum + u.maxHp, 0);
  if (whole <= 0) return 0;
  return army.reduce((sum, u) => sum + (u.alive ? Math.max(0, u.hp) : 0), 0) / whole;
}

// How much danger an army with that health is in, 0 to 1: none while it
// has half of it; the screen reddens its side by this.
export const danger = (health) => Math.max(0, Math.min(1, (0.5 - health) / 0.5));
