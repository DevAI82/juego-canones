// The duel minigame's panels (docs/2026-11-22-duelo-design.md §9, §10):
// the shop, a unit's upgrades, the HUD's lines, the round's banner, the
// result and the profile's screen. As in attackUI.js, what each of them
// says is worked out from the game by pure functions (tested without a
// page); the builders below them turn that into elements.
//
// Everything is said from a `view` of the duel (duel.js's duelView): what
// the player on `side` may know.
import {
  DUEL_ORDER,
  DUEL_UNITS,
  DUEL_UPGRADES,
  SKILLS,
  UNIT_CAP,
  ROUNDS_TO_WIN,
  otherSide,
  upgradeCost,
} from "./duel.js";
import { DUEL_ARENAS, arenaOf } from "./duelArenas.js";
import { LEAGUES, WINS_TO_PROMOTE, pointsFree, xpProgress } from "./duelProfile.js";
import { UNIT_NAMES, SKILL_NAMES } from "./attackUI.js";

const UNIT_ICON = {
  soldier: "assets/units3d/soldier_icon.webp",
  motorcycle: "assets/units3d/motorcycle_icon.webp",
  buggy: "assets/units3d/buggy_icon.webp",
  tank: "assets/units3d/tank_icon.webp",
  rocket: "assets/units3d/rocket_icon.webp",
};
const SKILL_ICON = {
  damage: "assets/ui_icon_damage.png",
  range: "assets/ui_icon_range.png",
  armor: "assets/ui_icon_armor.png",
  rate: "assets/ui_icon_firerate.png",
  speed: "assets/ui_icon_speed.png",
};

const leagueName = (league) => LEAGUES[league - 1] || LEAGUES[0];
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// Why this side can't shop right now, or "".
function shopShut(view, side) {
  if (view.phase !== "buy") return "La tienda abre entre asaltos";
  if (view.sides[side].ready) return "Ya has dicho «¡Listo!»";
  return "";
}

// ------------------------------------------------------------ what they say

// The shop's cards, cheapest first: the unit and its price, its upgrade
// levels in all (shown as stars), and whether it can be bought now -- with
// why not, for its tooltip.
export function duelShopEntries(view, side) {
  const mine = view.sides[side];
  const shut = shopShut(view, side);
  const full = mine.army.length >= UNIT_CAP;
  return DUEL_ORDER.map((type) => {
    const price = DUEL_UNITS[type].price;
    const poor = mine.money < price;
    return {
      type,
      label: `${UNIT_NAMES[type]} $${price}`,
      stars: SKILLS.reduce((sum, skill) => sum + mine.upgrades[type][skill], 0),
      disabled: Boolean(shut) || full || poor,
      title: shut || (full ? `Tope de ${UNIT_CAP} unidades` : poor ? "No hay dinero suficiente" : "Comprar"),
    };
  });
}

// The five upgrades of a unit type.
export function duelUpgradeRows(view, side, type) {
  const mine = view.sides[side];
  const open = !shopShut(view, side);
  return SKILLS.map((skill) => {
    const level = mine.upgrades[type][skill];
    const cost = upgradeCost(view, side, type, skill);
    return {
      skill,
      name: SKILL_NAMES[skill],
      level,
      levels: DUEL_UPGRADES[skill].levels,
      cost,
      maxed: cost === null,
      affordable: open && cost !== null && mine.money >= cost,
    };
  });
}

// What selling this unit of an army gives back (duel.js's sellUnit).
export function duelRefund(view, unit) {
  const price = DUEL_UNITS[unit.type].price;
  return unit.round === view.round ? price : price / 2;
}

const clock = (seconds) => {
  const s = Math.max(0, Math.ceil(seconds - 1e-9));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

// The HUD: where and which round, this side's money and army, the time
// left of a fight (or of a purchase between two players), and the score.
export function duelHud(view, side) {
  const mine = view.sides[side];
  const timed = view.phase === "combat" || (view.phase === "buy" && view.clock !== null);
  return {
    head: `Duelo · Liga ${arenaOf(view.arena).league} · Asalto ${view.round}`,
    money: `$${Math.floor(mine.money)}`,
    army: `Unidades ${mine.army.length}/${UNIT_CAP}`,
    clock: timed ? clock(view.clock) : null,
    mine: view.wins[side],
    theirs: view.wins[otherSide(side)],
    toWin: ROUNDS_TO_WIN,
  };
}

// What to do next, in a line.
export function duelHint(view, side) {
  if (view.phase !== "buy") return "";
  const mine = view.sides[side];
  if (mine.ready) return "Esperando al rival…";
  if (mine.army.length === 0) return "Compra tu ejército en la tienda";
  return "Arrastra tus unidades para colocarlas y pulsa «¡Listo!»";
}

const ROUND_REASONS = {
  wipe: ["Has destruido su ejército", "Han destruido tu ejército"],
  time: ["Se acabó el tiempo: te quedaba más ejército", "Se acabó el tiempo: al rival le quedaba más ejército"],
  damage: ["Fuerzas igualadas: hiciste más daño", "Fuerzas igualadas: el rival hizo más daño"],
  coin: ["Empate total: se decidió a suertes", "Empate total: se decidió a suertes"],
  empty: ["El rival no presentó ejército", "No presentaste ejército"],
};

// The banner of a finished round, for this side: who won it, why, and the
// money it brought -- the round's income and what the fight itself earned.
// null while there is nothing to announce.
export function roundBanner(view, side) {
  if ((view.phase !== "roundEnd" && view.phase !== "over") || !view.lastRound) return null;
  const { winner, reason, income } = view.lastRound;
  const won = winner === side;
  return {
    won,
    title: won ? "¡ASALTO GANADO!" : "ASALTO PERDIDO",
    detail: (ROUND_REASONS[reason] || ROUND_REASONS.wipe)[won ? 0 : 1],
    income: `+$${income[side]}`,
    earned: `+$${Math.floor(view.sides[side].earned)}`,
  };
}

// Where a profile stands in its league, in a line.
function leagueLine(profile) {
  if (profile.champion) return `Campeón de la liga ${leagueName(LEAGUES.length)}`;
  const goal = profile.league >= LEAGUES.length ? "ser campeón" : "ascender";
  return `Liga ${leagueName(profile.league)} · ${profile.leagueWins}/${WINS_TO_PROMOTE} victorias para ${goal}`;
}

// The end of a duel, for the player on `side`: `gained` and `profile` are
// what duelProfile.js's recordDuel gave back.
export function duelResult(state, side, gained, profile) {
  const won = state.winner === side;
  const destroyed = Object.values(state.sides[side].destroyed).reduce((sum, n) => sum + n, 0);
  const news = [];
  if (gained.levels > 0) {
    news.push(`¡Subes al nivel ${profile.level}! Tienes ${plural(pointsFree(profile), "punto", "puntos")} de habilidad por asignar`);
  }
  if (gained.promoted) news.push(`¡Asciendes a la liga ${leagueName(profile.league)}!`);
  if (gained.champion) news.push(`¡Campeón de la liga ${leagueName(LEAGUES.length)}!`);
  return {
    won,
    title: won ? "¡VICTORIA!" : "DERROTA",
    score: `${state.wins[side]} – ${state.wins[otherSide(side)]}`,
    rows: [
      ["Unidades destruidas", String(destroyed)],
      ["Experiencia", `+${gained.xp}`],
      ["Nivel", String(profile.level)],
    ],
    news,
    league: leagueLine(profile),
  };
}

// The profile's screen: the level and its bar, the league, the skill
// points (those free, and where the others are), and the five arenas --
// those of leagues not reached yet are locked; `top` is the one whose wins
// count for the league.
export function lobbyInfo(profile) {
  const points = {};
  for (const type of DUEL_ORDER) {
    points[type] = {};
    for (const skill of SKILLS) points[type][skill] = profile.points[type]?.[skill] || 0;
  }
  return {
    level: profile.level,
    xp: xpProgress(profile),
    league: leagueLine(profile),
    champion: profile.champion,
    pointsFree: pointsFree(profile),
    points,
    arenas: DUEL_ARENAS.map((arena) => ({
      id: arena.id,
      name: arena.league,
      locked: arena.id > profile.league,
      top: arena.id === profile.league,
    })),
  };
}

// ------------------------------------------------------------ the panels
// Built once in an element and refreshed every frame, like attackUI.js's,
// whose classes (and so whose look) they use.

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

// The shop: «¡Listo!» first, where it is always in sight and big enough
// for a finger on any screen, then a card a unit. A click buys one.
export function mountDuelShop(container, { onBuy, onReady }) {
  container.innerHTML = "";
  const ready = el("button", "duel-ready", "✔ ¡Listo!");
  ready.title = "Empezar el asalto";
  ready.addEventListener("click", () => onReady());
  const list = el("div", "build-towers-section");
  const refs = {};
  for (const type of DUEL_ORDER) {
    const btn = el("button", "build-btn shop-btn");
    btn.style.backgroundImage = `url(${UNIT_ICON[type]})`;
    const label = el("span", "build-btn-label");
    btn.appendChild(label);
    btn.addEventListener("click", () => onBuy(type));
    list.appendChild(btn);
    refs[type] = { btn, label };
  }
  container.append(el("div", "shop-title", "Ejército"), ready, list);
  container._duelShop = refs;
  container._duelReady = ready;
}

export function updateDuelShop(container, view, side) {
  for (const entry of duelShopEntries(view, side)) {
    const { btn, label } = container._duelShop[entry.type];
    btn.disabled = entry.disabled;
    btn.title = entry.title;
    label.textContent = entry.stars ? `${entry.label} ★${entry.stars}` : entry.label;
  }
  const mine = view.sides[side];
  const ready = container._duelReady;
  ready.disabled = Boolean(shopShut(view, side));
  ready.textContent = view.phase === "buy" && mine.ready ? "✔ Listo" : "✔ ¡Listo!";
  // It calls for a press once there is an army to send.
  ready.classList.toggle("pulse", !ready.disabled && mine.army.length > 0);
}

// The panel of the unit picked on the map: its type's five upgrades, and
// selling that unit.
export function mountDuelUnitPanel(container, { onUpgrade, onSell, onClose }) {
  container.innerHTML = "";
  const tabs = el("div", "unit-tabs");
  const name = el("button", "unit-tab active");
  const sell = el("button", "unit-tab duel-sell");
  sell.addEventListener("click", () => onSell());
  const close = el("button", "unit-tab", "✕");
  close.title = "Cerrar";
  close.addEventListener("click", () => onClose());
  tabs.append(name, sell, close);
  const cols = el("div", "unit-upgrade-cols");
  const colRefs = {};
  for (const skill of SKILLS) {
    const col = el("div", "upgrade-col");
    const card = el("div", "upgrade-card");
    card.style.backgroundImage = `url(${SKILL_ICON[skill]})`;
    const stats = el("div", "upgrade-stats");
    const levelEl = el("span", "upgrade-level");
    const costEl = el("span", "upgrade-cost");
    stats.append(levelEl, costEl);
    const pips = el("div", "upgrade-pips");
    const pipEls = [];
    for (let i = 0; i < DUEL_UPGRADES[skill].levels; i++) {
      const pip = el("span", "upgrade-pip");
      pips.appendChild(pip);
      pipEls.push(pip);
    }
    card.append(stats, pips);
    const btn = el("button", "upgrade-btn");
    btn.addEventListener("click", () => onUpgrade(skill));
    col.append(el("div", "upgrade-label", SKILL_NAMES[skill]), card, btn);
    cols.appendChild(col);
    colRefs[skill] = { levelEl, costEl, btn, pipEls };
  }
  container.append(tabs, cols);
  container._duelUnit = { name, sell, colRefs };
}

// `unit`: the army's unit picked, or null (the panel hides).
export function updateDuelUnitPanel(container, view, side, unit) {
  container.classList.toggle("hidden", !unit);
  if (!unit) return;
  const { name, sell, colRefs } = container._duelUnit;
  name.textContent = UNIT_NAMES[unit.type];
  sell.textContent = `Vender $${duelRefund(view, unit)}`;
  sell.disabled = Boolean(shopShut(view, side));
  for (const row of duelUpgradeRows(view, side, unit.type)) {
    const { levelEl, costEl, btn, pipEls } = colRefs[row.skill];
    levelEl.textContent = `Nv. ${row.level}/${row.levels}`;
    costEl.textContent = row.maxed ? "-" : `$${row.cost}`;
    btn.textContent = row.maxed ? "Máx" : "Mejorar";
    btn.disabled = !row.affordable;
    pipEls.forEach((pip, i) => pip.classList.toggle("filled", i < row.level));
  }
}

// The profile's screen, in the menu. onStart(arena), onAssign(type, skill)
// and onReset() are called for the player's clicks; the screen is drawn
// again by calling this again.
export function renderDuelLobby(container, profile, handlers) {
  const info = lobbyInfo(profile);
  container.innerHTML = "";

  const head = el("div", "duel-profile");
  const bar = el("div", "duel-xp");
  const fill = el("div", "duel-xp-fill");
  fill.style.width = info.xp.need ? `${Math.round((100 * info.xp.have) / info.xp.need)}%` : "100%";
  bar.append(fill, el("span", "duel-xp-text", info.xp.need ? `${info.xp.have} / ${info.xp.need} de experiencia` : "Nivel máximo"));
  head.append(el("div", "duel-level", `Nivel ${info.level}`), bar, el("div", "duel-league", info.league));

  const arenas = el("div", "duel-arenas");
  for (const arena of info.arenas) {
    const btn = el("button", `duel-arena${arena.top ? " top" : ""}`);
    btn.disabled = arena.locked;
    const picture = arenaOf(arena.id).image;
    if (picture) btn.style.backgroundImage = `linear-gradient(rgba(6, 10, 12, 0.35), rgba(6, 10, 12, 0.8)), url(${picture})`;
    btn.append(
      el("span", "duel-arena-name", arena.name),
      el("span", "duel-arena-note", arena.locked ? "🔒 Gana en la liga anterior" : arena.top ? "Tu liga" : "Superada"),
    );
    btn.addEventListener("click", () => handlers.onStart(arena.id));
    arenas.appendChild(btn);
  }
  container.append(head, el("div", "menu-subtitle", "Elige arena"), arenas);

  // The skill points, once there is one to give.
  if (info.level > 1) {
    const box = el("div", "duel-points");
    const title = el("div", "duel-points-head", `Puntos de habilidad: ${plural(info.pointsFree, "libre", "libres")}`);
    const reset = el("button", "duel-points-reset", "Reiniciar puntos");
    reset.addEventListener("click", () => handlers.onReset());
    title.appendChild(reset);
    const grid = el("div", "duel-points-grid");
    grid.appendChild(el("span", "duel-points-corner"));
    for (const skill of SKILLS) grid.appendChild(el("span", "duel-points-skill", SKILL_NAMES[skill]));
    for (const type of DUEL_ORDER) {
      grid.appendChild(el("span", "duel-points-unit", UNIT_NAMES[type]));
      for (const skill of SKILLS) {
        const n = info.points[type][skill];
        const cell = el("button", `duel-point${n ? " set" : ""}`, n ? `+${n}` : "·");
        cell.disabled = info.pointsFree <= 0 || n >= DUEL_UPGRADES[skill].levels;
        cell.title = `${UNIT_NAMES[type]}: empieza con un nivel más de ${SKILL_NAMES[skill].toLowerCase()} contra la máquina`;
        cell.addEventListener("click", () => handlers.onAssign(type, skill));
        grid.appendChild(cell);
      }
    }
    box.append(title, grid);
    container.appendChild(box);
  }
}

// The end of a duel, over the arena. onRematch() and onExit() for its two
// buttons.
export function showDuelResult(container, result, { onRematch, onExit }) {
  container.innerHTML = "";
  const box = el("div", `duel-result-box ${result.won ? "won" : "lost"}`);
  box.append(el("div", "duel-result-title", result.title), el("div", "duel-result-score", result.score));
  const table = el("table", "duel-result-rows");
  for (const [label, value] of result.rows) {
    const row = el("tr");
    row.append(el("td", "", label), el("td", "", value));
    table.appendChild(row);
  }
  box.appendChild(table);
  for (const line of result.news) box.appendChild(el("div", "duel-result-news", line));
  box.appendChild(el("div", "duel-result-league", result.league));
  const buttons = el("div", "duel-result-buttons");
  const again = el("button", "duel-result-btn", "Revancha");
  again.addEventListener("click", () => onRematch());
  const exit = el("button", "duel-result-btn", "Salir");
  exit.addEventListener("click", () => onExit());
  buttons.append(again, exit);
  box.appendChild(buttons);
  container.appendChild(box);
  container.classList.remove("hidden");
}

export function hideDuelResult(container) {
  container.classList.add("hidden");
  container.innerHTML = "";
}
