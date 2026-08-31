// Shared, DOM-free game simulation. This is the single source of truth for
// "what happens each tick" and "what a build/upgrade/repair/sell/skip
// action does" -- used identically by:
//   - main.js, ticking it locally via requestAnimationFrame (solo play,
//     unchanged from before this module existed -- this is a refactor of
//     logic that used to live directly in main.js's loop()).
//   - server.js, ticking it on a setInterval and broadcasting the result
//     to every connected browser over HTTP polling (LAN co-op multiplayer).
//
// Every action function returns { ok: boolean, reason?: string } instead of
// throwing, so a caller (a click handler, an HTTP request handler) can
// report *why* an action was rejected without a try/catch.
import { PATH, randomSoldierPath, distanceToPath } from "./map.js";
import { createEnemy, stepEnemy, damageEnemy, stepEnemyFire } from "./enemy.js";
import { WAVES, buildSpawnQueue } from "./waves.js";
import { createEconomy, earn, loseLife, spend } from "./economy.js";
import { createTower, stepTower, damageTower, TOWER_TYPES } from "./tower.js";
import { createProjectile, stepProjectile } from "./projectile.js";
import { applyUpgrade, upgradeCost, canUpgrade } from "./upgrades.js";

export const MIN_PLACEMENT_DIST_FROM_PATH = 38;
export const SELL_REFUND_FRACTION = 0.6;
export const INTER_WAVE_DELAY = 4;

let nextId = 1;
function assignId(obj) {
  obj.id = nextId++;
  return obj;
}

export function createGameState() {
  return {
    economy: createEconomy(150, 20),
    waveIndex: 0,
    spawnQueue: buildSpawnQueue(0),
    waveClock: 0,
    interWaveTimer: 0,
    enemies: [],
    towers: [],
    projectiles: [],
    explosions: [],
    beams: [],
    gameOver: false,
    win: false,
    // Feeds the end-of-game stats screen and scoring.js's score breakdown.
    // Deliberately NOT reset by anything mid-match -- these accumulate for
    // the whole game, including through the sell/repair/upgrade economy,
    // so "total money spent" really means total, not net.
    stats: {
      kills: { soldier: 0, buggy: 0, tank: 0, motorcycle: 0, rocket: 0 },
      towersBuilt: 0,
      towersLost: 0,
      moneySpent: 0,
    },
    // A shared pause: stepSimulation() below no-ops entirely while this is
    // true, so in networked mode pausing stops the server's own tick loop
    // -- global for every connected player, not a local "hide the game"
    // toggle that leaves the shared board running for everyone else.
    paused: false,
  };
}

function trySpawn(state) {
  if (state.interWaveTimer > 0) return;
  while (state.spawnQueue.length && state.spawnQueue[0].time <= state.waveClock) {
    const { type } = state.spawnQueue.shift();
    // Vehicles are confined to the trench; only foot soldiers can roam --
    // each one gets its own randomly generated route (see map.js).
    // waveIndex drives the tank/rocket's progressive armor/range (enemy.js).
    state.enemies.push(assignId(createEnemy(type, type === "soldier" ? randomSoldierPath() : PATH, state.waveIndex)));
  }
}

function nextWaveIfDone(state) {
  if (state.interWaveTimer > 0) return;
  if (state.spawnQueue.length === 0 && state.enemies.length === 0) {
    if (state.waveIndex < WAVES.length - 1) {
      state.waveIndex++;
      state.economy.wave = state.waveIndex + 1;
      state.spawnQueue = buildSpawnQueue(state.waveIndex);
      state.waveClock = 0;
      state.interWaveTimer = INTER_WAVE_DELAY;
    } else if (!state.win) {
      state.win = true;
    }
  }
}

// One tick of the whole simulation. Mutates state in place (and reassigns
// its array properties via filter, matching the pattern main.js's loop()
// used before this module existed).
export function stepSimulation(state, dt) {
  if (state.gameOver || state.win || state.paused) return;

  if (state.interWaveTimer > 0) {
    state.interWaveTimer = Math.max(0, state.interWaveTimer - dt);
  } else {
    state.waveClock += dt;
  }
  trySpawn(state);

  for (const e of state.enemies) {
    const { reachedEnd } = stepEnemy(e, dt);
    if (reachedEnd) {
      e.alive = false;
      if (loseLife(state.economy, e.damage)) state.gameOver = true;
    }
  }
  state.enemies = state.enemies.filter((e) => e.alive);

  for (const t of state.towers) {
    const shot = stepTower(t, state.enemies, dt);
    if (shot) {
      if (t.type === "laser") {
        // A railgun beam travels effectively instantly -- damage the
        // target immediately rather than spawning a bullet that flies
        // toward it, and leave only a brief visual flash behind.
        damageEnemy(shot.target, shot.damage);
        state.beams.push(assignId({ x1: shot.x, y1: shot.y, x2: shot.target.x, y2: shot.target.y, age: 0, duration: 0.15 }));
      } else {
        for (let i = 0; i < shot.projectilesPerShot; i++) {
          // Offset each shot perpendicular to the barrel so the double
          // tower's two rounds are visibly two separate bullets from its
          // twin barrels, not one bullet drawn on top of the other.
          // 14px (was 6): at the towers' current draw size the old gap read
          // as one thick dot rather than two distinct shots -- per user
          // feedback wanting the double tower's twin barrels clearly visible.
          const spread = shot.projectilesPerShot > 1 ? (i - (shot.projectilesPerShot - 1) / 2) * 14 : 0;
          const px = shot.x - Math.sin(t.angle) * spread;
          const py = shot.y + Math.cos(t.angle) * spread;
          // Both cannon towers (basic/double) fire the tank-shell sprite
          // per user request; only the laser (handled above, a beam) is
          // visually different among player towers.
          state.projectiles.push(assignId(createProjectile(px, py, shot.target, shot.damage, 400, "shell", "cannon")));
        }
      }
    }
  }

  for (const e of state.enemies) {
    const shot = stepEnemyFire(e, state.towers, dt);
    if (shot) {
      // Tank/rocket fire the same tank-shell sprite as the player's cannon
      // towers (per user request); the lighter infantry/vehicle weapons
      // (soldier, buggy, motorcycle) keep the small tracer streak. Sound is
      // its own three-way split per user request (machinegun for the light
      // units, cannon for the tank, missile for the rocket launcher) --
      // rocket shares the tank's "shell" visual but not its sound.
      const style = e.type === "tank" || e.type === "rocket" ? "shell" : "tracer";
      const sound = e.type === "tank" ? "cannon" : e.type === "rocket" ? "missile" : "machinegun";
      state.projectiles.push(assignId(createProjectile(shot.x, shot.y, shot.target, shot.damage, 300, style, sound)));
    }
  }

  for (const p of state.projectiles) {
    const hit = stepProjectile(p, dt);
    if (hit) {
      if ("maxHp" in p.target && "range" in p.target) {
        damageTower(p.target, p.damage);
      } else {
        damageEnemy(p.target, p.damage);
      }
    }
  }
  state.projectiles = state.projectiles.filter((p) => p.alive);
  for (const ex of state.explosions) ex.age += dt;
  state.explosions = state.explosions.filter((ex) => ex.age < ex.duration);
  for (const bm of state.beams) bm.age += dt;
  state.beams = state.beams.filter((bm) => bm.age < bm.duration);
  // Counted here, before the filter removes them, so a tower that died in
  // combat this tick is tallied -- sellTower() removes towers by its own
  // reference filter instead, so a voluntary sale never lands here.
  state.stats.towersLost += state.towers.filter((t) => t.hp <= 0).length;
  state.towers = state.towers.filter((t) => t.hp > 0);

  const killedEnemies = state.enemies.filter((e) => !e.alive);
  for (const e of killedEnemies) {
    earn(state.economy, e.bounty);
    state.stats.kills[e.type] = (state.stats.kills[e.type] || 0) + 1;
    state.explosions.push(createExplosion(e.x, e.y));
  }
  state.enemies = state.enemies.filter((e) => e.alive);

  nextWaveIfDone(state);
}

function makeDebris() {
  return {
    angle: Math.random() * Math.PI * 2,
    speed: 40 + Math.random() * 70,
    size: 1.5 + Math.random() * 2.5,
  };
}

export function createExplosion(x, y) {
  const count = 6 + Math.floor(Math.random() * 5);
  const debris = [];
  for (let i = 0; i < count; i++) debris.push(makeDebris());
  return { x, y, age: 0, duration: 0.5, debris };
}

// --- Player actions -- identical validation whether called from main.js's
// own click handler (solo play) or from server.js's HTTP action endpoint
// (each connected player's click, relayed over the network). ---

export function placeTower(state, towerType, x, y) {
  if (state.gameOver || state.win) return { ok: false, reason: "game-over" };
  const def = TOWER_TYPES[towerType];
  if (!def) return { ok: false, reason: "unknown-type" };
  const countOnField = state.towers.filter((t) => t.type === towerType && t.hp > 0).length;
  if (countOnField >= def.maxCount) return { ok: false, reason: "max-count" };
  if (distanceToPath(PATH, x, y) < MIN_PLACEMENT_DIST_FROM_PATH) return { ok: false, reason: "on-road" };
  if (!spend(state.economy, def.cost)) return { ok: false, reason: "cant-afford" };
  state.stats.towersBuilt++;
  state.stats.moneySpent += def.cost;
  const tower = assignId(createTower(towerType, x, y));
  state.towers.push(tower);
  return { ok: true, towerId: tower.id };
}

function findTower(state, towerId) {
  return state.towers.find((t) => t.id === towerId) || null;
}

export function upgradeTower(state, towerId, skill) {
  if (state.gameOver || state.win) return { ok: false, reason: "game-over" };
  const tower = findTower(state, towerId);
  if (!tower) return { ok: false, reason: "no-such-tower" };
  if (!canUpgrade(tower, skill)) return { ok: false, reason: "maxed" };
  const cost = upgradeCost(skill, tower.level[skill]);
  if (!spend(state.economy, cost)) return { ok: false, reason: "cant-afford" };
  state.stats.moneySpent += cost;
  applyUpgrade(tower, skill, TOWER_TYPES[tower.type]);
  return { ok: true };
}

export function repairTower(state, towerId) {
  if (state.gameOver || state.win) return { ok: false, reason: "game-over" };
  const tower = findTower(state, towerId);
  if (!tower) return { ok: false, reason: "no-such-tower" };
  const cost = Math.round((tower.maxHp - tower.hp) * 0.5);
  if (cost <= 0) return { ok: false, reason: "already-full" };
  if (!spend(state.economy, cost)) return { ok: false, reason: "cant-afford" };
  state.stats.moneySpent += cost;
  tower.hp = tower.maxHp;
  return { ok: true };
}

export function sellTower(state, towerId) {
  if (state.gameOver || state.win) return { ok: false, reason: "game-over" };
  const tower = findTower(state, towerId);
  if (!tower) return { ok: false, reason: "no-such-tower" };
  earn(state.economy, Math.round(TOWER_TYPES[tower.type].cost * SELL_REFUND_FRACTION));
  damageTower(tower, tower.hp);
  state.towers = state.towers.filter((t) => t !== tower);
  return { ok: true };
}

export function skipWave(state) {
  if (state.gameOver || state.win) return { ok: false, reason: "game-over" };
  state.interWaveTimer = 0;
  return { ok: true };
}

export function togglePause(state) {
  state.paused = !state.paused;
  return { ok: true, paused: state.paused };
}
