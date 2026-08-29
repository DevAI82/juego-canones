import { lerpAngle } from "./util.js";

// How quickly an enemy's facing angle catches up to its direction of
// travel, in "fraction of the remaining turn per second". Higher = snappier.
// Instant snapping (the old behavior) read as robotic; this eases into
// turns over a few frames instead.
const TURN_RATE = 9;

export const ENEMY_TYPES = {
  soldier: { hp: 40, speed: 55, damage: 1, bounty: 8, fireRange: 90, fireDamage: 2, fireCooldown: 1.2 },
  buggy: { hp: 25, speed: 95, damage: 1, bounty: 10, fireRange: 100, fireDamage: 2, fireCooldown: 1.0 },
  tank: { hp: 120, speed: 30, damage: 2, bounty: 20, fireRange: 120, fireDamage: 5, fireCooldown: 2.0 },
};

export function createEnemy(type, path) {
  const def = ENEMY_TYPES[type];
  // +/-10% per-instance speed variation so a wave of identical enemies
  // doesn't move in a perfectly uniform, robotic block.
  const speedJitter = 0.9 + Math.random() * 0.2;
  return {
    type,
    hp: def.hp,
    maxHp: def.hp,
    speed: def.speed * speedJitter,
    damage: def.damage,
    bounty: def.bounty,
    fireRange: def.fireRange,
    fireDamage: def.fireDamage,
    fireCooldown: def.fireCooldown,
    fireTimer: def.fireCooldown,
    path,
    waypointIndex: 0,
    x: path[0].x,
    y: path[0].y,
    angle: 0,
    // Random phase offset for the walking/driving bob animation (drawn in
    // main.js), so enemies of the same type don't all bob in lockstep.
    bobPhase: Math.random() * Math.PI * 2,
    alive: true,
  };
}

export function stepEnemy(enemy, dt) {
  if (!enemy.alive) return { reachedEnd: false };
  const target = enemy.path[enemy.waypointIndex + 1];
  if (!target) return { reachedEnd: true };

  const dx = target.x - enemy.x;
  const dy = target.y - enemy.y;
  const dist = Math.hypot(dx, dy);
  const step = enemy.speed * dt;

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
  enemy.hp -= amount;
  if (enemy.hp <= 0) {
    enemy.hp = 0;
    enemy.alive = false;
  }
  return enemy.alive;
}

export function stepEnemyFire(enemy, towers, dt) {
  if (!enemy.alive) return null;
  enemy.fireTimer -= dt;
  if (enemy.fireTimer > 0) return null;

  let best = null;
  let bestDist = Infinity;
  for (const t of towers) {
    if (t.hp <= 0) continue;
    const d = Math.hypot(t.x - enemy.x, t.y - enemy.y);
    if (d <= enemy.fireRange && d < bestDist) {
      best = t;
      bestDist = d;
    }
  }
  if (!best) return null;

  enemy.fireTimer = enemy.fireCooldown;
  return { x: enemy.x, y: enemy.y, target: best, damage: enemy.fireDamage };
}
