// Score formula for a completed match, kept separate from simulate.js so
// both main.js (to show the live end-of-game breakdown) and server.js (to
// persist a score to the shared leaderboard) can import just this, without
// pulling in the whole simulation.
import { WAVES } from "./waves.js";

// Per-user request: point value per enemy type killed, roughly matching
// how threatening/tough each one is.
export const KILL_POINTS = { soldier: 1, motorcycle: 2, buggy: 3, tank: 5, rocket: 8 };
export const WAVE_CLEAR_POINTS = 50;
export const LIFE_BONUS_POINTS = 10;
export const TOWER_LOST_PENALTY = 20;

// waveIndex counts *fully cleared* waves while a match is still running
// (simulate.js's nextWaveIfDone only increments it once the current wave's
// spawn queue and enemies are both empty) -- so it's already the right
// number on a loss. On a win, every wave was cleared.
export function wavesCleared(state) {
  return state.win ? WAVES.length : state.waveIndex;
}

const ENEMY_LABELS = { soldier: "Soldados", motorcycle: "Motos", buggy: "Buggies", tank: "Tanques", rocket: "Lanzacohetes" };

// Itemized per user request ("la puntuación deberías hacer una tabla
// explicando el total de puntos por cada concepto") -- one row per kill
// type plus the three match-level bonuses/penalties, in the exact order
// they should be displayed, each with its own point subtotal so the
// end-of-game screen can show a real breakdown table instead of just the
// final number.
export function computeScoreBreakdown(state) {
  const rows = [];
  for (const [type, points] of Object.entries(KILL_POINTS)) {
    const count = state.stats.kills[type] || 0;
    rows.push({ label: ENEMY_LABELS[type], count, pointsEach: points, subtotal: count * points });
  }
  const waves = wavesCleared(state);
  rows.push({ label: "Oleadas superadas", count: waves, pointsEach: WAVE_CLEAR_POINTS, subtotal: waves * WAVE_CLEAR_POINTS });
  rows.push({ label: "Vidas restantes", count: state.economy.lives, pointsEach: LIFE_BONUS_POINTS, subtotal: state.economy.lives * LIFE_BONUS_POINTS });
  rows.push({ label: "Torretas destruidas", count: state.stats.towersLost, pointsEach: -TOWER_LOST_PENALTY, subtotal: -state.stats.towersLost * TOWER_LOST_PENALTY });

  const total = Math.max(0, rows.reduce((sum, r) => sum + r.subtotal, 0));
  return { rows, total };
}

export function computeScore(state) {
  return computeScoreBreakdown(state).total;
}
