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
import { randomPath, offsetPath } from "./map.js";
import { MAX_LEVEL, levelData } from "./levels.js";
import { createEnemy, stepEnemy, damageEnemy, stepEnemyFire } from "./enemy.js";
import { WAVES, buildSpawnQueue } from "./waves.js";
import { createEconomy, earn, loseLife, spend, canAfford } from "./economy.js";
import { createTower, stepTower, damageTower, TOWER_TYPES } from "./tower.js";
import { createProjectile, stepProjectile } from "./projectile.js";
import { applyUpgrade, upgradeCost, canUpgrade } from "./upgrades.js";

export const SELL_REFUND_FRACTION = 0.6;
export const INTER_WAVE_DELAY = 4;

// Half-width of the "road" vehicles are allowed to spread across, per
// user request -- each vehicle gets its own randomized lane offset
// (map.js's offsetPath) instead of every buggy/tank/motorcycle/rocket
// riding the exact same centerline.
const VEHICLE_LANE_HALF_WIDTH = 24;

// Two enemies (of any type/lane) closer than this get gently pushed apart
// after moving each tick -- per user request, no more enemies rendered
// stacked exactly on top of each other.
const ENEMY_SEPARATION_DIST = 14;

// Every level builds only at its own fixed slots (levels.js's
// buildSlots, per user request): a click within this radius of a slot
// snaps to it; a slot within this radius of an existing live tower
// counts as occupied. Wide enough that clicking doesn't need to be
// pixel-precise.
const SLOT_SNAP_RADIUS = 45;
const SLOT_OCCUPIED_RADIUS = 20;

function nearestSlot(slots, x, y) {
  let best = null;
  let bestDist = Infinity;
  for (const slot of slots) {
    const d = Math.hypot(slot.x - x, slot.y - y);
    if (d < bestDist) {
      bestDist = d;
      best = slot;
    }
  }
  return best && bestDist <= SLOT_SNAP_RADIUS ? best : null;
}

let nextId = 1;
function assignId(obj) {
  obj.id = nextId++;
  return obj;
}

function pathForSpawn(type, level) {
  const level_ = levelData(level);
  if (type === "soldier") return randomPath(level_.soldierEntry, level_.soldierExit, level_.worldHeight, level_.wall);
  // Levels can offer more than one road (level 2's fork) -- each vehicle
  // spawn picks one at random, then gets its own lane offset within it.
  const basePath = level_.paths[Math.floor(Math.random() * level_.paths.length)];
  const laneOffset = (Math.random() * 2 - 1) * VEHICLE_LANE_HALF_WIDTH;
  return offsetPath(basePath, laneOffset);
}

// Nudges any two alive enemies closer than ENEMY_SEPARATION_DIST directly
// apart from each other, split evenly. O(n^2), but n is the number of
// enemies simultaneously on screen (spawn intervals stagger the much
// larger per-wave totals), not the wave's full count -- cheap in
// practice at this game's scale.
//
// The push is rate-limited to SEPARATION_SPEED px/s (scaled by dt), not
// applied as a full instant correction -- a dense cluster of slow enemies
// (several tanks bunched together, worse once escorts started spawning
// right behind them) could otherwise get pushed apart *faster* than the
// tank's own 30px/s forward speed, permanently overpowering its path
// progress and jamming the whole group at the spawn point instead of just
// easing them apart over a couple of seconds. SEPARATION_SPEED is kept
// below every enemy type's speed (enemy.js's slowest is the tank's 30) so
// forward path movement always wins out eventually, no matter how
// crowded the spawn gets.
const SEPARATION_SPEED = 20;

function separateEnemies(enemies, dt) {
  const maxPush = SEPARATION_SPEED * dt;
  for (let i = 0; i < enemies.length; i++) {
    const a = enemies[i];
    if (!a.alive) continue;
    for (let j = i + 1; j < enemies.length; j++) {
      const b = enemies[j];
      if (!b.alive) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const distSq = dx * dx + dy * dy;
      if (distSq >= ENEMY_SEPARATION_DIST * ENEMY_SEPARATION_DIST) continue;
      if (distSq > 0) {
        const dist = Math.sqrt(distSq);
        const push = Math.min(ENEMY_SEPARATION_DIST - dist, maxPush) / 2;
        const nx = dx / dist;
        const ny = dy / dist;
        a.x -= nx * push;
        a.y -= ny * push;
        b.x += nx * push;
        b.y += ny * push;
      } else {
        // Exact same point (e.g. two enemies spawned at the same instant)
        // -- nudge apart in a random direction since there's no direction
        // to push "away from" yet.
        const angle = Math.random() * Math.PI * 2;
        const push = maxPush / 2;
        a.x -= Math.cos(angle) * push;
        a.y -= Math.sin(angle) * push;
        b.x += Math.cos(angle) * push;
        b.y += Math.sin(angle) * push;
      }
    }
  }
}

export function createGameState(level = 1) {
  return {
    level,
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
    // Only ever true once the FINAL level's waves are all cleared -- a
    // true campaign victory. Clearing an earlier level sets
    // levelComplete instead (see nextWaveIfDone), so main.js can offer
    // "continue to the next level" rather than ending the match.
    win: false,
    levelComplete: false,
    // Waves cleared across the WHOLE campaign so far, not just the
    // current level -- each level restarts waveIndex at 0 (same 40-wave
    // difficulty curve, fresh), but scoring.js wants a number that keeps
    // counting through a level transition.
    totalWavesCleared: 0,
    // Feeds the end-of-game stats screen and scoring.js's score breakdown.
    // Deliberately NOT reset by anything mid-match (including a level
    // transition, see startNextLevel) -- these accumulate for the whole
    // campaign, including through the sell/repair/upgrade economy, so
    // "total money spent" really means total, not net.
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

// Builds the fresh state for the next level once the current one's been
// cleared, preserving the campaign-wide stats/totalWavesCleared instead
// of restarting them -- returns null if there's no level to advance to
// (called before state.levelComplete is true, or already at MAX_LEVEL).
// Mirrors how a full restart is handled: the caller (main.js/server.js)
// reassigns its own `state` variable to whatever this returns, the same
// way they already do for createGameState() on a plain restart.
export function startNextLevel(state) {
  if (!state.levelComplete) return null;
  if (state.level >= MAX_LEVEL) return null;
  const fresh = createGameState(state.level + 1);
  fresh.stats = state.stats;
  fresh.totalWavesCleared = state.totalWavesCleared;
  return fresh;
}

function trySpawn(state) {
  if (state.interWaveTimer > 0) return;
  while (state.spawnQueue.length && state.spawnQueue[0].time <= state.waveClock) {
    const { type } = state.spawnQueue.shift();
    // Vehicles are confined to the current level's road(s) (in their own
    // randomized lane, see pathForSpawn); only foot soldiers roam the
    // whole map. waveIndex drives the tank/rocket's progressive
    // armor/range (enemy.js) -- resets with each new level, same as the
    // wave curve itself.
    state.enemies.push(assignId(createEnemy(type, pathForSpawn(type, state.level), state.waveIndex)));
  }
}

function nextWaveIfDone(state) {
  if (state.interWaveTimer > 0) return;
  if (state.spawnQueue.length === 0 && state.enemies.length === 0) {
    if (state.waveIndex < WAVES.length - 1) {
      state.waveIndex++;
      state.totalWavesCleared++;
      state.economy.wave = state.waveIndex + 1;
      state.spawnQueue = buildSpawnQueue(state.waveIndex);
      state.waveClock = 0;
      state.interWaveTimer = INTER_WAVE_DELAY;
    } else if (!state.win && !state.levelComplete) {
      state.totalWavesCleared++; // the final wave counts too
      if (state.level < MAX_LEVEL) {
        state.levelComplete = true;
      } else {
        state.win = true;
      }
    }
  }
}

// One tick of the whole simulation. Mutates state in place (and reassigns
// its array properties via filter, matching the pattern main.js's loop()
// used before this module existed).
export function stepSimulation(state, dt) {
  if (state.gameOver || state.win || state.levelComplete || state.paused) return;

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
  separateEnemies(state.enemies, dt);

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

// Pure validity check -- no mutation, no spending -- shared by placeTower
// (the real action) and main.js (to color the placement ghost green/red
// and decide whether to play the error sound, live as the mouse moves,
// without needing a round trip to the server in networked mode). Returns
// { ok: true, x, y } with the ACTUAL position to place at -- the snapped
// slot center, not the raw click -- or { ok: false, reason }. Per user
// request, applied to both maps: every level restricts building to its
// own fixed, marked slots (levels.js's buildSlots) rather than free
// placement anywhere off-road.
export function canPlaceTower(state, towerType, x, y) {
  if (state.gameOver || state.win || state.levelComplete) return { ok: false, reason: "game-over" };
  const def = TOWER_TYPES[towerType];
  if (!def) return { ok: false, reason: "unknown-type" };
  const countOnField = state.towers.filter((t) => t.type === towerType && t.hp > 0).length;
  if (countOnField >= def.maxCount) return { ok: false, reason: "max-count" };

  const slot = nearestSlot(levelData(state.level).buildSlots, x, y);
  if (!slot) return { ok: false, reason: "no-slot" };
  const occupied = state.towers.some((t) => t.hp > 0 && Math.hypot(t.x - slot.x, t.y - slot.y) < SLOT_OCCUPIED_RADIUS);
  if (occupied) return { ok: false, reason: "slot-occupied" };

  if (!canAfford(state.economy, def.cost)) return { ok: false, reason: "cant-afford" };
  return { ok: true, x: slot.x, y: slot.y };
}

export function placeTower(state, towerType, x, y) {
  const check = canPlaceTower(state, towerType, x, y);
  if (!check.ok) return check;
  const def = TOWER_TYPES[towerType];
  spend(state.economy, def.cost); // already confirmed affordable by canPlaceTower
  state.stats.towersBuilt++;
  state.stats.moneySpent += def.cost;
  const tower = assignId(createTower(towerType, check.x, check.y));
  state.towers.push(tower);
  return { ok: true, towerId: tower.id };
}

function findTower(state, towerId) {
  return state.towers.find((t) => t.id === towerId) || null;
}

export function upgradeTower(state, towerId, skill) {
  if (state.gameOver || state.win || state.levelComplete) return { ok: false, reason: "game-over" };
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
  if (state.gameOver || state.win || state.levelComplete) return { ok: false, reason: "game-over" };
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
  if (state.gameOver || state.win || state.levelComplete) return { ok: false, reason: "game-over" };
  const tower = findTower(state, towerId);
  if (!tower) return { ok: false, reason: "no-such-tower" };
  earn(state.economy, Math.round(TOWER_TYPES[tower.type].cost * SELL_REFUND_FRACTION));
  damageTower(tower, tower.hp);
  state.towers = state.towers.filter((t) => t !== tower);
  return { ok: true };
}

export function skipWave(state) {
  if (state.gameOver || state.win || state.levelComplete) return { ok: false, reason: "game-over" };
  state.interWaveTimer = 0;
  return { ok: true };
}

export function togglePause(state) {
  state.paused = !state.paused;
  return { ok: true, paused: state.paused };
}
