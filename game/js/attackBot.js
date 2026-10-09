// A simple attacker for headless games -- the tests' whole games and the
// balance runs of the design's §9: as each round starts it buys an army
// with its money, picks the entry whose way to the base the towers cover
// least, and sends everything it has into the base.
import { levelData } from "./levels.js";
import { attackMapOf, roadRoute } from "./roadGraph.js";
import { routeThreat } from "./ai.js";
import { createAttackState, stepAttack, startAttack, buyUnits, setEntry, orderEnter } from "./attack.js";

// The entry whose road to the base runs past the least firepower.
function safestEntry(state) {
  const { graph, entries, base } = attackMapOf(levelData(state.level));
  let best = 0;
  let bestThreat = Infinity;
  entries.forEach((e, i) => {
    const threat = routeThreat(roadRoute(graph, e, base), state.towers);
    if (threat < bestThreat) {
      best = i;
      bestThreat = threat;
    }
  });
  return best;
}

// Sends every unit standing idle into the base.
export function sendIn(state) {
  const idle = state.enemies.filter((u) => u.alive && !u.order).map((u) => u.id);
  if (idle.length) orderEnter(state, idle);
}

// The bot's turn as a round starts: at the safest entry, a tank or two to
// soak up fire (from round 3), buggies with half of the rest of the money,
// soldiers with what's left -- and everyone in.
export function botRound(state) {
  const a = state.attack;
  setEntry(state, safestEntry(state));
  if (a.round >= 3) buyUnits(state, "tank", Math.floor(a.money / 300));
  buyUnits(state, "buggy", Math.floor(a.money / 2 / 35));
  buyUnits(state, "soldier", 60);
  sendIn(state);
}

// A whole game, the bot against the computer's defence; onTick(state)
// after every step. Returns the finished game.
export function playBotGame(level, difficulty, { dt = 0.1, onTick = null } = {}) {
  const state = createAttackState(level, difficulty);
  botRound(state);
  startAttack(state);
  let sinceSend = 0;
  while (!state.gameOver) {
    stepAttack(state, dt);
    if (onTick) onTick(state);
    if (state.attack.roundJustStarted) botRound(state);
    sinceSend += dt;
    if (sinceSend >= 1) {
      sinceSend = 0;
      sendIn(state);
    }
  }
  return state;
}
