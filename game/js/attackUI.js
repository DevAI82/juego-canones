// The attack mode's interface (docs/2026-10-09-modo-atacante-design.md §5):
// the shop of units, the upgrade panel of the selected units' types, the
// HUD's lines and the end screen's summary. What each card, row and line
// says is worked out from the game state by pure functions (tested
// without a page); the panels are built once and refreshed every frame,
// like ui.js's build menu and towers' upgrade panel, whose look they share.
import { UNIT_ORDER, UNIT_PRICES, UNIT_UPGRADES, UNIT_CAP, ROUNDS, unitUpgradeCost } from "./attack.js";
import { DIFFICULTY_NAMES, MONEY_NAMES } from "./menu.js";

export const UNIT_NAMES = { soldier: "Soldado", motorcycle: "Moto", buggy: "Buggy", tank: "Tanque", rocket: "Lanzacohetes" };
export const SKILL_NAMES = { damage: "Daño", range: "Alcance", armor: "Blindaje", rate: "Cadencia", speed: "Velocidad" };

const UNIT_ICON = {
  soldier: "assets/enemy_soldier.png",
  motorcycle: "assets/enemy_motorcycle.png",
  buggy: "assets/enemy_buggy.png",
  tank: "assets/enemy_tank.png",
  rocket: "assets/enemy_rocket.png",
};
const SKILL_ICON = {
  damage: "assets/ui_icon_damage.png",
  range: "assets/ui_icon_range.png",
  armor: "assets/ui_icon_armor.png",
  rate: "assets/ui_icon_firerate.png",
  speed: "assets/ui_icon_speed.png",
};

// The army's size, counting the units bought and still to come in.
const armySize = (state) => state.enemies.length + state.attack.queue.length;

// One shop card: its label, the type's upgrade levels in all (shown as
// stars), and whether it can be bought now -- with why not, for its tooltip.
export function shopEntry(state, type) {
  const a = state.attack;
  const price = UNIT_PRICES[type];
  const full = armySize(state) >= UNIT_CAP;
  const poor = a.money < price;
  return {
    label: `${UNIT_NAMES[type]} $${price}`,
    stars: Object.values(a.upgrades[type]).reduce((sum, level) => sum + level, 0),
    disabled: Boolean(state.gameOver) || full || poor,
    title: full ? `Tope de ${UNIT_CAP} unidades` : poor ? "No hay dinero suficiente" : "Clic: comprar 1 · Mayús + clic: comprar 5",
  };
}

// The upgrade panel's five rows for a unit type.
export function upgradeRows(state, type) {
  const levels = state.attack.upgrades[type];
  return Object.entries(UNIT_UPGRADES).map(([skill, def]) => {
    const level = levels[skill];
    const maxed = level >= def.levels;
    const cost = maxed ? null : unitUpgradeCost(skill, level);
    return {
      skill,
      name: SKILL_NAMES[skill],
      level,
      levels: def.levels,
      cost,
      maxed,
      affordable: !maxed && !state.gameOver && state.attack.money >= cost,
    };
  });
}

const clock = (seconds) => {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

// The HUD's lines: the round and the time left in it (or the preparation),
// the base's lives, the money and the army's size.
export function attackHudLines(state) {
  const a = state.attack;
  const head =
    a.phase === "prep" ? `Nivel ${state.level} · Preparación` : `Nivel ${state.level} · Ronda ${a.round}/${ROUNDS} · ${clock(a.roundLeft)}`;
  return [head, `Base: ❤ ${state.economy.lives}`, `$${Math.floor(a.money)}`, `Unidades ${armySize(state)}/${UNIT_CAP}`];
}

// The same game seen by the defender, one against the other: the round
// and its clock, the base's lives, the defence's money and the army
// coming at it.
export function defenderHudLines(state) {
  const [head] = attackHudLines(state);
  return [head, `Base: ❤ ${state.economy.lives}`, `$${Math.floor(state.economy.money)}`, `Ejército enemigo ${armySize(state)}/${UNIT_CAP}`];
}

// What the end screen says about a finished attack (design §3.7) to the
// player on `side` -- the attacker's, unless it's the defender of a game
// one against the other.
export function attackSummary(state, side = "attack") {
  const a = state.attack;
  const baseFell = a.winner === "attacker";
  const won = baseFell === (side === "attack");
  const lost = Object.values(state.stats.kills).reduce((sum, n) => sum + n, 0);
  const byPerson = a.defender === "player";
  return {
    title: baseFell ? "¡BASE DESTRUIDA!" : "LA BASE HA RESISTIDO",
    subtitle: won ? "Has ganado" : "Has perdido",
    rows: [
      ["Ronda alcanzada", `${a.round}/${ROUNDS}`],
      ["Vidas quitadas a la base", String(a.stats.livesTaken)],
      ["Torres destruidas", String(state.stats.towersLost)],
      ["Unidades perdidas", String(lost)],
      ["Dinero gastado", `$${Math.round(a.stats.moneySpent)}`],
      byPerson
        ? ["Dinero de la defensa", MONEY_NAMES[a.difficulty] || MONEY_NAMES.normal]
        : ["Dificultad", DIFFICULTY_NAMES[a.difficulty] || DIFFICULTY_NAMES.normal],
    ],
  };
}

// The shop, built once in `container` (it takes the build menu's place).
// A click buys one unit, Shift + click five.
export function initShop(container, { onBuy }) {
  container.innerHTML = "";
  const title = document.createElement("div");
  title.className = "shop-title";
  title.textContent = "Ejército";
  const list = document.createElement("div");
  list.className = "build-towers-section";
  const refs = {};
  for (const type of UNIT_ORDER) {
    const btn = document.createElement("button");
    btn.className = "build-btn shop-btn";
    btn.style.backgroundImage = `url(${UNIT_ICON[type]})`;
    const label = document.createElement("span");
    label.className = "build-btn-label";
    btn.appendChild(label);
    btn.addEventListener("click", (evt) => onBuy(type, evt.shiftKey ? 5 : 1));
    list.appendChild(btn);
    refs[type] = { btn, label };
  }
  container.append(title, list);
  container._shopRefs = refs;
}

// Every frame: prices, upgrade stars and which cards can be bought.
export function updateShop(container, state) {
  for (const type of UNIT_ORDER) {
    const { btn, label } = container._shopRefs[type];
    const entry = shopEntry(state, type);
    btn.disabled = entry.disabled;
    btn.title = entry.title;
    label.textContent = entry.stars ? `${entry.label} ★${entry.stars}` : entry.label;
  }
}

// The upgrade panel of the selected units' types, built once: a tab per
// type, and the five upgrades of the active one laid out like the towers'.
// The upgrades fold away under a button (onToggle): the panel comes up
// with every selection, and open it hid the bottom of the map just where
// orders were being given (level 4's base, per user request).
export function initUnitUpgrades(container, { onUpgrade, onTab, onToggle }) {
  container.innerHTML = "";
  const tabs = document.createElement("div");
  tabs.className = "unit-tabs";
  const tabRefs = {};
  for (const type of UNIT_ORDER) {
    const tab = document.createElement("button");
    tab.className = "unit-tab";
    tab.textContent = UNIT_NAMES[type];
    tab.addEventListener("click", () => onTab(type));
    tabs.appendChild(tab);
    tabRefs[type] = tab;
  }
  const toggle = document.createElement("button");
  toggle.className = "unit-tab unit-upgrade-toggle";
  toggle.addEventListener("click", () => onToggle());
  tabs.appendChild(toggle);
  const cols = document.createElement("div");
  cols.className = "unit-upgrade-cols";
  const colRefs = {};
  for (const skill of Object.keys(UNIT_UPGRADES)) {
    const col = document.createElement("div");
    col.className = "upgrade-col";
    const label = document.createElement("div");
    label.className = "upgrade-label";
    label.textContent = SKILL_NAMES[skill];
    const card = document.createElement("div");
    card.className = "upgrade-card";
    card.style.backgroundImage = `url(${SKILL_ICON[skill]})`;
    const stats = document.createElement("div");
    stats.className = "upgrade-stats";
    const levelEl = document.createElement("span");
    levelEl.className = "upgrade-level";
    const costEl = document.createElement("span");
    costEl.className = "upgrade-cost";
    stats.append(levelEl, costEl);
    const pips = document.createElement("div");
    pips.className = "upgrade-pips";
    const pipEls = [];
    for (let i = 0; i < UNIT_UPGRADES[skill].levels; i++) {
      const pip = document.createElement("span");
      pip.className = "upgrade-pip";
      pips.appendChild(pip);
      pipEls.push(pip);
    }
    card.append(stats, pips);
    const btn = document.createElement("button");
    btn.className = "upgrade-btn";
    btn.addEventListener("click", () => onUpgrade(skill));
    col.append(label, card, btn);
    cols.appendChild(col);
    colRefs[skill] = { levelEl, costEl, btn, pipEls };
  }
  container.append(tabs, cols);
  container._unitUpgradeRefs = { tabRefs, colRefs, cols, toggle };
}

// Every frame. `types`: the unit types in the selection (none: the panel
// hides); `active`: the one whose upgrades show; `open`: shown, or folded
// away to its tabs.
export function updateUnitUpgrades(container, state, types, active, open = true) {
  container.classList.toggle("hidden", !types.length || !active);
  if (!types.length || !active) return;
  const { tabRefs, colRefs, cols, toggle } = container._unitUpgradeRefs;
  cols.classList.toggle("hidden", !open);
  toggle.textContent = open ? "▼ Ocultar" : "▲ Mejoras";
  for (const type of UNIT_ORDER) {
    tabRefs[type].classList.toggle("hidden", !types.includes(type));
    tabRefs[type].classList.toggle("active", type === active);
  }
  for (const row of upgradeRows(state, active)) {
    const { levelEl, costEl, btn, pipEls } = colRefs[row.skill];
    levelEl.textContent = `Nv. ${row.level}/${row.levels}`;
    costEl.textContent = row.maxed ? "-" : `$${row.cost}`;
    btn.textContent = row.maxed ? "Máx" : "Mejorar";
    btn.disabled = !row.affordable;
    pipEls.forEach((pip, i) => pip.classList.toggle("filled", i < row.level));
  }
}
