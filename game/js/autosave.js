// When to write saves -- shared by main.js (solo, into the browser) and
// server.js (co-op at home, into a file on its PC), which each pass in
// their own `write(slot, save)`. Saves are only ever made at a quiet
// moment -- between waves in a defence game, as a round starts in an
// attack (modes.js's canSaveGame) -- so:
//   - the autosave is written once per quiet moment: when a level begins
//     and whenever a wave ends (in an attack: in preparation, and as each
//     round starts);
//   - a save the player asks for mid-wave (or mid-round) is put off until
//     the next quiet moment and written then (per user request: the
//     countdown between waves lasts a few seconds, too short to have to
//     catch it).
// tick() goes before each simulation step: a level's start only counts
// as between waves until its first tick spawns the opening units.
import { canSaveGame, gameSaveMoment, createGameSave } from "./modes.js";

export function createSaveScheduler(write) {
  let lastMoment = null;
  let requestedSlot = null;
  return {
    // A different game now (loaded, resumed, new): its autosave is due at
    // once, unless it's one that's `saved` already (resumed from it).
    reset(state, { saved = false } = {}) {
      lastMoment = saved ? gameSaveMoment(state) : null;
      requestedSlot = null;
    },
    request(slot, state) {
      if (canSaveGame(state)) return { done: true, result: write(slot, createGameSave(state)) };
      requestedSlot = slot;
      return { done: false };
    },
    tick(state, onRequestedWritten) {
      if (!canSaveGame(state)) return;
      const moment = gameSaveMoment(state);
      if (moment !== lastMoment) {
        lastMoment = moment;
        write("auto", createGameSave(state));
      }
      if (requestedSlot != null) {
        const slot = requestedSlot;
        requestedSlot = null;
        const result = write(slot, createGameSave(state));
        if (onRequestedWritten) onRequestedWritten(slot, result);
      }
    },
  };
}
