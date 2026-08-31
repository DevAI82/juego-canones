import { lerpAngle } from "./util.js";

// How quickly a turret's facing angle catches up to its target, in
// "fraction of the remaining turn per second". Instant snapping (the old
// behavior) made turrets look robotic; this eases the turn in over a few
// frames, closer to a real turret's slew rate.
const TURN_RATE = 6;

// armor is a damage-taken multiplier, not a stat that varies by tower
// type (all three start equally unarmored) -- it's here, at 1 for every
// type, purely so applyUpgrade's `baseStats.<skill>` lookup in
// upgrades.js works the same uniform way for armor as it does for
// damage/range/fireRate, instead of special-casing it.
export const TOWER_TYPES = {
  basic: { cost: 50, damage: 12, range: 140, fireRate: 0.6, maxAmmo: 20, reloadTime: 2, maxCount: 6, hp: 80, projectilesPerShot: 1, armor: 1 },
  double: { cost: 90, damage: 8, range: 150, fireRate: 0.35, maxAmmo: 20, reloadTime: 3, maxCount: 4, hp: 90, projectilesPerShot: 2, armor: 1 },
  laser: { cost: 160, damage: 35, range: 220, fireRate: 1.2, maxAmmo: 20, reloadTime: 5, maxCount: 2, hp: 100, projectilesPerShot: 1, armor: 1 },
};

export function createTower(type, x, y) {
  const def = TOWER_TYPES[type];
  return {
    type,
    x,
    y,
    hp: def.hp,
    maxHp: def.hp,
    range: def.range,
    damage: def.damage,
    fireRate: def.fireRate,
    projectilesPerShot: def.projectilesPerShot,
    ammo: def.maxAmmo,
    maxAmmo: def.maxAmmo,
    reloadTime: def.reloadTime,
    reloading: false,
    reloadTimer: 0,
    fireTimer: def.fireRate,
    angle: 0,
    target: null,
    armorMult: def.armor,
    level: { damage: 0, range: 0, fireRate: 0, armor: 0 },
  };
}

export function findTarget(tower, enemies) {
  let best = null;
  let bestDist = Infinity;
  for (const e of enemies) {
    if (!e.alive) continue;
    const d = Math.hypot(e.x - tower.x, e.y - tower.y);
    if (d <= tower.range && d < bestDist) {
      best = e;
      bestDist = d;
    }
  }
  return best;
}

export function stepTower(tower, enemies, dt) {
  if (tower.hp <= 0) return null;

  if (tower.reloading) {
    tower.reloadTimer -= dt;
    if (tower.reloadTimer <= 0) {
      tower.reloading = false;
      tower.ammo = tower.maxAmmo;
    }
    return null;
  }

  tower.target = findTarget(tower, enemies);
  if (!tower.target) return null;

  const targetAngle = Math.atan2(tower.target.y - tower.y, tower.target.x - tower.x);
  tower.angle = lerpAngle(tower.angle, targetAngle, TURN_RATE * dt);
  tower.fireTimer -= dt;
  if (tower.fireTimer <= 0 && tower.ammo > 0) {
    tower.fireTimer = tower.fireRate;
    tower.ammo--;
    const shot = { x: tower.x, y: tower.y, target: tower.target, damage: tower.damage, projectilesPerShot: tower.projectilesPerShot };
    if (tower.ammo <= 0) {
      tower.reloading = true;
      tower.reloadTimer = tower.reloadTime;
    }
    return shot;
  }
  return null;
}

export function damageTower(tower, amount) {
  tower.hp -= amount * tower.armorMult;
  if (tower.hp < 0) tower.hp = 0;
  return tower.hp > 0;
}
