# Tower Defense militar — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a playable browser Tower Defense game (HTML5 Canvas + vanilla JS) using art cropped from the project's own reference images, implementing all 4 systems from the design spec (path/waves, enemies, towers, economy/upgrades).

**Architecture:** Pure-logic game modules (`enemy.js`, `tower.js`, `projectile.js`, `economy.js`, `upgrades.js`, `waves.js`) written as ES modules with no DOM dependency, each independently testable with Node's built-in test runner (`node --test`). A thin integration layer (`main.js`, `map.js`, `ui.js`) wires them to a `<canvas>` game loop and DOM HUD, verified visually via the Browser pane. Art assets are pre-processed once by a Python/PIL script from the 4 source images into transparent PNGs.

**Tech Stack:** HTML5 Canvas, vanilla JavaScript (ES modules, no build step, no npm dependencies), Node.js built-in test runner (`node --test`) for logic tests, Python 3 + Pillow for the one-time asset extraction script, a trivial static file server for local preview.

**Spec:** [docs/2026-08-29-tower-defense-design.md](../docs/2026-08-29-tower-defense-design.md)

## Global Constraints

- No frameworks/libraries for the game itself (vanilla JS only) — code must stay readable for a learner.
- No new AI-generated art — every sprite is cropped/recolored from `tanques.jpg`, `ENEMIGOS CENITAL.jpg`, `mapa.jpg`, `explosiones.jpg`.
- Tower limits: 6 básica, 4 doble, 2 láser simultaneously on the field (from the spec).
- Every tower: max 20 shots before reload; reload times 2s (básica) / 3s (doble) / 5s (láser).
- Upgrade tree: 3 skills (daño, alcance, velocidad de disparo) × 5 levels each, per tower instance.
- 3 enemy types mapped as: soldado=normal, buggy=rápido, tanque=pesado; all 3 can shoot at towers.
- Canvas logical size: 1200×750.

---

## File Structure

```
Projects/JUEGO CAÑONES/
├── tools/extract_assets.py
└── game/
    ├── index.html
    ├── style.css
    ├── assets/                 (generated PNGs)
    └── js/
        ├── main.js             (game loop, ties everything together)
        ├── map.js              (path waypoints, background draw)
        ├── waves.js            (wave definitions, spawn queue)
        ├── enemy.js            (enemy types, movement, damage)
        ├── tower.js            (tower types, targeting, firing, damage)
        ├── projectile.js       (bullets/lasers in flight)
        ├── economy.js          (money, lives)
        ├── upgrades.js         (upgrade cost/apply)
        ├── ui.js               (HUD, build menu, upgrade panel — DOM)
        └── *.test.js           (Node --test files, one per pure-logic module)
```

---

### Task 1: Git init + art asset extraction pipeline

**Files:**
- Create: `tools/extract_assets.py`
- Create: `game/assets/` (output PNGs: `tower_basic.png`, `tower_double.png`, `tower_laser.png`, `enemy_soldier.png`, `enemy_buggy.png`, `enemy_tank.png`, `explosion.png`, `map_bg.png`)

**Interfaces:**
- Produces: 8 PNG files under `game/assets/`, all with alpha transparency except `map_bg.png` (opaque background).

- [ ] **Step 1: Initialize git repo for the project**

```bash
cd "Projects/JUEGO CAÑONES"
git init
printf "__pycache__/\n*.pyc\n" > .gitignore
git add .gitignore "Imágenes/Instrucciones Juego.docx" tanques.jpg enemigos.jpg mapa.jpg explosiones.jpg "ENEMIGOS CENITAL.jpg" docs/
git commit -m "chore: initial project files and design docs"
```

- [ ] **Step 2: Write the extraction script**

Create `tools/extract_assets.py`:

```python
"""One-time asset extraction: crops game sprites from the reference images.
Run from the project root: python tools/extract_assets.py
"""
import statistics
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "game" / "assets"
OUT.mkdir(parents=True, exist_ok=True)


def local_bg(im, x, y, w=15, h=15):
    patch = im.crop((x, y, x + w, y + h)).convert("RGB")
    px = list(patch.getdata())
    return (
        int(statistics.median(p[0] for p in px)),
        int(statistics.median(p[1] for p in px)),
        int(statistics.median(p[2] for p in px)),
    )


def paint_over(im, boxes):
    """Paint each (x0,y0,x1,y1) box with a background color sampled just left of it."""
    out = im.copy()
    px = out.load()
    for (x0, y0, x1, y1) in boxes:
        col = local_bg(im, max(x0 - 40, 0), y0)
        for y in range(y0, min(y1, out.height)):
            for x in range(x0, min(x1, out.width)):
                px[x, y] = col
    return out


def color_key(im, bg, tol=32):
    """Convert pixels close to bg color to transparent. Returns RGBA image."""
    im = im.convert("RGB")
    out = Image.new("RGBA", im.size)
    src = im.load()
    dst = out.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b = src[x, y]
            if abs(r - bg[0]) + abs(g - bg[1]) + abs(b - bg[2]) < tol * 3:
                dst[x, y] = (r, g, b, 0)
            else:
                dst[x, y] = (r, g, b, 255)
    return out


def extract_towers():
    im = Image.open(ROOT / "tanques.jpg").convert("RGB")
    bg = im.getpixel((5, 5))
    label_boxes = [
        (1090, 130, 2752, 230),    # "1. MBT-1 Vanquisher..."
        (240, 690, 1200, 860),     # "2. AA-2 Cyclone..."
        (1370, 1280, 2752, 1460),  # "3. RG-3 Tempest..." (two lines)
    ]
    cleaned = paint_over(im, label_boxes)
    crops = {
        "tower_basic": (0, 0, 1650, 680),
        "tower_double": (1250, 350, 2752, 1080),
        "tower_laser": (60, 850, 2752, 1536),
    }
    for name, box in crops.items():
        cropped = cleaned.crop(box)
        color_key(cropped, bg).save(OUT / f"{name}.png")


def tint_red(im, strength=0.55):
    """Shift an RGBA image's hue toward rust-red, keep alpha untouched."""
    im = im.convert("RGBA")
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            gray = (r + g + b) / 3
            nr = int(gray + (200 - gray) * strength)
            ng = int(gray * (1 - strength * 0.6))
            nb = int(gray * (1 - strength * 0.6))
            px[x, y] = (max(0, min(255, nr)), max(0, min(255, ng)), max(0, min(255, nb)), a)
    return im


def extract_enemies():
    im = Image.open(ROOT / "ENEMIGOS CENITAL.jpg").convert("RGB")
    bg = (254, 254, 254)
    label_boxes = [
        (0, 205, 1024, 225),   # "VISTAS CENITALES DE ENEMIGOS..." (top instance)
        (560, 378, 1024, 398), # same label, lower instance
    ]
    cleaned = paint_over(im, label_boxes)

    tank = cleaned.crop((10, 5, 445, 215))
    tank_rgba = color_key(tank, bg)
    tint_red(tank_rgba).save(OUT / "enemy_tank.png")

    buggy = cleaned.crop((700, 210, 1005, 365))
    color_key(buggy, bg).save(OUT / "enemy_buggy.png")

    soldier = cleaned.crop((895, 450, 990, 550))
    color_key(soldier, bg).save(OUT / "enemy_soldier.png")


def extract_explosion():
    im = Image.open(ROOT / "explosiones.jpg").convert("RGB")
    crop = im.crop((15, 385, 265, 600))
    bg = crop.getpixel((2, 2))
    color_key(crop, bg, tol=40).save(OUT / "explosion.png")


def extract_map():
    im = Image.open(ROOT / "mapa.jpg").convert("RGB")
    out = im.copy()
    # paint over the baked-in "ENEMY PATH" legend and the corner minimap with
    # nearby grass texture so our own HUD/path drawing isn't fighting the source art
    legend_box = (2000, 60, 2400, 140)
    minimap_box = (0, 1370, 430, 1792)
    for box in (legend_box, minimap_box):
        col = local_bg(im, max(box[0] - 60, 0), box[1])
        px = out.load()
        for y in range(box[1], min(box[3], out.height)):
            for x in range(box[0], min(box[2], out.width)):
                px[x, y] = col
    out.save(OUT / "map_bg.png")


if __name__ == "__main__":
    extract_towers()
    extract_enemies()
    extract_explosion()
    extract_map()
    print("Assets written to", OUT)
```

- [ ] **Step 3: Run it**

```bash
cd "Projects/JUEGO CAÑONES"
python tools/extract_assets.py
```

Expected: prints `Assets written to .../game/assets`, and 8 PNG files exist in `game/assets/`.

- [ ] **Step 4: Visually verify each sprite**

Open each of the 8 PNGs (e.g. with the Read tool, or any image viewer). Checklist per file:
- `tower_basic.png` / `tower_double.png` / `tower_laser.png`: one clean turret each, no visible label text, no fragment of a neighboring turret, background is transparent (checkerboard in a viewer that shows alpha).
- `enemy_tank.png`: same turret art as `tower_basic.png` but visibly red/rust-tinted, not olive green.
- `enemy_buggy.png`: the open-frame chassis, no visible label text.
- `enemy_soldier.png`: a single soldier figure, not two overlapping.
- `explosion.png`: fire/smoke burst only, no trash-can icon, no grid lines.
- `map_bg.png`: no "ENEMY PATH" text and no minimap box readable in the top area / bottom-left corner.

If any crop is off (text visible, wrong turret, cut-off sprite), adjust the specific box tuple in `extract_assets.py` (crop coords or label box coords) and re-run Step 3. This is expected to take 1-2 iterations — the source images are hand-illustrated reference sheets, not a pre-aligned sprite grid.

- [ ] **Step 5: Commit**

```bash
cd "Projects/JUEGO CAÑONES"
git add tools/extract_assets.py game/assets/
git commit -m "feat: art asset extraction pipeline and generated sprites"
```

---

### Task 2: Project skeleton + game loop + map rendering

**Files:**
- Create: `game/index.html`
- Create: `game/style.css`
- Create: `game/js/main.js`
- Create: `game/js/map.js`
- Test: `game/js/map.test.js`

**Interfaces:**
- Produces (`map.js`): `export const PATH` (array of `{x, y}`), `export function drawMap(ctx, mapImage)`, `export function pathPointAt(path, waypointIndex)`.
- Consumes: `game/assets/map_bg.png` from Task 1.

- [ ] **Step 1: Write the failing test for path data**

Create `game/js/map.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { PATH, pathPointAt } from "./map.js";

test("PATH has at least 2 waypoints", () => {
  assert.ok(PATH.length >= 2);
});

test("pathPointAt returns the waypoint at that index", () => {
  const p = pathPointAt(PATH, 0);
  assert.equal(p.x, PATH[0].x);
  assert.equal(p.y, PATH[0].y);
});

test("pathPointAt returns undefined past the end", () => {
  assert.equal(pathPointAt(PATH, PATH.length + 5), undefined);
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd "Projects/JUEGO CAÑONES/game"
node --test js/map.test.js
```

Expected: FAIL — `js/map.js` does not exist yet.

- [ ] **Step 3: Write map.js**

```js
export const CANVAS_WIDTH = 1200;
export const CANVAS_HEIGHT = 750;

// Waypoints approximating the serpentine path in mapa.jpg. Tune these against
// game/assets/map_bg.png once it's visible on screen (Task 2 Step 6).
export const PATH = [
  { x: -40, y: 120 },
  { x: 300, y: 120 },
  { x: 300, y: 420 },
  { x: 650, y: 420 },
  { x: 650, y: 140 },
  { x: 950, y: 140 },
  { x: 950, y: 620 },
  { x: 1240, y: 620 },
];

export function pathPointAt(path, index) {
  return path[index];
}

export function drawMap(ctx, mapImage) {
  ctx.drawImage(mapImage, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
}

export function drawPathDebug(ctx, path) {
  ctx.save();
  ctx.strokeStyle = "rgba(255,0,0,0.6)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(path[0].x, path[0].y);
  for (const p of path.slice(1)) ctx.lineTo(p.x, p.y);
  ctx.stroke();
  ctx.restore();
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd "Projects/JUEGO CAÑONES/game"
node --test js/map.test.js
```

Expected: PASS, 3 tests.

- [ ] **Step 5: Write index.html, style.css, and main.js**

Create `game/index.html`:

```html
<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>Tower Defense</title>
  <link rel="stylesheet" href="style.css" />
</head>
<body>
  <div id="game-container">
    <canvas id="game-canvas" width="1200" height="750"></canvas>
    <div id="hud"></div>
  </div>
  <script type="module" src="js/main.js"></script>
</body>
</html>
```

Create `game/style.css`:

```css
html, body { margin: 0; padding: 0; background: #111; }
#game-container { position: relative; width: 1200px; margin: 0 auto; }
#game-canvas { display: block; background: #222; }
#hud { position: absolute; top: 0; left: 0; width: 100%; pointer-events: none; }
#hud * { pointer-events: auto; }
```

Create `game/js/main.js`:

```js
import { CANVAS_WIDTH, CANVAS_HEIGHT, PATH, drawMap, drawPathDebug } from "./map.js";

const canvas = document.getElementById("game-canvas");
const ctx = canvas.getContext("2d");

const mapImage = new Image();
mapImage.src = "assets/map_bg.png";

let lastTime = performance.now();

function loop(now) {
  const dt = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;

  ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  if (mapImage.complete && mapImage.naturalWidth > 0) {
    drawMap(ctx, mapImage);
  } else {
    ctx.fillStyle = "#3a4a2f";
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  }
  drawPathDebug(ctx, PATH);

  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
```

- [ ] **Step 6: Serve and verify in the browser**

Create `.claude/launch.json` at the project root (`Projects/JUEGO CAÑONES/.claude/launch.json`) if it doesn't exist:

```json
{
  "version": "0.0.1",
  "configurations": [
    {
      "name": "td-game",
      "runtimeExecutable": "python",
      "runtimeArgs": ["-m", "http.server", "8420", "--directory", "game"],
      "port": 8420
    }
  ]
}
```

Start the preview (`preview_start` with `name: "td-game"`), then in the Browser pane confirm:
- The map background image is visible (not just the fallback green rectangle).
- A red debug line is visible tracing the serpentine path.
- No errors in `read_console_messages`.

If the path line doesn't roughly follow the visual road in `map_bg.png`, adjust the `PATH` waypoints in `map.js` and reload.

- [ ] **Step 7: Commit**

```bash
cd "Projects/JUEGO CAÑONES"
git add game/index.html game/style.css game/js/main.js game/js/map.js game/js/map.test.js .claude/launch.json
git commit -m "feat: game skeleton with canvas loop and map rendering"
```

---

### Task 3: Enemy module (types, movement, damage)

**Files:**
- Create: `game/js/enemy.js`
- Test: `game/js/enemy.test.js`

**Interfaces:**
- Produces: `export const ENEMY_TYPES` (keys `soldier`/`buggy`/`tank`, each `{hp, speed, damage, bounty, fireRange, fireDamage, fireCooldown}`), `export function createEnemy(type, path)`, `export function stepEnemy(enemy, dt)` → `{reachedEnd: boolean}`, `export function damageEnemy(enemy, amount)` → `boolean` (true if still alive).
- Consumes: `PATH` shape `{x,y}[]` from `map.js` (any compatible array works, not imported directly — tests pass their own path).

- [ ] **Step 1: Write the failing tests**

Create `game/js/enemy.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { ENEMY_TYPES, createEnemy, stepEnemy, damageEnemy } from "./enemy.js";

const PATH = [{ x: 0, y: 0 }, { x: 100, y: 0 }];

test("createEnemy starts at the first waypoint with full hp", () => {
  const e = createEnemy("soldier", PATH);
  assert.equal(e.x, 0);
  assert.equal(e.y, 0);
  assert.equal(e.hp, ENEMY_TYPES.soldier.hp);
  assert.equal(e.alive, true);
});

test("stepEnemy moves toward the next waypoint", () => {
  const e = createEnemy("buggy", PATH);
  const before = e.x;
  stepEnemy(e, 0.1);
  assert.ok(e.x > before);
  assert.ok(e.x <= 100);
});

test("stepEnemy reports reachedEnd once past the last waypoint", () => {
  const e = createEnemy("buggy", PATH);
  let result;
  for (let i = 0; i < 200; i++) {
    result = stepEnemy(e, 0.1);
    if (result.reachedEnd) break;
  }
  assert.equal(result.reachedEnd, true);
});

test("damageEnemy reduces hp and reports death at 0", () => {
  const e = createEnemy("soldier", PATH);
  const stillAlive = damageEnemy(e, e.hp - 1);
  assert.equal(stillAlive, true);
  assert.equal(e.alive, true);
  const dead = damageEnemy(e, 999);
  assert.equal(dead, false);
  assert.equal(e.alive, false);
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd "Projects/JUEGO CAÑONES/game"
node --test js/enemy.test.js
```

Expected: FAIL — `js/enemy.js` does not exist.

- [ ] **Step 3: Write enemy.js**

```js
export const ENEMY_TYPES = {
  soldier: { hp: 40, speed: 55, damage: 1, bounty: 8, fireRange: 90, fireDamage: 2, fireCooldown: 1.2 },
  buggy: { hp: 25, speed: 95, damage: 1, bounty: 10, fireRange: 100, fireDamage: 2, fireCooldown: 1.0 },
  tank: { hp: 120, speed: 30, damage: 2, bounty: 20, fireRange: 120, fireDamage: 5, fireCooldown: 2.0 },
};

export function createEnemy(type, path) {
  const def = ENEMY_TYPES[type];
  return {
    type,
    hp: def.hp,
    maxHp: def.hp,
    speed: def.speed,
    damage: def.damage,
    bounty: def.bounty,
    fireRange: def.fireRange,
    fireDamage: def.fireDamage,
    fireCooldown: def.fireCooldown,
    fireTimer: def.fireCooldown,
    path,
    waypointIndex: 0,
    x: path[0].x,
    y: path[0].y,
    angle: 0,
    alive: true,
  };
}

export function stepEnemy(enemy, dt) {
  if (!enemy.alive) return { reachedEnd: false };
  const target = enemy.path[enemy.waypointIndex + 1];
  if (!target) return { reachedEnd: true };

  const dx = target.x - enemy.x;
  const dy = target.y - enemy.y;
  const dist = Math.hypot(dx, dy);
  const step = enemy.speed * dt;

  if (step >= dist) {
    enemy.x = target.x;
    enemy.y = target.y;
    enemy.waypointIndex++;
  } else {
    enemy.angle = Math.atan2(dy, dx);
    enemy.x += (dx / dist) * step;
    enemy.y += (dy / dist) * step;
  }
  return { reachedEnd: false };
}

export function damageEnemy(enemy, amount) {
  enemy.hp -= amount;
  if (enemy.hp <= 0) {
    enemy.hp = 0;
    enemy.alive = false;
  }
  return enemy.alive;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd "Projects/JUEGO CAÑONES/game"
node --test js/enemy.test.js
```

Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
cd "Projects/JUEGO CAÑONES"
git add game/js/enemy.js game/js/enemy.test.js
git commit -m "feat: enemy module with movement and damage logic"
```

---

### Task 4: Waves + spawner, wired into the game loop with lives

**Files:**
- Create: `game/js/waves.js`
- Create: `game/js/economy.js`
- Modify: `game/js/main.js`
- Test: `game/js/waves.test.js`
- Test: `game/js/economy.test.js`

**Interfaces:**
- Produces (`waves.js`): `export const WAVES` (array of `{enemies: [{type, count, interval}]}`), `export function buildSpawnQueue(waveIndex)` → `[{type, time}]` sorted by `time`.
- Produces (`economy.js`): `export function createEconomy(startMoney, startLives)` → `{money, lives, wave}`, `export function canAfford(eco, cost)`, `export function spend(eco, cost)` → `boolean`, `export function earn(eco, amount)`, `export function loseLife(eco, amount)` → `boolean` (true if game over).
- Consumes: `createEnemy`, `stepEnemy` from `enemy.js` (Task 3); `PATH` from `map.js` (Task 2).

- [ ] **Step 1: Write the failing tests**

Create `game/js/waves.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { WAVES, buildSpawnQueue } from "./waves.js";

test("WAVES has at least 8 waves", () => {
  assert.ok(WAVES.length >= 8);
});

test("buildSpawnQueue returns entries sorted by time", () => {
  const queue = buildSpawnQueue(0);
  for (let i = 1; i < queue.length; i++) {
    assert.ok(queue[i].time >= queue[i - 1].time);
  }
});

test("buildSpawnQueue total count matches the wave definition", () => {
  const queue = buildSpawnQueue(1);
  const expected = WAVES[1].enemies.reduce((sum, g) => sum + g.count, 0);
  assert.equal(queue.length, expected);
});
```

Create `game/js/economy.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { createEconomy, canAfford, spend, earn, loseLife } from "./economy.js";

test("createEconomy sets starting values", () => {
  const eco = createEconomy(150, 20);
  assert.equal(eco.money, 150);
  assert.equal(eco.lives, 20);
  assert.equal(eco.wave, 1);
});

test("spend fails and leaves money unchanged when unaffordable", () => {
  const eco = createEconomy(10, 20);
  const ok = spend(eco, 50);
  assert.equal(ok, false);
  assert.equal(eco.money, 10);
});

test("spend succeeds and deducts money when affordable", () => {
  const eco = createEconomy(100, 20);
  const ok = spend(eco, 40);
  assert.equal(ok, true);
  assert.equal(eco.money, 60);
});

test("earn adds money", () => {
  const eco = createEconomy(0, 20);
  earn(eco, 15);
  assert.equal(eco.money, 15);
});

test("loseLife returns true (game over) once lives hit 0", () => {
  const eco = createEconomy(0, 2);
  assert.equal(loseLife(eco, 1), false);
  assert.equal(loseLife(eco, 1), true);
  assert.equal(eco.lives, 0);
});
```

- [ ] **Step 2: Run to verify they fail**

```bash
cd "Projects/JUEGO CAÑONES/game"
node --test js/waves.test.js js/economy.test.js
```

Expected: FAIL — `waves.js` and `economy.js` don't exist.

- [ ] **Step 3: Write waves.js**

```js
export const WAVES = [
  { enemies: [{ type: "soldier", count: 5, interval: 1.0 }] },
  { enemies: [{ type: "soldier", count: 4, interval: 0.9 }, { type: "buggy", count: 2, interval: 0.8 }] },
  { enemies: [{ type: "buggy", count: 5, interval: 0.6 }] },
  { enemies: [{ type: "soldier", count: 6, interval: 0.7 }, { type: "tank", count: 1, interval: 2.0 }] },
  { enemies: [{ type: "buggy", count: 4, interval: 0.5 }, { type: "tank", count: 2, interval: 1.8 }] },
  { enemies: [{ type: "soldier", count: 8, interval: 0.5 }, { type: "buggy", count: 3, interval: 0.5 }] },
  { enemies: [{ type: "tank", count: 3, interval: 1.5 }, { type: "buggy", count: 4, interval: 0.5 }] },
  { enemies: [{ type: "soldier", count: 10, interval: 0.4 }, { type: "tank", count: 2, interval: 1.5 }] },
  { enemies: [{ type: "buggy", count: 8, interval: 0.4 }, { type: "tank", count: 3, interval: 1.2 }] },
  { enemies: [{ type: "soldier", count: 10, interval: 0.35 }, { type: "buggy", count: 6, interval: 0.4 }, { type: "tank", count: 4, interval: 1.0 }] },
];

export function buildSpawnQueue(waveIndex) {
  const wave = WAVES[waveIndex];
  const queue = [];
  for (const group of wave.enemies) {
    let t = 0;
    for (let i = 0; i < group.count; i++) {
      queue.push({ type: group.type, time: t });
      t += group.interval;
    }
  }
  return queue.sort((a, b) => a.time - b.time);
}
```

- [ ] **Step 4: Write economy.js**

```js
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
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd "Projects/JUEGO CAÑONES/game"
node --test js/waves.test.js js/economy.test.js
```

Expected: PASS, 8 tests total.

- [ ] **Step 6: Wire into main.js**

Replace the contents of `game/js/main.js` with:

```js
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
```

- [ ] **Step 7: Verify in the browser**

Reload the preview. Confirm: enemies of 3 different colors spawn over time following the red path line, each with a red health bar; the wave counter advances once a wave's enemies are all gone; letting enemies reach the end reduces the lives counter; reaching 0 lives shows "GAME OVER". Check console for errors.

- [ ] **Step 8: Commit**

```bash
cd "Projects/JUEGO CAÑONES"
git add game/js/waves.js game/js/economy.js game/js/waves.test.js game/js/economy.test.js game/js/main.js
git commit -m "feat: wave spawner and economy wired into the core game loop"
```

---

### Task 5: Tower module (types, targeting, firing, reload)

**Files:**
- Create: `game/js/tower.js`
- Test: `game/js/tower.test.js`

**Interfaces:**
- Produces: `export const TOWER_TYPES` (keys `basic`/`double`/`laser`, each `{cost, damage, range, fireRate, maxAmmo, reloadTime, maxCount, hp, projectilesPerShot}`), `export function createTower(type, x, y)`, `export function findTarget(tower, enemies)` → enemy or `null`, `export function stepTower(tower, enemies, dt)` → `{x, y, target, damage, projectilesPerShot}` or `null`, `export function damageTower(tower, amount)` → `boolean` (alive).
- Consumes: enemy objects shaped like `enemy.js`'s (`{x, y, alive}` at minimum).

- [ ] **Step 1: Write the failing tests**

Create `game/js/tower.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { TOWER_TYPES, createTower, findTarget, stepTower, damageTower } from "./tower.js";

function fakeEnemy(x, y, alive = true) {
  return { x, y, alive, hp: 10 };
}

test("createTower sets base stats from TOWER_TYPES", () => {
  const t = createTower("basic", 100, 100);
  assert.equal(t.hp, TOWER_TYPES.basic.hp);
  assert.equal(t.range, TOWER_TYPES.basic.range);
  assert.equal(t.ammo, TOWER_TYPES.basic.maxAmmo);
});

test("findTarget picks the closest enemy within range, ignores dead ones", () => {
  const t = createTower("basic", 0, 0);
  const near = fakeEnemy(10, 0);
  const far = fakeEnemy(t.range + 50, 0);
  const dead = fakeEnemy(5, 0, false);
  const target = findTarget(t, [far, dead, near]);
  assert.equal(target, near);
});

test("findTarget returns null when nothing is in range", () => {
  const t = createTower("basic", 0, 0);
  const target = findTarget(t, [fakeEnemy(t.range + 100, 0)]);
  assert.equal(target, null);
});

test("stepTower fires when a target is in range and cooldown is ready", () => {
  const t = createTower("basic", 0, 0);
  t.fireTimer = 0;
  const enemy = fakeEnemy(10, 0);
  const shot = stepTower(t, [enemy], 0.016);
  assert.ok(shot);
  assert.equal(shot.target, enemy);
  assert.equal(t.ammo, TOWER_TYPES.basic.maxAmmo - 1);
});

test("stepTower enters reload after maxAmmo shots", () => {
  const t = createTower("basic", 0, 0);
  const enemy = fakeEnemy(10, 0);
  for (let i = 0; i < TOWER_TYPES.basic.maxAmmo; i++) {
    t.fireTimer = 0;
    stepTower(t, [enemy], 0.016);
  }
  assert.equal(t.reloading, true);
  assert.equal(t.ammo, 0);
});

test("damageTower reduces hp and reports death at 0", () => {
  const t = createTower("basic", 0, 0);
  assert.equal(damageTower(t, t.hp - 1), true);
  assert.equal(damageTower(t, 999), false);
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd "Projects/JUEGO CAÑONES/game"
node --test js/tower.test.js
```

Expected: FAIL — `tower.js` does not exist.

- [ ] **Step 3: Write tower.js**

```js
export const TOWER_TYPES = {
  basic: { cost: 50, damage: 12, range: 140, fireRate: 0.6, maxAmmo: 20, reloadTime: 2, maxCount: 6, hp: 80, projectilesPerShot: 1 },
  double: { cost: 90, damage: 8, range: 150, fireRate: 0.35, maxAmmo: 20, reloadTime: 3, maxCount: 4, hp: 90, projectilesPerShot: 2 },
  laser: { cost: 160, damage: 35, range: 220, fireRate: 1.2, maxAmmo: 20, reloadTime: 5, maxCount: 2, hp: 100, projectilesPerShot: 1 },
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
    level: { damage: 0, range: 0, fireRate: 0 },
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

  tower.angle = Math.atan2(tower.target.y - tower.y, tower.target.x - tower.x);
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
  tower.hp -= amount;
  if (tower.hp < 0) tower.hp = 0;
  return tower.hp > 0;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd "Projects/JUEGO CAÑONES/game"
node --test js/tower.test.js
```

Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
cd "Projects/JUEGO CAÑONES"
git add game/js/tower.js game/js/tower.test.js
git commit -m "feat: tower module with targeting, firing and reload logic"
```

---

### Task 6: Projectiles, wired into combat (towers hit enemies, explosion effect)

**Files:**
- Create: `game/js/projectile.js`
- Modify: `game/js/main.js`
- Test: `game/js/projectile.test.js`

**Interfaces:**
- Produces: `export function createProjectile(x, y, target, damage, speed = 400)`, `export function stepProjectile(proj, dt)` → `boolean` (true = hit this frame).
- Consumes: `stepTower` shots from `tower.js` (Task 5), `damageEnemy` from `enemy.js` (Task 3).

- [ ] **Step 1: Write the failing tests**

Create `game/js/projectile.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { createProjectile, stepProjectile } from "./projectile.js";

test("createProjectile starts at the given position", () => {
  const target = { x: 100, y: 0, alive: true };
  const p = createProjectile(0, 0, target, 10);
  assert.equal(p.x, 0);
  assert.equal(p.y, 0);
  assert.equal(p.alive, true);
});

test("stepProjectile moves toward the target without hitting immediately", () => {
  const target = { x: 100, y: 0, alive: true };
  const p = createProjectile(0, 0, target, 10, 50);
  const hit = stepProjectile(p, 0.1);
  assert.equal(hit, false);
  assert.ok(p.x > 0 && p.x < 100);
});

test("stepProjectile reports a hit once it reaches the target", () => {
  const target = { x: 10, y: 0, alive: true };
  const p = createProjectile(0, 0, target, 10, 1000);
  const hit = stepProjectile(p, 1);
  assert.equal(hit, true);
  assert.equal(p.alive, false);
});

test("stepProjectile fizzles if the target died first", () => {
  const target = { x: 100, y: 0, alive: false };
  const p = createProjectile(0, 0, target, 10);
  const hit = stepProjectile(p, 0.1);
  assert.equal(hit, false);
  assert.equal(p.alive, false);
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd "Projects/JUEGO CAÑONES/game"
node --test js/projectile.test.js
```

Expected: FAIL — `projectile.js` does not exist.

- [ ] **Step 3: Write projectile.js**

```js
export function createProjectile(x, y, target, damage, speed = 400) {
  return { x, y, target, damage, speed, alive: true };
}

export function stepProjectile(proj, dt) {
  if (!proj.alive) return false;
  if (!proj.target.alive) {
    proj.alive = false;
    return false;
  }
  const dx = proj.target.x - proj.x;
  const dy = proj.target.y - proj.y;
  const dist = Math.hypot(dx, dy);
  const step = proj.speed * dt;

  if (step >= dist) {
    proj.x = proj.target.x;
    proj.y = proj.target.y;
    proj.alive = false;
    return true;
  }
  proj.x += (dx / dist) * step;
  proj.y += (dy / dist) * step;
  return false;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd "Projects/JUEGO CAÑONES/game"
node --test js/projectile.test.js
```

Expected: PASS, 4 tests.

- [ ] **Step 5: Wire towers + projectiles into main.js**

In `game/js/main.js`, add imports and state, and extend the loop. Apply these edits:

Add to the imports at the top:
```js
import { createTower, stepTower, damageTower } from "./tower.js";
import { createProjectile, stepProjectile } from "./projectile.js";
import { damageEnemy } from "./enemy.js";
```

Add new state next to `let enemies = [];`:
```js
let towers = [
  createTower("basic", 400, 300),
  createTower("laser", 800, 300),
];
let projectiles = [];
```

Inside `loop`, right after the enemy-stepping block (`enemies = enemies.filter((e) => e.alive);`), add:
```js
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
```

Note: capture `killedEnemies` **before** filtering — filtering first would drop the dead enemies before their bounty is paid.

Replace the drawing block (after `drawPathDebug(ctx, PATH);`) with:
```js
  for (const t of towers) drawTower(t);
  for (const e of enemies) drawEnemy(e);
  for (const p of projectiles) drawProjectile(p);
  drawHud();
```

Add new draw functions above `drawHud`:
```js
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
```

- [ ] **Step 6: Verify in the browser**

Reload. Confirm: the two placed towers rotate to track the nearest enemy in range, fire yellow projectiles, enemies lose HP and die before reaching the end when in tower range, money increases on kills, and each tower's blue ammo bar depletes over 20 shots then pauses to refill. Check console for errors.

- [ ] **Step 7: Commit**

```bash
cd "Projects/JUEGO CAÑONES"
git add game/js/projectile.js game/js/projectile.test.js game/js/main.js
git commit -m "feat: projectiles connect tower fire to enemy damage"
```

---

### Task 7: Tower placement UI (build menu, drag-ghost, cost, per-type max count)

**Files:**
- Create: `game/js/ui.js`
- Modify: `game/js/main.js`
- Modify: `game/index.html`
- Modify: `game/style.css`

**Interfaces:**
- Produces (`ui.js`): `export function initBuildMenu(container, { onSelect })`, `export function updateBuildMenu(container, { towers, economy })`.
- Consumes: `TOWER_TYPES` from `tower.js` (Task 5), `economy` from `economy.js` (Task 4).

- [ ] **Step 1: Add the build menu markup**

In `game/index.html`, replace `<div id="hud"></div>` with:
```html
<div id="hud"></div>
<div id="build-menu"></div>
```

- [ ] **Step 2: Style the build menu**

Append to `game/style.css`:
```css
#build-menu { position: absolute; bottom: 0; left: 0; width: 100%; display: flex; gap: 8px; padding: 8px; background: rgba(0,0,0,0.5); box-sizing: border-box; }
.build-btn { flex: 1; padding: 8px; background: #333; color: #fff; border: 2px solid #555; cursor: pointer; font-family: sans-serif; }
.build-btn.selected { border-color: #5af; }
.build-btn:disabled { opacity: 0.4; cursor: not-allowed; }
```

- [ ] **Step 3: Write ui.js**

```js
import { TOWER_TYPES } from "./tower.js";

const LABELS = { basic: "Básica", double: "Doble", laser: "Láser" };

export function initBuildMenu(container, { onSelect }) {
  container.innerHTML = "";
  for (const type of Object.keys(TOWER_TYPES)) {
    const btn = document.createElement("button");
    btn.className = "build-btn";
    btn.dataset.type = type;
    btn.addEventListener("click", () => onSelect(type));
    container.appendChild(btn);
  }
}

export function updateBuildMenu(container, { towers, economy, selectedType }) {
  for (const btn of container.querySelectorAll(".build-btn")) {
    const type = btn.dataset.type;
    const def = TOWER_TYPES[type];
    const countOnField = towers.filter((t) => t.type === type && t.hp > 0).length;
    const atMax = countOnField >= def.maxCount;
    const canAfford = economy.money >= def.cost;
    btn.disabled = atMax || !canAfford;
    btn.classList.toggle("selected", type === selectedType);
    btn.textContent = `${LABELS[type]} ($${def.cost}) ${countOnField}/${def.maxCount}`;
  }
}
```

- [ ] **Step 4: Wire placement into main.js**

Add to the imports:
```js
import { TOWER_TYPES } from "./tower.js";
import { spend } from "./economy.js";
import { initBuildMenu, updateBuildMenu } from "./ui.js";
```

Replace `let towers = [...]` (the two hardcoded demo towers from Task 6) with:
```js
let towers = [];
let selectedBuildType = null;
let mouseX = 0;
let mouseY = 0;
```

Add below the existing state, before `let lastTime = performance.now();`:
```js
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
  if (!selectedBuildType) return;
  const def = TOWER_TYPES[selectedBuildType];
  const countOnField = towers.filter((t) => t.type === selectedBuildType && t.hp > 0).length;
  if (countOnField >= def.maxCount) return;
  if (!spend(economy, def.cost)) return;
  const pos = canvasPos(evt);
  towers.push(createTower(selectedBuildType, pos.x, pos.y));
  selectedBuildType = null;
});
```

Inside `loop`, after `drawHud();`, add:
```js
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
```

- [ ] **Step 5: Verify in the browser**

Reload. Confirm: 3 buttons appear at the bottom with cost and `N/max` counts; clicking one then clicking the canvas places a tower there and deducts money; the button disables once its type's max count is reached or money is insufficient; a translucent blue circle follows the cursor while a build type is selected.

- [ ] **Step 6: Commit**

```bash
cd "Projects/JUEGO CAÑONES"
git add game/js/ui.js game/js/main.js game/index.html game/style.css
git commit -m "feat: tower placement UI with build menu and per-type limits"
```

---

### Task 8: Enemies fire back at towers

**Files:**
- Modify: `game/js/enemy.js`
- Modify: `game/js/main.js`
- Modify: `game/js/enemy.test.js`

**Interfaces:**
- Produces: `export function stepEnemyFire(enemy, towers, dt)` → `{x, y, target, damage}` or `null` (added to `enemy.js`, reuses the same nearest-in-range pattern as `tower.js findTarget`).
- Consumes: `damageTower` from `tower.js` (Task 5).

- [ ] **Step 1: Write the failing test**

Append to `game/js/enemy.test.js`:

```js
import { stepEnemyFire } from "./enemy.js";

test("stepEnemyFire targets the nearest tower in range and respects cooldown", () => {
  const e = createEnemy("tank", PATH);
  e.x = 0; e.y = 0;
  e.fireTimer = 0;
  const near = { x: 20, y: 0, hp: 10 };
  const far = { x: e.fireRange + 50, y: 0, hp: 10 };
  const shot = stepEnemyFire(e, [far, near], 0.016);
  assert.ok(shot);
  assert.equal(shot.target, near);
  assert.ok(e.fireTimer > 0);
});

test("stepEnemyFire returns null when no tower in range", () => {
  const e = createEnemy("soldier", PATH);
  e.x = 0; e.y = 0;
  const shot = stepEnemyFire(e, [{ x: 9999, y: 0, hp: 10 }], 0.016);
  assert.equal(shot, null);
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd "Projects/JUEGO CAÑONES/game"
node --test js/enemy.test.js
```

Expected: FAIL — `stepEnemyFire` is not exported.

- [ ] **Step 3: Add stepEnemyFire to enemy.js**

Append to `game/js/enemy.js`:

```js
export function stepEnemyFire(enemy, towers, dt) {
  if (!enemy.alive) return null;
  enemy.fireTimer -= dt;
  if (enemy.fireTimer > 0) return null;

  let best = null;
  let bestDist = Infinity;
  for (const t of towers) {
    if (t.hp <= 0) continue;
    const d = Math.hypot(t.x - enemy.x, t.y - enemy.y);
    if (d <= enemy.fireRange && d < bestDist) {
      best = t;
      bestDist = d;
    }
  }
  if (!best) return null;

  enemy.fireTimer = enemy.fireCooldown;
  return { x: enemy.x, y: enemy.y, target: best, damage: enemy.fireDamage };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd "Projects/JUEGO CAÑONES/game"
node --test js/enemy.test.js
```

Expected: PASS, all enemy.js tests including the 2 new ones.

- [ ] **Step 5: Wire into main.js**

Add to the imports: `stepEnemyFire` alongside the existing `enemy.js` imports.

Inside `loop`, right after the tower-firing block (`for (const t of towers) { ... }` from Task 6), add:
```js
    for (const e of enemies) {
      const shot = stepEnemyFire(e, towers, dt);
      if (shot) {
        projectiles.push(createProjectile(shot.x, shot.y, shot.target, shot.damage, 300));
      }
    }
```

Change the projectile-resolution block so it applies damage to whichever kind of target was hit (enemy or tower). Replace:
```js
    for (const p of projectiles) {
      const hit = stepProjectile(p, dt);
      if (hit) damageEnemy(p.target, p.damage);
    }
```
with:
```js
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
```

Filter out destroyed towers so they stop being drawn/targeted — after `projectiles = projectiles.filter((p) => p.alive);`, add:
```js
    towers = towers.filter((t) => t.hp > 0);
```

- [ ] **Step 6: Verify in the browser**

Reload. Confirm: enemies within range of a tower periodically fire projectiles back at it; the tower's green HP bar drops; a tower whose HP reaches 0 disappears (and its build-menu count frees up a slot).

- [ ] **Step 7: Commit**

```bash
cd "Projects/JUEGO CAÑONES"
git add game/js/enemy.js game/js/enemy.test.js game/js/main.js
git commit -m "feat: enemies return fire and can destroy towers"
```

---

### Task 9: Upgrade tree (per-tower, 3 skills × 5 levels) + selection panel

**Files:**
- Create: `game/js/upgrades.js`
- Modify: `game/js/ui.js`
- Modify: `game/js/main.js`
- Modify: `game/index.html`
- Modify: `game/style.css`
- Test: `game/js/upgrades.test.js`

**Interfaces:**
- Produces (`upgrades.js`): `export const UPGRADE_DEFS` (keys `damage`/`range`/`fireRate`, each `{levels, baseCost, mult}`), `export function upgradeCost(skill, currentLevel)`, `export function canUpgrade(tower, skill)`, `export function applyUpgrade(tower, skill, baseStats)` → `boolean`.
- Consumes: `TOWER_TYPES` from `tower.js` (base stats to upgrade from), tower's own `level` field (set in `createTower`, Task 5).

- [ ] **Step 1: Write the failing tests**

Create `game/js/upgrades.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { createTower, TOWER_TYPES } from "./tower.js";
import { UPGRADE_DEFS, upgradeCost, canUpgrade, applyUpgrade } from "./upgrades.js";

test("upgradeCost grows with level", () => {
  const c0 = upgradeCost("damage", 0);
  const c1 = upgradeCost("damage", 1);
  assert.ok(c1 > c0);
});

test("canUpgrade is false once max level reached", () => {
  const t = createTower("basic", 0, 0);
  t.level.range = UPGRADE_DEFS.range.levels;
  assert.equal(canUpgrade(t, "range"), false);
});

test("applyUpgrade increases damage and increments level", () => {
  const t = createTower("basic", 0, 0);
  const before = t.damage;
  const ok = applyUpgrade(t, "damage", TOWER_TYPES.basic);
  assert.equal(ok, true);
  assert.ok(t.damage > before);
  assert.equal(t.level.damage, 1);
});

test("applyUpgrade decreases fireRate (faster shooting) as level rises", () => {
  const t = createTower("basic", 0, 0);
  const before = t.fireRate;
  applyUpgrade(t, "fireRate", TOWER_TYPES.basic);
  assert.ok(t.fireRate < before);
});

test("applyUpgrade returns false past max level", () => {
  const t = createTower("basic", 0, 0);
  for (let i = 0; i < UPGRADE_DEFS.damage.levels; i++) applyUpgrade(t, "damage", TOWER_TYPES.basic);
  const ok = applyUpgrade(t, "damage", TOWER_TYPES.basic);
  assert.equal(ok, false);
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd "Projects/JUEGO CAÑONES/game"
node --test js/upgrades.test.js
```

Expected: FAIL — `upgrades.js` does not exist.

- [ ] **Step 3: Write upgrades.js**

```js
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd "Projects/JUEGO CAÑONES/game"
node --test js/upgrades.test.js
```

Expected: PASS, 5 tests.

- [ ] **Step 5: Add the upgrade panel markup and styles**

In `game/index.html`, replace `<div id="build-menu"></div>` with:
```html
<div id="build-menu"></div>
<div id="upgrade-panel" class="hidden"></div>
```

Append to `game/style.css`:
```css
#upgrade-panel { position: absolute; bottom: 60px; left: 50%; transform: translateX(-50%); display: flex; gap: 8px; background: rgba(0,0,0,0.7); padding: 10px; border-radius: 4px; }
#upgrade-panel.hidden { display: none; }
.upgrade-col { color: #fff; font-family: sans-serif; text-align: center; min-width: 100px; }
.upgrade-col button { display: block; width: 100%; margin-top: 4px; }
```

- [ ] **Step 6: Add the panel logic to ui.js**

Append to `game/js/ui.js`:
```js
import { UPGRADE_DEFS, upgradeCost, canUpgrade } from "./upgrades.js";

const SKILL_LABELS = { damage: "Daño", range: "Alcance", fireRate: "Vel. disparo" };

export function renderUpgradePanel(container, tower, { onUpgrade, onRepair, onSell }) {
  if (!tower) {
    container.classList.add("hidden");
    container.innerHTML = "";
    return;
  }
  container.classList.remove("hidden");
  container.innerHTML = "";

  for (const skill of Object.keys(UPGRADE_DEFS)) {
    const col = document.createElement("div");
    col.className = "upgrade-col";
    const level = tower.level[skill];
    const maxed = !canUpgrade(tower, skill);
    const cost = maxed ? "-" : upgradeCost(skill, level);
    col.innerHTML = `<div>${SKILL_LABELS[skill]}</div><div>Nv. ${level}/${UPGRADE_DEFS[skill].levels}</div><div>$${cost}</div>`;
    const btn = document.createElement("button");
    btn.textContent = maxed ? "Máx" : "Mejorar";
    btn.disabled = maxed;
    btn.addEventListener("click", () => onUpgrade(skill));
    col.appendChild(btn);
    container.appendChild(col);
  }

  const repairBtn = document.createElement("button");
  repairBtn.textContent = "Reparar";
  repairBtn.addEventListener("click", onRepair);
  container.appendChild(repairBtn);

  const sellBtn = document.createElement("button");
  sellBtn.textContent = "Vender";
  sellBtn.addEventListener("click", onSell);
  container.appendChild(sellBtn);
}
```

- [ ] **Step 7: Wire selection + upgrades into main.js**

Add to the imports:
```js
import { TOWER_TYPES, damageTower } from "./tower.js";
import { applyUpgrade, upgradeCost, canUpgrade } from "./upgrades.js";
import { renderUpgradePanel } from "./ui.js";
```
(merge with existing `tower.js`/`ui.js` import lines rather than duplicating them)

Add new state near `let selectedBuildType = null;`:
```js
let selectedTower = null;
const upgradePanelEl = document.getElementById("upgrade-panel");
```

Change the canvas `click` handler: keep the existing build-placement branch, and add an else-branch that selects a tower when not in build mode. Replace the whole handler with:
```js
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
  selectedTower = towers.find((t) => Math.hypot(t.x - pos.x, t.y - pos.y) < 20) || null;
});
```

At the end of `loop`, replace `updateBuildMenu(buildMenuEl, { towers, economy, selectedType: selectedBuildType });` with:
```js
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
```

Highlight the selected tower — in `drawTower`, add a ring when it matches `selectedTower`. Change the `drawTower` signature and its call site:
```js
function drawTower(t) {
  ctx.save();
  ctx.translate(t.x, t.y);
  ctx.rotate(t.angle);
  ctx.fillStyle = t.type === "laser" ? "#8a6a3a" : t.type === "double" ? "#888" : "#6b7a4a";
  ctx.fillRect(-14, -10, 28, 20);
  ctx.fillRect(0, -3, 22, 6);
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
```

- [ ] **Step 8: Verify in the browser**

Reload. Place a tower, click it (with no build type selected) to select it — confirm a range ring appears and the upgrade panel shows 3 columns with level/cost. Click "Mejorar" on Daño a few times — confirm money drops, the level counter increases, and the button disables at level 5/5. Damage a tower (let an enemy shoot it) then click "Reparar" — confirm HP restores and money drops accordingly. Click "Vender" — confirm the tower disappears and the panel hides.

- [ ] **Step 9: Commit**

```bash
cd "Projects/JUEGO CAÑONES"
git add game/js/upgrades.js game/js/upgrades.test.js game/js/ui.js game/js/main.js game/index.html game/style.css
git commit -m "feat: per-tower upgrade tree with selection panel, repair and sell"
```

---

### Task 10: Real sprites, explosion effect, and visual upgrade tiers

**Files:**
- Modify: `game/js/main.js`

**Interfaces:**
- Consumes: `game/assets/*.png` from Task 1.

- [ ] **Step 1: Load sprite images**

In `game/js/main.js`, replace the single `mapImage` block with:
```js
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
```

- [ ] **Step 2: Draw real sprites instead of placeholder shapes**

Replace the body of `drawEnemy` (keep the health-bar lines as-is) — change only the shape-drawing part:
```js
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

  const w = 24;
  const pct = e.hp / e.maxHp;
  ctx.fillStyle = "#400";
  ctx.fillRect(e.x - w / 2, e.y - 20, w, 4);
  ctx.fillStyle = "#e33";
  ctx.fillRect(e.x - w / 2, e.y - 20, w * pct, 4);
}
```

Replace the shape-drawing part of `drawTower` (keep the range ring / health / ammo bar lines as-is):
```js
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
  // ...(keep the existing range-ring / health-bar / ammo-bar code below unchanged)
```

- [ ] **Step 3: Add explosion effects on enemy death**

Add new state near `let projectiles = [];`:
```js
let explosions = [];
```

Change the kill-detection block (from Task 6, the `killedEnemies` block) to also spawn an explosion per kill:
```js
    const killedEnemies = enemies.filter((e) => !e.alive);
    for (const e of killedEnemies) {
      earn(economy, e.bounty);
      explosions.push({ x: e.x, y: e.y, age: 0, duration: 0.4 });
    }
    enemies = enemies.filter((e) => e.alive);
```

After `projectiles = projectiles.filter((p) => p.alive);`, add:
```js
    for (const ex of explosions) ex.age += dt;
    explosions = explosions.filter((ex) => ex.age < ex.duration);
```

Add a draw function and call it after `for (const p of projectiles) drawProjectile(p);`:
```js
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
```
and add `for (const ex of explosions) drawExplosion(ex);` to the draw calls in `loop`.

- [ ] **Step 4: Verify in the browser**

Reload. Confirm: towers and enemies render as the real cropped sprites (not colored circles/rectangles) once assets load; killing an enemy shows a fading, growing explosion at its death position; a tower with any upgrade level shows a soft gold halo behind its sprite, more intense the more levels it has; a tower that has taken enemy fire shows a darkening overlay on its sprite proportional to lost HP (and money increases correctly on each kill — this also re-verifies the Task 6 bounty-payout fix).

- [ ] **Step 5: Commit**

```bash
cd "Projects/JUEGO CAÑONES"
git add game/js/main.js
git commit -m "feat: real sprites, death explosions, and visual upgrade tiers"
```

---

### Task 11: Win/lose screens and restart

**Files:**
- Modify: `game/js/main.js`

**Interfaces:**
- Consumes: `WAVES` from `waves.js`, `economy` state, `gameOver` flag (all already present from Task 4).

- [ ] **Step 1: Add a win condition and restart control**

Add new state near `let gameOver = false;`:
```js
let win = false;
```

In `nextWaveIfDone`, change it to detect completing the final wave:
```js
function nextWaveIfDone() {
  if (spawnQueue.length === 0 && enemies.length === 0) {
    if (waveIndex < WAVES.length - 1) {
      waveIndex++;
      economy.wave = waveIndex + 1;
      spawnQueue = buildSpawnQueue(waveIndex);
      waveClock = 0;
    } else if (!win) {
      win = true;
    }
  }
}
```

Guard the whole simulation block (spawn/step/collision) so it also stops on win — change `if (!gameOver) {` to `if (!gameOver && !win) {`.

Update `drawHud` to show a win message and a restart hint:
```js
function drawHud() {
  ctx.save();
  ctx.fillStyle = "#fff";
  ctx.font = "20px sans-serif";
  ctx.fillText(`Oleada ${economy.wave}/${WAVES.length}`, 20, 30);
  ctx.fillText(`Vidas: ${economy.lives}`, 20, 55);
  ctx.fillText(`$${economy.money}`, 20, 80);
  if (gameOver || win) {
    ctx.font = "48px sans-serif";
    ctx.fillText(gameOver ? "GAME OVER" : "¡VICTORIA!", CANVAS_WIDTH / 2 - 150, CANVAS_HEIGHT / 2);
    ctx.font = "20px sans-serif";
    ctx.fillText("Pulsa R para reiniciar", CANVAS_WIDTH / 2 - 90, CANVAS_HEIGHT / 2 + 40);
  }
  ctx.restore();
}
```

Add a restart handler near the other event listeners:
```js
window.addEventListener("keydown", (evt) => {
  if (evt.key.toLowerCase() !== "r") return;
  if (!gameOver && !win) return;
  location.reload();
});
```

- [ ] **Step 2: Verify in the browser**

Reload. Force a loss (let enemies through) and confirm "GAME OVER" + restart hint appear, and pressing R reloads the page. Separately, to sanity-check the win path without playing all 10 waves, temporarily set `waveIndex = WAVES.length - 2` right after its declaration, reload, clear the last wave, confirm "¡VICTORIA!" appears — then remove that temporary line.

- [ ] **Step 3: Commit**

```bash
cd "Projects/JUEGO CAÑONES"
git add game/js/main.js
git commit -m "feat: win/lose screens with restart"
```

---

## Out of scope for this plan

Sound (Sistema D's "Guinda") is deliberately excluded: it needs licensed audio files, and downloading files requires the user's explicit approval per session policy. Once art/gameplay are verified fun, a follow-up task can add `<audio>` elements once the user supplies or approves specific sound files.
