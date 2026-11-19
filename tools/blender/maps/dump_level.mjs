// Writes what a level's map has to respect -- its roads, streets, wall,
// gates, build slots and the RTS mode's fixed places -- as JSON for the
// Blender scripts that build the map.
//   node tools/blender/maps/dump_level.mjs <level> <out.json>
import { writeFileSync } from "node:fs";
import { levelData } from "../../../game/js/levels.js";
import { RTS_CONFIG, createRtsMineralFields } from "../../../game/js/rts.js";

const level = Number(process.argv[2]);
const d = levelData(level);
const out = {
  level,
  width: d.worldWidth,
  height: d.worldHeight,
  paths: d.paths,
  streets: d.streets || [],
  wall: d.wall || null,
  base: d.soldierExit,
  slots: d.buildSlots,
  soldierEntries: d.soldierEntries || [d.soldierEntry],
  soldiersOnRoads: Boolean(d.soldiersOnRoads),
  water: d.water || [],
  narrows: d.narrows || [],
  noGo: d.noGo || d.obstacles || [],
  rts: level === RTS_CONFIG.mapLevel ? { blueBase: RTS_CONFIG.blueBase, redBase: RTS_CONFIG.redBase, minerals: createRtsMineralFields() } : null,
};
writeFileSync(process.argv[3], JSON.stringify(out));
console.log(`level ${level}: ${out.paths.length} roads, ${out.streets.length} streets, ${out.slots.length} slots`);
