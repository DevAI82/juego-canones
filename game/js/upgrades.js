export const UPGRADE_DEFS = {
  damage: { levels: 5, baseCost: 75, mult: 1.35 },
  range: { levels: 5, baseCost: 25, mult: 1.2 },
  fireRate: { levels: 5, baseCost: 85, mult: 0.85 },
  // Same compounding shape as fireRate (each level is another x0.85), but
  // applied to the tower's damage-TAKEN multiplier instead of its firing
  // cooldown -- level 5 leaves a tower taking ~44% of the damage it used
  // to (a ~56% reduction). Priced as the most expensive single-level
  // skill (matches the $110 in the user's mockup) since a maxed-out
  // armor tower is otherwise very hard to lose.
  armor: { levels: 5, baseCost: 110, mult: 0.85 },
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
  if (skill === "armor") tower.armorMult = baseStats.armor * mult;
  return true;
}
