import { lerpAngle } from "./util.js";
import { pickTowerTarget, ROCKET_SIEGE_TIME, SOLDIER_SPRINT_TIME, SOLDIER_SPRINT_MULT, SOLDIER_SPRINT_COOLDOWN } from "./ai.js";

// How quickly an enemy's facing angle catches up to its direction of
// travel, in "fraction of the remaining turn per second". Higher = snappier.
// Instant snapping (the old behavior) read as robotic; this eases into
// turns over a few frames instead.
const TURN_RATE = 9;

export const ENEMY_TYPES = {
  soldier: { hp: 40, speed: 50, damage: 1, bounty: 8, fireRange: 90, fireDamage: 2, fireCooldown: 1.2 },
  buggy: { hp: 30, speed: 62, damage: 1, bounty: 10, fireRange: 110, fireDamage: 2, fireCooldown: 1.0 },
  tank: { hp: 120, speed: 32, damage: 2, bounty: 20, fireRange: 130, fireDamage: 5, fireCooldown: 2.0 },
  // Vehicle, fast escort unit that stays coordinated with the armored convoy.
  motorcycle: { hp: 18, speed: 78, damage: 1, bounty: 9, fireRange: 95, fireDamage: 2, fireCooldown: 0.9 },
  // Heavy rocket artillery truck. Range matches laser tower max range (220 base up to ~345 at max wave level)
  rocket: { hp: 75, speed: 34, damage: 2, bounty: 25, fireRange: 220, fireDamage: 10, fireCooldown: 2.4 },
};

// Per user request, the tank and rocket launcher aren't static threats --
// they escalate as the waves progress, the same 5-level/compounding shape
// as the player towers' own armor/range upgrades (upgrades.js), just
// driven by waveIndex instead of money. One level every WAVES_PER_LEVEL
// waves, capping at level 5 with room to sit at max for the last several
// waves of a 40-wave run (floor(39/7) = 5).
const WAVES_PER_LEVEL = 7;
const MAX_PROGRESSIVE_LEVEL = 5;
const TANK_ARMOR_MULT_PER_LEVEL = 0.85; // damage-taken multiplier, mirrors tower armor
const ROCKET_RANGE_MULT_PER_LEVEL = 1.09; // Scales 220 base up to ~340 at level 5, equivalent to max laser tower range (345)

function progressiveLevel(waveIndex) {
  return Math.min(MAX_PROGRESSIVE_LEVEL, Math.floor(waveIndex / WAVES_PER_LEVEL));
}

// pathIndex: which of the level's roads a vehicle took (index into
// levels.js's `paths`), or null for a soldier's own random route.
export function createEnemy(type, path, waveIndex = 0, pathIndex = null) {
  const def = ENEMY_TYPES[type];
  // +/-10% per-instance speed variation so a wave of identical enemies
  // doesn't move in a perfectly uniform, robotic block.
  const speedJitter = 0.9 + Math.random() * 0.2;
  const level = progressiveLevel(waveIndex);
  const armorMult = type === "tank" ? Math.pow(TANK_ARMOR_MULT_PER_LEVEL, level) : 1;
  const fireRange = type === "rocket" ? def.fireRange * Math.pow(ROCKET_RANGE_MULT_PER_LEVEL, level) : def.fireRange;
  return {
    type,
    hp: def.hp,
    maxHp: def.hp,
    speed: def.speed * speedJitter,
    damage: def.damage,
    bounty: def.bounty,
    fireRange,
    fireDamage: def.fireDamage,
    fireCooldown: def.fireCooldown,
    fireTimer: def.fireCooldown,
    armorMult,
    path,
    pathIndex,
    waypointIndex: 0,
    x: path[0].x,
    y: path[0].y,
    angle: 0,
    // Random phase offset for the walking/driving bob animation (drawn in
    // main.js), so enemies of the same type don't all bob in lockstep.
    bobPhase: Math.random() * Math.PI * 2,
    // Seconds of siege a rocket truck has left (ai.js's holdsForSiege),
    // and whether it's stopped to shell a tower right now.
    siegeLeft: type === "rocket" ? ROCKET_SIEGE_TIME : 0,
    holding: false,
    // Seconds left of a soldier's sprint after being hit, and until it can
    // sprint again.
    sprint: 0,
    sprintCooldown: 0,
    alive: true,
  };
}

export function stepEnemy(enemy, dt) {
  if (!enemy.alive) return { reachedEnd: false };
  const target = enemy.path[enemy.waypointIndex + 1];
  if (!target) return { reachedEnd: true };

  let speed = enemy.speed;
  if (enemy.sprintCooldown > 0) enemy.sprintCooldown = Math.max(0, enemy.sprintCooldown - dt);
  if (enemy.sprint > 0) {
    enemy.sprint = Math.max(0, enemy.sprint - dt);
    speed *= SOLDIER_SPRINT_MULT;
  }
  const dx = target.x - enemy.x;
  const dy = target.y - enemy.y;
  const dist = Math.hypot(dx, dy);
  const step = speed * dt;

  if (step >= dist) {
    enemy.x = target.x;
    enemy.y = target.y;
    enemy.waypointIndex++;
  } else {
    enemy.angle = lerpAngle(enemy.angle, Math.atan2(dy, dx), TURN_RATE * dt);
    enemy.x += (dx / dist) * step;
    enemy.y += (dy / dist) * step;
  }
  return { reachedEnd: false };
}

export function damageEnemy(enemy, amount) {
  enemy.hp -= amount * (enemy.armorMult ?? 1);
  if (enemy.hp <= 0) {
    enemy.hp = 0;
    enemy.alive = false;
  } else if (enemy.type === "soldier" && !(enemy.sprintCooldown > 0)) {
    enemy.sprint = SOLDIER_SPRINT_TIME;
    enemy.sprintCooldown = SOLDIER_SPRINT_COOLDOWN;
  }
  return enemy.alive;
}

export function stepEnemyFire(enemy, towers, dt) {
  if (!enemy.alive) return null;
  enemy.fireTimer -= dt;
  if (enemy.fireTimer > 0) return null;

  const best = pickTowerTarget(enemy, towers);
  if (!best) return null;

  enemy.fireTimer = enemy.fireCooldown;
  return { x: enemy.x, y: enemy.y, target: best, damage: enemy.fireDamage };
}
