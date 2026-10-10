import { createFog, updateFog, isVisible, isExplored } from "./fog.js";

// RTS (Command & Conquer) Mode module for JUEGO CAÑONES.
// Governs power grid, mineral fields, harvesting, production queues,
// building rules (build radius), MCV deployment, direct mouse control,
// and team state (Blue vs Red).

export const RTS_CONFIG = {
  mapLevel: 3,
  worldSize: 2048,
  blueBase: { x: 430, y: 1600 },
  redBase: { x: 1650, y: 450 },
  buildRadius: 260, // Max distance from an existing friendly building
  unitCapPerTeam: 60, // 60 active units per team
  maxWallsPerTeam: 40,
};

export const RTS_SIGHT = {
  // Units
  soldier: 190,
  motorcycle: 270,
  buggy: 230,
  tank: 200,
  rocket: 210,
  harvester: 180,
  mcv: 260,
  // Buildings
  hq: 420,
  solar: 220,
  wind: 260,
  refinery: 260,
  barracks: 260,
  factory: 280,
  techlab: 300,
  turret_basic: 280,
  turret_double: 300,
  turret_laser: 340,
  wall: 120,
};

export const RTS_BUILDINGS = {
  hq: {
    name: "Centro de Mando",
    cost: 1000,
    hp: 1500,
    power: 0,
    footprint: 100,
    buildDuration: 3.5,
    sprite: "bld_hq",
    buildSprite: "bld_hq_build",
    category: "base",
    desc: "Edificio central desplegado desde el VCM. Permite construir la base.",
  },
  solar: {
    name: "Central Solar",
    cost: 300,
    hp: 450,
    power: 70, // Generates 70
    footprint: 75,
    buildDuration: 4.0,
    sprite: "bld_solar",
    buildSprite: "bld_solar_build",
    category: "base",
    desc: "+70 Energía. Requiere estar cerca de la base.",
  },
  wind: {
    name: "Generador Eólico",
    cost: 150,
    hp: 250,
    power: 30, // Generates 30
    footprint: 55,
    buildDuration: 3.0,
    freePlacement: true, // Can be built anywhere on the map!
    sprite: "bld_wind",
    buildSprite: "bld_wind_build",
    category: "base",
    desc: "+30 Energía. ¡Se puede construir en cualquier punto del mapa!",
  },
  refinery: {
    name: "Refinería",
    cost: 800,
    hp: 650,
    power: -20, // Consumes 20
    footprint: 85,
    buildDuration: 5.0,
    sprite: "bld_refinery",
    buildSprite: "bld_refinery_build",
    category: "base",
    desc: "Procesa el mineral que descargan las cosechadoras (+300$ por viaje).",
  },
  barracks: {
    name: "Barracón Militar",
    cost: 250,
    hp: 450,
    power: -10, // Consumes 10
    footprint: 75,
    buildDuration: 4.0,
    sprite: "bld_barracks",
    buildSprite: "bld_barracks_build",
    category: "base",
    desc: "Permite entrenar soldados Fusileros para defensa de rutas.",
  },
  factory: {
    name: "Fábrica de Blindados",
    cost: 500,
    hp: 750,
    power: -25, // Consumes 25
    footprint: 90,
    buildDuration: 6.0,
    sprite: "bld_factory",
    buildSprite: "bld_factory_build",
    category: "base",
    desc: "Construye vehículos de combate y cosechadoras de mineral.",
  },
  techlab: {
    name: "Laboratorio de Tecnología",
    cost: 600,
    hp: 550,
    power: -35, // Consumes 35
    footprint: 80,
    buildDuration: 6.0,
    sprite: "bld_techlab",
    buildSprite: "bld_techlab_build",
    requires: "refinery",
    category: "base",
    desc: "Desbloquea Torretas Láser y mejoras avanzadas.",
  },
  turret_basic: {
    name: "Torreta Básica",
    cost: 100,
    hp: 300,
    power: 0,
    footprint: 50,
    buildDuration: 3.5,
    category: "defenses",
    sprite: "turret_basic",
    desc: "Cañón antivehículo e infantería.",
  },
  turret_double: {
    name: "Torreta Doble",
    cost: 175,
    hp: 450,
    power: 0,
    footprint: 55,
    buildDuration: 4.5,
    category: "defenses",
    sprite: "turret_double",
    desc: "Doble cañón con alta cadencia de fuego.",
  },
  turret_laser: {
    name: "Torreta Láser",
    cost: 250,
    hp: 400,
    power: -20, // Consumes 20 power
    footprint: 50,
    buildDuration: 5.5,
    requires: "techlab",
    category: "defenses",
    sprite: "turret_laser",
    desc: "Rayo continuo de plasma. Se apaga si no hay energía suficiente.",
  },
  wall: {
    name: "Muralla Militar",
    cost: 15,
    hp: 150,
    power: 0,
    footprint: 32,
    buildDuration: 0, // ¡Inmediato como solicita el usuario!
    category: "defenses",
    sprite: "bld_wall",
    desc: "Muro defensivo inmediato (máx. 40 bloques).",
  },
};

export const RTS_UNITS = {
  soldier: {
    name: "Fusilero",
    producedIn: "barracks",
    cost: 40,
    hp: 50,
    speed: 50,
    damage: 6,
    range: 95,
    fireRate: 0.45,
    buildTime: 2.5,
    type: "infantry",
    sprite: "enemy_soldier",
  },
  buggy: {
    name: "Buggy",
    producedIn: "factory",
    cost: 120,
    hp: 95,
    speed: 80,
    damage: 9,
    range: 125,
    fireRate: 0.5,
    buildTime: 4.0,
    type: "vehicle",
    sprite: "enemy_buggy",
  },
  motorcycle: {
    name: "Moto",
    producedIn: "factory",
    cost: 85,
    hp: 60,
    speed: 95,
    damage: 7,
    range: 110,
    fireRate: 0.4,
    buildTime: 3.0,
    type: "vehicle",
    sprite: "enemy_motorcycle",
  },
  tank: {
    name: "Tanque",
    producedIn: "factory",
    cost: 300,
    hp: 280,
    speed: 38,
    damage: 30,
    range: 140,
    fireRate: 1.2,
    buildTime: 6.5,
    type: "vehicle",
    sprite: "enemy_tank",
  },
  rocket: {
    name: "Lanzamisiles",
    producedIn: "factory",
    cost: 260,
    hp: 120,
    speed: 42,
    damage: 48,
    range: 230,
    fireRate: 2.2,
    buildTime: 6.0,
    type: "vehicle",
    sprite: "enemy_rocket",
  },
  harvester: {
    name: "Cosechadora",
    producedIn: "factory",
    cost: 350,
    hp: 360,
    speed: 40,
    damage: 0,
    range: 0,
    fireRate: 0,
    capacity: 300,
    buildTime: 5.5,
    type: "harvester",
    sprite: "unit_harvester",
  },
  mcv: {
    name: "VCM (Vehículo de Construcción Móvil)",
    producedIn: "factory",
    cost: 1000,
    hp: 1200,
    speed: 35,
    damage: 0,
    range: 0,
    fireRate: 0,
    buildTime: 12.0,
    type: "mcv",
    sprite: "unit_mcv",
    desc: "Vehículo pesado de despliegue. Haz doble clic para desplegar la Base Central.",
  },
};

// 5 Levels of Tech Research for Units and 5 Levels for Turrets in the Tech Lab
export const RTS_RESEARCH_UPGRADES = {
  // === 5 MEJORAS PARA SOLDADOS Y VEHÍCULOS (NIVEL 1 A 5) ===
  unitDamage: {
    name: "Potencia de Fuego (+Daño)",
    category: "units",
    maxLevel: 5,
    costPerLevel: [100, 200, 350, 500, 800],
    timePerLevel: [4.0, 5.0, 6.0, 8.0, 10.0],
    bonusPerLevel: 0.15, // +15% daño por nivel (hasta +75%)
    desc: "Aumenta el daño de ataque infligido por fusileros y todos los blindados.",
  },
  unitSpeed: {
    name: "Motores Mejorados (+Velocidad)",
    category: "units",
    maxLevel: 5,
    costPerLevel: [90, 180, 300, 450, 700],
    timePerLevel: [3.5, 4.5, 5.5, 7.0, 9.0],
    bonusPerLevel: 0.10, // +10% velocidad por nivel (hasta +50%)
    desc: "Aumenta la velocidad de desplazamiento y maniobra de las unidades.",
  },
  unitFireRate: {
    name: "Sistemas de Disparo (+Cadencia)",
    category: "units",
    maxLevel: 5,
    costPerLevel: [110, 210, 340, 490, 750],
    timePerLevel: [4.0, 5.0, 6.0, 7.5, 9.5],
    bonusPerLevel: 0.12, // +12% cadencia de fuego por nivel (hasta +60%)
    desc: "Acelera la cadencia de tiro y tiempo entre disparos de las unidades.",
  },
  unitArmor: {
    name: "Blindaje Reforzado (+Resistencia/Vida)",
    category: "units",
    maxLevel: 5,
    costPerLevel: [120, 220, 380, 550, 850],
    timePerLevel: [4.0, 5.0, 6.0, 8.0, 10.0],
    bonusPerLevel: 0.15, // +15% salud/vida por nivel (hasta +75%)
    desc: "Incrementa los puntos de impacto y blindaje de soldados y vehículos.",
  },
  unitAmmo: {
    name: "Cargadores Ampliados (+Capacidad Munición)",
    category: "units",
    maxLevel: 5,
    costPerLevel: [100, 190, 310, 460, 720],
    timePerLevel: [3.5, 4.5, 5.5, 7.0, 9.0],
    bonusPerLevel: 0.20, // +20% munición por cargador por nivel (hasta +100%)
    desc: "Aumenta el número de disparos que realiza una unidad antes de recargar.",
  },

  // === 5 MEJORAS PARA TORRETAS DEFENSIVAS (NIVEL 1 A 5) ===
  turretDamage: {
    name: "Calibre y Ópticas (+Daño)",
    category: "turrets",
    maxLevel: 5,
    costPerLevel: [110, 210, 360, 520, 800],
    timePerLevel: [4.0, 5.0, 6.0, 8.0, 10.0],
    bonusPerLevel: 0.15, // +15% daño por nivel (hasta +75%)
    desc: "Aumenta el daño de impacto de todas las torretas defensivas.",
  },
  turretRange: {
    name: "Radar y Detección (+Alcance)",
    category: "turrets",
    maxLevel: 5,
    costPerLevel: [100, 190, 320, 480, 750],
    timePerLevel: [4.0, 5.0, 6.0, 8.0, 10.0],
    bonusPerLevel: 0.10, // +10% alcance por nivel (hasta +50%)
    desc: "Amplía el radio de visión y alcance de disparo de las torretas.",
  },
  turretFireRate: {
    name: "Refrigeración Rápida (+Cadencia)",
    category: "turrets",
    maxLevel: 5,
    costPerLevel: [130, 240, 400, 580, 900],
    timePerLevel: [4.5, 5.5, 6.5, 8.5, 11.0],
    bonusPerLevel: 0.12, // +12% cadencia de fuego por nivel (hasta +60%)
    desc: "Reduce el tiempo de enfriamiento y cadencia de fuego de las torretas.",
  },
  turretArmor: {
    name: "Blindaje de Fortificación (+Vida/Blindaje)",
    category: "turrets",
    maxLevel: 5,
    costPerLevel: [120, 230, 370, 540, 820],
    timePerLevel: [4.0, 5.0, 6.0, 8.0, 10.0],
    bonusPerLevel: 0.15, // +15% vida por nivel (hasta +75%)
    desc: "Aumenta la salud estructural y resistencia de las defensas.",
  },
  turretAmmo: {
    name: "Almacén Automatizado (+Capacidad Munición)",
    category: "turrets",
    maxLevel: 5,
    costPerLevel: [110, 200, 330, 490, 760],
    timePerLevel: [4.0, 5.0, 6.0, 7.5, 9.5],
    bonusPerLevel: 0.20, // +20% capacidad por nivel (hasta +100%)
    desc: "Amplía el cargador de las torretas para disparar ráfagas más largas.",
  },
};

// Expansive, rich mineral fields on Map 3
export function createRtsMineralFields() {
  return [
    {
      id: "ore_blue",
      name: "Gran Yacimiento Azul",
      x: 380,
      y: 1220,
      radius: 200,
      reserves: 30000,
      maxReserves: 30000,
    },
    {
      id: "ore_red",
      name: "Gran Yacimiento Rojo",
      x: 1680,
      y: 850,
      radius: 200,
      reserves: 30000,
      maxReserves: 30000,
    },
    {
      id: "ore_center",
      name: "Megayacimiento Central",
      x: 1024,
      y: 1024,
      radius: 280,
      reserves: 80000,
      maxReserves: 80000,
    },
    {
      id: "ore_northwest",
      name: "Yacimiento Noroeste",
      x: 520,
      y: 580,
      radius: 170,
      reserves: 25000,
      maxReserves: 25000,
    },
    {
      id: "ore_southeast",
      name: "Yacimiento Sureste",
      x: 1480,
      y: 1480,
      radius: 170,
      reserves: 25000,
      maxReserves: 25000,
    },
  ];
}

// Calculate team energy balance and whether they are in "Low Power"
export function calculatePowerGrid(buildings, team) {
  let produced = 0;
  let consumed = 0;
  for (const b of buildings) {
    if (b.team !== team || b.hp <= 0 || b.buildTimeRemaining > 0) continue;
    const def = RTS_BUILDINGS[b.type];
    if (!def) continue;
    if (def.power > 0) produced += def.power;
    else if (def.power < 0) consumed += Math.abs(def.power);
  }
  return {
    produced,
    consumed,
    surplus: produced - consumed,
    isLowPower: consumed > produced,
  };
}

// Check whether a team has an operational Headquarters or MCV
export function canTeamBuild(buildings, units, team) {
  const hasHq = buildings.some((b) => b.team === team && b.type === "hq" && b.hp > 0);
  const hasMcv = units.some((u) => u.team === team && u.type === "mcv" && u.hp > 0);
  return hasHq || hasMcv;
}

// Check whether a point (x,y) is within build radius of friendly base or buildings
export function canBuildAtLocation(x, y, buildingType, buildings, basePos, team) {
  const def = RTS_BUILDINGS[buildingType];
  if (!def) return false;
  // Wind turbine can be built ANYWHERE on the map!
  if (def.freePlacement) return true;

  // Check distance to headquarters/base
  if (basePos && Math.hypot(x - basePos.x, y - basePos.y) <= RTS_CONFIG.buildRadius) {
    return true;
  }
  // Check distance to any existing friendly building
  for (const b of buildings) {
    if (b.team === team && b.hp > 0 && Math.hypot(x - b.x, y - b.y) <= RTS_CONFIG.buildRadius) {
      return true;
    }
  }
  return false;
}

// Deploy an MCV into a Headquarters building
export function deployMcv(mcv, state) {
  if (!mcv || mcv.type !== "mcv" || mcv.hp <= 0) return false;
  mcv.isDeploying = true;
  mcv.deployProgress = 0;
  mcv.deployDuration = RTS_BUILDINGS.hq.buildDuration;
  return true;
}

// Finish MCV deployment into HQ
export function completeMcvDeployment(mcv, state) {
  const team = mcv.team;
  const hq = {
    id: state.nextId++,
    team: team,
    type: "hq",
    x: mcv.x,
    y: mcv.y,
    hp: RTS_BUILDINGS.hq.hp,
    maxHp: RTS_BUILDINGS.hq.hp,
    buildTimeRemaining: 0,
  };
  state.rtsBuildings.push(hq);
  // Update team base position to the deployed HQ location
  if (state.teams[team]) {
    state.teams[team].hq = { x: mcv.x, y: mcv.y, hp: hq.hp, maxHp: hq.maxHp };
    state.teams[team].hasHq = true;
  }
  // Remove MCV from active units
  const idx = state.rtsUnits.indexOf(mcv);
  if (idx !== -1) state.rtsUnits.splice(idx, 1);
  return hq;
}

// Create an RTS game state: supports 'campaign' (2 bases) and 'survival' (1 player base vs waves)
export function createRtsState(submode = "campaign") {
  const isSurvival = submode === "survival";
  const state = {
    isRts: true,
    rtsSubmode: submode, // "campaign" | "survival"
    level: 3,
    towers: [],
    enemies: [],
    projectiles: [],
    beams: [],
    explosions: [],
    walls: [],
    paused: false,
    gameOver: false,
    win: false,
    levelComplete: false,
    survivalWave: 0,
    maxSurvivalWaves: 20,
    survivalWaveTimer: isSurvival ? 25.0 : 0,
    mineralFields: createRtsMineralFields(),
    teams: {
      blue: {
        credits: 1600,
        hasHq: false,
        hq: { x: RTS_CONFIG.blueBase.x, y: RTS_CONFIG.blueBase.y, hp: 0, maxHp: 1500 },
        rallyPoints: {
          barracks: { x: RTS_CONFIG.blueBase.x + 80, y: RTS_CONFIG.blueBase.y - 40 },
          factory: { x: RTS_CONFIG.blueBase.x + 90, y: RTS_CONFIG.blueBase.y - 80 },
        },
        productionQueues: {
          barracks: null, // { unitType, progress, duration }
          factory: null,
        },
        upgrades: {
          unitDamage: 0,
          unitSpeed: 0,
          unitFireRate: 0,
          unitArmor: 0,
          unitAmmo: 0,
          turretDamage: 0,
          turretRange: 0,
          turretFireRate: 0,
          turretArmor: 0,
          turretAmmo: 0,
          laserUnlocked: false,
        },
      },
      red: isSurvival
        ? null
        : {
            credits: 1600,
            hasHq: false,
            hq: { x: RTS_CONFIG.redBase.x, y: RTS_CONFIG.redBase.y, hp: 0, maxHp: 1500 },
            rallyPoints: {
              barracks: { x: RTS_CONFIG.redBase.x - 80, y: RTS_CONFIG.redBase.y + 40 },
              factory: { x: RTS_CONFIG.redBase.x - 90, y: RTS_CONFIG.redBase.y + 80 },
            },
            productionQueues: {
              barracks: null,
              factory: null,
            },
            upgrades: {
              unitDamage: 0,
              unitSpeed: 0,
              unitFireRate: 0,
              unitArmor: 0,
              unitAmmo: 0,
              turretDamage: 0,
              turretRange: 0,
              turretFireRate: 0,
              turretArmor: 0,
              turretAmmo: 0,
              laserUnlocked: false,
            },
          },
    },
    rtsBuildings: [],
    rtsUnits: [
      // Blue starting MCV (Mobile Construction Vehicle)
      {
        id: 1000,
        team: "blue",
        type: "mcv",
        x: RTS_CONFIG.blueBase.x,
        y: RTS_CONFIG.blueBase.y,
        hp: RTS_UNITS.mcv.hp,
        maxHp: RTS_UNITS.mcv.hp,
        isDeploying: false,
        deployProgress: 0,
        selected: false,
      },
    ],
    nextId: 3000,
    winner: null,
  };

  // In campaign mode, spawn red MCV as well
  if (!isSurvival) {
    state.rtsUnits.push({
      id: 2000,
      team: "red",
      type: "mcv",
      x: RTS_CONFIG.redBase.x,
      y: RTS_CONFIG.redBase.y,
      hp: RTS_UNITS.mcv.hp,
      maxHp: RTS_UNITS.mcv.hp,
      isDeploying: false,
      deployProgress: 0,
      selected: false,
    });
  }

  // Fog of War (Shroud & Grey Fog like modern C&C)
  state.fog = createFog(RTS_CONFIG.worldSize, RTS_CONFIG.worldSize);
  updateRtsFog(state);

  return state;
}

// Update the player's fog of war from all active friendly buildings and units
export function updateRtsFog(state) {
  if (!state || !state.fog) return;
  const viewers = [];
  const turretRangeLevel = state.teams?.blue?.upgrades?.turretRange || 0;
  const turretBonus = 1 + turretRangeLevel * (RTS_RESEARCH_UPGRADES.turretRange?.bonusPerLevel || 0.1);

  if (state.rtsBuildings) {
    for (const b of state.rtsBuildings) {
      if (b.team === "blue" && b.hp > 0) {
        let r = RTS_SIGHT[b.type] || 220;
        if (b.type && b.type.startsWith("turret_")) r *= turretBonus;
        viewers.push({ x: b.x, y: b.y, r });
      }
    }
  }

  if (state.rtsUnits) {
    for (const u of state.rtsUnits) {
      if (u.team === "blue" && u.hp > 0) {
        const r = RTS_SIGHT[u.type] || 190;
        viewers.push({ x: u.x, y: u.y, r });
      }
    }
  }

  updateFog(state.fog, viewers, []);
}

// Victory Condition:
// In Campaign: team wins when enemy has NO buildings and NO units left.
// In Survival: win by clearing 20 waves; lose if blue base/units are wiped out.
export function checkRtsVictory(state) {
  if (state.winner) return state.winner;

  const blueBuildings = state.rtsBuildings.filter((b) => b.team === "blue" && b.hp > 0).length;
  const blueUnits = state.rtsUnits.filter((u) => u.team === "blue" && u.hp > 0).length;
  const blueAlive = blueBuildings > 0 || blueUnits > 0;

  if (state.rtsSubmode === "survival") {
    if (!blueAlive) {
      state.winner = "defeat";
      state.gameOver = true;
      return "defeat";
    }
    if (state.survivalWave >= state.maxSurvivalWaves) {
      state.winner = "victory";
      state.win = true;
      return "victory";
    }
    return null;
  }

  // Campaign mode
  const redBuildings = state.rtsBuildings.filter((b) => b.team === "red" && b.hp > 0).length;
  const redUnits = state.rtsUnits.filter((u) => u.team === "red" && u.hp > 0).length;
  const redAlive = redBuildings > 0 || redUnits > 0;

  if (!blueAlive && redAlive) {
    state.winner = "red";
    state.gameOver = true;
    return "red";
  }
  if (!redAlive && blueAlive) {
    state.winner = "blue";
    state.win = true;
    return "blue";
  }
  return null;
}

// Find closest mineral field with remaining ore
export function findBestMineralField(unit, mineralFields) {
  let best = null;
  let bestDist = Infinity;
  for (const f of mineralFields) {
    if (f.reserves <= 0) continue;
    const d = Math.hypot(f.x - unit.x, f.y - unit.y);
    if (d < bestDist) {
      bestDist = d;
      best = f;
    }
  }
  return best;
}

// Find nearest active refinery for the team
export function findNearestRefinery(unit, buildings) {
  let best = null;
  let bestDist = Infinity;
  for (const b of buildings) {
    if (b.team !== unit.team || b.type !== "refinery" || b.hp <= 0 || b.buildTimeRemaining > 0) continue;
    const d = Math.hypot(b.x - unit.x, b.y - unit.y);
    if (d < bestDist) {
      bestDist = d;
      best = b;
    }
  }
  return best;
}

// Step one tick of harvester AI
export function stepHarvester(h, dt, mineralFields, buildings, teamState) {
  const HARVEST_RATE = 85; // 300 capacity filled in ~3.5 seconds
  const SPEED = RTS_UNITS.harvester.speed || 40;
  const CAPACITY = h.capacity || RTS_UNITS.harvester.capacity || 300;

  // Initialize load/cargo safely
  if (h.load === undefined) h.load = h.cargo || 0;
  h.cargo = h.load;

  // If player issued an active manual move order, wait until they arrive
  if (h.targetX !== undefined) return;

  // 1. Idle / Defending: Auto-seek ore or return if already carrying
  if (h.state === "IDLE" || h.state === "idle" || h.state === "DEFENDING" || h.state === "MOVING") {
    if (h.load >= CAPACITY) {
      h.state = "TO_REFINERY";
    } else {
      const field = findBestMineralField(h, mineralFields);
      if (field) {
        h.targetFieldId = field.id;
        h.state = "TO_FIELD";
      }
    }
    return;
  }

  // 2. Traveling to mineral field
  if (h.state === "TO_FIELD") {
    const field = (mineralFields && mineralFields.find((f) => f.id === h.targetFieldId)) || findBestMineralField(h, mineralFields);
    if (!field || field.reserves <= 0) {
      h.state = "IDLE";
      return;
    }
    h.targetFieldId = field.id;
    const d = Math.hypot(field.x - h.x, field.y - h.y);
    if (d <= field.radius * 0.7) {
      h.state = "HARVESTING";
      h.harvestTimer = 0;
    } else {
      const angle = Math.atan2(field.y - h.y, field.x - h.x);
      h.x += Math.cos(angle) * SPEED * dt;
      h.y += Math.sin(angle) * SPEED * dt;
      h.angle = angle;
    }
    return;
  }

  // 3. Actively harvesting minerals
  if (h.state === "HARVESTING") {
    const field = mineralFields && mineralFields.find((f) => f.id === h.targetFieldId);
    if (!field || field.reserves <= 0 || h.load >= CAPACITY) {
      h.state = "TO_REFINERY";
      return;
    }
    const delta = Math.min(HARVEST_RATE * dt, field.reserves, CAPACITY - h.load);
    h.load += delta;
    h.cargo = h.load;
    field.reserves -= delta;
    if (h.load >= CAPACITY) {
      h.state = "TO_REFINERY";
    }
    return;
  }

  // 4. Returning loaded to the refinery
  if (h.state === "TO_REFINERY") {
    const refinery = findNearestRefinery(h, buildings);
    if (!refinery) {
      h.state = "IDLE";
      return;
    }
    const d = Math.hypot(refinery.x - h.x, refinery.y - h.y);
    if (d <= 65) {
      h.state = "UNLOADING";
      h.unloadTimer = 0.8;
    } else {
      const angle = Math.atan2(refinery.y - h.y, refinery.x - h.x);
      h.x += Math.cos(angle) * SPEED * dt;
      h.y += Math.sin(angle) * SPEED * dt;
      h.angle = angle;
    }
    return;
  }

  // 5. Unloading harvested minerals at refinery dock
  if (h.state === "UNLOADING") {
    h.unloadTimer = (h.unloadTimer || 0.8) - dt;
    if (h.unloadTimer <= 0) {
      const deposit = Math.round(h.load);
      if (teamState) teamState.credits += deposit;
      h.load = 0;
      h.cargo = 0;
      // Head straight back out to harvest the best field!
      const nextField = findBestMineralField(h, mineralFields);
      if (nextField) {
        h.targetFieldId = nextField.id;
        h.state = "TO_FIELD";
      } else {
        h.state = "IDLE";
      }
    }
  }
}

// Create an RTS building instance
export function createRtsBuilding(type, x, y, team, id) {
  const def = RTS_BUILDINGS[type];
  if (!def) return null;
  const isImmediate = def.buildDuration === 0;
  return {
    id,
    team,
    type,
    x,
    y,
    hp: def.hp,
    maxHp: def.hp,
    buildTimeRemaining: isImmediate ? 0 : def.buildDuration,
    totalBuildTime: def.buildDuration,
    harvesterSpawned: false,
    queue: type === "barracks" || type === "factory" ? { current: null, pending: [] } : null,
    research: type === "techlab" ? null : undefined,
  };
}

// Production Queue for Barracks (Infantry) & Factory (Vehicles)
export function enqueueUnit(building, unitType, teamState) {
  if (!building || !building.queue) return { ok: false, reason: "not-a-production-building" };
  if (building.buildTimeRemaining > 0) return { ok: false, reason: "under-construction" };
  const unitDef = RTS_UNITS[unitType];
  if (!unitDef) return { ok: false, reason: "unknown-unit" };
  if (unitDef.producedIn !== building.type) return { ok: false, reason: "wrong-building" };
  if (teamState.credits < unitDef.cost) return { ok: false, reason: "insufficient-credits" };

  teamState.credits -= unitDef.cost;
  if (!building.queue.current) {
    building.queue.current = {
      unitType,
      elapsed: 0,
      totalTime: unitDef.buildTime,
    };
  } else {
    building.queue.pending.push(unitType);
  }
  return { ok: true, credits: teamState.credits };
}

// Cancel a queued unit and refund credits
// index -1: cancels current item being produced
// index >= 0: cancels pending queue item at that index
export function cancelQueueItem(building, index, teamState) {
  if (!building || !building.queue) return false;
  if (index === -1) {
    if (!building.queue.current) return false;
    const unitDef = RTS_UNITS[building.queue.current.unitType];
    if (unitDef) teamState.credits += unitDef.cost;
    if (building.queue.pending.length > 0) {
      const nextType = building.queue.pending.shift();
      building.queue.current = {
        unitType: nextType,
        elapsed: 0,
        totalTime: RTS_UNITS[nextType].buildTime,
      };
    } else {
      building.queue.current = null;
    }
    return true;
  }
  if (index >= 0 && index < building.queue.pending.length) {
    const unitType = building.queue.pending.splice(index, 1)[0];
    const unitDef = RTS_UNITS[unitType];
    if (unitDef) teamState.credits += unitDef.cost;
    return true;
  }
  return false;
}

// Step production queue of a barracks or factory
export function stepProductionQueue(building, dt, isLowPower, onComplete) {
  if (!building || !building.queue || !building.queue.current) return;
  const speed = isLowPower ? 0.5 : 1.0;
  building.queue.current.elapsed += dt * speed;
  if (building.queue.current.elapsed >= building.queue.current.totalTime) {
    const finishedType = building.queue.current.unitType;
    if (onComplete) {
      onComplete(finishedType, building);
    }
    if (building.queue.pending.length > 0) {
      const nextType = building.queue.pending.shift();
      building.queue.current = {
        unitType: nextType,
        elapsed: 0,
        totalTime: RTS_UNITS[nextType].buildTime,
      };
    } else {
      building.queue.current = null;
    }
  }
}

// Tech Lab Research (Up to 5 levels for Units and Defensive Turrets)
export function startResearch(techLab, upgradeKey, teamState) {
  if (!techLab || techLab.type !== "techlab" || techLab.hp <= 0 || techLab.buildTimeRemaining > 0) {
    return { ok: false, reason: "techlab-unavailable" };
  }
  if (techLab.research) {
    return { ok: false, reason: "already-researching" };
  }
  const upgradeDef = RTS_RESEARCH_UPGRADES[upgradeKey];
  if (!upgradeDef) return { ok: false, reason: "unknown-upgrade" };

  const currentLevel = teamState.upgrades[upgradeKey] || 0;
  if (currentLevel >= upgradeDef.maxLevel) {
    return { ok: false, reason: "max-level-reached" };
  }

  const cost = upgradeDef.costPerLevel[currentLevel];
  if (teamState.credits < cost) {
    return { ok: false, reason: "insufficient-credits" };
  }

  teamState.credits -= cost;
  const totalTime = upgradeDef.timePerLevel[currentLevel];
  techLab.research = {
    upgradeKey,
    targetLevel: currentLevel + 1,
    elapsed: 0,
    totalTime,
  };
  return { ok: true, targetLevel: currentLevel + 1, credits: teamState.credits };
}

// Step active research in a Tech Lab
export function stepResearch(techLab, dt, isLowPower, teamState, onComplete) {
  if (!techLab || techLab.type !== "techlab" || !techLab.research) return;
  const speed = isLowPower ? 0.5 : 1.0;
  techLab.research.elapsed += dt * speed;
  if (techLab.research.elapsed >= techLab.research.totalTime) {
    const { upgradeKey, targetLevel } = techLab.research;
    teamState.upgrades[upgradeKey] = targetLevel;
    techLab.research = null;
    if (onComplete) onComplete(upgradeKey, targetLevel);
  }
}

// Stat multipliers based on tech levels (5 levels for units, 5 levels for turrets)
export function getUnitStatMultipliers(upgrades) {
  const damageLvl = upgrades.unitDamage || 0;
  const speedLvl = upgrades.unitSpeed || 0;
  const fireRateLvl = upgrades.unitFireRate || 0;
  const armorLvl = upgrades.unitArmor || 0;
  const ammoLvl = upgrades.unitAmmo || 0;
  return {
    damageMult: 1 + damageLvl * RTS_RESEARCH_UPGRADES.unitDamage.bonusPerLevel,
    speedMult: 1 + speedLvl * RTS_RESEARCH_UPGRADES.unitSpeed.bonusPerLevel,
    fireRateMult: 1 + fireRateLvl * RTS_RESEARCH_UPGRADES.unitFireRate.bonusPerLevel,
    hpMult: 1 + armorLvl * RTS_RESEARCH_UPGRADES.unitArmor.bonusPerLevel,
    ammoMult: 1 + ammoLvl * RTS_RESEARCH_UPGRADES.unitAmmo.bonusPerLevel,
  };
}

export function getTurretStatMultipliers(upgrades) {
  const damageLvl = upgrades.turretDamage || 0;
  const rangeLvl = upgrades.turretRange || 0;
  const fireRateLvl = upgrades.turretFireRate || 0;
  const armorLvl = upgrades.turretArmor || 0;
  const ammoLvl = upgrades.turretAmmo || 0;
  return {
    damageMult: 1 + damageLvl * RTS_RESEARCH_UPGRADES.turretDamage.bonusPerLevel,
    rangeMult: 1 + rangeLvl * RTS_RESEARCH_UPGRADES.turretRange.bonusPerLevel,
    fireRateMult: 1 + fireRateLvl * RTS_RESEARCH_UPGRADES.turretFireRate.bonusPerLevel,
    hpMult: 1 + armorLvl * RTS_RESEARCH_UPGRADES.turretArmor.bonusPerLevel,
    ammoMult: 1 + ammoLvl * RTS_RESEARCH_UPGRADES.turretAmmo.bonusPerLevel,
  };
}

// Spawn a freshly produced unit from a building
export function spawnRtsUnit(unitType, building, state) {
  const def = RTS_UNITS[unitType];
  if (!def) return null;
  const team = building.team;
  const teamState = state.teams[team];
  const mults = teamState && teamState.upgrades ? getUnitStatMultipliers(teamState.upgrades) : { hpMult: 1, damageMult: 1, speedMult: 1 };

  const unit = {
    id: state.nextId++,
    team,
    type: unitType,
    x: building.x + (Math.random() - 0.5) * 50,
    y: building.y + 55,
    hp: Math.round(def.hp * mults.hpMult),
    maxHp: Math.round(def.hp * mults.hpMult),
    speed: def.speed * mults.speedMult,
    damage: def.damage * mults.damageMult,
    range: def.range,
    fireRate: def.fireRate,
    fireCooldown: 0,
    ammo: 20,
    maxAmmo: 20,
    selected: false,
    state: unitType === "harvester" ? "IDLE" : "DEFENDING",
    load: 0,
    targetFieldId: null,
  };
  state.rtsUnits.push(unit);
  return unit;
}

// Handle combat between opposing teams and survival waves
export function stepRtsCombat(state, dt) {
  const isSurvival = state.rtsSubmode === "survival";

  // 1. Survival mode wave spawner
  if (isSurvival && state.survivalWave < state.maxSurvivalWaves) {
    state.survivalWaveTimer -= dt;
    if (state.survivalWaveTimer <= 0) {
      state.survivalWave++;
      state.survivalWaveTimer = 30.0;
      // Spawn wave from top/east edge of Map 3
      const waveCount = 4 + state.survivalWave * 2;
      for (let i = 0; i < waveCount; i++) {
        const types = ["soldier", "motorcycle", "buggy", "tank", "rocket"];
        const typeIndex = Math.min(types.length - 1, Math.floor(state.survivalWave / 4));
        const uType = types[Math.floor(Math.random() * (typeIndex + 1))];
        const def = RTS_UNITS[uType];
        state.rtsUnits.push({
          id: state.nextId++,
          team: "red",
          type: uType,
          x: 1800 + (Math.random() - 0.5) * 100,
          y: 350 + i * 40,
          hp: def.hp,
          maxHp: def.hp,
          speed: def.speed,
          damage: def.damage,
          range: def.range,
          fireRate: def.fireRate,
          fireCooldown: 0,
          ammo: 20,
          maxAmmo: 20,
          selected: false,
          state: "ATTACKING_BASE",
          load: 0,
        });
      }
    }
  }

  // 2. Unit targeting & firing
  for (const u of state.rtsUnits) {
    if (u.hp <= 0) continue;
    u.fireCooldown = Math.max(0, (u.fireCooldown || 0) - dt);

    // Explicit move order towards targetX, targetY
    if (u.targetX !== undefined && u.targetY !== undefined) {
      const d = Math.hypot(u.targetX - u.x, u.targetY - u.y);
      if (d <= Math.max(8, u.speed * dt)) {
        u.x = u.targetX;
        u.y = u.targetY;
        u.targetX = undefined;
        u.targetY = undefined;
        if (u.state === "MOVING") u.state = "DEFENDING";
      } else {
        const angle = Math.atan2(u.targetY - u.y, u.targetX - u.x);
        u.x += Math.cos(angle) * u.speed * dt;
        u.y += Math.sin(angle) * u.speed * dt;
        u.angle = angle;
      }
    }

    // Red attackers in survival or campaign march toward blue base
    if (u.team === "red" && u.state === "ATTACKING_BASE" && u.targetX === undefined) {
      const targetPos = (state.teams.blue && state.teams.blue.hq) || { x: RTS_CONFIG.blueBase.x, y: RTS_CONFIG.blueBase.y };
      const d = Math.hypot(targetPos.x - u.x, targetPos.y - u.y);
      if (d > 80) {
        const angle = Math.atan2(targetPos.y - u.y, targetPos.x - u.x);
        u.x += Math.cos(angle) * u.speed * dt;
        u.y += Math.sin(angle) * u.speed * dt;
        u.angle = angle;
      }
    }

    // Combat units acquire targets and attack
    if (u.damage > 0) {
      let bestTarget = null;
      let bestDist = u.range;

      // If unit has an assigned target enemy
      if (u.targetEnemyId) {
        const enemy = state.rtsUnits.find((o) => o.id === u.targetEnemyId && o.hp > 0 && o.team !== u.team) ||
                      state.rtsBuildings.find((o) => o.id === u.targetEnemyId && o.hp > 0 && o.team !== u.team);
        if (!enemy) {
          u.targetEnemyId = null;
        } else {
          const d = Math.hypot(enemy.x - u.x, enemy.y - u.y);
          if (d <= u.range) {
            bestTarget = enemy;
          } else if (u.targetX === undefined) {
            // Move toward enemy to get in range
            const angle = Math.atan2(enemy.y - u.y, enemy.x - u.x);
            u.x += Math.cos(angle) * u.speed * dt;
            u.y += Math.sin(angle) * u.speed * dt;
            u.angle = angle;
          }
        }
      }

      // If no explicit target or target out of range, find nearest hostile target within range
      if (!bestTarget) {
        for (const other of state.rtsUnits) {
          if (other.team === u.team || other.hp <= 0) continue;
          const d = Math.hypot(other.x - u.x, other.y - u.y);
          if (d < bestDist) {
            bestDist = d;
            bestTarget = other;
          }
        }

        if (!bestTarget) {
          for (const bld of state.rtsBuildings) {
            if (bld.team === u.team || bld.hp <= 0) continue;
            const d = Math.hypot(bld.x - u.x, bld.y - u.y);
            if (d < bestDist) {
              bestDist = d;
              bestTarget = bld;
            }
          }
        }
      }

      // Shoot target
      if (bestTarget && u.fireCooldown <= 0) {
        bestTarget.hp = Math.max(0, bestTarget.hp - u.damage);
        u.fireCooldown = u.fireRate;
        u.angle = Math.atan2(bestTarget.y - u.y, bestTarget.x - u.x);
        // Record combat tracer
        state.rtsTracers = state.rtsTracers || [];
        state.rtsTracers.push({
          x1: u.x,
          y1: u.y,
          x2: bestTarget.x,
          y2: bestTarget.y,
          color: u.team === "blue" ? "#60a5fa" : "#f87171",
          life: 0.15,
        });
      }
    }
  }

  // 3. Defensive Turrets targeting & firing
  for (const b of state.rtsBuildings) {
    if (b.hp <= 0 || b.buildTimeRemaining > 0) continue;
    if (!b.type.startsWith("turret_")) continue;

    // Laser turret check power
    const isLaser = b.type === "turret_laser";
    if (isLaser && calculatePowerGrid(state.rtsBuildings, b.team).isLowPower) {
      continue; // Laser turret offline during low power!
    }

    const teamState = state.teams[b.team];
    const turretMults = teamState && teamState.upgrades ? getTurretStatMultipliers(teamState.upgrades) : { damageMult: 1, rangeMult: 1, fireRateMult: 1 };

    let baseDamage = b.type === "turret_laser" ? 18 : b.type === "turret_double" ? 22 : 14;
    let baseRange = b.type === "turret_laser" ? 220 : 180;
    let baseFireRate = b.type === "turret_laser" ? 0.3 : b.type === "turret_double" ? 0.6 : 0.9;

    const damage = baseDamage * turretMults.damageMult;
    const range = baseRange * turretMults.rangeMult;
    const fireCooldownTime = baseFireRate / turretMults.fireRateMult;

    b.turretCooldown = Math.max(0, (b.turretCooldown || 0) - dt);

    let bestTarget = null;
    let bestDist = range;
    for (const u of state.rtsUnits) {
      if (u.team === b.team || u.hp <= 0) continue;
      const d = Math.hypot(u.x - b.x, u.y - b.y);
      if (d < bestDist) {
        bestDist = d;
        bestTarget = u;
      }
    }

    if (bestTarget) {
      b.turretAngle = Math.atan2(bestTarget.y - b.y, bestTarget.x - b.x);
      if (b.turretCooldown <= 0) {
        bestTarget.hp = Math.max(0, bestTarget.hp - damage);
        b.turretCooldown = fireCooldownTime;
        // Record turret shot / laser beam
        state.rtsTracers = state.rtsTracers || [];
        state.rtsTracers.push({
          x1: b.x,
          y1: b.y,
          x2: bestTarget.x,
          y2: bestTarget.y,
          color: isLaser ? "#38bdf8" : "#fbbf24",
          width: isLaser ? 3 : 1.5,
          life: isLaser ? 0.25 : 0.12,
        });
      }
    }
  }

  // Step active combat tracers
  if (state.rtsTracers) {
    for (const tr of state.rtsTracers) tr.life -= dt;
    state.rtsTracers = state.rtsTracers.filter((tr) => tr.life > 0);
  }

  // 4. Remove dead units & buildings
  state.rtsUnits = state.rtsUnits.filter((u) => u.hp > 0);
  state.rtsBuildings = state.rtsBuildings.filter((b) => b.hp > 0);
}

// Master step tick for RTS simulation loop
export function stepRts(state, dt) {
  if (state.winner || state.paused) return;

  // 1. Process MCV deployment
  for (let i = state.rtsUnits.length - 1; i >= 0; i--) {
    const u = state.rtsUnits[i];
    if (u.type === "mcv" && u.isDeploying) {
      u.deployProgress += dt;
      if (u.deployProgress >= u.deployDuration) {
        completeMcvDeployment(u, state);
      }
    }
  }

  // 2. Process buildings construction time
  for (const b of state.rtsBuildings) {
    if (b.buildTimeRemaining > 0) {
      const isLowPower = calculatePowerGrid(state.rtsBuildings, b.team).isLowPower;
      b.buildTimeRemaining = Math.max(0, b.buildTimeRemaining - dt * (isLowPower ? 0.5 : 1.0));
    }
    // When a refinery is completed, automatically deploy a default Harvester (C&C feature)
    if (b.type === "refinery" && b.buildTimeRemaining <= 0 && !b.harvesterSpawned) {
      b.harvesterSpawned = true;
      const harvester = {
        id: state.nextId++,
        team: b.team,
        type: "harvester",
        x: b.x + 35,
        y: b.y + 40,
        hp: RTS_UNITS.harvester.hp,
        maxHp: RTS_UNITS.harvester.hp,
        speed: RTS_UNITS.harvester.speed,
        cargo: 0,
        load: 0,
        capacity: RTS_UNITS.harvester.capacity || 300,
        state: "IDLE",
        selected: false,
      };
      state.rtsUnits.push(harvester);
      if (typeof state.onHarvesterSpawned === "function") {
        state.onHarvesterSpawned(harvester, b);
      }
    }
  }

  // 3. Process Harvesters AI & movement
  for (const u of state.rtsUnits) {
    if (u.type === "harvester" && u.hp > 0) {
      stepHarvester(u, dt, state.mineralFields, state.rtsBuildings, state.teams[u.team]);
    }
  }

  // 4. Process Production Queues (Barracks & Factory)
  for (const b of state.rtsBuildings) {
    if (b.hp > 0 && b.buildTimeRemaining <= 0 && b.queue) {
      const isLowPower = calculatePowerGrid(state.rtsBuildings, b.team).isLowPower;
      stepProductionQueue(b, dt, isLowPower, (unitType, building) => {
        spawnRtsUnit(unitType, building, state);
      });
    }
  }

  // 5. Process Tech Lab Research
  for (const b of state.rtsBuildings) {
    if (b.type === "techlab" && b.hp > 0 && b.buildTimeRemaining <= 0 && b.research) {
      const isLowPower = calculatePowerGrid(state.rtsBuildings, b.team).isLowPower;
      stepResearch(b, dt, isLowPower, state.teams[b.team]);
    }
  }

  // 6. Combat / Unit combat between Blue and Red, or Survival Waves
  stepRtsCombat(state, dt);

  // 7. Campaign Mode Red AI
  if (state.rtsSubmode === "campaign") {
    stepRtsCampaignAi(state, dt);
  }

  // 8. Update Fog of War (revealing shroud and grey fog)
  updateRtsFog(state);

  // 9. Check Victory condition
  checkRtsVictory(state);
}

// Campaign AI for the enemy Red team
export function stepRtsCampaignAi(state, dt) {
  if (state.rtsSubmode !== "campaign" || !state.teams.red) return;
  const red = state.teams.red;

  state.redAiTimer = (state.redAiTimer || 0) + dt;
  if (state.redAiTimer < 1.0) return;
  state.redAiTimer = 0;

  // 1. Deploy MCV if present and not yet deploying
  const redMcv = state.rtsUnits.find((u) => u.team === "red" && u.type === "mcv");
  if (redMcv && !redMcv.isDeploying) {
    deployMcv(redMcv, state);
    return;
  }

  if (!red.hasHq) return;

  const redBuildings = state.rtsBuildings.filter((b) => b.team === "red" && b.hp > 0);
  const power = calculatePowerGrid(redBuildings, "red");

  // 2. First Solar power plant
  const solarUnderConstruction = redBuildings.some((b) => b.type === "solar" && b.buildTimeRemaining > 0);
  const solarCount = redBuildings.filter((b) => b.type === "solar").length;
  if (solarCount === 0 && !solarUnderConstruction && red.credits >= 300) {
    red.credits -= 300;
    const bld = createRtsBuilding("solar", red.hq.x + 80, red.hq.y - 60, "red", state.nextId++);
    state.rtsBuildings.push(bld);
    return;
  }

  // 3. Refinery (essential for mineral economy)
  const hasRefinery = redBuildings.some((b) => b.type === "refinery");
  const refineryCost = RTS_BUILDINGS.refinery.cost;
  if (!hasRefinery && red.credits >= refineryCost) {
    red.credits -= refineryCost;
    const bld = createRtsBuilding("refinery", 1600, 620, "red", state.nextId++);
    state.rtsBuildings.push(bld);
    return;
  }

  // Additional solar if power surplus is low and not already building one
  if (power.surplus <= 10 && !solarUnderConstruction && red.credits >= 300 && solarCount < 3) {
    red.credits -= 300;
    const bld = createRtsBuilding("solar", red.hq.x + 80 + solarCount * 60, red.hq.y - 60, "red", state.nextId++);
    state.rtsBuildings.push(bld);
    return;
  }

  // 4. Weapons Factory
  const factory = redBuildings.find((b) => b.type === "factory" && b.buildTimeRemaining <= 0);
  if (!factory && !redBuildings.some((b) => b.type === "factory") && red.credits >= 500) {
    red.credits -= 500;
    const bld = createRtsBuilding("factory", red.hq.x - 90, red.hq.y + 60, "red", state.nextId++);
    state.rtsBuildings.push(bld);
    return;
  }

  // 5. Barracks
  const barracks = redBuildings.find((b) => b.type === "barracks" && b.buildTimeRemaining <= 0);
  if (!barracks && !redBuildings.some((b) => b.type === "barracks") && red.credits >= 250) {
    red.credits -= 250;
    const bld = createRtsBuilding("barracks", red.hq.x + 60, red.hq.y + 70, "red", state.nextId++);
    state.rtsBuildings.push(bld);
    return;
  }

  // 6. Unit production
  const redHarvesters = state.rtsUnits.filter((u) => u.team === "red" && u.type === "harvester").length;
  if (factory && redHarvesters < 2 && red.credits >= 350) {
    enqueueUnit(factory, "harvester", red);
    return;
  }

  if (factory && red.credits >= 150) {
    const candidates = ["motorcycle", "buggy", "tank", "rocket"];
    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    if (red.credits >= RTS_UNITS[pick].cost) {
      enqueueUnit(factory, pick, red);
    }
  }

  if (barracks && red.credits >= 80) {
    enqueueUnit(barracks, "soldier", red);
  }

  // 7. Tactical command: form assault squad
  const combatUnits = state.rtsUnits.filter((u) => u.team === "red" && u.damage > 0 && u.state !== "ATTACKING_BASE");
  if (combatUnits.length >= 4) {
    for (const u of combatUnits) {
      u.state = "ATTACKING_BASE";
    }
  }
}




