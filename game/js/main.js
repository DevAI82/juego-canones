import { CANVAS_WIDTH, CANVAS_HEIGHT, PATH, drawMap, drawPathDebug } from "./map.js";
import { createEnemy, stepEnemy, ENEMY_TYPES, damageEnemy, stepEnemyFire } from "./enemy.js";
import { WAVES, buildSpawnQueue } from "./waves.js";
import { createEconomy, earn, loseLife, spend } from "./economy.js";
import { createTower, stepTower, damageTower, TOWER_TYPES } from "./tower.js";
import { createProjectile, stepProjectile } from "./projectile.js";
import { initBuildMenu, updateBuildMenu, renderUpgradePanel } from "./ui.js";
import { applyUpgrade, upgradeCost, canUpgrade } from "./upgrades.js";

const canvas = document.getElementById("game-canvas");
const ctx = canvas.getContext("2d");

function loadImage(src) {
  const img = new Image();
  img.src = src;
  return img;
}

const mapImage = loadImage("assets/map_bg.png");
const sprites = {
  tower_basic: loadImage("assets/tower_basic.png"),
  tower_double: loadImage("assets/tower_double.png"),
  tower_laser: loadImage("assets/tower_laser.png"),
  enemy_soldier: loadImage("assets/enemy_soldier.png"),
  enemy_buggy: loadImage("assets/enemy_buggy.png"),
  enemy_tank: loadImage("assets/enemy_tank.png"),
  explosion: loadImage("assets/explosion.png"),
};

function ready(img) {
  return img.complete && img.naturalWidth > 0;
}

const economy = createEconomy(150, 20);
let waveIndex = 0;
let spawnQueue = buildSpawnQueue(waveIndex);
let waveClock = 0;
let enemies = [];
let towers = [];
let selectedBuildType = null;
let selectedTower = null;
const upgradePanelEl = document.getElementById("upgrade-panel");
let mouseX = 0;
let mouseY = 0;
let projectiles = [];
let explosions = [];
let gameOver = false;

function trySpawn() {
  while (spawnQueue.length && spawnQueue[0].time <= waveClock) {
    const { type } = spawnQueue.shift();
    enemies.push(createEnemy(type, PATH));
  }
}

function nextWaveIfDone() {
  if (spawnQueue.length === 0 && enemies.length === 0 && waveIndex < WAVES.length - 1) {
    waveIndex++;
    economy.wave = waveIndex + 1;
    spawnQueue = buildSpawnQueue(waveIndex);
    waveClock = 0;
  }
}

function drawEnemy(e) {
  const spriteKey = `enemy_${e.type}`;
  const img = sprites[spriteKey];
  ctx.save();
  ctx.translate(e.x, e.y);
  ctx.rotate(e.angle);
  if (ready(img)) {
    const w = 32, h = 32;
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
  } else {
    ctx.fillStyle = e.type === "tank" ? "#7a3b3b" : e.type === "buggy" ? "#b8ab7a" : "#8a8f5c";
    ctx.beginPath();
    ctx.arc(0, 0, 10, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // health bar
  const w = 24;
  const pct = e.hp / e.maxHp;
  ctx.fillStyle = "#400";
  ctx.fillRect(e.x - w / 2, e.y - 20, w, 4);
  ctx.fillStyle = "#e33";
  ctx.fillRect(e.x - w / 2, e.y - 20, w * pct, 4);
}

function drawTower(t) {
  const img = sprites[`tower_${t.type}`];
  const levelSum = t.level.damage + t.level.range + t.level.fireRate;
  ctx.save();
  ctx.translate(t.x, t.y);
  ctx.rotate(t.angle);
  if (levelSum > 0) {
    ctx.save();
    ctx.globalAlpha = Math.min(0.15 + levelSum * 0.06, 0.6);
    ctx.fillStyle = "#ffd700";
    ctx.beginPath();
    ctx.arc(0, 0, 26, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  if (ready(img)) {
    const w = 40, h = 40;
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
    const damagePct = 1 - t.hp / t.maxHp;
    if (damagePct > 0) {
      ctx.globalAlpha = damagePct * 0.6;
      ctx.fillStyle = "#000";
      ctx.fillRect(-w / 2, -h / 2, w, h);
      ctx.globalAlpha = 1;
    }
  } else {
    ctx.fillStyle = t.type === "laser" ? "#8a6a3a" : t.type === "double" ? "#888" : "#6b7a4a";
    ctx.fillRect(-14, -10, 28, 20);
    ctx.fillRect(0, -3, 22, 6);
  }
  ctx.restore();

  if (t === selectedTower) {
    ctx.save();
    ctx.strokeStyle = "#5af";
    ctx.beginPath();
    ctx.arc(t.x, t.y, t.range, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  const w = 30;
  const pct = t.hp / t.maxHp;
  ctx.fillStyle = "#400";
  ctx.fillRect(t.x - w / 2, t.y - 26, w, 4);
  ctx.fillStyle = "#3c3";
  ctx.fillRect(t.x - w / 2, t.y - 26, w * pct, 4);

  const ammoPct = t.ammo / t.maxAmmo;
  ctx.fillStyle = "#225";
  ctx.fillRect(t.x - w / 2, t.y - 20, w, 3);
  ctx.fillStyle = "#5af";
  ctx.fillRect(t.x - w / 2, t.y - 20, w * ammoPct, 3);
}

function drawExplosion(ex) {
  const img = sprites.explosion;
  const t = ex.age / ex.duration;
  const scale = 0.6 + t * 0.8;
  ctx.save();
  ctx.globalAlpha = 1 - t;
  if (ready(img)) {
    const w = 50 * scale, h = 50 * scale;
    ctx.drawImage(img, ex.x - w / 2, ex.y - h / 2, w, h);
  } else {
    ctx.fillStyle = "#f80";
    ctx.beginPath();
    ctx.arc(ex.x, ex.y, 20 * scale, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawProjectile(p) {
  ctx.fillStyle = "#ff0";
  ctx.beginPath();
  ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
  ctx.fill();
}

function drawHud() {
  ctx.save();
  ctx.fillStyle = "#fff";
  ctx.font = "20px sans-serif";
  ctx.fillText(`Oleada ${economy.wave}/${WAVES.length}`, 20, 30);
  ctx.fillText(`Vidas: ${economy.lives}`, 20, 55);
  ctx.fillText(`$${economy.money}`, 20, 80);
  if (gameOver) {
    ctx.font = "48px sans-serif";
    ctx.fillText("GAME OVER", CANVAS_WIDTH / 2 - 130, CANVAS_HEIGHT / 2);
  }
  ctx.restore();
}

const buildMenuEl = document.getElementById("build-menu");
initBuildMenu(buildMenuEl, {
  onSelect: (type) => {
    selectedBuildType = selectedBuildType === type ? null : type;
  },
});

function canvasPos(evt) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((evt.clientX - rect.left) / rect.width) * CANVAS_WIDTH,
    y: ((evt.clientY - rect.top) / rect.height) * CANVAS_HEIGHT,
  };
}

canvas.addEventListener("mousemove", (evt) => {
  const pos = canvasPos(evt);
  mouseX = pos.x;
  mouseY = pos.y;
});

canvas.addEventListener("click", (evt) => {
  const pos = canvasPos(evt);
  if (selectedBuildType) {
    const def = TOWER_TYPES[selectedBuildType];
    const countOnField = towers.filter((t) => t.type === selectedBuildType && t.hp > 0).length;
    if (countOnField >= def.maxCount) return;
    if (!spend(economy, def.cost)) return;
    towers.push(createTower(selectedBuildType, pos.x, pos.y));
    selectedBuildType = null;
    return;
  }
  let nearestTower = null;
  let nearestDist = 20;
  for (const t of towers) {
    const d = Math.hypot(t.x - pos.x, t.y - pos.y);
    if (d < nearestDist) {
      nearestDist = d;
      nearestTower = t;
    }
  }
  selectedTower = nearestTower;
});

let lastTime = performance.now();

function loop(now) {
  const dt = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;

  if (!gameOver) {
    waveClock += dt;
    trySpawn();

    for (const e of enemies) {
      const { reachedEnd } = stepEnemy(e, dt);
      if (reachedEnd) {
        e.alive = false;
        if (loseLife(economy, e.damage)) gameOver = true;
      }
    }
    enemies = enemies.filter((e) => e.alive);

    for (const t of towers) {
      const shot = stepTower(t, enemies, dt);
      if (shot) {
        for (let i = 0; i < shot.projectilesPerShot; i++) {
          projectiles.push(createProjectile(shot.x, shot.y, shot.target, shot.damage));
        }
      }
    }

    for (const e of enemies) {
      const shot = stepEnemyFire(e, towers, dt);
      if (shot) {
        projectiles.push(createProjectile(shot.x, shot.y, shot.target, shot.damage, 300));
      }
    }

    for (const p of projectiles) {
      const hit = stepProjectile(p, dt);
      if (hit) {
        if ("maxHp" in p.target && "range" in p.target) {
          damageTower(p.target, p.damage);
        } else {
          damageEnemy(p.target, p.damage);
        }
      }
    }
    projectiles = projectiles.filter((p) => p.alive);
    for (const ex of explosions) ex.age += dt;
    explosions = explosions.filter((ex) => ex.age < ex.duration);
    towers = towers.filter((t) => t.hp > 0);

    const killedEnemies = enemies.filter((e) => !e.alive);
    for (const e of killedEnemies) {
      earn(economy, e.bounty);
      explosions.push({ x: e.x, y: e.y, age: 0, duration: 0.4 });
    }
    enemies = enemies.filter((e) => e.alive);

    nextWaveIfDone();
  }

  ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  if (mapImage.complete && mapImage.naturalWidth > 0) {
    drawMap(ctx, mapImage);
  } else {
    ctx.fillStyle = "#3a4a2f";
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  }
  drawPathDebug(ctx, PATH);
  for (const t of towers) drawTower(t);
  for (const e of enemies) drawEnemy(e);
  for (const p of projectiles) drawProjectile(p);
  for (const ex of explosions) drawExplosion(ex);
  drawHud();

  if (selectedBuildType) {
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = "#5af";
    ctx.beginPath();
    ctx.arc(mouseX, mouseY, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  updateBuildMenu(buildMenuEl, { towers, economy, selectedType: selectedBuildType });
  if (selectedTower && selectedTower.hp <= 0) selectedTower = null;
  renderUpgradePanel(upgradePanelEl, selectedTower, {
    onUpgrade: (skill) => {
      if (!canUpgrade(selectedTower, skill)) return;
      const cost = upgradeCost(skill, selectedTower.level[skill]);
      if (!spend(economy, cost)) return;
      applyUpgrade(selectedTower, skill, TOWER_TYPES[selectedTower.type]);
    },
    onRepair: () => {
      const cost = Math.round((selectedTower.maxHp - selectedTower.hp) * 0.5);
      if (cost <= 0) return;
      if (!spend(economy, cost)) return;
      selectedTower.hp = selectedTower.maxHp;
    },
    onSell: () => {
      damageTower(selectedTower, selectedTower.hp);
      towers = towers.filter((t) => t !== selectedTower);
      selectedTower = null;
    },
  });

  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
