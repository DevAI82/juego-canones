import { TOWER_TYPES } from "./tower.js";

const LABELS = { basic: "Básica", double: "Doble", laser: "Láser" };

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
