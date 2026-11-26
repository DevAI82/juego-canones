// A throwaway home server for testing what needs one (two players on the
// home network: «Uno contra otro», the duels): the game's own server.js on
// another port, its saves and ranking in a temporary folder -- never the
// family's (CLAUDE.md).
//
//   node tools/serve_test.mjs [port]      (8432 unless told)
import os from "node:os";
import path from "node:path";
import { mkdtempSync } from "node:fs";
import { startServer } from "../game/server.js";

const port = Number(process.argv[2]) || 8432;
const dataDir = mkdtempSync(path.join(os.tmpdir(), "td-test-"));
await startServer({ port, dataDir });
console.log(`Test server: http://localhost:${port} (its saves in ${dataDir})`);
