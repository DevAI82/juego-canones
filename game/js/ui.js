import { TOWER_TYPES } from "./tower.js";
import { UPGRADE_DEFS, upgradeCost, canUpgrade } from "./upgrades.js";
import { computeScoreBreakdown } from "./scoring.js";
import { WALL, repairCost, sellRefund } from "./simulate.js";

const LABELS = { basic: "Básica", double: "Doble", laser: "Láser" };
const SKILL_LABELS = { damage: "Daño", range: "Alcance", fireRate: "Vel. disparo", armor: "Blindaje", ammo: "Munición" };
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

const SKILL_ICON = {
  damage: "assets/ui_icon_damage.png",
  range: "assets/ui_icon_range.png",
  fireRate: "assets/ui_icon_firerate.png",
  armor: "assets/ui_icon_armor.png",
  // Drawn to match the others (tools/ isn't involved: a one-off made with
  // PIL from ui_icon_firerate.png's panel background).
  ammo: "assets/ui_icon_ammo.png",
};

export function initBuildMenu(container, { onSelect, onRepair, onSell }) {
  container.innerHTML = "";

  const towersSection = document.createElement("div");
  towersSection.className = "build-towers-section";

  for (const type of Object.keys(TOWER_TYPES)) {
    const btn = document.createElement("button");
    btn.className = "build-btn";
    btn.dataset.type = type;
    btn.style.backgroundImage = `url(${TOWER_ICON[type]})`;
    const label = document.createElement("span");
    label.className = "build-btn-label";
    btn.appendChild(label);
    btn.addEventListener("click", () => onSelect(type));
    towersSection.appendChild(btn);
  }
  // Concrete wall blocks (walls.js), per user request -- selected and
  // placed like a tower type.
  const wallBtn = document.createElement("button");
  wallBtn.className = "build-btn";
  wallBtn.dataset.type = "wall";
  wallBtn.style.backgroundImage = "url(assets/ui_icon_wall.png)";
  const wallLabel = document.createElement("span");
  wallLabel.className = "build-btn-label";
  wallBtn.appendChild(wallLabel);
  wallBtn.addEventListener("click", () => onSelect("wall"));
  towersSection.appendChild(wallBtn);
  container.appendChild(towersSection);

  // Actions section (Reparar & Vender) placed directly below the laser turret
  const actionsSection = document.createElement("div");
  actionsSection.className = "build-actions-section";

  const repairBtn = document.createElement("button");
  repairBtn.className = "build-action-btn build-repair-btn";
  repairBtn.style.backgroundImage = `url(assets/ui_btn_repair.png)`;
  const repairLabel = document.createElement("span");
  repairLabel.className = "build-action-btn-label";
  repairLabel.textContent = "Reparar";
  repairBtn.appendChild(repairLabel);
  repairBtn.addEventListener("click", () => onRepair());
  actionsSection.appendChild(repairBtn);

  const sellBtn = document.createElement("button");
  sellBtn.className = "build-action-btn build-sell-btn";
  sellBtn.style.backgroundImage = `url(assets/ui_btn_sell.png)`;
  const sellLabel = document.createElement("span");
  sellLabel.className = "build-action-btn-label";
  sellLabel.textContent = "Vender";
  sellBtn.appendChild(sellLabel);
  sellBtn.addEventListener("click", () => onSell());
  actionsSection.appendChild(sellBtn);

  container.appendChild(actionsSection);

  container._buildMenuRefs = {
    repairBtn,
    repairLabel,
    sellBtn,
    sellLabel,
  };
}

// selected: the selected tower or wall block (or null), for the
// repair/sell buttons.
export function updateBuildMenu(container, { towers, walls = [], economy, selectedType, selected }) {
  for (const btn of container.querySelectorAll(".build-btn")) {
    const type = (btn.dataset && btn.dataset.type) || btn.getAttribute("data-type") || btn.dataset?.type;
    if (type === "wall") {
      btn.disabled = walls.length >= WALL.max || !economy || economy.money < WALL.cost;
      btn.classList.toggle("selected", selectedType === "wall");
      btn.querySelector(".build-btn-label").textContent = `Muro ($${WALL.cost}) ${walls.length}/${WALL.max}`;
      continue;
    }
    const def = TOWER_TYPES[type];
    if (!def) continue;
    const countOnField = (towers || []).filter((t) => t.type === type && t.hp > 0).length;
    const atMax = countOnField >= def.maxCount;
    const canAfford = economy && economy.money >= def.cost;
    btn.disabled = atMax || !canAfford;
    btn.classList.toggle("selected", type === selectedType);
    const labelEl = btn.querySelector(".build-btn-label");
    if (labelEl) {
      labelEl.textContent = `${LABELS[type] || type} ($${def.cost}) ${countOnField}/${def.maxCount}`;
    }
  }

  const refs = container._buildMenuRefs;
  if (!refs) return;

  if (selected) {
    const repairCostNow = repairCost(selected);
    const refund = sellRefund(selected);

    if (repairCostNow > 0) {
      const canAffordRepair = economy.money >= repairCostNow;
      refs.repairBtn.disabled = !canAffordRepair;
      refs.repairLabel.textContent = `Reparar ($${repairCostNow})`;
    } else {
      refs.repairBtn.disabled = true;
      refs.repairLabel.textContent = "100% Vida";
    }

    refs.sellBtn.disabled = false;
    refs.sellLabel.textContent = `Vender (+$${refund})`;
  } else {
    refs.repairBtn.disabled = true;
    refs.repairLabel.textContent = "Reparar";
    refs.sellBtn.disabled = true;
    refs.sellLabel.textContent = "Vender";
  }
}

// Builds the upgrade panel's DOM structure ONCE and wires up its event listeners once.
export function initUpgradePanel(container, { onUpgrade }) {
  container.innerHTML = "";
  const cols = {};

  for (const skill of Object.keys(UPGRADE_DEFS)) {
    const col = document.createElement("div");
    col.className = "upgrade-col";

    const label = document.createElement("div");
    label.className = "upgrade-label";
    label.textContent = SKILL_LABELS[skill];

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

  container._upgradePanelRefs = { cols };
}

export function renderStatsModal(overlay, state, rankingEntries) {
  const summary = overlay.querySelector("#stats-summary-card");
  if (summary) {
    const kills = state.stats.kills || {};
    const totalKills = Object.values(kills).reduce((a, b) => a + b, 0);
    summary.innerHTML = `
      <div class="stats-grid">
        <div class="stats-item"><span class="stats-num">${state.level}/3</span><span class="stats-lbl">Nivel</span></div>
        <div class="stats-item"><span class="stats-num">${state.waveIndex + 1}/40</span><span class="stats-lbl">Oleada</span></div>
        <div class="stats-item"><span class="stats-num">${state.economy.lives}</span><span class="stats-lbl">Vidas</span></div>
        <div class="stats-item"><span class="stats-num">$${state.economy.money}</span><span class="stats-lbl">Fondos</span></div>
        <div class="stats-item"><span class="stats-num">${state.stats.towersBuilt}</span><span class="stats-lbl">Torretas</span></div>
        <div class="stats-item"><span class="stats-num">${totalKills}</span><span class="stats-lbl">Bajas</span></div>
      </div>
      <div class="stats-kills-detail">
        <span class="kill-tag">💂 Soldados: ${kills.soldier || 0}</span>
        <span class="kill-tag">🏎️ Buggies: ${kills.buggy || 0}</span>
        <span class="kill-tag">🏍️ Motos: ${kills.motorcycle || 0}</span>
        <span class="kill-tag">🛡️ Tanques: ${kills.tank || 0}</span>
        <span class="kill-tag">🚀 Cohetes: ${kills.rocket || 0}</span>
      </div>
    `;
  }

  const list = overlay.querySelector("#stats-ranking-list");
  if (list) {
    list.innerHTML = "";
    if (!rankingEntries || rankingEntries.length === 0) {
      list.innerHTML = `<li class="gameend-ranking-empty">Sin puntuaciones registradas aún</li>`;
    } else {
      rankingEntries.forEach((entry, i) => {
        const li = document.createElement("li");
        li.className = "stats-ranking-row";
        // Built with textContent, not innerHTML: names are typed by players
        // (and shared across every co-op browser via the server), so they
        // must never be parsed as HTML.
        for (const [cls, text] of [["ranking-pos", `#${i + 1}`], ["ranking-name", entry.name], ["ranking-score", `${entry.score} pts`]]) {
          const span = document.createElement("span");
          span.className = cls;
          span.textContent = text;
          li.appendChild(span);
        }
        list.appendChild(li);
      });
    }
  }
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

// An attack's end screen (attackUI.js's attackSummary): who won and how it
// went. The attack mode has no score or ranking yet (design §3.7), so those
// sections stay hidden -- renderGameEndScreen shows them again for the next
// defence game.
export function renderAttackEndScreen(overlay, summary) {
  overlay.querySelector("#gameend-title").textContent = summary.title;
  for (const id of ["#gameend-save-row", "#gameend-save-status", "#gameend-ranking-title", "#gameend-ranking"]) {
    overlay.querySelector(id).classList.add("hidden");
  }
  const table = overlay.querySelector("#gameend-breakdown");
  table.innerHTML = "";
  for (const [label, value] of summary.rows) {
    const tr = document.createElement("tr");
    tr.className = "gameend-info-row";
    tr.append(scoreCell(label), scoreCell(value));
    table.appendChild(tr);
  }
  overlay.querySelector("#gameend-total").textContent = summary.subtitle;
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
