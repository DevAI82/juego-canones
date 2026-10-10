// The two ways to play -- defending (simulate.js) and attacking
// (attack.js) -- share one game loop and one set of saved games: these
// pick each step's defence or attack version by the game's mode. A game
// without a mode is a defence game (all of them, before the attack mode).
import { stepSimulation, canSaveNow, saveMoment, createSave, restoreSave, saveSummary } from "./simulate.js";
import { stepAttack, canSaveAttack, attackSaveMoment, createAttackSave, restoreAttackSave, attackSaveSummary } from "./attack.js";
import { stepRts } from "./rts.js";

const attacking = (state) => state.mode === "attack";
const attackSave = (save) => Boolean(save) && typeof save === "object" && save.mode === "attack";

export function stepGame(state, dt) {
  if (state.isRts) stepRts(state, dt);
  else if (attacking(state)) stepAttack(state, dt);
  else stepSimulation(state, dt);
}

export function canSaveGame(state) {
  if (state.isRts) return true;
  return attacking(state) ? canSaveAttack(state) : canSaveNow(state);
}

export function gameSaveMoment(state) {
  if (state.isRts) return `rts_${state.rtsSubmode || "campaign"}`;
  return attacking(state) ? attackSaveMoment(state) : saveMoment(state);
}

export function createRtsSave(state, now = new Date()) {
  return {
    version: 1,
    savedAt: now.toISOString(),
    isRts: true,
    rtsSubmode: state.rtsSubmode,
    survivalWave: state.survivalWave,
    survivalWaveTimer: state.survivalWaveTimer,
    teams: JSON.parse(JSON.stringify(state.teams)),
    mineralFields: JSON.parse(JSON.stringify(state.mineralFields)),
    rtsBuildings: JSON.parse(JSON.stringify(state.rtsBuildings)),
    rtsUnits: JSON.parse(JSON.stringify(state.rtsUnits)),
    nextId: state.nextId,
    winner: state.winner,
    level: 3,
  };
}

export function restoreRtsSave(save) {
  return {
    isRts: true,
    rtsSubmode: save.rtsSubmode || "campaign",
    survivalWave: save.survivalWave || 0,
    maxSurvivalWaves: 20,
    survivalWaveTimer: save.survivalWaveTimer || 0,
    teams: JSON.parse(JSON.stringify(save.teams || {})),
    mineralFields: JSON.parse(JSON.stringify(save.mineralFields || [])),
    rtsBuildings: JSON.parse(JSON.stringify(save.rtsBuildings || [])),
    rtsUnits: JSON.parse(JSON.stringify(save.rtsUnits || [])),
    nextId: save.nextId || 4000,
    winner: save.winner || null,
    level: 3,
    paused: false,
    gameOver: false,
    win: false,
  };
}

export function createGameSave(state, now = new Date()) {
  if (state.isRts) return createRtsSave(state, now);
  return attacking(state) ? createAttackSave(state, now) : createSave(state, now);
}

export function restoreGameSave(save) {
  if (save && save.isRts) return restoreRtsSave(save);
  return attackSave(save) ? restoreAttackSave(save) : restoreSave(save);
}

export function gameSaveSummary(save) {
  if (save && save.isRts) {
    return {
      mode: "rts",
      submode: save.rtsSubmode || "campaign",
      level: 3,
      credits: save.teams && save.teams.blue ? save.teams.blue.credits : 0,
    };
  }
  if (attackSave(save)) return attackSaveSummary(save);
  const summary = saveSummary(save);
  return summary && { mode: "defense", ...summary };
}
