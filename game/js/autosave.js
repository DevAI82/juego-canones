// When to write saves -- shared by main.js (solo, into the browser) and
// server.js (co-op at home, into a file on its PC), which each pass in
// their own `write(slot, save)`. Saves are only ever made between waves
// (simulate.js's canSaveNow), so:
//   - the autosave is written once per between-waves moment: when a
//     level begins and whenever a wave ends;
//   - a save the player asks for mid-wave is put off until the wave is
//     over, then written (per user request: the countdown between waves
//     lasts a few seconds, too short to have to catch it).
// tick() goes before each simulation step: a level's start only counts
// as between waves until its first tick spawns the opening units.
import { canSaveNow, saveMoment, createSave } from "./simulate.js";

export function createSaveScheduler(write) {
  let lastMoment = null;
  let requestedSlot = null;
  return {
    // A different game now (loaded, resumed, new): its autosave is due at
    // once, unless it's one that's `saved` already (resumed from it).
    reset(state, { saved = false } = {}) {
      lastMoment = saved ? saveMoment(state) : null;
      requestedSlot = null;
    },
    request(slot, state) {
      if (canSaveNow(state)) return { done: true, result: write(slot, createSave(state)) };
      requestedSlot = slot;
      return { done: false };
    },
    tick(state, onRequestedWritten) {
      if (!canSaveNow(state)) return;
      const moment = saveMoment(state);
      if (moment !== lastMoment) {
        lastMoment = moment;
        write("auto", createSave(state));
      }
      if (requestedSlot != null) {
        const slot = requestedSlot;
        requestedSlot = null;
        const result = write(slot, createSave(state));
        if (onRequestedWritten) onRequestedWritten(slot, result);
      }
    },
  };
}
