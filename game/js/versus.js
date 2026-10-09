// One against the other at home (docs/2026-10-09-uno-contra-otro-design.md):
// who plays which side of an attack, and the turns they take -- both
// getting ready, pausing, a player gone. Pure logic on a small `seats`
// object and the attack's state; host.js keeps the seats next to the game
// and calls these as the players' tabs ask for news and send actions.
//
// A player is a browser tab, known by the id it sends (main.js keeps it in
// the tab's sessionStorage, so a reload keeps it). `now` is in ms.
import { startAttack } from "./attack.js";

export const SIDES = ["defense", "attack"];
// How long a tab may go without asking for news before its side counts as
// free: it polls several times a second, so this is a closed tab, a
// computer gone to sleep or a dropped WiFi, not a slow answer.
export const GONE_AFTER = 5000;

export const otherSide = (side) => (side === "defense" ? "attack" : "defense");

const emptySeat = () => ({ player: null, lastSeen: 0, ready: false, auto: false });

export function createSeats() {
  // pausedBy: the side whose pause it is; gone: the side that left mid-round.
  return { defense: emptySeat(), attack: emptySeat(), pausedBy: null, gone: null };
}

export function sideOf(seats, playerId) {
  return SIDES.find((side) => playerId != null && seats[side].player === playerId) || null;
}

export function isConnected(seats, side, now) {
  const seat = seats[side];
  return seat.player != null && now - seat.lastSeen <= GONE_AFTER;
}

// The sides another tab could take now.
export function freeSides(seats, now) {
  return SIDES.filter((side) => !isConnected(seats, side, now));
}

// A tab takes `side`: free, or its own already.
export function sit(seats, side, playerId, now) {
  if (!SIDES.includes(side)) return { ok: false, reason: "no-such-side" };
  const mine = sideOf(seats, playerId);
  if (mine && mine !== side) return { ok: false, reason: "already-seated" };
  if (!mine && isConnected(seats, side, now)) return { ok: false, reason: "taken" };
  const seat = seats[side];
  if (seat.player !== playerId) Object.assign(seat, emptySeat(), { player: playerId });
  seat.lastSeen = now;
  return { ok: true };
}

// A tab asked for news: it's still there. `auto`: it plays the attack with
// the phone's automatic army (host.js runs it for that tab).
export function seen(seats, playerId, now, { auto } = {}) {
  const side = sideOf(seats, playerId);
  if (!side) return null;
  seats[side].lastSeen = now;
  if (auto !== undefined) seats[side].auto = Boolean(auto);
  return side;
}

// A side gone in the middle of a round pauses the game -- its pause, so the
// one left can carry on only once it's clear the other isn't coming back
// (resume below). The preparation has no clock, so nothing to pause there.
// Returns the sides gone just now.
export function checkGone(seats, state, now) {
  if (seats.gone && isConnected(seats, seats.gone, now)) seats.gone = null;
  const battle = state.attack?.phase === "battle" && !state.gameOver;
  if (!battle) return [];
  const gone = SIDES.filter((side) => !isConnected(seats, side, now));
  if (!gone.length || state.paused) return [];
  state.paused = true;
  seats.pausedBy = gone[0];
  seats.gone = gone[0];
  return gone;
}

// «¡Listo!»: round 1 starts once both sides, there and then, have said so.
export function ready(seats, state, side, now) {
  if (state.gameOver || state.attack.phase !== "prep") return { ok: false, reason: "already-started" };
  seats[side].ready = true;
  const both = SIDES.every((s) => seats[s].ready && isConnected(seats, s, now));
  if (!both) return { ok: true, started: false };
  startAttack(state);
  for (const s of SIDES) seats[s].ready = false;
  seats.pausedBy = null;
  seats.gone = null;
  return { ok: true, started: true };
}

// Either side can pause the game for both; the pause is theirs.
export function pause(seats, state, side) {
  if (state.gameOver) return { ok: false, reason: "game-over" };
  if (!state.paused) {
    state.paused = true;
    seats.pausedBy = side;
  }
  return { ok: true };
}

// Only the side that paused can carry on -- nobody's game is resumed while
// they're away -- unless that side has gone, or the pause is nobody's (a
// game just loaded waits paused).
export function resume(seats, state, side, now) {
  if (state.gameOver) return { ok: false, reason: "game-over" };
  if (!state.paused) return { ok: true };
  const owner = seats.pausedBy;
  if (owner && owner !== side && isConnected(seats, owner, now)) return { ok: false, reason: "not-yours" };
  state.paused = false;
  seats.pausedBy = null;
  seats.gone = null;
  return { ok: true };
}

// Whether this tab may start another game or load one: the players can; a
// third device at home can't cut their game short while either is there.
export function mayChangeGame(seats, playerId, now) {
  if (sideOf(seats, playerId)) return true;
  return !SIDES.some((side) => isConnected(seats, side, now));
}

// «Revancha»: the same two players, each on the other side.
export function swapSides(seats) {
  const { defense, attack } = seats;
  seats.defense = { ...attack, ready: false };
  seats.attack = { ...defense, ready: false };
  seats.pausedBy = null;
  seats.gone = null;
}
