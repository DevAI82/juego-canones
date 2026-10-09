// The five lines of the statistics board (per user request: the drawing
// Imágenes/PANTALLA ESTADÍSTICAS.jpg, its sample labels and numbers
// painted out of assets/stats_board.jpg). Its pictures stay -- a bunker,
// an ammunition belt, coins, a shield, a skull -- and the game writes over
// them what they stand for in the game being played: a defence's, or an
// attack's. The fourth line's number goes on the shield. DOM-free; ui.js
// writes them into the board.
import { WAVES } from "./waves.js";
import { ROUNDS } from "./attack.js";

// 328643 -> "328.643", as numbers are written in Spanish.
export function formatCount(n) {
  return Math.round(n).toLocaleString("es-ES", { useGrouping: "always" });
}

const kills = (state) => Object.values(state.stats.kills || {}).reduce((sum, n) => sum + n, 0);

export function statsBoardRows(state) {
  if (state.mode === "attack") {
    const a = state.attack;
    return [
      { label: "Torres destruidas", value: formatCount(state.stats.towersLost) },
      { label: "Unidades perdidas", value: formatCount(kills(state)) },
      { label: "Dinero gastado", value: `$${formatCount(a.stats.moneySpent)}` },
      { label: "Vidas de la base", value: String(state.economy.lives) },
      { label: `Ronda · nivel ${state.level}`, value: `${a.round}/${ROUNDS}` },
    ];
  }
  return [
    { label: "Torres construidas", value: formatCount(state.stats.towersBuilt) },
    { label: "Enemigos abatidos", value: formatCount(kills(state)) },
    { label: "Dinero gastado", value: `$${formatCount(state.stats.moneySpent)}` },
    { label: "Vidas restantes", value: String(state.economy.lives) },
    { label: `Oleada · nivel ${state.level}`, value: `${state.economy.wave}/${WAVES.length}` },
  ];
}
