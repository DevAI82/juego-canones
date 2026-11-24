// Writes what a duel arena's picture has to respect -- its size, the two
// zones and the obstacles -- as JSON for the scripts that build it.
//   node tools/blender/maps/dump_arena.mjs <arena> <out.json>
import { writeFileSync } from "node:fs";
import { ARENA, ZONES, arenaOf } from "../../../game/js/duelArenas.js";

const arena = arenaOf(Number(process.argv[2]));
const out = { arena: arena.id, league: arena.league, width: ARENA.width, height: ARENA.height, zones: ZONES, obstacles: arena.obstacles };
writeFileSync(process.argv[3], JSON.stringify(out));
console.log(`arena ${arena.id} (${arena.league}): ${arena.obstacles.length} obstacles`);
