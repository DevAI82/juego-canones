import { CANVAS_WIDTH, CANVAS_HEIGHT, PATH, SOLDIER_PATH, drawMap, drawPathDebug, distanceToPath } from "./map.js";
import { createEnemy, stepEnemy, damageEnemy, stepEnemyFire } from "./enemy.js";
import { WAVES, buildSpawnQueue } from "./waves.js";
import { createEconomy, earn, loseLife, spend } from "./economy.js";
import { createTower, stepTower, damageTower, TOWER_TYPES } from "./tower.js";
import { createProjectile, stepProjectile } from "./projectile.js";
import { initBuildMenu, updateBuildMenu, initUpgradePanel, updateUpgradePanel } from "./ui.js";
import { applyUpgrade, upgradeCost, canUpgrade } from "./upgrades.js";

// Minimum distance (px) a new tower must keep from the road -- rejects
// placement on or immediately next to the path. The trench itself reads
// as ~30-50px wide on screen, and towers draw ~40px wide with a platform
// pad, so this keeps them visually clear of the actual road surface, not
// just the single-pixel-wide waypoint line down its middle.
const MIN_PLACEMENT_DIST_FROM_PATH = 40;

// Refund fraction paid back to the player when selling a tower via the
// upgrade panel's "Vender" button.
const SELL_REFUND_FRACTION = 0.6;

// Pause between waves so the player has a moment to place/upgrade towers,
// plus how long remains on that pause (ticked down each frame, skippable
// via the "Siguiente oleada" fast-forward button).
const INTER_WAVE_DELAY = 4;

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
// Laser hits are instant (no travel time, matching a beam of light rather
// than a physical bullet) -- damage applies the moment the shot fires, and
// `beams` holds only the brief visual flash, not something that needs to
// "arrive" like a projectile.
let beams = [];
let gameOver = false;
let win = false;

// Inter-wave delay state: while > 0, the next wave's spawn queue has already
// been built but trySpawn won't drain it yet (waveClock is held at 0), so
// the player gets a calm moment between waves. The "Siguiente oleada" button
// zeroes this to skip the wait immediately.
let interWaveTimer = 0;

function trySpawn() {
  if (interWaveTimer > 0) return;
  while (spawnQueue.length && spawnQueue[0].time <= waveClock) {
    const { type } = spawnQueue.shift();
    // Vehicles are confined to the trench; only foot soldiers can duck out
    // and cut across open ground on the shorter, more exposed SOLDIER_PATH.
    enemies.push(createEnemy(type, type === "soldier" ? SOLDIER_PATH : PATH));
  }
}

function nextWaveIfDone() {
  if (interWaveTimer > 0) return;
  if (spawnQueue.length === 0 && enemies.length === 0) {
    if (waveIndex < WAVES.length - 1) {
      waveIndex++;
      economy.wave = waveIndex + 1;
      spawnQueue = buildSpawnQueue(waveIndex);
      waveClock = 0;
      interWaveTimer = INTER_WAVE_DELAY;
    } else if (!win) {
      win = true;
    }
  }
}

function drawEnemy(e) {
  const spriteKey = `enemy_${e.type}`;
  const img = sprites[spriteKey];
  ctx.save();
  ctx.translate(e.x, e.y);
  ctx.rotate(e.angle);
  if (ready(img)) {
    // Draw at the sprite's real aspect ratio instead of squashing every
    // enemy into a fixed square -- source crops range up to ~3.8:1.
    const h = 26;
    const w = h * (img.naturalWidth / img.naturalHeight);
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

  // A dark platform under every tower keeps it visible regardless of
  // terrain color -- the turret sprites and the grass/dirt map share
  // similar olive/earth tones, so without this a tower can be hard to
  // spot at a glance (this is why every real TD game gives towers a base
  // pad instead of relying on the terrain to contrast on its own).
  ctx.save();
  ctx.fillStyle = "rgba(20,22,18,0.75)";
  ctx.beginPath();
  ctx.arc(t.x, t.y, 19, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(220,220,200,0.55)";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();

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
    // Draw at the sprite's real aspect ratio instead of squashing every
    // turret into a fixed square -- the laser turret crop alone is ~3.8:1.
    const h = 34;
    const w = h * (img.naturalWidth / img.naturalHeight);
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

function drawBeam(b) {
  const t = b.age / b.duration;
  ctx.save();
  ctx.globalAlpha = 1 - t;
  ctx.strokeStyle = "#aef9ff";
  ctx.lineWidth = 3;
  ctx.shadowColor = "#7ff9ff";
  ctx.shadowBlur = 8;
  ctx.beginPath();
  ctx.moveTo(b.x1, b.y1);
  ctx.lineTo(b.x2, b.y2);
  ctx.stroke();
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
  if (interWaveTimer > 0 && !gameOver && !win) {
    ctx.fillText(`Siguiente oleada en ${Math.ceil(interWaveTimer)}s`, 20, 105);
  }
  if (gameOver || win) {
    ctx.font = "48px sans-serif";
    ctx.fillText(gameOver ? "GAME OVER" : "¡VICTORIA!", CANVAS_WIDTH / 2 - 150, CANVAS_HEIGHT / 2);
    ctx.font = "20px sans-serif";
    ctx.fillText("Pulsa R para reiniciar", CANVAS_WIDTH / 2 - 90, CANVAS_HEIGHT / 2 + 40);
  }
  ctx.restore();
}

const buildMenuEl = document.getElementById("build-menu");
initBuildMenu(buildMenuEl, {
  onSelect: (type) => {
    if (gameOver || win) return;
    selectedBuildType = selectedBuildType === type ? null : type;
  },
});

// Upgrade panel callbacks are defined once, here, and read the *current*
// value of the module-level `selectedTower` variable at click time via
// normal closure semantics -- they are never re-created per frame, which is
// what makes the panel's buttons clickable in the first place (see
// initUpgradePanel's comment in ui.js).
initUpgradePanel(upgradePanelEl, {
  onUpgrade: (skill) => {
    if (gameOver || win || !selectedTower) return;
    if (!canUpgrade(selectedTower, skill)) return;
    const cost = upgradeCost(skill, selectedTower.level[skill]);
    if (!spend(economy, cost)) return;
    applyUpgrade(selectedTower, skill, TOWER_TYPES[selectedTower.type]);
  },
  onRepair: () => {
    if (gameOver || win || !selectedTower) return;
    const cost = Math.round((selectedTower.maxHp - selectedTower.hp) * 0.5);
    if (cost <= 0) return;
    if (!spend(economy, cost)) return;
    selectedTower.hp = selectedTower.maxHp;
  },
  onSell: () => {
    if (gameOver || win || !selectedTower) return;
    earn(economy, Math.round(TOWER_TYPES[selectedTower.type].cost * SELL_REFUND_FRACTION));
    damageTower(selectedTower, selectedTower.hp);
    towers = towers.filter((t) => t !== selectedTower);
    selectedTower = null;
  },
});

const skipWaveBtn = document.getElementById("skip-wave-btn");
skipWaveBtn.addEventListener("click", () => {
  if (gameOver || win) return;
  interWaveTimer = 0;
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
  if (gameOver || win) return;
  const pos = canvasPos(evt);
  if (selectedBuildType) {
    const def = TOWER_TYPES[selectedBuildType];
    const countOnField = towers.filter((t) => t.type === selectedBuildType && t.hp > 0).length;
    if (countOnField >= def.maxCount) return;
    if (distanceToPath(PATH, pos.x, pos.y) < MIN_PLACEMENT_DIST_FROM_PATH) return;
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

window.addEventListener("keydown", (evt) => {
  if (evt.key.toLowerCase() !== "r") return;
  if (!gameOver && !win) return;
  location.reload();
});

let lastTime = performance.now();

function loop(now) {
  const dt = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;

  if (!gameOver && !win) {
    if (interWaveTimer > 0) {
      interWaveTimer = Math.max(0, interWaveTimer - dt);
    } else {
      waveClock += dt;
    }
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
        if (t.type === "laser") {
          // A railgun beam travels effectively instantly -- damage the
          // target immediately rather than spawning a bullet that flies
          // toward it, and leave only a brief visual flash behind.
          damageEnemy(shot.target, shot.damage);
          beams.push({ x1: shot.x, y1: shot.y, x2: shot.target.x, y2: shot.target.y, age: 0, duration: 0.15 });
        } else {
          for (let i = 0; i < shot.projectilesPerShot; i++) {
            // Offset each shot perpendicular to the barrel so the double
            // tower's two rounds are visibly two separate bullets from its
            // twin barrels, not one bullet drawn on top of the other.
            const spread = shot.projectilesPerShot > 1 ? (i - (shot.projectilesPerShot - 1) / 2) * 6 : 0;
            const px = shot.x - Math.sin(t.angle) * spread;
            const py = shot.y + Math.cos(t.angle) * spread;
            projectiles.push(createProjectile(px, py, shot.target, shot.damage));
          }
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
    for (const bm of beams) bm.age += dt;
    beams = beams.filter((bm) => bm.age < bm.duration);
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
  if (ready(mapImage)) {
    drawMap(ctx, mapImage);
  } else {
    ctx.fillStyle = "#3a4a2f";
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  }
  drawPathDebug(ctx, PATH);
  for (const t of towers) drawTower(t);
  for (const e of enemies) drawEnemy(e);
  for (const p of projectiles) drawProjectile(p);
  for (const bm of beams) drawBeam(bm);
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
  updateUpgradePanel(upgradePanelEl, selectedTower);
  skipWaveBtn.classList.toggle("hidden", !(interWaveTimer > 0 && !gameOver && !win));

  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
