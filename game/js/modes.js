// The two ways to play -- defending (simulate.js) and attacking
// (attack.js) -- share one game loop and one set of saved games: these
// pick each step's defence or attack version by the game's mode. A game
// without a mode is a defence game (all of them, before the attack mode).
import { stepSimulation, canSaveNow, saveMoment, createSave, restoreSave, saveSummary } from "./simulate.js";
import { stepAttack, canSaveAttack, attackSaveMoment, createAttackSave, restoreAttackSave, attackSaveSummary } from "./attack.js";

const attacking = (state) => state.mode === "attack";
const attackSave = (save) => Boolean(save) && typeof save === "object" && save.mode === "attack";

export function stepGame(state, dt) {
  if (attacking(state)) stepAttack(state, dt);
  else stepSimulation(state, dt);
}

export function canSaveGame(state) {
  return attacking(state) ? canSaveAttack(state) : canSaveNow(state);
}

export function gameSaveMoment(state) {
  return attacking(state) ? attackSaveMoment(state) : saveMoment(state);
}

export function createGameSave(state, now = new Date()) {
  return attacking(state) ? createAttackSave(state, now) : createSave(state, now);
}

export function restoreGameSave(save) {
  return attackSave(save) ? restoreAttackSave(save) : restoreSave(save);
}

export function gameSaveSummary(save) {
  if (attackSave(save)) return attackSaveSummary(save);
  const summary = saveSummary(save);
  return summary && { mode: "defense", ...summary };
}
