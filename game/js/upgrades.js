export const UPGRADE_DEFS = {
  damage: { levels: 5, baseCost: 75, mult: 1.35 },
  range: { levels: 5, baseCost: 25, mult: 1.2 },
  fireRate: { levels: 5, baseCost: 85, mult: 0.85 },
};

export function upgradeCost(skill, currentLevel) {
  return Math.round(UPGRADE_DEFS[skill].baseCost * (currentLevel + 1));
}

export function canUpgrade(tower, skill) {
  return tower.level[skill] < UPGRADE_DEFS[skill].levels;
}

export function applyUpgrade(tower, skill, baseStats) {
  if (!canUpgrade(tower, skill)) return false;
  tower.level[skill]++;
  const mult = Math.pow(UPGRADE_DEFS[skill].mult, tower.level[skill]);
  if (skill === "damage") tower.damage = baseStats.damage * mult;
  if (skill === "range") tower.range = baseStats.range * mult;
  if (skill === "fireRate") tower.fireRate = baseStats.fireRate * mult;
  return true;
}
