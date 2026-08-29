import { CANVAS_WIDTH, CANVAS_HEIGHT, PATH, drawMap, drawPathDebug } from "./map.js";
import { createEnemy, stepEnemy, ENEMY_TYPES, damageEnemy } from "./enemy.js";
import { WAVES, buildSpawnQueue } from "./waves.js";
import { createEconomy, earn, loseLife } from "./economy.js";
import { createTower, stepTower, damageTower } from "./tower.js";
import { createProjectile, stepProjectile } from "./projectile.js";

const canvas = document.getElementById("game-canvas");
const ctx = canvas.getContext("2d");

const mapImage = new Image();
mapImage.src = "assets/map_bg.png";

const economy = createEconomy(150, 20);
let waveIndex = 0;
let spawnQueue = buildSpawnQueue(waveIndex);
let waveClock = 0;
let enemies = [];
let towers = [
  createTower("basic", 400, 300),
  createTower("laser", 800, 300),
];
let projectiles = [];
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
  ctx.save();
  ctx.translate(e.x, e.y);
  ctx.fillStyle = e.type === "tank" ? "#7a3b3b" : e.type === "buggy" ? "#b8ab7a" : "#8a8f5c";
  ctx.beginPath();
  ctx.arc(0, 0, 10, 0, Math.PI * 2);
  ctx.fill();
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
  ctx.save();
  ctx.translate(t.x, t.y);
  ctx.rotate(t.angle);
  ctx.fillStyle = t.type === "laser" ? "#8a6a3a" : t.type === "double" ? "#888" : "#6b7a4a";
  ctx.fillRect(-14, -10, 28, 20);
  ctx.fillRect(0, -3, 22, 6);
  ctx.restore();

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

    for (const p of projectiles) {
      const hit = stepProjectile(p, dt);
      if (hit) damageEnemy(p.target, p.damage);
    }
    projectiles = projectiles.filter((p) => p.alive);

    const killedEnemies = enemies.filter((e) => !e.alive);
    for (const e of killedEnemies) earn(economy, e.bounty);
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
  drawHud();

  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
