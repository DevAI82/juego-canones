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
import { randomPath, offsetPath, crossesWall, pointInPolygon, pushOutOfPolygons } from "./map.js";
import { MAX_LEVEL, levelData, narrowsOf, solidSegmentsOf } from "./levels.js";
import { createEnemy, stepEnemy, damageEnemy, stepEnemyFire } from "./enemy.js";
import { WAVES, buildSpawnQueue } from "./waves.js";
import { createEconomy, earn, loseLife, spend, canAfford } from "./economy.js";
import { createTower, stepTower, damageTower, TOWER_TYPES, MUZZLE_OFFSET, BUILD_DURATION } from "./tower.js";
import { createProjectile, stepProjectile } from "./projectile.js";
import { applyUpgrade, upgradeCost, canUpgrade, UPGRADE_DEFS } from "./upgrades.js";
import { chooseRoute, SOLDIER_ROUTE_CANDIDATES, holdsForSiege } from "./ai.js";
import { WALL, wallCell, segmentNearBlock } from "./walls.js";
import { assignId } from "./ids.js";
import { reachesEntryRoad } from "./entryRoads.js";

export { WALL };

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
const SLOT_SNAP_RADIUS = 55;
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

// Returns { path, pathIndex } for a spawn-queue item. Soldiers weigh a few
// random routes (from any of the level's entries) and take a weakly
// defended one. Vehicles pick among the level's roads the same way (ai.js's
// chooseRoute) -- except an escort, which takes the road its lead heavy
// already took (stamped on it by trySpawn) -- then get their own lane
// offset within it. On a level whose buildings leave soldiers nowhere to
// go but the streets (soldiersOnRoads -- level 4's city), they pick a road
// too, in a narrower spread across it.
const SOLDIER_LANE_HALF_WIDTH = 16;

function pathForSpawn(item, state) {
  const level_ = levelData(state.level);
  if (item.type === "soldier" && !level_.soldiersOnRoads) {
    const entries = level_.soldierEntries || [level_.soldierEntry];
    const candidates = [];
    for (let i = 0; i < SOLDIER_ROUTE_CANDIDATES; i++) {
      const entry = entries[Math.floor(Math.random() * entries.length)];
      candidates.push(randomPath(entry, level_.soldierExit, level_.worldHeight, level_.wall));
    }
    return { path: candidates[chooseRoute(candidates, state.towers, Math.random, state.walls)], pathIndex: null };
  }
  const pathIndex = item.pathIndex ?? chooseRoute(level_.paths, state.towers, Math.random, state.walls);
  const spread = item.type === "soldier" ? SOLDIER_LANE_HALF_WIDTH : VEHICLE_LANE_HALF_WIDTH;
  const laneOffset = (Math.random() * 2 - 1) * spread;
  return { path: offsetPath(level_.paths[pathIndex], laneOffset, narrowsOf(level_)), pathIndex };
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

// Moves `e` by (dx, dy) -- unless that would take it through something
// solid (levels.js's solidSegmentsOf: level 3's fortress wall, which per
// user request nothing may cross, and level 4's shores).
function nudge(e, dx, dy, walls) {
  const to = { x: e.x + dx, y: e.y + dy };
  if (walls && crossesWall(e, to, walls)) return;
  e.x = to.x;
  e.y = to.y;
}

export function separateEnemies(enemies, dt, walls) {
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
        nudge(a, -nx * push, -ny * push, walls);
        nudge(b, nx * push, ny * push, walls);
      } else {
        // Exact same point (e.g. two enemies spawned at the same instant)
        // -- nudge apart in a random direction since there's no direction
        // to push "away from" yet.
        const angle = Math.random() * Math.PI * 2;
        const push = maxPush / 2;
        nudge(a, -Math.cos(angle) * push, -Math.sin(angle) * push, walls);
        nudge(b, Math.cos(angle) * push, Math.sin(angle) * push, walls);
      }
    }
  }
}

// What every game starts with (createGameState) -- also what a save with
// no money or lives recorded falls back to (restoreSave).
const START_MONEY = 150;
const START_LIVES = 20;

export function createGameState(level = 1) {
  return {
    level,
    economy: createEconomy(START_MONEY, START_LIVES),
    waveIndex: 0,
    spawnQueue: buildSpawnQueue(0),
    waveClock: 0,
    interWaveTimer: 0,
    enemies: [],
    towers: [],
    // The player's concrete wall blocks (walls.js), per user request.
    walls: [],
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
    // How many waves are on the board right now and not yet counted in
    // totalWavesCleared -- normally 1, more when the player calls the next
    // wave early (skipWave) before clearing the current one. They're only
    // credited once the board actually clears (nextWaveIfDone), so calling
    // waves early and then losing doesn't score waves that were never won.
    wavesInPlay: 1,
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
    const item = state.spawnQueue.shift();
    // Vehicles are confined to the current level's road(s) (in their own
    // randomized lane, see pathForSpawn); only foot soldiers roam the
    // whole map. waveIndex drives the tank/rocket's progressive
    // armor/range (enemy.js) -- resets with each new level, same as the
    // wave curve itself.
    const { path, pathIndex } = pathForSpawn(item, state);
    // A lead heavy's road is stamped on its escorts still in the queue
    // (they always spawn after it, waves.js's ESCORT_DELAY).
    if (item.convoy != null && item.pathIndex == null) {
      for (const q of state.spawnQueue) if (q.convoy === item.convoy) q.pathIndex = pathIndex;
    }
    state.enemies.push(assignId(createEnemy(item.type, path, state.waveIndex, pathIndex)));
  }
}

function nextWaveIfDone(state) {
  if (state.interWaveTimer > 0) return;
  if (state.spawnQueue.length === 0 && state.enemies.length === 0) {
    if (state.waveIndex < WAVES.length - 1) {
      state.totalWavesCleared += state.wavesInPlay;
      state.wavesInPlay = 1;
      state.waveIndex++;
      state.economy.wave = state.waveIndex + 1;
      state.spawnQueue = buildSpawnQueue(state.waveIndex);
      state.waveClock = 0;
      state.interWaveTimer = INTER_WAVE_DELAY;
    } else if (!state.win && !state.levelComplete) {
      state.totalWavesCleared += state.wavesInPlay; // the final wave(s) count too
      state.wavesInPlay = 0;
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

  const { worldWidth, worldHeight, water } = levelData(state.level);
  const gates = narrowsOf(levelData(state.level));
  const walls = solidSegmentsOf(levelData(state.level));
  for (const e of state.enemies) {
    const hold = holdsForSiege(e, state.towers, dt, worldWidth, worldHeight);
    const { reachedEnd, blockedBy } = stepEnemy(e, dt, { others: state.enemies, hold, walls, gates, barriers: state.walls });
    e.blockedBy = blockedBy ?? null;
    if (reachedEnd) {
      e.alive = false;
      if (loseLife(state.economy, e.damage)) state.gameOver = true;
    }
  }
  state.enemies = state.enemies.filter((e) => e.alive);
  separateEnemies(state.enemies, dt, walls);
  // The shores are solid (solidSegmentsOf), so nobody should ever get into
  // the river or the sea -- but if anyone does, they're put back ashore.
  if (water) for (const e of state.enemies) pushOutOfPolygons(e, water, worldWidth, worldHeight);

  fireTowers(state, dt);
  fireUnits(state, dt);
  stepShots(state, dt);
  clearDestroyed(state);

  nextWaveIfDone(state);
}

// The rest of a tick, in pieces the attack mode (attack.js) runs too.

// The towers' turn: each one aims at a unit in its range and fires.
export function fireTowers(state, dt) {
  for (const t of state.towers) {
    const shot = stepTower(t, state.enemies, dt);
    if (shot) {
      // Rounds leave from the tip of the turret's barrel, not its center.
      const muzzleX = t.x + Math.cos(t.angle) * MUZZLE_OFFSET;
      const muzzleY = t.y + Math.sin(t.angle) * MUZZLE_OFFSET;

      if (t.type === "laser") {
        // A railgun beam travels instantly from the muzzle to the target
        damageEnemy(shot.target, shot.damage);
        state.beams.push(assignId({ x1: muzzleX, y1: muzzleY, x2: shot.target.x, y2: shot.target.y, age: 0, duration: 0.15 }));
      } else {
        for (let i = 0; i < shot.projectilesPerShot; i++) {
          // Offset each shot perpendicular to the barrel for double cannons
          const spread = shot.projectilesPerShot > 1 ? (i - (shot.projectilesPerShot - 1) / 2) * 12 : 0;
          const px = muzzleX - Math.sin(t.angle) * spread;
          const py = muzzleY + Math.cos(t.angle) * spread;
          state.projectiles.push(assignId(createProjectile(px, py, shot.target, shot.damage, 420, "shell", "cannon")));
        }
      }
    }
  }
}

// The units' turn: each one fires at the best target in its range among
// targetsFor(unit) -- every tower, unless the attack mode narrows it to the
// one a unit was sent against -- or first at a wall block holding it up.
export function fireUnits(state, dt, targetsFor = () => state.towers) {
  for (const e of state.enemies) {
    const shot = stepEnemyFire(e, targetsFor(e), dt, state.walls);
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
}

// Shots in flight move on and land; explosions and laser beams fade.
// onStructureHit(structure, damage), if given, hears of every hit on a
// tower or wall block and how much health it actually took off (the
// attack mode pays the attacker a share of it).
export function stepShots(state, dt, onStructureHit = null) {
  for (const p of state.projectiles) {
    if (!stepProjectile(p, dt)) continue;
    const before = p.target.hp;
    if (p.target.kind === "wall") {
      p.target.hp = Math.max(0, p.target.hp - p.damage);
    } else if ("maxHp" in p.target && "range" in p.target) {
      damageTower(p.target, p.damage);
    } else {
      damageEnemy(p.target, p.damage);
      continue;
    }
    if (onStructureHit) onStructureHit(p.target, before - p.target.hp);
  }
  state.projectiles = state.projectiles.filter((p) => p.alive);
  for (const ex of state.explosions) ex.age += dt;
  state.explosions = state.explosions.filter((ex) => ex.age < ex.duration);
  for (const bm of state.beams) bm.age += dt;
  state.beams = state.beams.filter((bm) => bm.age < bm.duration);
}

// What was destroyed this tick leaves the field: towers (counted as lost)
// and wall blocks go up in explosions, and each unit killed pays its
// bounty to the defence.
export function clearDestroyed(state) {
  // Counted here, before the filter removes them, so a tower that died in
  // combat this tick is tallied -- sellStructure() removes towers by its own
  // reference filter instead, so a voluntary sale never lands here.
  for (const t of state.towers) {
    if (t.hp > 0) continue;
    state.stats.towersLost++;
    state.explosions.push(assignId(createExplosion(t.x, t.y, "tower")));
  }
  state.towers = state.towers.filter((t) => t.hp > 0);
  for (const w of state.walls) if (w.hp <= 0) state.explosions.push(assignId(createExplosion(w.x, w.y, "wall")));
  state.walls = state.walls.filter((w) => w.hp > 0);

  const killedEnemies = state.enemies.filter((e) => !e.alive);
  for (const e of killedEnemies) {
    earn(state.economy, e.bounty);
    state.stats.kills[e.type] = (state.stats.kills[e.type] || 0) + 1;
    state.explosions.push(assignId(createExplosion(e.x, e.y, e.type, e.angle)));
  }
  state.enemies = state.enemies.filter((e) => e.alive);
}

function makeDebris() {
  return {
    angle: Math.random() * Math.PI * 2,
    speed: 40 + Math.random() * 70,
    size: 1.5 + Math.random() * 2.5,
  };
}

// kind: what blew up -- an enemy type, or "tower" -- and angle which way it
// was facing: main.js's effects size the blast by it and leave a burnt-out
// wreck of a vehicle where it died, turned the way it was driving.
export function createExplosion(x, y, kind = "soldier", angle = 0) {
  const count = 6 + Math.floor(Math.random() * 5);
  const debris = [];
  for (let i = 0; i < count; i++) debris.push(makeDebris());
  return { x, y, kind, angle, age: 0, duration: 0.5, debris };
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
  // In an attack, the army's entries keep a stretch of road no tower
  // reaches (entryRoads.js) -- whoever is defending.
  if (state.mode === "attack" && reachesEntryRoad(levelData(state.level), slot.x, slot.y, def.range)) {
    return { ok: false, reason: "entry-road" };
  }

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
  if (skill === "range" && state.mode === "attack") {
    // Nor may a longer reach take a tower over an entry's safe stretch.
    const range = TOWER_TYPES[tower.type].range * UPGRADE_DEFS.range.mult ** (tower.level.range + 1);
    if (reachesEntryRoad(levelData(state.level), tower.x, tower.y, range)) return { ok: false, reason: "entry-road" };
  }
  const cost = upgradeCost(skill, tower.level[skill]);
  if (!spend(state.economy, cost)) return { ok: false, reason: "cant-afford" };
  state.stats.moneySpent += cost;
  applyUpgrade(tower, skill, TOWER_TYPES[tower.type]);
  return { ok: true };
}

// A tower or one of the player's wall blocks, by id (ids are unique
// across both -- assignId).
function findStructure(state, id) {
  return state.towers.find((t) => t.id === id) || state.walls.find((w) => w.id === id) || null;
}

// What it costs to bring a damaged tower or wall block back to full
// health, and what selling one gives back -- shared with ui.js's build
// menu labels. A block costs at most its own price to patch up.
export function repairCost(s) {
  if (s.kind === "wall") return Math.ceil((WALL.cost * (s.maxHp - s.hp)) / s.maxHp);
  return Math.round((s.maxHp - s.hp) * 0.5);
}

export function sellRefund(s) {
  return Math.round((s.kind === "wall" ? WALL.cost : TOWER_TYPES[s.type].cost) * SELL_REFUND_FRACTION);
}

export function repairStructure(state, id) {
  if (state.gameOver || state.win || state.levelComplete) return { ok: false, reason: "game-over" };
  const s = findStructure(state, id);
  if (!s) return { ok: false, reason: "no-such-structure" };
  const cost = repairCost(s);
  if (cost <= 0) return { ok: false, reason: "already-full" };
  if (!spend(state.economy, cost)) return { ok: false, reason: "cant-afford" };
  state.stats.moneySpent += cost;
  s.hp = s.maxHp;
  return { ok: true };
}

export function sellStructure(state, id) {
  if (state.gameOver || state.win || state.levelComplete) return { ok: false, reason: "game-over" };
  const s = findStructure(state, id);
  if (!s) return { ok: false, reason: "no-such-structure" };
  earn(state.economy, sellRefund(s));
  if (s.kind === "wall") {
    state.walls = state.walls.filter((w) => w !== s);
  } else {
    damageTower(s, s.hp);
    state.towers = state.towers.filter((t) => t !== s);
  }
  return { ok: true };
}

// Where a wall block may go: the grid cell the point falls in, if it's on
// the map, free (no other block, no tower, and clear of build slots so
// they stay usable), not on level 3's fortress wall or on water, nothing
// standing right there, and affordable. Same { ok, x, y } / { ok, reason }
// shape as canPlaceTower, for main.js's placement ghost.
export function canPlaceWall(state, x, y) {
  if (state.gameOver || state.win || state.levelComplete) return { ok: false, reason: "game-over" };
  const level = levelData(state.level);
  const cell = wallCell(x, y);
  const half = WALL.size / 2;
  if (cell.x < half || cell.y < half || cell.x > level.worldWidth - half || cell.y > level.worldHeight - half) {
    return { ok: false, reason: "off-map" };
  }
  if (state.walls.length >= WALL.max) return { ok: false, reason: "max-count" };
  if (state.walls.some((w) => w.x === cell.x && w.y === cell.y)) return { ok: false, reason: "occupied" };
  if (state.towers.some((t) => Math.hypot(t.x - cell.x, t.y - cell.y) < 40)) return { ok: false, reason: "occupied" };
  if (level.wall && level.wall.segments.some(([a, b]) => segmentNearBlock(a, b, cell, 0))) {
    return { ok: false, reason: "fortress-wall" };
  }
  if ((level.water || []).some((poly) => pointInPolygon(cell, poly))) return { ok: false, reason: "water" };
  if (level.buildSlots.some((sl) => Math.hypot(sl.x - cell.x, sl.y - cell.y) < 30)) return { ok: false, reason: "build-slot" };
  if (state.enemies.some((e) => e.alive && Math.hypot(e.x - cell.x, e.y - cell.y) < 26)) {
    return { ok: false, reason: "enemy-in-the-way" };
  }
  if (!canAfford(state.economy, WALL.cost)) return { ok: false, reason: "cant-afford" };
  return { ok: true, x: cell.x, y: cell.y };
}

export function placeWall(state, x, y) {
  const check = canPlaceWall(state, x, y);
  if (!check.ok) return check;
  spend(state.economy, WALL.cost);
  state.stats.moneySpent += WALL.cost;
  const wall = assignId({ kind: "wall", x: check.x, y: check.y, hp: WALL.hp, maxHp: WALL.hp });
  state.walls.push(wall);
  return { ok: true, wallId: wall.id };
}

export function skipWave(state) {
  if (state.gameOver || state.win || state.levelComplete) return { ok: false, reason: "game-over" };
  // Calling a wave in gets the game going if it was paused: a loaded game
  // waits paused in its countdown (restoreSave), and the button mustn't
  // seem to do nothing.
  // If waiting in inter-wave countdown, start the wave immediately
  if (state.interWaveTimer > 0) {
    state.interWaveTimer = 0;
    state.paused = false;
    return { ok: true, wave: state.waveIndex + 1 };
  }
  // Mid-wave: call the next wave in early to speed things up -- but only
  // once everything already queued has spawned, so the button can't be
  // mashed to dump all 40 waves onto the board at once (thousands of
  // enemies, and an O(n^2) separation pass every tick).
  if (state.spawnQueue.length > 0) return { ok: false, reason: "wave-still-spawning" };
  if (state.waveIndex < WAVES.length - 1) {
    state.waveIndex++;
    state.wavesInPlay++; // credited only once the board clears, see nextWaveIfDone
    state.economy.wave = state.waveIndex + 1;
    const nextQueue = buildSpawnQueue(state.waveIndex);
    // Offset spawn times so they begin spawning from the current clock
    for (const item of nextQueue) {
      item.time += state.waveClock;
    }
    state.spawnQueue = state.spawnQueue.concat(nextQueue).sort((a, b) => a.time - b.time);
    state.paused = false;
    return { ok: true, wave: state.waveIndex + 1 };
  }
  return { ok: false, reason: "last-wave" };
}

export function togglePause(state) {
  state.paused = !state.paused;
  return { ok: true, paused: state.paused };
}

// --- Saved games -------------------------------------------------------
// Per user request (docs/2026-10-08-menu-y-guardado-design.md): a game is
// saved, and loaded back, between waves -- the only moments nothing is on
// the field. So a save holds the player's decisions (level, wave, money,
// lives, each tower's type, place and upgrades, the walls, the campaign
// stats) and none of the moving parts. Shared by main.js (solo: the
// browser's storage) and server.js (co-op at home: a file on its PC).
export const SAVE_VERSION = 1;

// Between waves: no one on the field and the current wave not begun --
// the countdown before it, or a level just started.
export function canSaveNow(state) {
  return !state.gameOver && !state.win && !state.levelComplete && state.enemies.length === 0 && state.waveClock === 0;
}

// Which between-waves moment a save would capture (autosave.js writes the
// autosave once per moment, not on every tick of a countdown).
export function saveMoment(state) {
  return `${state.level}:${state.waveIndex}:${state.totalWavesCleared}`;
}

// What both kinds of game keep the same way in a save: the defence's
// towers and wall blocks, and the game's stats (attack.js saves them too).
export function boardForSave(state) {
  return {
    stats: JSON.parse(JSON.stringify(state.stats)),
    towers: state.towers
      .filter((t) => t.hp > 0)
      .map((t) => ({
        type: t.type,
        x: t.x,
        y: t.y,
        level: { ...t.level },
        hp: t.hp,
        ammo: t.ammo,
        buildTimeRemaining: t.buildTimeRemaining,
      })),
    walls: state.walls.filter((w) => w.hp > 0).map((w) => ({ x: w.x, y: w.y, hp: w.hp })),
  };
}

export function createSave(state, now = new Date()) {
  return {
    version: SAVE_VERSION,
    mode: "defense",
    savedAt: now.toISOString(),
    level: state.level,
    waveIndex: state.waveIndex,
    totalWavesCleared: state.totalWavesCleared,
    money: state.economy.money,
    lives: state.economy.lives,
    ...boardForSave(state),
  };
}

const num = (v, fallback) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// The level a save is for, or null if it isn't a save this version reads.
function readableLevel(save) {
  if (!save || typeof save !== "object" || save.version !== SAVE_VERSION) return null;
  if (save.mode != null && save.mode !== "defense") return null;
  return Number.isInteger(save.level) && save.level >= 1 && save.level <= MAX_LEVEL ? save.level : null;
}

// The game a save describes, ready to play: paused in the countdown
// before its next wave (restoreBoard brings back its towers, walls and
// stats). Fields it doesn't know are ignored, missing ones take their
// defaults; null if it isn't a defence save this version can read.
export function restoreSave(save) {
  const level = readableLevel(save);
  if (level == null) return null;
  const state = createGameState(level);
  state.waveIndex = clamp(Math.floor(num(save.waveIndex, 0)), 0, WAVES.length - 1);
  state.economy.wave = state.waveIndex + 1;
  state.spawnQueue = buildSpawnQueue(state.waveIndex);
  state.interWaveTimer = INTER_WAVE_DELAY;
  state.paused = true;
  state.totalWavesCleared = Math.max(0, Math.floor(num(save.totalWavesCleared, 0)));
  state.economy.money = Math.max(0, num(save.money, START_MONEY));
  state.economy.lives = Math.max(1, Math.floor(num(save.lives, START_LIVES)));
  restoreBoard(state, save);
  return state;
}

// Puts a save's stats, towers and wall blocks into `state`, a fresh game of
// the save's level. Every tower is rebuilt from its type with its upgrades
// applied again level by level, so a save made before a balance change
// loads with today's values -- and stays where it stood even if that's no
// longer a build slot. Everything gets a fresh id (assignId, like anything
// placed in play), so nothing can clash with what comes later.
export function restoreBoard(state, save) {
  const stats = save.stats && typeof save.stats === "object" ? save.stats : {};
  const kills = stats.kills && typeof stats.kills === "object" ? stats.kills : {};
  for (const type of Object.keys(state.stats.kills)) state.stats.kills[type] = Math.max(0, num(kills[type], 0));
  for (const key of ["towersBuilt", "towersLost", "moneySpent"]) state.stats[key] = Math.max(0, num(stats[key], 0));

  for (const saved of Array.isArray(save.towers) ? save.towers : []) {
    if (!saved || !TOWER_TYPES[saved.type]) continue;
    const x = num(saved.x, NaN);
    const y = num(saved.y, NaN);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    const tower = createTower(saved.type, x, y);
    const levels = saved.level && typeof saved.level === "object" ? saved.level : {};
    for (const skill of Object.keys(UPGRADE_DEFS)) {
      const target = Math.floor(num(levels[skill], 0));
      for (let i = tower.level[skill]; i < target; i++) {
        if (!applyUpgrade(tower, skill, TOWER_TYPES[saved.type])) break;
      }
    }
    tower.hp = clamp(num(saved.hp, tower.maxHp), 1, tower.maxHp);
    tower.ammo = clamp(Math.floor(num(saved.ammo, tower.maxAmmo)), 0, tower.maxAmmo);
    // An empty magazine only refills by reloading (stepTower starts that
    // when the last round is fired) -- start it here, or it never would.
    if (tower.ammo === 0) {
      tower.reloading = true;
      tower.reloadTimer = tower.reloadTime;
    }
    tower.buildTimeRemaining = clamp(num(saved.buildTimeRemaining, 0), 0, BUILD_DURATION);
    state.towers.push(assignId(tower));
  }

  for (const saved of Array.isArray(save.walls) ? save.walls : []) {
    const x = num(saved?.x, NaN);
    const y = num(saved?.y, NaN);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    state.walls.push(assignId({ kind: "wall", x, y, hp: clamp(num(saved.hp, WALL.hp), 1, WALL.hp), maxHp: WALL.hp }));
  }
}

// What the menu lists for a save (null: it can't be loaded).
export function saveSummary(save) {
  const level = readableLevel(save);
  if (level == null) return null;
  return {
    level,
    wave: clamp(Math.floor(num(save.waveIndex, 0)), 0, WAVES.length - 1) + 1,
    lives: Math.max(1, Math.floor(num(save.lives, START_LIVES))),
    money: Math.max(0, Math.floor(num(save.money, START_MONEY))),
    savedAt: typeof save.savedAt === "string" ? save.savedAt : null,
  };
}
