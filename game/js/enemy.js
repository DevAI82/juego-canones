export const ENEMY_TYPES = {
  soldier: { hp: 40, speed: 55, damage: 1, bounty: 8, fireRange: 90, fireDamage: 2, fireCooldown: 1.2 },
  buggy: { hp: 25, speed: 95, damage: 1, bounty: 10, fireRange: 100, fireDamage: 2, fireCooldown: 1.0 },
  tank: { hp: 120, speed: 30, damage: 2, bounty: 20, fireRange: 120, fireDamage: 5, fireCooldown: 2.0 },
};

export function createEnemy(type, path) {
  const def = ENEMY_TYPES[type];
  return {
    type,
    hp: def.hp,
    maxHp: def.hp,
    speed: def.speed,
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
    enemy.angle = Math.atan2(dy, dx);
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
