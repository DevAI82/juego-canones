import { TOWER_TYPES } from "./tower.js";
import { UPGRADE_DEFS, upgradeCost, canUpgrade } from "./upgrades.js";

const LABELS = { basic: "Básica", double: "Doble", laser: "Láser" };
const SKILL_LABELS = { damage: "Daño", range: "Alcance", fireRate: "Vel. disparo" };

export function initBuildMenu(container, { onSelect }) {
  container.innerHTML = "";
  for (const type of Object.keys(TOWER_TYPES)) {
    const btn = document.createElement("button");
    btn.className = "build-btn";
    btn.dataset.type = type;
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
    btn.textContent = `${LABELS[type]} ($${def.cost}) ${countOnField}/${def.maxCount}`;
  }
}

export function renderUpgradePanel(container, tower, { onUpgrade, onRepair, onSell }) {
  if (!tower) {
    container.classList.add("hidden");
    container.innerHTML = "";
    return;
  }
  container.classList.remove("hidden");
  container.innerHTML = "";

  for (const skill of Object.keys(UPGRADE_DEFS)) {
    const col = document.createElement("div");
    col.className = "upgrade-col";
    const level = tower.level[skill];
    const maxed = !canUpgrade(tower, skill);
    const cost = maxed ? "-" : upgradeCost(skill, level);
    col.innerHTML = `<div>${SKILL_LABELS[skill]}</div><div>Nv. ${level}/${UPGRADE_DEFS[skill].levels}</div><div>$${cost}</div>`;
    const btn = document.createElement("button");
    btn.textContent = maxed ? "Máx" : "Mejorar";
    btn.disabled = maxed;
    btn.addEventListener("click", () => onUpgrade(skill));
    col.appendChild(btn);
    container.appendChild(col);
  }

  const repairBtn = document.createElement("button");
  repairBtn.textContent = "Reparar";
  repairBtn.addEventListener("click", onRepair);
  container.appendChild(repairBtn);

  const sellBtn = document.createElement("button");
  sellBtn.textContent = "Vender";
  sellBtn.addEventListener("click", onSell);
  container.appendChild(sellBtn);
}
