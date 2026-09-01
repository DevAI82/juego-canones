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

// How long a freshly-placed tower spends "under construction" before it
// can target/fire, per user request for a Command & Conquer/Dune
// 2000-style build effect that visibly takes effort to deploy rather
// than appearing instantly. Only the basic tower has its own build
// animation today (game/assets/tower_basic_build.png -- see main.js),
// but the delay itself applies to every type so double/laser aren't
// placed "for free" faster than basic while they still just fade in.
export const BUILD_DURATION = 3.5;

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
    buildTimeRemaining: BUILD_DURATION,
  };
}

// Per user request, a tank in range draws a tower's fire away from
// whatever's riding behind it (motorcycles/buggies) -- it always
// outranks any non-tank target regardless of distance, so towers keep
// hammering the tank instead of splitting attention to the lighter
// escorted units. Nothing else gets elevated priority: only the tank's
// specific role as an escort's "shield" changes targeting.
const TARGET_PRIORITY = { tank: 2 };

export function findTarget(tower, enemies) {
  let best = null;
  let bestPriority = -Infinity;
  let bestDist = Infinity;
  for (const e of enemies) {
    if (!e.alive) continue;
    const d = Math.hypot(e.x - tower.x, e.y - tower.y);
    if (d > tower.range) continue;
    const priority = TARGET_PRIORITY[e.type] || 1;
    if (priority > bestPriority || (priority === bestPriority && d < bestDist)) {
      best = e;
      bestPriority = priority;
      bestDist = d;
    }
  }
  return best;
}

export function stepTower(tower, enemies, dt) {
  if (tower.hp <= 0) return null;

  // Under construction -- can be damaged/destroyed like any other tower
  // (matches how a half-built structure works in the games this is
  // modeled on), but doesn't target or fire until it finishes.
  if (tower.buildTimeRemaining > 0) {
    tower.buildTimeRemaining = Math.max(0, tower.buildTimeRemaining - dt);
    return null;
  }

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
