import { TOWER_TYPES } from "./tower.js";
import { UPGRADE_DEFS, upgradeCost, canUpgrade } from "./upgrades.js";
import { computeScoreBreakdown } from "./scoring.js";

const LABELS = { basic: "Básica", double: "Doble", laser: "Láser" };
const SKILL_LABELS = { damage: "Daño", range: "Alcance", fireRate: "Vel. disparo", armor: "Blindaje" };
// Reuse each tower's own premium render (game/assets/tower_*.png, extracted
// from the user's "diseño torres" reference images) as the build menu's
// icon, instead of a plain text button -- per user request for a more
// premium look here too.
const TOWER_ICON = { basic: "assets/tower_basic.png", double: "assets/tower_double.png", laser: "assets/tower_laser.png" };
// Reuse each enemy's own in-game sprite as the score breakdown's row icon
// -- per user request for a more visual stats screen.
const ENEMY_ICON = {
  soldier: "assets/enemy_soldier.png",
  motorcycle: "assets/enemy_motorcycle.png",
  buggy: "assets/enemy_buggy.png",
  tank: "assets/enemy_tank.png",
  rocket: "assets/enemy_rocket.png",
};

export function initBuildMenu(container, { onSelect }) {
  container.innerHTML = "";
  for (const type of Object.keys(TOWER_TYPES)) {
    const btn = document.createElement("button");
    btn.className = "build-btn";
    btn.dataset.type = type;
    btn.style.backgroundImage = `url(${TOWER_ICON[type]})`;
    const label = document.createElement("span");
    label.className = "build-btn-label";
    btn.appendChild(label);
    btn.addEventListener("click", () => onSelect(type));
    container.appendChild(btn);
  }
}

export function updateBuildMenu(container, { towers, economy, selectedType }) {
  for (const btn of container.querySelectorAll(".build-btn")) {
    const type = btn.dataset.type;
    const def = TOWER_TYPES[type];
    const countOnField = towers.filter((t) => t.type === type && t.hp > 0).length;
    const atMax = countOnField >= def.maxCount;
    const canAfford = economy.money >= def.cost;
    btn.disabled = atMax || !canAfford;
    btn.classList.toggle("selected", type === selectedType);
    btn.querySelector(".build-btn-label").textContent = `${LABELS[type]} ($${def.cost}) ${countOnField}/${def.maxCount}`;
  }
}

// Builds the upgrade panel's DOM structure ONCE and wires up its event
// listeners once. This mirrors updateBuildMenu's pattern above: rebuilding
// innerHTML on every animation-loop call (as the old renderUpgradePanel did)
// makes the buttons structurally unclickable, because a browser click event
// only fires when the mousedown and mouseup targets share a common ancestor
// -- and at ~60 rebuilds/sec against a 50-150ms human click, the DOM gets
// swapped out from under the pointer between those two events almost every
// time. See updateUpgradePanel below for the per-frame mutation half.
//
// `onUpgrade`/`onRepair`/`onSell` are captured once here, but that's fine as
// long as the caller defines them as ordinary functions that read the
// "currently selected tower" from their own enclosing scope at call time
// (e.g. a module-level `let selectedTower` in main.js) rather than a value
// snapshotted when initUpgradePanel was invoked.
// Holographic-card art per skill, and the shared "Mejorar" button art --
// cropped from the user's Gemini-generated mockup (diseño mejoras.jpg) so
// the panel matches the premium sci-fi look they commissioned, rather than
// plain text buttons.
const SKILL_ICON = {
  damage: "assets/ui_icon_damage.png",
  range: "assets/ui_icon_range.png",
  fireRate: "assets/ui_icon_firerate.png",
  // Cropped from the follow-up mockup (Mejoras/diseño mejoras ampliado.jpg)
  // that added this 4th skill, not the original 3-skill one above.
  armor: "assets/ui_icon_armor.png",
};

export function initUpgradePanel(container, { onUpgrade, onRepair, onSell }) {
  container.innerHTML = "";
  const cols = {};

  for (const skill of Object.keys(UPGRADE_DEFS)) {
    const col = document.createElement("div");
    col.className = "upgrade-col";

    const label = document.createElement("div");
    label.className = "upgrade-label";
    label.textContent = SKILL_LABELS[skill];

    // The hologram-icon crop only covers the icon area of the mockup (not
    // the stats/pips region below it, which needs to show live numbers) --
    // this inner card is the cyan-bordered box, with the icon as its top
    // background and its own dark fill showing through underneath for the
    // stats/pips row, so the border reads as one continuous card exactly
    // like the mockup's.
    const card = document.createElement("div");
    card.className = "upgrade-card";
    card.style.backgroundImage = `url(${SKILL_ICON[skill]})`;

    const stats = document.createElement("div");
    stats.className = "upgrade-stats";
    const levelEl = document.createElement("span");
    levelEl.className = "upgrade-level";
    const costEl = document.createElement("span");
    costEl.className = "upgrade-cost";
    stats.appendChild(levelEl);
    stats.appendChild(costEl);

    const pips = document.createElement("div");
    pips.className = "upgrade-pips";
    const pipEls = [];
    for (let i = 0; i < UPGRADE_DEFS[skill].levels; i++) {
      const pip = document.createElement("span");
      pip.className = "upgrade-pip";
      pips.appendChild(pip);
      pipEls.push(pip);
    }

    card.appendChild(stats);
    card.appendChild(pips);

    const btn = document.createElement("button");
    btn.className = "upgrade-btn";
    btn.textContent = "Mejorar";
    btn.addEventListener("click", () => onUpgrade(skill));

    col.appendChild(label);
    col.appendChild(card);
    col.appendChild(btn);
    container.appendChild(col);

    cols[skill] = { levelEl, costEl, btn, pipEls };
  }

  const repairBtn = document.createElement("button");
  repairBtn.className = "upgrade-icon-btn upgrade-repair-btn";
  repairBtn.setAttribute("aria-label", "Reparar");
  repairBtn.addEventListener("click", () => onRepair());
  container.appendChild(repairBtn);

  const sellBtn = document.createElement("button");
  sellBtn.className = "upgrade-icon-btn upgrade-sell-btn";
  sellBtn.setAttribute("aria-label", "Vender");
  sellBtn.addEventListener("click", () => onSell());
  container.appendChild(sellBtn);

  // Stash element references on the container so updateUpgradePanel (called
  // every frame) can find them again without touching innerHTML.
  container._upgradePanelRefs = { cols, repairBtn, sellBtn };
}

// The end-of-game screen only needs to render once (when the match ends)
// and again after a score save -- unlike the build menu/upgrade panel
// above, nothing here needs a per-frame update, so this rebuilds innerHTML
// freely rather than following their build-once/mutate-every-frame split.

function scoreCell(text, extraClass) {
  const td = document.createElement("td");
  td.textContent = text;
  if (extraClass) td.className = extraClass;
  return td;
}

export function renderGameEndScreen(overlay, state) {
  const title = overlay.querySelector("#gameend-title");
  if (state.levelComplete) title.textContent = `¡NIVEL ${state.level} SUPERADO!`;
  else title.textContent = state.win ? "¡VICTORIA!" : "GAME OVER";

  // The save/ranking sections only make sense at a true match end (a
  // loss, or beating the FINAL level) -- clearing an earlier level is
  // just a checkpoint on the way there, so those are hidden and only the
  // stats-so-far/score breakdown shows.
  overlay.querySelector("#gameend-save-row").classList.toggle("hidden", state.levelComplete);
  overlay.querySelector("#gameend-save-status").classList.toggle("hidden", state.levelComplete);
  overlay.querySelector("#gameend-ranking-title").classList.toggle("hidden", state.levelComplete);
  overlay.querySelector("#gameend-ranking").classList.toggle("hidden", state.levelComplete);

  const { rows, total } = computeScoreBreakdown(state);
  const table = overlay.querySelector("#gameend-breakdown");
  table.innerHTML = "";

  const info = document.createElement("tr");
  info.className = "gameend-info-row";
  info.append(scoreCell("Torretas construidas"), scoreCell(state.stats.towersBuilt));
  table.appendChild(info);
  const info2 = document.createElement("tr");
  info2.className = "gameend-info-row";
  info2.append(scoreCell("Dinero gastado en total"), scoreCell(`$${state.stats.moneySpent}`));
  table.appendChild(info2);

  const header = document.createElement("tr");
  header.className = "gameend-header-row";
  header.append(scoreCell("Concepto"), scoreCell("Cantidad"), scoreCell("Puntos c/u"), scoreCell("Subtotal"));
  table.appendChild(header);

  for (const row of rows) {
    const tr = document.createElement("tr");
    tr.className = "gameend-score-row";
    if (row.subtotal < 0) tr.classList.add("negative");
    const sign = (n) => (n > 0 ? `+${n}` : `${n}`);

    const conceptCell = document.createElement("td");
    conceptCell.className = "gameend-concept-cell";
    if (row.type && ENEMY_ICON[row.type]) {
      const icon = document.createElement("img");
      icon.src = ENEMY_ICON[row.type];
      icon.alt = "";
      icon.className = "gameend-enemy-icon";
      conceptCell.appendChild(icon);
    }
    conceptCell.appendChild(document.createTextNode(row.label));

    tr.append(conceptCell, scoreCell(row.count), scoreCell(sign(row.pointsEach)), scoreCell(sign(row.subtotal)));
    table.appendChild(tr);
  }

  overlay.querySelector("#gameend-total").textContent = `PUNTUACIÓN TOTAL: ${total}`;
  return total;
}

export function renderRanking(overlay, entries, highlightIndex = -1) {
  const list = overlay.querySelector("#gameend-ranking");
  list.innerHTML = "";
  if (!entries || entries.length === 0) {
    const li = document.createElement("li");
    li.className = "gameend-ranking-empty";
    li.textContent = "Sin puntuaciones todavía -- ¡sé el primero!";
    list.appendChild(li);
    return;
  }
  entries.forEach((entry, i) => {
    const li = document.createElement("li");
    li.textContent = `${entry.name} — ${entry.score} pts`;
    if (i === highlightIndex) li.classList.add("gameend-ranking-mine");
    list.appendChild(li);
  });
}

// Called every frame. Only mutates existing elements (text/disabled/hidden
// state) -- never innerHTML -- so listeners attached once in
// initUpgradePanel stay attached across every call.
export function updateUpgradePanel(container, tower) {
  const visible = !!tower;
  container.classList.toggle("hidden", !visible);
  if (!visible) return;

  const refs = container._upgradePanelRefs;
  for (const skill of Object.keys(UPGRADE_DEFS)) {
    const { levelEl, costEl, btn, pipEls } = refs.cols[skill];
    const level = tower.level[skill];
    const maxed = !canUpgrade(tower, skill);
    const cost = maxed ? "-" : upgradeCost(skill, level);
    levelEl.textContent = `Nv. ${level}/${UPGRADE_DEFS[skill].levels}`;
    costEl.textContent = `$${cost}`;
    btn.textContent = maxed ? "Máx" : "Mejorar";
    btn.disabled = maxed;
    pipEls.forEach((pip, i) => pip.classList.toggle("filled", i < level));
  }
}
