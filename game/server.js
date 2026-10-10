// LAN multiplayer host. Run with: node server.js
//
// Serves the game's static files (same as `python -m http.server` did for
// solo play) AND runs the authoritative game, ticking it on a timer and
// exposing it over two tiny JSON endpoints:
//   GET  /api/state?player=<id>  -> the game, as that browser tab needs it
//   POST /api/action             -> one player action ({player, type, ...})
// The game itself -- «Defender juntos» (everyone defends one map) or «Uno
// contra otro» (one tab defends, another attacks), who plays which side,
// what each may do -- is js/host.js's; this file only puts it on the
// network (docs/2026-10-09-uno-contra-otro-design.md).
//
// Every browser that opens this server's URL (the host's own machine, a
// second PC, a phone -- see the LAN URL this script prints on startup)
// runs the exact same game/js/main.js. main.js's boot() detects /api/state
// exists and switches itself into networked mode automatically: no
// separate "host" build, no config, just open the same URL everywhere.
//
// Deliberately dependency-free (matches the rest of this project's "no
// npm install" approach) -- state sync uses HTTP polling (main.js polls
// every 120ms) rather than WebSockets, which would need either an external
// package or hand-rolling the WebSocket wire protocol. On a home LAN the
// added latency is imperceptible for this game's pace.
import http from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { pathToFileURL, fileURLToPath } from "node:url";

import { createHost } from "./js/host.js";
import { restoreGameSave } from "./js/modes.js";
import { readSaveFile, writeSaveSlot, listSaveFile } from "./server-saves.js";

const TICK_MS = 50; // 20 ticks/sec -- plenty smooth for this game's pace
const GAME_DIR = path.dirname(fileURLToPath(import.meta.url));

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".json": "application/json; charset=utf-8",
  ".mp3": "audio/mpeg",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".webmanifest": "application/manifest+json",
  ".txt": "text/plain; charset=utf-8",
};

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf-8") || "{}");
}

// Shared, persistent high-score table -- the whole point of running this
// on the server rather than in each browser's localStorage is that all
// the co-op players save into the SAME ranking. Kept as a plain JSON file
// (not a real database) to match the rest of this project's
// dependency-free approach; survives server restarts, which localStorage
// alone wouldn't need to but a shared multi-device ranking does.
const LEADERBOARD_MAX_ENTRIES = 20;

async function loadLeaderboard(file) {
  try {
    return JSON.parse(await readFile(file, "utf-8"));
  } catch {
    return [];
  }
}

async function addLeaderboardEntry(file, name, score) {
  const entries = await loadLeaderboard(file);
  entries.push({ name, score, date: new Date().toISOString() });
  entries.sort((a, b) => b.score - a.score);
  const trimmed = entries.slice(0, LEADERBOARD_MAX_ENTRIES);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(trimmed, null, 2));
  return trimmed;
}

async function serveStatic(req, res) {
  let urlPath = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (urlPath === "/") urlPath = "/index.html";
  const filePath = path.resolve(path.join(GAME_DIR, urlPath));
  const rel = path.relative(path.resolve(GAME_DIR), filePath);
  // Refuse to serve anything outside the game directory (e.g. "/../server.js").
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    res.writeHead(403).end("Forbidden");
    return;
  }
  try {
    const data = await readFile(filePath);
    const ext = path.extname(filePath);
    const headers = { "Content-Type": CONTENT_TYPES[ext] || "application/octet-stream" };
    // This project ships game code updates by editing files on disk and
    // restarting this server -- there's no cache-busting query string or
    // build hash in the URL a browser would treat as "this changed" on
    // its own. Without this, a browser (especially a phone's) can keep
    // serving a stale index.html/js/css from its disk cache even across
    // a manual reload, silently running old game logic against the
    // current server (this is exactly what happened: a family member's
    // reload still didn't show the new end-of-game screen). Images/audio
    // are excluded -- those are large, don't change per-edit the way code
    // does, and normal caching for them is what you want.
    if (ext === ".html" || ext === ".js" || ext === ".css") {
      headers["Cache-Control"] = "no-store";
    }
    res.writeHead(200, headers);
    res.end(data);
  } catch {
    res.writeHead(404).end("Not found");
  }
}

function sendJson(res, body) {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(typeof body === "string" ? body : JSON.stringify(body));
}

// The server: the game (host.js) ticking on a timer, the saves and the
// ranking in `dataDir`, everything on `port`. Per user request, the game
// picks up where it was: restarting the server (to update the game, say)
// resumes the last autosave -- paused, for whoever reconnects -- instead
// of starting over. Resolves once it's listening, with a way to stop it
// (the tests run their own server on a spare port, away from the
// family's on 8420).
export async function startServer({ port = 8421, dataDir = path.join(GAME_DIR, "data"), log = console.log } = {}) {
  const savesPath = path.join(dataDir, "saves.json");
  const leaderboardPath = path.join(dataDir, "leaderboard.json");
  const store = {
    read: () => readSaveFile(savesPath),
    write: (slot, save) => writeSaveSlot(savesPath, slot, save),
  };
  const initial = restoreGameSave((await readSaveFile(savesPath)).auto);
  const host = createHost({ store, initial, log: (msg) => console.error(msg) });
  if (initial) log(`Resumed the saved game: level ${initial.level} (paused).`);

  let lastTick = Date.now();
  const ticker = setInterval(() => {
    const now = Date.now();
    const dt = Math.min((now - lastTick) / 1000, 0.1);
    lastTick = now;
    host.tick(dt);
  }, TICK_MS);

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://x");
    const urlPath = url.pathname;

    if (urlPath === "/api/state" && req.method === "GET") {
      // Asking for news also tells the game this tab is still there.
      const player = url.searchParams.get("player");
      const auto = url.searchParams.get("auto");
      sendJson(res, host.viewJson(player, { auto: auto == null ? undefined : auto === "1" }));
      return;
    }

    if (urlPath === "/api/action" && req.method === "POST") {
      let result;
      try {
        const body = await readBody(req);
        result = await host.act(typeof body.player === "string" ? body.player : null, body);
      } catch {
        result = { ok: false, reason: "bad-request" };
      }
      sendJson(res, result);
      return;
    }

    // Where the other computer finds the game (the banner while waiting
    // for the second player): this one's addresses on the home network.
    if (urlPath === "/api/address" && req.method === "GET") {
      const { port: actual } = server.address();
      sendJson(res, { urls: lanAddresses().map((addr) => `http://${addr}:${actual}`) });
      return;
    }

    if (urlPath === "/api/saves" && req.method === "GET") {
      sendJson(res, await listSaveFile(savesPath));
      return;
    }

    if (urlPath === "/api/leaderboard" && req.method === "GET") {
      sendJson(res, await loadLeaderboard(leaderboardPath));
      return;
    }

    if (urlPath === "/api/leaderboard" && req.method === "POST") {
      let result;
      try {
        const body = await readBody(req);
        const name = String(body.name ?? "JUGADOR").trim().slice(0, 16) || "JUGADOR";
        const score = Math.max(0, Math.round(Number(body.score) || 0));
        const entries = await addLeaderboardEntry(leaderboardPath, name, score);
        result = { ok: true, entries };
      } catch {
        result = { ok: false, reason: "bad-request" };
      }
      sendJson(res, result);
      return;
    }

    await serveStatic(req, res);
  });

  await new Promise((resolve) => server.listen(port, resolve));
  return {
    port: server.address().port,
    host,
    close: () =>
      new Promise((resolve) => {
        clearInterval(ticker);
        server.close(() => resolve());
        server.closeAllConnections?.();
      }),
  };
}

function lanAddresses() {
  const out = [];
  for (const ifaces of Object.values(os.networkInterfaces())) {
    for (const iface of ifaces || []) {
      if (iface.family === "IPv4" && !iface.internal) out.push(iface.address);
    }
  }
  return out;
}

// `node server.js`: the family's server. PORT and DATA_DIR let a
// throwaway test instance run without touching the real one on 8420.
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const port = Number(process.argv[2]) || Number(process.env.PORT) || 8421;
  const dataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : undefined;
  await startServer({ port, dataDir });
  console.log(`Tower Defense multiplayer host running.`);
  console.log(`  On this computer: http://localhost:${port}`);
  for (const addr of lanAddresses()) {
    console.log(`  On the same WiFi (other PC/phone): http://${addr}:${port}`);
  }
  console.log(`Open one of the LAN addresses above on the other devices: «Defender juntos» plays one shared map,`);
  console.log(`«Uno contra otro» has one computer defend and the other attack.`);
}
