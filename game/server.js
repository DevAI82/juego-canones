// LAN co-op multiplayer host. Run with: node server.js
//
// Serves the game's static files (same as `python -m http.server` did for
// solo play) AND runs the authoritative game simulation, ticking it on a
// timer and exposing it over two tiny JSON endpoints:
//   GET  /api/state   -> the full current game state
//   POST /api/action  -> apply one player action ({type, ...params})
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
// added latency is imperceptible for a tower defense game's pace.
import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

import {
  createGameState,
  stepSimulation,
  placeTower,
  upgradeTower,
  repairTower,
  sellTower,
  skipWave,
  togglePause,
} from "./js/simulate.js";

const PORT = 8420;
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
};

let state = createGameState();
let lastTick = Date.now();
setInterval(() => {
  const now = Date.now();
  const dt = Math.min((now - lastTick) / 1000, 0.1);
  lastTick = now;
  stepSimulation(state, dt);
}, TICK_MS);

const ACTION_HANDLERS = {
  place: (body) => placeTower(state, body.towerType, body.x, body.y),
  upgrade: (body) => upgradeTower(state, body.towerId, body.skill),
  repair: (body) => repairTower(state, body.towerId),
  sell: (body) => sellTower(state, body.towerId),
  skip: () => skipWave(state),
  pause: () => togglePause(state),
  restart: () => {
    state = createGameState();
    return { ok: true };
  },
};

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf-8") || "{}");
}

async function serveStatic(req, res) {
  let urlPath = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (urlPath === "/") urlPath = "/index.html";
  const filePath = path.join(GAME_DIR, urlPath);
  // Refuse to serve anything outside the game directory (e.g. "/../server.js").
  if (!filePath.startsWith(GAME_DIR)) {
    res.writeHead(403).end("Forbidden");
    return;
  }
  try {
    const data = await readFile(filePath);
    const ext = path.extname(filePath);
    res.writeHead(200, { "Content-Type": CONTENT_TYPES[ext] || "application/octet-stream" });
    res.end(data);
  } catch {
    res.writeHead(404).end("Not found");
  }
}

const server = http.createServer(async (req, res) => {
  const urlPath = new URL(req.url, "http://x").pathname;

  if (urlPath === "/api/state" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(state));
    return;
  }

  if (urlPath === "/api/action" && req.method === "POST") {
    let result;
    try {
      const body = await readBody(req);
      const handler = ACTION_HANDLERS[body.type];
      result = handler ? handler(body) : { ok: false, reason: "unknown-action" };
    } catch (err) {
      result = { ok: false, reason: "bad-request" };
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(result));
    return;
  }

  await serveStatic(req, res);
});

function lanAddresses() {
  const out = [];
  for (const ifaces of Object.values(os.networkInterfaces())) {
    for (const iface of ifaces || []) {
      if (iface.family === "IPv4" && !iface.internal) out.push(iface.address);
    }
  }
  return out;
}

server.listen(PORT, () => {
  console.log(`Tower Defense multiplayer host running.`);
  console.log(`  On this computer: http://localhost:${PORT}`);
  for (const addr of lanAddresses()) {
    console.log(`  On the same WiFi (other PC/phone): http://${addr}:${PORT}`);
  }
  console.log(`Open one of the LAN addresses above on your son's device -- everyone who opens this server's URL plays on the same shared board.`);
});
