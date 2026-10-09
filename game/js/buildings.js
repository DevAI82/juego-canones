// The support buildings (per user request, 2026-10-09): six military
// buildings in the isometric RTS style of Command & Conquer and Dune, each
// built up through four phases -- foundations, steel frame, walls, final
// fittings -- before it stands finished. tools/extract_buildings.py cuts
// them out of the user's drawings (Imágenes/) into assets/: the finished
// building, and its four phases in a 2 x 2 sheet of pictures the same size.
//
// What each building does, where it may go up and in which mode it's
// played are still to be decided with the user; for now this is what's
// needed to show them: what they're called, their pictures, how long the
// works take and which picture shows at each moment of them. DOM-free;
// main.js draws them (drawBuilding).

// In the shop's order. buildTime: seconds of works (provisional, until the
// buildings' mode is designed).
export const BUILDING_TYPES = {
  solar: { name: "Central fotovoltaica", buildTime: 10 },
  wind: { name: "Generador eólico", buildTime: 10 },
  refinery: { name: "Refinería", buildTime: 12 },
  barracks: { name: "Barracón militar", buildTime: 12 },
  factory: { name: "Fábrica de blindados", buildTime: 15 },
  lab: { name: "Laboratorio de tecnología", buildTime: 15 },
};
export const BUILDING_ORDER = Object.keys(BUILDING_TYPES);
for (const key of BUILDING_ORDER) {
  BUILDING_TYPES[key].sprite = `assets/building_${key}.webp`;
  BUILDING_TYPES[key].sheet = `assets/building_${key}_build.webp`;
}

// The construction sheet: PHASE_COUNT phases, SHEET_COLS to a row.
export const PHASE_COUNT = 4;
export const SHEET_COLS = 2;
// The share of the works over which the last phase crossfades into the
// finished building, as the towers' build animations do (main.js).
export const FINAL_CROSSFADE = 0.15;
// The share of each phase over which it fades into the next: four
// pictures cut straight from one to the next would jump.
const PHASE_BLEND = 0.3;

// How far along a building's works are: 0 just started, 1 finished.
export function buildingProgress(b) {
  const total = BUILDING_TYPES[b.type]?.buildTime || 1;
  const left = Math.max(0, b.buildTimeRemaining || 0);
  return Math.max(0, Math.min(1, 1 - left / total));
}

// Which pictures show at `progress` (0-1) of the works: phase `from`, with
// phase `to` drawn over it at opacity `mix` -- phases 0-3 are the sheet's,
// PHASE_COUNT (4) the finished building. Each phase holds, then fades into
// the next over the last PHASE_BLEND of its share; the last one holds
// until the final crossfade.
export function constructionFrame(progress) {
  const p = Math.max(0, Math.min(1, progress));
  if (p >= 1) return { from: PHASE_COUNT, to: PHASE_COUNT, mix: 0 };
  const finalStart = 1 - FINAL_CROSSFADE;
  if (p >= finalStart) return { from: PHASE_COUNT - 1, to: PHASE_COUNT, mix: (p - finalStart) / FINAL_CROSSFADE };
  const share = finalStart / PHASE_COUNT;
  const phase = Math.min(PHASE_COUNT - 1, Math.floor(p / share));
  const within = (p - phase * share) / share;
  if (phase === PHASE_COUNT - 1 || within < 1 - PHASE_BLEND) return { from: phase, to: phase, mix: 0 };
  return { from: phase, to: phase + 1, mix: (within - (1 - PHASE_BLEND)) / PHASE_BLEND };
}
