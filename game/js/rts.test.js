import test from "node:test";
import assert from "node:assert/strict";
import { isVisible, isExplored } from "./fog.js";

import {
  RTS_CONFIG,
  RTS_BUILDINGS,
  RTS_UNITS,
  RTS_RESEARCH_UPGRADES,
  createRtsMineralFields,
  calculatePowerGrid,
  canBuildAtLocation,
  canTeamBuild,
  deployMcv,
  completeMcvDeployment,
  createRtsState,
  checkRtsVictory,
  findBestMineralField,
  findNearestRefinery,
  stepHarvester,
  createRtsBuilding,
  enqueueUnit,
  cancelQueueItem,
  stepProductionQueue,
  startResearch,
  stepResearch,
  getUnitStatMultipliers,
  getTurretStatMultipliers,
  stepRtsCombat,
  stepRtsCampaignAi,
  stepRts,
} from "./rts.js";

test("RTS Config defines Map 3, 60 unit cap, bases and expanded mineral fields", () => {
  assert.equal(RTS_CONFIG.mapLevel, 3);
  assert.equal(RTS_CONFIG.worldSize, 2048);
  assert.equal(RTS_CONFIG.unitCapPerTeam, 60); // 60 active units per team
  assert.ok(RTS_CONFIG.blueBase);
  assert.ok(RTS_CONFIG.redBase);

  const fields = createRtsMineralFields();
  assert.equal(fields.length, 5);
  assert.equal(fields[0].id, "ore_blue");
  assert.equal(fields[1].id, "ore_red");
  assert.equal(fields[2].id, "ore_center");
  assert.ok(fields[2].reserves >= 15000);
});

test("MCV deploys into Headquarters, enabling base construction", () => {
  const state = createRtsState();
  const mcv = state.rtsUnits.find((u) => u.team === "blue" && u.type === "mcv");
  assert.ok(mcv);
  assert.equal(mcv.isDeploying, false);

  // Initially team has no HQ building, but has MCV -> canTeamBuild is true
  assert.equal(canTeamBuild(state.rtsBuildings, state.rtsUnits, "blue"), true);

  // Deploy MCV
  assert.equal(deployMcv(mcv, state), true);
  assert.equal(mcv.isDeploying, true);

  // Complete deployment
  const hq = completeMcvDeployment(mcv, state);
  assert.ok(hq);
  assert.equal(hq.type, "hq");
  assert.equal(hq.team, "blue");
  assert.equal(hq.hp, RTS_BUILDINGS.hq.hp);
  assert.equal(state.teams.blue.hasHq, true);

  // MCV is consumed/removed from units array
  assert.equal(state.rtsUnits.some((u) => u.id === mcv.id), false);
  // Team can still build because HQ is operational
  assert.equal(canTeamBuild(state.rtsBuildings, state.rtsUnits, "blue"), true);

  // Destroy HQ -> team now cannot build!
  hq.hp = 0;
  assert.equal(canTeamBuild(state.rtsBuildings, state.rtsUnits, "blue"), false);
});

test("Victory condition triggers in Campaign and Survival submodes", () => {
  // 1. Campaign submode: defeat when red loses everything
  const campState = createRtsState("campaign");
  assert.equal(campState.rtsSubmode, "campaign");
  assert.equal(checkRtsVictory(campState), null);

  campState.rtsUnits = campState.rtsUnits.filter((u) => u.team !== "red");
  campState.rtsBuildings = campState.rtsBuildings.filter((b) => b.team !== "red");
  assert.equal(checkRtsVictory(campState), "blue");
  assert.equal(campState.winner, "blue");

  // 2. Survival submode: win when surviving 20 waves, defeat if wiped out
  const survState = createRtsState("survival");
  assert.equal(survState.rtsSubmode, "survival");
  assert.equal(survState.teams.red, null); // No enemy base
  assert.equal(checkRtsVictory(survState), null);

  // Reaching wave 20 -> victory
  survState.survivalWave = 20;
  assert.equal(checkRtsVictory(survState), "victory");

  // If player is wiped out -> defeat
  const deadSurvState = createRtsState("survival");
  deadSurvState.rtsUnits = [];
  deadSurvState.rtsBuildings = [];
  assert.equal(checkRtsVictory(deadSurvState), "defeat");
});

test("Power Grid calculates surplus and detects Low Power status", () => {
  const blds1 = [
    { team: "blue", type: "solar", hp: 400, buildTimeRemaining: 0 },
    { team: "blue", type: "refinery", hp: 600, buildTimeRemaining: 0 },
  ];
  const grid1 = calculatePowerGrid(blds1, "blue");
  assert.equal(grid1.produced, 70);
  assert.equal(grid1.consumed, 20);
  assert.equal(grid1.surplus, 50);
  assert.equal(grid1.isLowPower, false);

  const blds2 = [
    ...blds1,
    { team: "blue", type: "factory", hp: 700, buildTimeRemaining: 0 },
    { team: "blue", type: "techlab", hp: 500, buildTimeRemaining: 0 },
  ];
  const grid2 = calculatePowerGrid(blds2, "blue");
  assert.equal(grid2.produced, 70);
  assert.equal(grid2.consumed, 80);
  assert.equal(grid2.surplus, -10);
  assert.equal(grid2.isLowPower, true);
});

test("Wind turbine can be placed anywhere, other buildings require build radius", () => {
  const base = RTS_CONFIG.blueBase;
  const buildings = [
    { team: "blue", type: "solar", x: base.x + 50, y: base.y + 50, hp: 400 },
  ];

  assert.equal(canBuildAtLocation(1800, 300, "wind", buildings, base, "blue"), true);
  assert.equal(canBuildAtLocation(1800, 300, "solar", buildings, base, "blue"), false);
  assert.equal(canBuildAtLocation(base.x + 100, base.y, "solar", buildings, base, "blue"), true);
  assert.equal(canBuildAtLocation(base.x + 200, base.y + 50, "solar", buildings, base, "blue"), true);
});

test("Wall deployment is immediate (buildDuration: 0), while other buildings take seconds", () => {
  const wall = createRtsBuilding("wall", 400, 1500, "blue", 1);
  assert.ok(wall);
  assert.equal(wall.buildTimeRemaining, 0); // Immediate!
  assert.equal(wall.totalBuildTime, 0);

  const solar = createRtsBuilding("solar", 450, 1500, "blue", 2);
  assert.ok(solar);
  assert.equal(solar.buildTimeRemaining, 4.0); // Takes 4 seconds
  assert.equal(solar.totalBuildTime, 4.0);

  const factory = createRtsBuilding("factory", 500, 1500, "blue", 3);
  assert.equal(factory.buildTimeRemaining, 6.0); // Takes 6 seconds
});

test("Barracks and Factory queues allow multi-unit queueing, progressive times, and refunds", () => {
  const teamState = { credits: 1000 };
  const barracks = createRtsBuilding("barracks", 400, 1500, "blue", 10);
  barracks.buildTimeRemaining = 0; // finished construction

  // 1. Enqueue soldier (cost 40)
  const res1 = enqueueUnit(barracks, "soldier", teamState);
  assert.equal(res1.ok, true);
  assert.equal(teamState.credits, 960);
  assert.ok(barracks.queue.current);
  assert.equal(barracks.queue.current.unitType, "soldier");
  assert.equal(barracks.queue.pending.length, 0);

  // 2. Enqueue two more soldiers (queued in pending)
  enqueueUnit(barracks, "soldier", teamState);
  enqueueUnit(barracks, "soldier", teamState);
  assert.equal(teamState.credits, 880);
  assert.equal(barracks.queue.pending.length, 2);

  // 3. Step queue until first soldier completes
  let spawned = [];
  stepProductionQueue(barracks, 3.0, false, (type) => spawned.push(type));
  assert.equal(spawned.length, 1);
  assert.equal(spawned[0], "soldier");
  // Next soldier from pending should now be active
  assert.equal(barracks.queue.pending.length, 1);
  assert.ok(barracks.queue.current);

  // 4. Cancel a pending unit -> refund 40 credits
  const refunded = cancelQueueItem(barracks, 0, teamState);
  assert.equal(refunded, true);
  assert.equal(teamState.credits, 920);
  assert.equal(barracks.queue.pending.length, 0);

  // 5. Factory vehicle queue with heavier units taking longer
  const factory = createRtsBuilding("factory", 500, 1500, "blue", 11);
  factory.buildTimeRemaining = 0;

  // Moto (cost 85, time 3.0s) vs Tanque (cost 300, time 6.5s)
  enqueueUnit(factory, "motorcycle", teamState);
  assert.equal(factory.queue.current.totalTime, 3.0);

  enqueueUnit(factory, "tank", teamState);
  assert.equal(factory.queue.pending[0], "tank");
  assert.equal(RTS_UNITS.tank.buildTime, 6.5);
  assert.ok(RTS_UNITS.tank.buildTime > RTS_UNITS.motorcycle.buildTime);
});

test("Tech Lab allows research up to 5 levels for 5 unit upgrades and 5 turret upgrades", () => {
  const teamState = {
    credits: 5000,
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
    },
  };

  const techlab = createRtsBuilding("techlab", 400, 1500, "blue", 20);
  techlab.buildTimeRemaining = 0;

  // 1. Research Unit Damage Level 1
  const r1 = startResearch(techlab, "unitDamage", teamState);
  assert.equal(r1.ok, true);
  assert.equal(r1.targetLevel, 1);
  assert.ok(techlab.research);
  assert.equal(teamState.credits, 4900); // 100 spent

  // Step research to completion
  stepResearch(techlab, 5.0, false, teamState);
  assert.equal(techlab.research, null);
  assert.equal(teamState.upgrades.unitDamage, 1);

  // Multiplier for Level 1 unit damage (+15%)
  const unitMults1 = getUnitStatMultipliers(teamState.upgrades);
  assert.equal(unitMults1.damageMult, 1.15);

  // 2. Set all 5 unit upgrades to Max Level (5)
  teamState.upgrades.unitDamage = 5;
  teamState.upgrades.unitSpeed = 5;
  teamState.upgrades.unitFireRate = 5;
  teamState.upgrades.unitArmor = 5;
  teamState.upgrades.unitAmmo = 5;

  const unitMults5 = getUnitStatMultipliers(teamState.upgrades);
  assert.equal(unitMults5.damageMult, 1.75);   // +75% daño (1 + 5 * 0.15)
  assert.equal(unitMults5.speedMult, 1.50);    // +50% velocidad (1 + 5 * 0.10)
  assert.equal(unitMults5.fireRateMult, 1.60); // +60% cadencia (1 + 5 * 0.12)
  assert.equal(unitMults5.hpMult, 1.75);       // +75% vida/resistencia (1 + 5 * 0.15)
  assert.equal(unitMults5.ammoMult, 2.00);     // +100% capacidad munición (1 + 5 * 0.20)

  // Attempting to research beyond Level 5 is rejected
  const rOver = startResearch(techlab, "unitDamage", teamState);
  assert.equal(rOver.ok, false);
  assert.equal(rOver.reason, "max-level-reached");

  // 3. Set all 5 turret upgrades to test levels
  teamState.upgrades.turretDamage = 3;   // +45% daño (1 + 3 * 0.15 = 1.45)
  teamState.upgrades.turretRange = 2;    // +20% alcance (1 + 2 * 0.10 = 1.20)
  teamState.upgrades.turretFireRate = 4; // +48% cadencia (1 + 4 * 0.12 = 1.48)
  teamState.upgrades.turretArmor = 5;    // +75% blindaje/vida (1 + 5 * 0.15 = 1.75)
  teamState.upgrades.turretAmmo = 3;     // +60% munición (1 + 3 * 0.20 = 1.60)

  const turretMults = getTurretStatMultipliers(teamState.upgrades);
  assert.equal(turretMults.damageMult, 1.45);
  assert.equal(turretMults.rangeMult, 1.20);
  assert.equal(turretMults.fireRateMult, 1.48);
  assert.equal(turretMults.hpMult, 1.75);
  assert.equal(turretMults.ammoMult, 1.60);
});

test("stepRtsCombat moves units to target destination and engages enemy targets", () => {
  const state = createRtsState("campaign");
  const blueUnit = {
    id: 101,
    team: "blue",
    type: "soldier",
    x: 100,
    y: 100,
    hp: 50,
    maxHp: 50,
    speed: 50,
    damage: 10,
    range: 90,
    fireRate: 0.5,
    fireCooldown: 0,
    targetX: 130,
    targetY: 100,
    state: "MOVING",
  };
  const redTarget = {
    id: 201,
    team: "red",
    type: "soldier",
    x: 150,
    y: 100,
    hp: 40,
    maxHp: 40,
    speed: 50,
    damage: 0,
    range: 90,
  };
  state.rtsUnits = [blueUnit, redTarget];

  // Step 1: Unit moves towards targetX (130)
  stepRtsCombat(state, 0.5); // moves 25px -> x: 125
  assert.ok(blueUnit.x > 100);
  assert.ok(blueUnit.x < 130);

  // Step 2: Unit reaches targetX and clears target coordinates
  stepRtsCombat(state, 0.5); // reaches 130
  assert.equal(blueUnit.targetX, undefined);
  assert.equal(blueUnit.targetY, undefined);
  assert.equal(blueUnit.state, "DEFENDING");

  // Step 3: Now within range (distance 20 <= 90), blue unit attacks red target
  assert.ok(redTarget.hp < 40);
});

test("stepRtsCampaignAi manages base development, queues, and assault squad", () => {
  const state = createRtsState("campaign");
  const redMcv = state.rtsUnits.find((u) => u.team === "red" && u.type === "mcv");
  assert.ok(redMcv);
  assert.equal(redMcv.isDeploying, false);

  // 1. First AI tick deploys Red MCV
  state.redAiTimer = 1.0;
  stepRtsCampaignAi(state, 0.1);
  assert.equal(redMcv.isDeploying, true);

  // Complete deployment
  completeMcvDeployment(redMcv, state);
  assert.equal(state.teams.red.hasHq, true);

  // 2. Next AI tick with 1600 credits builds Solar power
  state.redAiTimer = 1.0;
  stepRtsCampaignAi(state, 0.1);
  const solar = state.rtsBuildings.find((b) => b.team === "red" && b.type === "solar");
  assert.ok(solar);
  assert.equal(state.teams.red.credits, 1300); // 1600 - 300

  // 3. Next AI tick builds Refinery ($800) near red mineral field
  state.redAiTimer = 1.0;
  stepRtsCampaignAi(state, 0.1);
  const refinery = state.rtsBuildings.find((b) => b.team === "red" && b.type === "refinery");
  assert.ok(refinery);
  assert.equal(state.teams.red.credits, 500); // 1300 - 800

  // 4. Next AI tick builds Factory ($500)
  state.redAiTimer = 1.0;
  stepRtsCampaignAi(state, 0.1);
  const factory = state.rtsBuildings.find((b) => b.team === "red" && b.type === "factory");
  assert.ok(factory);
  assert.equal(state.teams.red.credits, 0); // 500 - 500
});

test("refinery costs 800 credits as per user specification", () => {
  assert.equal(RTS_BUILDINGS.refinery.cost, 800);
});

test("fog of war shrouds unexplored map and reveals friendly sight", () => {
  const state = createRtsState("campaign");
  assert.ok(state.fog);
  // Blue MCV starts at (430, 1600)
  assert.ok(isVisible(state.fog, 430, 1600));
  assert.ok(isExplored(state.fog, 430, 1600));

  // Red base at (1650, 450) must NOT be visible or explored initially (shrouded in black)
  assert.equal(isVisible(state.fog, 1650, 450), false);
  assert.equal(isExplored(state.fog, 1650, 450), false);
});

test("building a refinery automatically spawns a harvester upon completion (C&C style)", () => {
  const state = createRtsState("campaign");
  const refinery = createRtsBuilding("refinery", 500, 1500, "blue", state.nextId++);
  refinery.buildTimeRemaining = 0.1;
  state.rtsBuildings.push(refinery);

  const initialHarvesters = state.rtsUnits.filter((u) => u.type === "harvester").length;
  assert.equal(initialHarvesters, 0);

  // Step RTS past construction time
  stepRts(state, 0.2);

  assert.equal(refinery.buildTimeRemaining, 0);
  assert.equal(refinery.harvesterSpawned, true);

  const newHarvesters = state.rtsUnits.filter((u) => u.type === "harvester" && u.team === "blue");
  assert.equal(newHarvesters.length, 1);
  assert.ok(newHarvesters[0].hp > 0);
  assert.equal(newHarvesters[0].capacity, 300);
});

test("checkRtsVictory sets win and gameOver state flags", () => {
  // Campaign Blue win sets state.win = true
  const campState = createRtsState("campaign");
  campState.rtsUnits = campState.rtsUnits.filter((u) => u.team !== "red");
  campState.rtsBuildings = campState.rtsBuildings.filter((b) => b.team !== "red");
  checkRtsVictory(campState);
  assert.equal(campState.winner, "blue");
  assert.equal(campState.win, true);

  // Survival Blue defeat sets state.gameOver = true
  const survState = createRtsState("survival");
  survState.rtsUnits = [];
  survState.rtsBuildings = [];
  checkRtsVictory(survState);
  assert.equal(survState.winner, "defeat");
  assert.equal(survState.gameOver, true);
});



