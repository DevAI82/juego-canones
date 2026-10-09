// The phone's automatic army, per user request ("en el móvil sea todo
// automático": the player only buys units and zooms; the army goes on its
// own to the entry the towers cover least). On a PC the player commands it
// with the mouse instead (attackControls.js).
//
// What it does, like the design's bot (attackBot.js): while no units are
// waiting, the next ones gather at the entry whose road to the base runs
// past the least firepower; the waiting group goes into the base together
// as each round starts (the preparation's army with «¡Al ataque!»), as soon
// as it's GROUP_SIZE strong, or at once in the last two rounds. Units
// bought during a round wait at the entry for the next one, so the army
// never trickles in one by one to be picked off.
import { setEntry, orderEnter, ROUNDS } from "./attack.js";
import { safestEntry, GROUP_SIZE } from "./attackBot.js";

export function createAutoArmy() {
  let lastRound = null; // the battle round it last saw

  return {
    reset() {
      lastRound = null;
    },

    // Call often (every frame or so) while an attack is on.
    step(state) {
      const a = state?.attack;
      if (!a || state.gameOver) return;
      const waiting = state.enemies.filter((u) => u.alive && !u.order);
      if (!waiting.length && !a.queue.length) setEntry(state, safestEntry(state));
      if (a.phase !== "battle") return;
      const newRound = a.round !== lastRound;
      lastRound = a.round;
      const lastRounds = a.round >= ROUNDS - 1;
      if (waiting.length && (newRound || lastRounds || waiting.length >= GROUP_SIZE)) {
        orderEnter(state, waiting.map((u) => u.id));
      }
    },
  };
}
