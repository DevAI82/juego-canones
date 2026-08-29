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
export function initUpgradePanel(container, { onUpgrade, onRepair, onSell }) {
  container.innerHTML = "";
  const cols = {};

  for (const skill of Object.keys(UPGRADE_DEFS)) {
    const col = document.createElement("div");
    col.className = "upgrade-col";

    const label = document.createElement("div");
    label.textContent = SKILL_LABELS[skill];
    const levelEl = document.createElement("div");
    const costEl = document.createElement("div");
    const btn = document.createElement("button");
    btn.addEventListener("click", () => onUpgrade(skill));

    col.appendChild(label);
    col.appendChild(levelEl);
    col.appendChild(costEl);
    col.appendChild(btn);
    container.appendChild(col);

    cols[skill] = { levelEl, costEl, btn };
  }

  const repairBtn = document.createElement("button");
  repairBtn.textContent = "Reparar";
  repairBtn.addEventListener("click", () => onRepair());
  container.appendChild(repairBtn);

  const sellBtn = document.createElement("button");
  sellBtn.textContent = "Vender";
  sellBtn.addEventListener("click", () => onSell());
  container.appendChild(sellBtn);

  // Stash element references on the container so updateUpgradePanel (called
  // every frame) can find them again without touching innerHTML.
  container._upgradePanelRefs = { cols, repairBtn, sellBtn };
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
    const { levelEl, costEl, btn } = refs.cols[skill];
    const level = tower.level[skill];
    const maxed = !canUpgrade(tower, skill);
    const cost = maxed ? "-" : upgradeCost(skill, level);
    levelEl.textContent = `Nv. ${level}/${UPGRADE_DEFS[skill].levels}`;
    costEl.textContent = `$${cost}`;
    btn.textContent = maxed ? "Máx" : "Mejorar";
    btn.disabled = maxed;
  }
}
