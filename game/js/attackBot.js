// A simple attacker for headless games -- the tests' whole games and the
// balance runs of the design's §9 («compra unidades, las agrupa y las manda
// por la carretera menos defendida»): as each round starts it buys an army
// with its money, gathers it at the entry whose way to the base the towers
// cover least, and once the group is big enough sends it into the base
// together.
import { levelData } from "./levels.js";
import { attackMapOf, roadRoute } from "./roadGraph.js";
import { routeThreat } from "./ai.js";
import { createAttackState, stepAttack, startAttack, buyUnits, setEntry, orderEnter, upgradeUnitType, ROUNDS } from "./attack.js";

// How many units the bot gathers before it sends them in (bot games:
// groups of 12 lost more units and won fewer games -- 81/43/3 % on
// Easy/Normal/Difficult against 94/61/22 % with 25).
export const GROUP_SIZE = 25;

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

const waiting = (state) => state.enemies.filter((u) => u.alive && !u.order);

// Sends the gathered group into the base once it's GROUP_SIZE strong -- or,
// in the last two rounds, whatever has gathered.
export function sendIn(state) {
  const group = waiting(state);
  const lastRounds = state.attack.round >= ROUNDS - 1;
  if (group.length && (group.length >= GROUP_SIZE || lastRounds)) orderEnter(state, group.map((u) => u.id));
}

// What the bot upgrades with the money its army's cap leaves over, in turn.
const UPGRADE_PLAN = [
  ["soldier", "armor"],
  ["buggy", "armor"],
  ["tank", "armor"],
  ["soldier", "damage"],
  ["buggy", "damage"],
  ["tank", "damage"],
  ["soldier", "rate"],
  ["buggy", "rate"],
];

// The bot's turn as a round starts: a new group gathers at the entry the
// towers cover least (one already gathering stays where it is); it buys a
// tank for every $300 it has to soak up fire (from round 3), a buggy for
// every $70 of what's left and soldiers with the rest -- and with whatever
// the army's cap leaves over, upgrades, round the plan above (a player
// would too). (Buying buggies with half its money made it much weaker:
// soldiers are the better buy.)
export function botRound(state) {
  const a = state.attack;
  if (!waiting(state).length) setEntry(state, safestEntry(state));
  if (a.round >= 3) buyUnits(state, "tank", Math.floor(a.money / 300));
  buyUnits(state, "buggy", Math.floor(a.money / 2 / 35));
  buyUnits(state, "soldier", 60);
  for (let bought = true; bought; ) {
    bought = false;
    for (const [type, skill] of UPGRADE_PLAN) if (upgradeUnitType(state, type, skill).ok) bought = true;
  }
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
