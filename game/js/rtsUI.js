// RTS User Interface Module for JUEGO CAÑONES
// Manages the Command & Conquer tactical sidebar and contextual building menus
// for Base (HQ), Barracks, Factory, Tech Lab, and Defenses.

import {
  RTS_BUILDINGS,
  RTS_UNITS,
  RTS_RESEARCH_UPGRADES,
  calculatePowerGrid,
  getUnitStatMultipliers,
  getTurretStatMultipliers,
} from "./rts.js";

export const SPRITE_ASSETS = {
  bld_hq: "assets/bld_hq.jpg",
  bld_solar: "assets/bld_solar.jpg",
  bld_wind: "assets/bld_wind.jpg",
  bld_refinery: "assets/bld_refinery.jpg",
  bld_barracks: "assets/bld_barracks.jpg",
  bld_factory: "assets/bld_factory.jpg",
  bld_techlab: "assets/bld_techlab.jpg",
  bld_wall: "assets/bld_wall.jpg",
  turret_basic: "assets/tower_basic.png",
  turret_double: "assets/tower_double.png",
  turret_laser: "assets/tower_laser.png",
  enemy_soldier: "assets/enemy_soldier.png",
  enemy_motorcycle: "assets/enemy_motorcycle.png",
  enemy_buggy: "assets/enemy_buggy.png",
  enemy_tank: "assets/enemy_tank.png",
  enemy_rocket: "assets/enemy_rocket.png",
  unit_harvester: "assets/unit_harvester.png",
  unit_mcv: "assets/unit_mcv.jpg",
};

export const TECH_ICONS = {
  unitDamage: "assets/ui_icon_damage.png",
  unitSpeed: "assets/ui_icon_speed.png",
  unitFireRate: "assets/ui_icon_firerate.png",
  unitArmor: "assets/ui_icon_armor.png",
  unitAmmo: "assets/ui_icon_ammo.png",
  turretDamage: "assets/ui_icon_damage.png",
  turretRange: "assets/ui_icon_range.png",
  turretFireRate: "assets/ui_icon_firerate.png",
  turretArmor: "assets/ui_icon_armor.png",
  turretAmmo: "assets/ui_icon_ammo.png",
};

// Helper to format credits: $ 1.600
function formatCredits(n) {
  return "$ " + Math.max(0, Math.floor(n)).toLocaleString("es-ES");
}

export function createRtsUI(sidebarEl, contextPanelEl, handlers) {
  let currentTab = "base"; // "base" | "defenses" | "infantry" | "vehicles"
  let selectedBuilding = null;
  let activeHqSubtab = "bld"; // "bld" | "def"
  let activeTechCategory = "units"; // "units" | "turrets"
  let lastState = null;
  let renderedPanelBuildingId = null;
  let renderedPanelType = null;
  let lastQueueSig = "";

  // 1. Setup Sidebar Tabs
  const tabBtns = sidebarEl ? sidebarEl.querySelectorAll(".cnc-tab-btn") : [];
  tabBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      tabBtns.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      currentTab = btn.dataset.tab;
      renderProductionGrid(lastState);
    });
  });

  const creditsValEl = sidebarEl ? sidebarEl.querySelector("#cnc-credits-val") : null;
  const powerStatusEl = sidebarEl ? sidebarEl.querySelector("#cnc-power-status") : null;
  const powerFillEl = sidebarEl ? sidebarEl.querySelector("#cnc-power-fill") : null;
  const gridEl = sidebarEl ? sidebarEl.querySelector("#cnc-production-grid") : null;

  function setTab(tab) {
    currentTab = tab;
    tabBtns.forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
    renderProductionGrid(lastState);
  }

  // 2. Render Sidebar Cards
  function renderProductionGrid(state) {
    if (!gridEl) return;
    if (!state || !state.teams || !state.teams.blue) return;
    const team = state.teams.blue;
    const hasHq = team.hasHq;
    const hasBarracks = (state.rtsBuildings || []).some(
      (b) => b.team === "blue" && b.type === "barracks" && b.hp > 0 && b.buildTimeRemaining <= 0
    );
    const hasFactory = (state.rtsBuildings || []).some(
      (b) => b.team === "blue" && b.type === "factory" && b.hp > 0 && b.buildTimeRemaining <= 0
    );
    const hasTechLab = (state.rtsBuildings || []).some(
      (b) => b.team === "blue" && b.type === "techlab" && b.hp > 0 && b.buildTimeRemaining <= 0
    );

    gridEl.innerHTML = "";

    // A. BASE BUILDINGS TAB
    if (currentTab === "base") {
      const bldKeys = ["solar", "wind", "refinery", "barracks", "factory", "techlab"];
      bldKeys.forEach((key) => {
        const def = RTS_BUILDINGS[key];
        const card = createBuildCard({
          key,
          title: def.name,
          cost: def.cost,
          desc: def.desc,
          powerText: def.power > 0 ? `+${def.power}⚡` : def.power < 0 ? `${def.power}⚡` : "",
          timeText: `${def.buildDuration}s`,
          sprite: def.sprite,
          available: hasHq && team.credits >= def.cost,
          onClick: () => handlers.onSelectBuildType(key),
        });
        gridEl.appendChild(card);
      });
      return;
    }

    // B. DEFENSES TAB
    if (currentTab === "defenses") {
      const defKeys = ["wall", "turret_basic", "turret_double", "turret_laser"];
      defKeys.forEach((key) => {
        const def = RTS_BUILDINGS[key];
        const isLaser = key === "turret_laser";
        const locked = isLaser && !hasTechLab;
        const card = createBuildCard({
          key,
          title: def.name,
          cost: def.cost,
          desc: locked ? "Requiere Laboratorio I+D activo" : def.desc,
          powerText: def.power !== 0 ? `${def.power}⚡` : "",
          timeText: def.buildDuration === 0 ? "Inmediato" : `${def.buildDuration}s`,
          sprite: def.sprite,
          available: hasHq && !locked && team.credits >= def.cost,
          onClick: () => handlers.onSelectBuildType(key),
        });
        gridEl.appendChild(card);
      });
      return;
    }

    // C. INFANTRY TAB (Barracks)
    if (currentTab === "infantry") {
      const def = RTS_UNITS.soldier;
      const card = createUnitCard({
        key: "soldier",
        title: def.name,
        cost: def.cost,
        time: def.buildTime,
        desc: "Infantería ligera táctica para patrullas y defensa de rutas.",
        sprite: def.sprite,
        available: hasBarracks && team.credits >= def.cost,
        onTrain: () => handlers.onEnqueueSoldier("soldier"),
        onTrainMultiple: (count) => {
          for (let i = 0; i < count; i++) handlers.onEnqueueSoldier("soldier");
        },
      });
      gridEl.appendChild(card);
      return;
    }

    // D. VEHICLES TAB (Factory)
    if (currentTab === "vehicles") {
      const vKeys = ["motorcycle", "buggy", "tank", "rocket", "harvester"];
      vKeys.forEach((key) => {
        const def = RTS_UNITS[key];
        const card = createUnitCard({
          key,
          title: def.name,
          cost: def.cost,
          time: def.buildTime,
          desc: def.desc || `Blindado de combate táctico (${def.hp} HP).`,
          sprite: def.sprite,
          available: hasFactory && team.credits >= def.cost,
          onTrain: () => handlers.onEnqueueVehicle(key),
          onTrainMultiple: (count) => {
            for (let i = 0; i < count; i++) handlers.onEnqueueVehicle(key);
          },
        });
        gridEl.appendChild(card);
      });
      return;
    }
  }

  function createBuildCard({ key, title, cost, desc, powerText, timeText, sprite, available, onClick }) {
    const el = document.createElement("div");
    el.className = `cnc-card ${available ? "available" : "disabled"}`;
    el.dataset.buildKey = key;
    const assetUrl = SPRITE_ASSETS[sprite] || "";
    el.innerHTML = `
      <div class="cnc-card-header">
        <span class="cnc-card-title">${title}</span>
        <span class="cnc-card-cost">$ ${cost}</span>
      </div>
      <div class="cnc-card-body">
        <div class="cnc-card-thumb">
          ${assetUrl ? `<img src="${assetUrl}" class="cnc-thumb-img" alt="${title}" />` : ""}
        </div>
        <div class="cnc-card-meta">
          ${powerText ? `<span class="cnc-badge-power">${powerText}</span>` : ""}
          <span class="cnc-badge-time">⏱ ${timeText}</span>
        </div>
      </div>
      <div class="cnc-card-desc">${desc || ""}</div>
    `;
    if (onClick) {
      el.addEventListener("click", () => {
        if (el.classList.contains("available")) onClick();
      });
    }
    return el;
  }

  function createUnitCard({ key, title, cost, time, desc, sprite, available, onTrain, onTrainMultiple }) {
    const el = document.createElement("div");
    el.className = `cnc-card cnc-unit-card ${available ? "available" : "disabled"}`;
    el.dataset.unitKey = key;
    const assetUrl = SPRITE_ASSETS[sprite] || "";
    el.innerHTML = `
      <div class="cnc-card-header">
        <span class="cnc-card-title">${title}</span>
        <span class="cnc-card-cost">$ ${cost}</span>
      </div>
      <div class="cnc-card-body">
        <div class="cnc-card-thumb">
          ${assetUrl ? `<img src="${assetUrl}" class="cnc-thumb-img" alt="${title}" />` : ""}
        </div>
        <div class="cnc-card-meta">
          <span class="cnc-badge-time">⏱ ${time}s</span>
        </div>
      </div>
      <div class="cnc-card-desc">${desc || ""}</div>
      <div class="cnc-card-actions">
        <button class="cnc-btn-train cnc-btn-primary" ${!available ? "disabled" : ""}>+1 Reclutar</button>
        <button class="cnc-btn-train cnc-btn-multi" ${!available ? "disabled" : ""}>+3 Cola</button>
      </div>
    `;
    const btn1 = el.querySelector(".cnc-btn-primary");
    const btn3 = el.querySelector(".cnc-btn-multi");
    if (btn1 && onTrain) {
      btn1.addEventListener("click", (evt) => {
        evt.stopPropagation();
        onTrain();
      });
    }
    if (btn3 && onTrainMultiple) {
      btn3.addEventListener("click", (evt) => {
        evt.stopPropagation();
        onTrainMultiple(3);
      });
    }
    return el;
  }

  // 3. Setup Delegated Event Listener for Context Panel (ATTACHED ONCE)
  if (contextPanelEl) {
    contextPanelEl.addEventListener("click", (evt) => {
      // A. Close button clicked
      const closeBtn = evt.target.closest(".rts-context-close-btn");
      if (closeBtn) {
        closeBuildingContext();
        if (handlers.onDeselectBuilding) handlers.onDeselectBuilding();
        return;
      }

      // B. Subtab clicked (HQ)
      const subtabBtn = evt.target.closest(".rts-subtab");
      if (subtabBtn) {
        activeHqSubtab = subtabBtn.dataset.subtab;
        contextPanelEl.querySelectorAll(".rts-subtab").forEach((b) => {
          b.classList.toggle("active", b.dataset.subtab === activeHqSubtab);
        });
        if (selectedBuilding && lastState) renderHqSubtabContent(selectedBuilding, lastState);
        return;
      }

      // C. Tech tab clicked (Tech Lab)
      const techTabBtn = evt.target.closest(".rts-tech-tab");
      if (techTabBtn) {
        activeTechCategory = techTabBtn.dataset.techCat;
        contextPanelEl.querySelectorAll(".rts-tech-tab").forEach((b) => {
          b.classList.toggle("active", b.dataset.techCat === activeTechCategory);
        });
        if (selectedBuilding && lastState) renderTechListContent(selectedBuilding, lastState);
        return;
      }

      // D. Building card clicked inside HQ context panel -> START PLACEMENT & MINIMIZE PANEL
      const bldCard = evt.target.closest(".rts-hq-card");
      if (bldCard && bldCard.dataset.buildKey) {
        const key = bldCard.dataset.buildKey;
        if (bldCard.classList.contains("available")) {
          // Immediately hide panel so the player can see the map and place the building!
          closeBuildingContext();
          if (handlers.onSelectBuildType) handlers.onSelectBuildType(key);
        }
        return;
      }

      // E. Add unit queue button clicked (Barracks / Factory)
      const addBtn = evt.target.closest("[data-add-unit]");
      if (addBtn && selectedBuilding) {
        const uType = addBtn.dataset.addUnit;
        const count = parseInt(addBtn.dataset.count || "1", 10);
        for (let i = 0; i < count; i++) {
          if (selectedBuilding.type === "barracks") handlers.onEnqueueSoldier(uType, selectedBuilding);
          else handlers.onEnqueueVehicle(uType, selectedBuilding);
        }
        return;
      }

      // F. Queue chip cancel clicked
      const chip = evt.target.closest(".rts-chip");
      if (chip && selectedBuilding) {
        const idx = parseInt(chip.dataset.queueIndex, 10);
        if (handlers.onCancelQueue) handlers.onCancelQueue(selectedBuilding, idx);
        return;
      }

      // G. Tech research button clicked
      const resBtn = evt.target.closest("[data-start-research]");
      if (resBtn && selectedBuilding) {
        const uKey = resBtn.dataset.startResearch;
        if (handlers.onStartResearch) handlers.onStartResearch(selectedBuilding, uKey);
        return;
      }
    });
  }

  function closeBuildingContext() {
    if (contextPanelEl) contextPanelEl.classList.add("hidden");
    selectedBuilding = null;
    renderedPanelBuildingId = null;
    renderedPanelType = null;
    lastQueueSig = "";
  }

  // 4. Render Context Panel Structure (called on open or selection change)
  function renderContextPanelStructure(building, state) {
    if (!contextPanelEl || !building) return;
    selectedBuilding = building;
    renderedPanelBuildingId = building.id;
    renderedPanelType = building.type;
    lastQueueSig = "";

    contextPanelEl.classList.remove("hidden");

    let title = RTS_BUILDINGS[building.type] ? RTS_BUILDINGS[building.type].name : "Edificio";
    const isUnderConstruction = building.buildTimeRemaining > 0;
    const statusText = isUnderConstruction
      ? `Construyendo... (${Math.ceil(building.buildTimeRemaining)}s)`
      : `Operativo · ${building.hp}/${building.maxHp} HP`;

    let html = `
      <div class="rts-context-header">
        <div class="rts-context-title-box">
          <span class="rts-context-name">${title}</span>
          <span class="rts-context-status ${isUnderConstruction ? "building" : "ready"}">${statusText}</span>
        </div>
        <button class="rts-context-close-btn" title="Cerrar panel táctico">✕</button>
      </div>
    `;

    // 1. CENTRO DE MANDO (HQ)
    if (building.type === "hq") {
      html += `
        <div class="rts-context-tabs">
          <button class="rts-subtab ${activeHqSubtab === "bld" ? "active" : ""}" data-subtab="bld">🏗️ Construir Edificios</button>
          <button class="rts-subtab ${activeHqSubtab === "def" ? "active" : ""}" data-subtab="def">🛡️ Defensas y Murallas</button>
        </div>
        <div class="rts-context-body rts-hq-body"></div>
      `;
    }
    // 2. BARRACÓN MILITAR
    else if (building.type === "barracks") {
      const uDef = RTS_UNITS.soldier;
      html += `
        <div class="rts-context-body rts-queue-body">
          <div class="rts-unit-selection">
            <div class="rts-unit-row">
              <div class="rts-unit-thumb-box">
                <img src="${SPRITE_ASSETS.enemy_soldier}" class="cnc-thumb-img" alt="${uDef.name}" />
              </div>
              <div class="rts-unit-details">
                <span class="rts-unit-name">${uDef.name}</span>
                <span class="rts-unit-sub">$ ${uDef.cost} · ⏱ ${uDef.buildTime}s · Fusil táctico</span>
              </div>
              <div class="rts-btn-group">
                <button class="rts-btn-queue primary" data-add-unit="soldier" data-count="1">+1 Reclutar</button>
                <button class="rts-btn-queue multi" data-add-unit="soldier" data-count="5">+5 Cola</button>
              </div>
            </div>
          </div>
          <div class="rts-queue-status-box">
            <div class="rts-queue-header">
              <span>COLA DE ADIESTRAMIENTO</span>
              <span class="rts-queue-count">0 en espera</span>
            </div>
            <div class="rts-active-progress-track">
              <div class="rts-active-progress-fill" style="width: 0%"></div>
            </div>
            <div class="rts-queue-chips"></div>
          </div>
        </div>
      `;
    }
    // 3. FÁBRICA DE ARMAS
    else if (building.type === "factory") {
      const vehicles = [
        { key: "motorcycle", name: "Moto Exploradora", meta: "$ 85 · ⏱ 3s", sprite: "enemy_motorcycle" },
        { key: "buggy", name: "Buggy Ligero", meta: "$ 120 · ⏱ 4s", sprite: "enemy_buggy" },
        { key: "tank", name: "Tanque Blindado", meta: "$ 300 · ⏱ 6.5s", sprite: "enemy_tank" },
        { key: "rocket", name: "Lanzamisiles", meta: "$ 260 · ⏱ 6s", sprite: "enemy_rocket" },
        { key: "harvester", name: "Cosechadora", meta: "$ 350 · ⏱ 5.5s", sprite: "unit_harvester" },
      ];
      let vehGridHtml = "";
      vehicles.forEach((v) => {
        vehGridHtml += `
          <div class="rts-vehicle-item">
            <div class="rts-vehicle-thumb">
              <img src="${SPRITE_ASSETS[v.sprite]}" class="cnc-thumb-img" alt="${v.name}" />
            </div>
            <div class="rts-vehicle-info">
              <span class="v-name">${v.name}</span>
              <span class="v-meta">${v.meta}</span>
            </div>
            <div class="rts-v-btns">
              <button class="rts-btn-v-add" data-add-unit="${v.key}" data-count="1">+1</button>
              <button class="rts-btn-v-add multi" data-add-unit="${v.key}" data-count="3">+3</button>
            </div>
          </div>
        `;
      });
      html += `
        <div class="rts-context-body rts-queue-body">
          <div class="rts-vehicle-grid">
            ${vehGridHtml}
          </div>
          <div class="rts-queue-status-box">
            <div class="rts-queue-header">
              <span>COLA DE LÍNEA DE MONTAJE</span>
              <span class="rts-queue-count">0 blindados</span>
            </div>
            <div class="rts-active-progress-track">
              <div class="rts-active-progress-fill" style="width: 0%"></div>
            </div>
            <div class="rts-queue-chips"></div>
          </div>
        </div>
      `;
    }
    // 4. LABORATORIO DE TECNOLOGÍA
    else if (building.type === "techlab") {
      html += `
        <div class="rts-context-tabs">
          <button class="rts-tech-tab ${activeTechCategory === "units" ? "active" : ""}" data-tech-cat="units">🎖️ Unidades (5 Niveles)</button>
          <button class="rts-tech-tab ${activeTechCategory === "turrets" ? "active" : ""}" data-tech-cat="turrets">🛡️ Torretas (5 Niveles)</button>
        </div>
        <div class="rts-context-body rts-tech-body"></div>
      `;
    }

    contextPanelEl.innerHTML = html;

    // Fill subtab content
    if (building.type === "hq") {
      renderHqSubtabContent(building, state);
    } else if (building.type === "techlab") {
      renderTechListContent(building, state);
    }
  }

  function renderHqSubtabContent(building, state) {
    const hqBody = contextPanelEl.querySelector(".rts-hq-body");
    if (!hqBody || !state || !state.teams || !state.teams.blue) return;
    const team = state.teams.blue;
    hqBody.innerHTML = "";
    const keys = activeHqSubtab === "bld"
      ? ["solar", "wind", "refinery", "barracks", "factory", "techlab"]
      : ["wall", "turret_basic", "turret_double", "turret_laser"];

    keys.forEach((key) => {
      const def = RTS_BUILDINGS[key];
      const isLaser = key === "turret_laser";
      const hasTech = (state.rtsBuildings || []).some(
        (b) => b.team === "blue" && b.type === "techlab" && b.hp > 0 && b.buildTimeRemaining <= 0
      );
      const locked = isLaser && !hasTech;
      const canAfford = team.credits >= def.cost;
      const available = !locked && canAfford;
      const assetUrl = SPRITE_ASSETS[def.sprite] || "";

      const card = document.createElement("div");
      card.className = `rts-hq-card ${available ? "available" : "disabled"}`;
      card.dataset.buildKey = key;
      card.innerHTML = `
        <div class="rts-hq-thumb">
          ${assetUrl ? `<img src="${assetUrl}" class="cnc-thumb-img" alt="${def.name}" />` : ""}
        </div>
        <div class="rts-hq-info">
          <div class="rts-hq-name-line">
            <span class="rts-hq-name">${def.name}</span>
            <span class="rts-hq-cost">$ ${def.cost}</span>
          </div>
          <div class="rts-hq-meta">
            ${def.power > 0 ? `<span class="cnc-badge-power">+${def.power}⚡</span>` : def.power < 0 ? `<span class="cnc-badge-power">${def.power}⚡</span>` : ""}
            <span class="cnc-badge-time">⏱ ${def.buildDuration === 0 ? "Inmediato" : `${def.buildDuration}s`}</span>
          </div>
          <div class="rts-hq-desc">${locked ? "Requiere Laboratorio I+D" : def.desc}</div>
        </div>
        <button class="rts-hq-build-btn" ${!available ? "disabled" : ""}>Construir</button>
      `;
      hqBody.appendChild(card);
    });
  }

  function renderTechListContent(building, state) {
    const techBody = contextPanelEl.querySelector(".rts-tech-body");
    if (!techBody || !state || !state.teams || !state.teams.blue) return;
    techBody.innerHTML = "";
    const team = state.teams.blue;
    const upgrades = team.upgrades || {};
    const isUnits = activeTechCategory === "units";
    const keys = isUnits
      ? ["unitDamage", "unitSpeed", "unitFireRate", "unitArmor", "unitAmmo"]
      : ["turretDamage", "turretRange", "turretFireRate", "turretArmor", "turretAmmo"];

    keys.forEach((key) => {
      const uDef = RTS_RESEARCH_UPGRADES[key];
      const curLevel = upgrades[key] || 0;
      const isMax = curLevel >= uDef.maxLevel;
      const nextCost = !isMax ? uDef.costPerLevel[curLevel] : null;
      const nextTime = !isMax ? uDef.timePerLevel[curLevel] : null;
      const isResearchingThis = building.research && building.research.upgradeKey === key;
      const canAfford = !isMax && team.credits >= nextCost && !building.research;
      const iconUrl = TECH_ICONS[key] || "";

      let pipsHtml = "";
      for (let lvl = 1; lvl <= 5; lvl++) {
        pipsHtml += `<span class="rts-pip ${lvl <= curLevel ? "filled" : ""}">●</span>`;
      }

      const row = document.createElement("div");
      row.className = `rts-tech-card ${isMax ? "maxed" : canAfford ? "available" : "disabled"}`;
      row.dataset.techKey = key;
      row.innerHTML = `
        <div class="rts-tech-icon-box">
          ${iconUrl ? `<img src="${iconUrl}" class="rts-tech-icon-img" alt="${uDef.name}" />` : ""}
        </div>
        <div class="rts-tech-info">
          <div class="rts-tech-name-line">
            <span class="rts-tech-name">${uDef.name}</span>
            <span class="rts-tech-pips">${pipsHtml} <strong class="rts-lvl-txt">Nv. ${curLevel}/5</strong></span>
          </div>
          <div class="rts-tech-desc">${uDef.desc}</div>
        </div>
        <div class="rts-tech-action">
          ${
            isMax
              ? `<span class="rts-tech-max-badge">¡MÁXIMO!</span>`
              : isResearchingThis
              ? `<div class="rts-research-active-box">
                  <span class="rts-research-pct">${Math.round((building.research.elapsed / building.research.totalTime) * 100)}%</span>
                  <div class="rts-research-bar"><div class="rts-research-fill" style="width: ${Math.round((building.research.elapsed / building.research.totalTime) * 100)}%"></div></div>
                </div>`
              : `<button class="rts-btn-research" data-start-research="${key}" ${!canAfford ? "disabled" : ""}>
                  <span class="btn-cost">$ ${nextCost}</span>
                  <span class="btn-time">⏱ ${nextTime}s</span>
                </button>`
          }
        </div>
      `;
      techBody.appendChild(row);
    });
  }

  // 5. Update Dynamic Values Only (Flicker-Free, No DOM churn)
  function updateDynamicContextValues(building, state) {
    if (!contextPanelEl || !building) return;

    // Header status
    const statusEl = contextPanelEl.querySelector(".rts-context-status");
    if (statusEl) {
      const isUnderConstruction = building.buildTimeRemaining > 0;
      statusEl.textContent = isUnderConstruction
        ? `Construyendo... (${Math.ceil(building.buildTimeRemaining)}s)`
        : `Operativo · ${building.hp}/${building.maxHp} HP`;
      statusEl.className = `rts-context-status ${isUnderConstruction ? "building" : "ready"}`;
    }

    // Queues (Barracks & Factory)
    if (building.type === "barracks" || building.type === "factory") {
      const fillEl = contextPanelEl.querySelector(".rts-active-progress-fill");
      if (fillEl) {
        const pct = building.queue && building.queue.current
          ? Math.min(100, Math.round((building.queue.current.elapsed / building.queue.current.totalTime) * 100))
          : 0;
        fillEl.style.width = `${pct}%`;
      }
      const countEl = contextPanelEl.querySelector(".rts-queue-count");
      if (countEl && building.queue) {
        const total = (building.queue.current ? 1 : 0) + building.queue.pending.length;
        countEl.textContent = `${total} en espera`;
      }

      // Re-render chips only if signature changed
      const sig = building.queue
        ? `${building.queue.current ? building.queue.current.unitType : "none"}|${building.queue.pending.join(",")}`
        : "";
      if (sig !== lastQueueSig) {
        lastQueueSig = sig;
        const chipsEl = contextPanelEl.querySelector(".rts-queue-chips");
        if (chipsEl && building.queue) {
          chipsEl.innerHTML = "";
          if (building.queue.current) {
            const uDef = RTS_UNITS[building.queue.current.unitType];
            const chip = document.createElement("div");
            chip.className = "rts-chip active";
            chip.dataset.queueIndex = "-1";
            chip.title = "En producción activa. Toca para cancelar y reembolsar.";
            chip.innerHTML = `<span>▶ ${uDef ? uDef.name : "Unidad"}</span> <span class="rts-chip-cancel">✕</span>`;
            chipsEl.appendChild(chip);
          }
          building.queue.pending.forEach((pType, idx) => {
            const uDef = RTS_UNITS[pType];
            const chip = document.createElement("div");
            chip.className = "rts-chip pending";
            chip.dataset.queueIndex = String(idx);
            chip.title = "En cola. Toca para cancelar y reembolsar.";
            chip.innerHTML = `<span>${uDef ? uDef.name : pType}</span> <span class="rts-chip-cancel">✕</span>`;
            chipsEl.appendChild(chip);
          });
        }
      }
    }

    // Tech Lab research progress
    if (building.type === "techlab" && building.research) {
      const activeFill = contextPanelEl.querySelector(".rts-research-fill");
      const activePct = contextPanelEl.querySelector(".rts-research-pct");
      if (activeFill && activePct) {
        const pct = Math.min(100, Math.round((building.research.elapsed / building.research.totalTime) * 100));
        activeFill.style.width = `${pct}%`;
        activePct.textContent = `${pct}%`;
      }
    }
  }

  function updateCardsAvailability(state) {
    if (!gridEl) return;
    const team = state.teams.blue;
    const hasHq = team.hasHq;
    const hasBarracks = (state.rtsBuildings || []).some(
      (b) => b.team === "blue" && b.type === "barracks" && b.hp > 0 && b.buildTimeRemaining <= 0
    );
    const hasFactory = (state.rtsBuildings || []).some(
      (b) => b.team === "blue" && b.type === "factory" && b.hp > 0 && b.buildTimeRemaining <= 0
    );
    const hasTechLab = (state.rtsBuildings || []).some(
      (b) => b.team === "blue" && b.type === "techlab" && b.hp > 0 && b.buildTimeRemaining <= 0
    );

    const cards = gridEl.querySelectorAll(".cnc-card");
    cards.forEach((card) => {
      const bKey = card.dataset.buildKey;
      const uKey = card.dataset.unitKey;
      let avail = false;

      if (bKey) {
        const def = RTS_BUILDINGS[bKey];
        if (def) {
          const isLaser = bKey === "turret_laser";
          const locked = isLaser && !hasTechLab;
          avail = hasHq && !locked && team.credits >= def.cost;
        }
      } else if (uKey) {
        const def = RTS_UNITS[uKey];
        if (def) {
          const hasFac = uKey === "soldier" ? hasBarracks : hasFactory;
          avail = hasFac && team.credits >= def.cost;
          const btns = card.querySelectorAll(".cnc-btn-train");
          btns.forEach((btn) => {
            btn.disabled = !avail;
          });
        }
      }

      card.classList.toggle("available", avail);
      card.classList.toggle("disabled", !avail);
    });
  }

  // 6. Master update loop (runs once per frame)
  function update(state) {
    if (!state || !state.teams || !state.teams.blue) return;
    lastState = state;
    const team = state.teams.blue;
    const power = calculatePowerGrid(state.rtsBuildings, "blue");

    // 1. Credits
    if (creditsValEl) creditsValEl.textContent = formatCredits(team.credits);

    // 2. Power Balance
    if (powerStatusEl && powerFillEl) {
      const isLowPower = power.consumed > power.produced;
      powerStatusEl.textContent = `${power.consumed} / ${power.produced} ⚡ ${isLowPower ? "(BAJA ENERGÍA)" : "ÓPTIMO"}`;
      powerStatusEl.className = isLowPower ? "cnc-power-text low" : "cnc-power-text";

      const maxPower = Math.max(1, power.produced, power.consumed);
      const pct = Math.min(100, Math.round((power.produced / maxPower) * 100));
      powerFillEl.style.width = `${pct}%`;
      powerFillEl.style.background = isLowPower
        ? "linear-gradient(90deg, #ef4444 0%, #dc2626 100%)"
        : "linear-gradient(90deg, #eab308 0%, #22c55e 100%)";
    }

    // 3. Render or dynamically update sidebar cards
    if (gridEl) {
      if (gridEl.children.length === 0) {
        renderProductionGrid(state);
      } else {
        updateCardsAvailability(state);
      }
    }

    // 4. Update contextual panel if open
    if (selectedBuilding) {
      // If building died, close it
      if (selectedBuilding.hp <= 0) {
        closeBuildingContext();
        if (handlers.onDeselectBuilding) handlers.onDeselectBuilding();
      } else {
        // If building id or type changed, render structure; else update values
        if (renderedPanelBuildingId !== selectedBuilding.id || renderedPanelType !== selectedBuilding.type) {
          renderContextPanelStructure(selectedBuilding, state);
        } else {
          updateDynamicContextValues(selectedBuilding, state);
        }
      }
    }
  }

  return {
    update,
    openBuildingContext: (building, state) => {
      renderContextPanelStructure(building, state);
    },
    closeBuildingContext,
    setTab,
    refreshSidebar: () => renderProductionGrid(lastState),
  };
}
