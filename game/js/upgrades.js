export const UPGRADE_DEFS = {
  damage: { levels: 5, baseCost: 75, mult: 1.35 },
  range: { levels: 5, baseCost: 25, mult: 1.2 },
  fireRate: { levels: 5, baseCost: 85, mult: 0.85 },
  // Per user request, armor is the tower's health: each level raises its
  // maximum health (and main.js draws the health bar's length to scale, so
  // the bar grows with it). Each level is worth what the old version of
  // armor was -- a x0.85 cut in damage taken -- as health x1/0.85, so a
  // fully armored tower is exactly as tough as it used to be (x2.25).
  // Priced as the most expensive single-level skill (the $110 in the
  // user's original mockup).
  armor: { levels: 5, baseCost: 110, mult: 1 / 0.85 },
  // Per user request: magazine capacity, +20% of the type's base magazine
  // per level (20 -> 40 rounds), so fewer pauses to reload. Its bar grows
  // with it, like the health bar.
  ammo: { levels: 5, baseCost: 60, step: 0.2 },
};

export function upgradeCost(skill, currentLevel) {
  return Math.round(UPGRADE_DEFS[skill].baseCost * (currentLevel + 1));
}

export function canUpgrade(tower, skill) {
  return tower.level[skill] < UPGRADE_DEFS[skill].levels;
}

// A stat's value at `level` of `skill`, from the tower type's base stats.
function valueAt(skill, base, level) {
  const def = UPGRADE_DEFS[skill];
  if (skill === "damage") return base.damage * def.mult ** level;
  if (skill === "range") return base.range * def.mult ** level;
  if (skill === "fireRate") return base.fireRate * def.mult ** level;
  if (skill === "armor") return Math.round(base.hp * def.mult ** level);
  return Math.round(base.maxAmmo * (1 + def.step * level)); // ammo
}

// What a fully upgraded tower of this type has -- the length main.js scales
// the health and ammo bars against.
export function topValue(skill, base) {
  return valueAt(skill, base, UPGRADE_DEFS[skill].levels);
}

export function applyUpgrade(tower, skill, baseStats) {
  if (!canUpgrade(tower, skill)) return false;
  tower.level[skill]++;
  const value = valueAt(skill, baseStats, tower.level[skill]);
  if (skill === "damage") tower.damage = value;
  if (skill === "range") tower.range = value;
  if (skill === "fireRate") tower.fireRate = value;
  if (skill === "armor") {
    tower.hp += value - tower.maxHp;
    tower.maxHp = value;
  }
  if (skill === "ammo") {
    tower.ammo += value - tower.maxAmmo;
    tower.maxAmmo = value;
  }
  return true;
}
