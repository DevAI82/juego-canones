export function createEconomy(startMoney = 150, startLives = 20) {
  return { money: startMoney, lives: startLives, wave: 1 };
}

export function canAfford(eco, cost) {
  return eco.money >= cost;
}

export function spend(eco, cost) {
  if (!canAfford(eco, cost)) return false;
  eco.money -= cost;
  return true;
}

export function earn(eco, amount) {
  eco.money += amount;
}

export function loseLife(eco, amount = 1) {
  eco.lives -= amount;
  if (eco.lives < 0) eco.lives = 0;
  return eco.lives <= 0;
}
