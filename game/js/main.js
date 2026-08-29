import { CANVAS_WIDTH, CANVAS_HEIGHT, PATH, drawMap, drawPathDebug } from "./map.js";
import { createEnemy, stepEnemy, ENEMY_TYPES } from "./enemy.js";
import { WAVES, buildSpawnQueue } from "./waves.js";
import { createEconomy, earn, loseLife } from "./economy.js";

const canvas = document.getElementById("game-canvas");
const ctx = canvas.getContext("2d");

const mapImage = new Image();
mapImage.src = "assets/map_bg.png";

const economy = createEconomy(150, 20);
let waveIndex = 0;
let spawnQueue = buildSpawnQueue(waveIndex);
let waveClock = 0;
let enemies = [];
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
  for (const e of enemies) drawEnemy(e);
  drawHud();

  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
