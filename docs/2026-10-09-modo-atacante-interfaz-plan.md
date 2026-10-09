# Attack mode, plan B: controls, interface and drawing — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the attack mode playable in the browser: start it from the menu (map and difficulty), command the army Command & Conquer style (select, box, groups, right-click orders, stop), buy and upgrade units, see the round, money and base on the HUD, and fight through a grey fog of war — on top of plan A's core.

**Architecture:** Pure logic stays testable in Node: `selection.js` (picking units, boxes, groups, keys), the fog's look as pixel arrays (`fog.js`), and what each shop card, upgrade row, HUD line and end-screen row says (`attackUI.js`). Thin DOM/canvas layers use them: `attackUI.js` builds the shop and the unit upgrade panel like `ui.js` builds the build menu, `attackDraw.js` draws the fog and the attack marks, `attackControls.js` turns mouse and keyboard events into selections and orders. `main.js` only switches between the defence and attack versions of each of its pieces by `state.mode`; the defence game is untouched.

**Tech Stack:** Vanilla JS ES modules, Canvas 2D, DOM overlays, Node's test runner (`node --test` from `game/`), Pillow for one new icon. No new dependencies.

**Spec:** [docs/2026-10-09-modo-atacante-design.md](2026-10-09-modo-atacante-design.md) (§3.1, §3.10 drawing, §4, §5, §7). Plan A: [docs/2026-10-09-modo-atacante-nucleo-plan.md](2026-10-09-modo-atacante-nucleo-plan.md).

## Global Constraints

- The defence game must look and play exactly as before; the whole suite stays green.
- All text the player sees is in Spanish. Names: Soldado, Moto, Buggy, Tanque, Lanzacohetes; upgrades Daño, Alcance, Blindaje, Cadencia, Velocidad; difficulties Fácil, Normal, Difícil.
- Controls (spec §4): left click selects (clicking the ground lets go), left drag boxes, Shift + click/box adds or removes, double click selects that type on screen; Ctrl + 1–9 and Alt + 1–9 keep a group, 1–9 picks it, twice within 0.5 s centres the camera on it; right click on the ground moves, on a known tower or wall attacks, on/near the base goes in; S stops; Esc lets go of the selection first, then opens the pause menu; camera by arrows, screen edges, middle-button drag, minimap and wheel — WASD don't pan in attack mode. Touch: a tap on a unit selects it, a tap elsewhere orders the selection there, a drag pans.
- Interface (spec §5): the shop takes the build menu's place (click buys 1, Shift + click 5, greyed when unaffordable or at the cap); entry flags on the map and minimap, click one to make it the active entry; an upgrade panel for the selected types (a tab per type); selected units get a green ring and their group number; a known tower's reach shows under the pointer; HUD: round n/15, time left, money, base lives, units n/60; «¡Al ataque!» in the place of «Iniciar oleada» during preparation.
- Fog (spec §3.10): never-seen ground black, seen-before ground grey with the towers and walls as last seen, in-sight ground normal; shots and blasts only where in sight; the base always marked; the minimap fogged too. The defence's live state is never drawn outside the army's sight.
- Menu (spec §3.1, §7): «Atacar» enabled → map → «Dificultad» (Fácil / Normal / Difícil); in the co-op game at home «Atacar» is greyed out with «Solo en partida individual, por ahora».
- Never touch the LAN server on port 8420. Browser checks on the static server at port 8421 (`localStorage` `td_settings` = `{"music":false,"effects":false}` there before clicking anything); close the browser tab after testing (music).
- Commit locally only.

## Rulings this plan takes where the spec leaves room

1. **Own units' health bars are green** in attack mode (they're the player's units now; the defence game keeps its red enemy bars).
2. **Right-click on the minimap orders the selection there**, as in Command & Conquer (the spec lists the minimap only for the camera; this adds, never removes).
3. **A remembered tower that has since been destroyed** can still be clicked: the order becomes a move to its spot (there's nothing left to attack).
4. **The «Velocidad» upgrade card gets a new hologram icon** made like the existing ammo icon (`tools/make_speed_icon.py`).

## Review Focus

1. **Selections holding destroyed units** (a group whose units died, a selection with dead units): never orders or highlights a dead unit, never throws — tests in Task 1 (groups) and the pruning in Task 4.
2. **Keys typed into a text field** (the end screen's name box) or while a menu is open: no group, stop or pan shortcuts fire — checked in Task 5's browser run.
3. **Switching between a defence and an attack game** (new game, load, quit to menu): the other mode's panels, selection, markers and fog never linger — checked in Task 5's browser run.
4. **The fog at every zoom and map size** (levels 1–4): no gaps at the map's edges, soft edges, nothing of the defence visible through black — checked in Task 5's browser run.
5. **Ctrl + number reserved by the browser** (tab switching): Alt + number does the same — test in Task 1 and checked in the browser.

---

## File Structure

```
game/
├── js/selection.js          (create) picking units, boxes, Shift, double click, groups, the attack mode's keys
├── js/selection.test.js     (create)
├── js/fog.js                (modify) fogPixels / greyPixels: the fog's look, one pixel per cell
├── js/fog.test.js           (modify)
├── js/attackUI.js           (create) shop, unit upgrade panel, HUD lines, end-screen summary
├── js/attackUI.test.js      (create) the pure parts
├── js/ui.js                 (modify) renderAttackEndScreen
├── js/menu.js               (modify) «Atacar», the difficulty screen, attack-aware texts
├── js/minimap.js            (modify) fog, own units, entry flags
├── js/attackDraw.js         (create) fog layer, rings, group numbers, flags, base mark, order marks, reach, box
├── js/attackControls.js     (create) mouse/keyboard/touch → selection and orders
├── js/main.js               (modify) switches every piece by mode
├── index.html               (modify) «Atacar», difficulty screen, #attack-shop, #unit-upgrade-panel
├── style.css                (modify) shop, unit upgrade panel, tabs
├── assets/ui_icon_speed.png (create) «Velocidad» card icon
tools/make_speed_icon.py     (create) makes it
```

Test command for every task: `node --test` from `game/`.

---

### Task 1: Picking units and keeping groups

**Files:**
- Create: `game/js/selection.js`, `game/js/selection.test.js`

**Interfaces:**
- Consumes: `FOOTPRINT` (enemy.js: `[length, width]` per unit type). Units: `{ id, type, x, y, angle, alive }`.
- Produces: `unitAt(units, x, y) → unit | null`, `unitsInBox(units, x0, y0, x1, y1) → units`, `applyPick(selected: Set, picked: ids, { shift, box }) → Set`, `sameTypeInView(units, type, view: {x,y,w,h}) → ids`, `createGroups() → { assign(n, ids), members(n, units) → ids, groupOf(id) → n | null, clear() }`, `DOUBLE_PRESS` (0.5), `isDoublePress(last: {key, time} | null, key, now)`, `attackKey(evt: {code, key, ctrlKey, altKey, metaKey}) → { kind: "assign"|"select", n } | { kind: "stop" } | null`.

- [ ] **Step 1: Write the failing tests**

`game/js/selection.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { unitAt, unitsInBox, applyPick, sameTypeInView, createGroups, isDoublePress, attackKey, DOUBLE_PRESS } from "./selection.js";

const unit = (id, type, x, y, angle = 0) => ({ id, type, x, y, angle, alive: true });

test("a click picks the unit whose body is under it, the nearest if several", () => {
  const tank = unit(1, "tank", 100, 100); // 72 x 36, facing right
  const soldier = unit(2, "soldier", 160, 100);
  assert.equal(unitAt([tank, soldier], 130, 105), tank);
  assert.equal(unitAt([tank, soldier], 100, 130), null); // beside the tank, off its body
  assert.equal(unitAt([tank, soldier], 158, 102), soldier);
  assert.equal(unitAt([{ ...soldier, alive: false }], 160, 100), null);
  const turned = unit(3, "tank", 300, 300, Math.PI / 2); // facing down
  assert.equal(unitAt([turned], 300, 335), turned);
  assert.equal(unitAt([turned], 335, 300), null);
});

test("a box picks every unit inside it, drawn in any direction", () => {
  const units = [unit(1, "soldier", 10, 10), unit(2, "buggy", 50, 50), unit(3, "tank", 200, 200)];
  assert.deepEqual(unitsInBox(units, 0, 0, 60, 60).map((u) => u.id), [1, 2]);
  assert.deepEqual(unitsInBox(units, 60, 60, 0, 0).map((u) => u.id), [1, 2]);
  assert.deepEqual(unitsInBox(units, 100, 100, 120, 120), []);
});

test("a pick replaces the selection; with Shift a click toggles a unit and a box adds -- or takes out a box of units already all selected", () => {
  const sel = new Set([1, 2]);
  assert.deepEqual([...applyPick(sel, [3])], [3]);
  assert.deepEqual([...applyPick(sel, [])], []);
  assert.deepEqual([...applyPick(sel, [3], { shift: true })].sort(), [1, 2, 3]);
  assert.deepEqual([...applyPick(sel, [2], { shift: true })], [1]);
  assert.deepEqual([...applyPick(sel, [2, 3], { shift: true, box: true })].sort(), [1, 2, 3]);
  assert.deepEqual([...applyPick(sel, [1, 2], { shift: true, box: true })], []);
  assert.deepEqual([...sel].sort(), [1, 2]); // the old selection is left as it was
});

test("a double click picks every unit of that type in view", () => {
  const units = [unit(1, "buggy", 10, 10), unit(2, "buggy", 500, 10), unit(3, "tank", 20, 20), unit(4, "buggy", 90, 90)];
  assert.deepEqual(sameTypeInView(units, "buggy", { x: 0, y: 0, w: 100, h: 100 }), [1, 4]);
});

test("groups: a unit is in one group at most, and the fallen drop out", () => {
  const g = createGroups();
  const units = [1, 2, 3, 4].map((id) => unit(id, "soldier", id * 10, 0));
  g.assign(1, [1, 2]);
  g.assign(2, [2, 3]);
  assert.deepEqual(g.members(1, units), [1]);
  assert.deepEqual(g.members(2, units), [2, 3]);
  assert.equal(g.groupOf(2), 2);
  assert.equal(g.groupOf(4), null);
  units[2].alive = false;
  assert.deepEqual(g.members(2, units), [2]);
  assert.deepEqual(g.members(5, units), []);
  g.clear();
  assert.deepEqual(g.members(1, units), []);
});

test("pressing a group's number twice in half a second is a double press", () => {
  assert.equal(DOUBLE_PRESS, 0.5);
  assert.equal(isDoublePress({ key: 3, time: 10 }, 3, 10.4), true);
  assert.equal(isDoublePress({ key: 3, time: 10 }, 3, 10.6), false);
  assert.equal(isDoublePress({ key: 2, time: 10 }, 3, 10.1), false);
  assert.equal(isDoublePress(null, 3, 10), false);
});

test("the attack mode's keys: Ctrl or Alt + 1-9 keep a group, 1-9 pick it, S stops", () => {
  assert.deepEqual(attackKey({ code: "Digit3", key: "3", ctrlKey: true }), { kind: "assign", n: 3 });
  assert.deepEqual(attackKey({ code: "Digit3", key: "|", altKey: true }), { kind: "assign", n: 3 });
  assert.deepEqual(attackKey({ code: "Digit7", key: "7" }), { kind: "select", n: 7 });
  assert.deepEqual(attackKey({ code: "Numpad7", key: "7" }), { kind: "select", n: 7 });
  assert.deepEqual(attackKey({ code: "KeyS", key: "s" }), { kind: "stop" });
  assert.deepEqual(attackKey({ code: "KeyS", key: "S", shiftKey: true }), { kind: "stop" });
  assert.equal(attackKey({ code: "KeyS", key: "s", ctrlKey: true }), null);
  assert.equal(attackKey({ code: "Digit0", key: "0" }), null);
  assert.equal(attackKey({ code: "KeyW", key: "w" }), null);
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `node --test js/selection.test.js`
Expected: FAIL — `Cannot find module .../js/selection.js`.

- [ ] **Step 3: Write `game/js/selection.js`**

```js
// Picking the army's units with the mouse, and the numbered groups, the
// Command & Conquer way (docs/2026-10-09-modo-atacante-design.md §4, per
// user request: «seleccionar al ejército con el ratón y hacer grupos
// pulsando Control + número»). Pure logic on lists of units and sets of
// ids; attackControls.js wires it to the mouse and the keyboard.
import { FOOTPRINT } from "./enemy.js";

// Extra px round a unit's body that still count as clicking it, so a small
// soldier isn't fiddly to pick.
const CLICK_SLACK = 6;

// The unit under (x, y), if any -- its body being a box as long and wide
// as the unit, turned the way it faces -- the nearest if several.
export function unitAt(units, x, y) {
  let best = null;
  let bestD = Infinity;
  for (const u of units) {
    if (!u.alive) continue;
    const [len, wid] = FOOTPRINT[u.type] || [30, 30];
    const dx = x - u.x;
    const dy = y - u.y;
    const c = Math.cos(u.angle || 0);
    const s = Math.sin(u.angle || 0);
    const along = dx * c + dy * s;
    const across = dy * c - dx * s;
    if (Math.abs(along) > len / 2 + CLICK_SLACK || Math.abs(across) > wid / 2 + CLICK_SLACK) continue;
    const d = Math.hypot(dx, dy);
    if (d < bestD) {
      best = u;
      bestD = d;
    }
  }
  return best;
}

// The units inside the box between two corners, in either order.
export function unitsInBox(units, x0, y0, x1, y1) {
  const left = Math.min(x0, x1);
  const right = Math.max(x0, x1);
  const top = Math.min(y0, y1);
  const bottom = Math.max(y0, y1);
  return units.filter((u) => u.alive && u.x >= left && u.x <= right && u.y >= top && u.y <= bottom);
}

// The selection after a click or a box picked `picked` (ids): on its own
// it replaces the selection; with Shift a click toggles its unit, and a box
// adds its units -- or takes them out, if they were all selected already.
// A new set; `selected` is left as it was.
export function applyPick(selected, picked, { shift = false, box = false } = {}) {
  if (!shift) return new Set(picked);
  const next = new Set(selected);
  if (!box) {
    for (const id of picked) {
      if (next.has(id)) next.delete(id);
      else next.add(id);
    }
    return next;
  }
  const allIn = picked.length > 0 && picked.every((id) => next.has(id));
  for (const id of picked) {
    if (allIn) next.delete(id);
    else next.add(id);
  }
  return next;
}

// A double click: every unit of that type in view ({ x, y, w, h }).
export function sameTypeInView(units, type, view) {
  return units
    .filter((u) => u.alive && u.type === type && u.x >= view.x && u.x <= view.x + view.w && u.y >= view.y && u.y <= view.y + view.h)
    .map((u) => u.id);
}

// The numbered groups: Ctrl/Alt + n keeps the selection as group n (a unit
// is in one group at most: put in another, it leaves the old one), n picks
// it again -- without the units destroyed since.
export function createGroups() {
  const groups = new Map();
  return {
    assign(n, ids) {
      for (const members of groups.values()) for (const id of ids) members.delete(id);
      groups.set(n, new Set(ids));
    },
    members(n, units) {
      const members = groups.get(n);
      if (!members) return [];
      const alive = new Set(units.filter((u) => u.alive).map((u) => u.id));
      for (const id of [...members]) if (!alive.has(id)) members.delete(id);
      return [...members];
    },
    groupOf(id) {
      for (const [n, members] of groups) if (members.has(id)) return n;
      return null;
    },
    clear() {
      groups.clear();
    },
  };
}

// A group's number pressed twice within this many seconds: the camera
// goes to the group.
export const DOUBLE_PRESS = 0.5;

export function isDoublePress(last, key, now) {
  return Boolean(last) && last.key === key && now - last.time <= DOUBLE_PRESS;
}

// What a key means in an attack: Ctrl (or Alt -- browsers keep Ctrl + a
// number for switching tabs) + 1-9 keeps the selection as that group, 1-9
// picks it, S stops; anything else is null. By the key's place (`code`),
// so Alt or Shift changing the character it types doesn't matter.
export function attackKey(evt) {
  const digit = /^(?:Digit|Numpad)([1-9])$/.exec(evt.code || "") || /^([1-9])$/.exec(evt.key || "");
  if (digit) {
    const n = Number(digit[1]);
    return evt.ctrlKey || evt.altKey || evt.metaKey ? { kind: "assign", n } : { kind: "select", n };
  }
  const isS = evt.code === "KeyS" || (evt.key || "").toLowerCase() === "s";
  if (isS && !evt.ctrlKey && !evt.altKey && !evt.metaKey) return { kind: "stop" };
  return null;
}
```

- [ ] **Step 4: Run the whole suite**

Run: `node --test`
Expected: PASS (7 new tests).

- [ ] **Step 5: Commit**

```bash
git add game/js/selection.js game/js/selection.test.js
git commit -m "Attack mode: picking units by click, box, Shift and double click, and numbered groups"
```

---

### Task 2: What the attack interface shows — fog pixels, shop, upgrade panel, HUD, end screen

**Files:**
- Modify: `game/js/fog.js`, `game/js/fog.test.js`, `game/js/ui.js`, `game/js/menu.js` (export `DIFFICULTY_NAMES`)
- Create: `game/js/attackUI.js`, `game/js/attackUI.test.js`, `tools/make_speed_icon.py`, `game/assets/ui_icon_speed.png`

**Interfaces:**
- Consumes: from attack.js `UNIT_ORDER`, `UNIT_PRICES`, `UNIT_UPGRADES`, `UNIT_CAP`, `ROUNDS`, `unitUpgradeCost`; the attack state (`state.attack.{phase, round, roundLeft, money, upgrades, queue, stats, difficulty, winner}`).
- Produces: fog.js `VEIL_ALPHA` (150), `fogPixels(fog, out?) → Uint8ClampedArray`, `greyPixels(fog, out?) → Uint8ClampedArray`; attackUI.js `UNIT_NAMES`, `SKILL_NAMES`, `shopEntry(state, type) → { label, stars, disabled, title }`, `upgradeRows(state, type) → [{ skill, name, level, levels, cost, maxed, affordable }]`, `attackHudLines(state) → [4 strings]`, `attackSummary(state) → { title, subtitle, rows: [[label, value]] }`, `initShop(container, { onBuy(type, count) })`, `updateShop(container, state)`, `initUnitUpgrades(container, { onUpgrade(skill), onTab(type) })`, `updateUnitUpgrades(container, state, types, active)`; ui.js `renderAttackEndScreen(overlay, summary)`; menu.js `DIFFICULTY_NAMES`.

- [ ] **Step 1: Write the failing tests**

Append to `game/js/fog.test.js` (and add `fogPixels, greyPixels, VEIL_ALPHA` to its import from `./fog.js`):

```js
test("the fog's look, a pixel per cell: black where never seen, a veil where seen before, clear in sight", () => {
  const fog = createFog(96, 32); // three cells in a row
  fog.explored[0] = 1;
  fog.visible[0] = 1;
  fog.explored[1] = 1;
  const veil = fogPixels(fog);
  assert.deepEqual([veil[3], veil[7], veil[11]], [0, VEIL_ALPHA, 255]);
  const grey = greyPixels(fog);
  assert.deepEqual([grey[3], grey[7], grey[11]], [0, 255, 0]);
  assert.deepEqual([grey[4], grey[5], grey[6]], [128, 128, 128]);
});
```

`game/js/attackUI.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { shopEntry, upgradeRows, attackHudLines, attackSummary, UNIT_NAMES, SKILL_NAMES } from "./attackUI.js";
import { createAttackState, buyUnits, upgradeUnitType, startAttack } from "./attack.js";

function empty(level = 2) {
  const s = createAttackState(level, "normal", { aiSetup: false });
  s.economy.money = 0;
  return s;
}

test("the units' and upgrades' names", () => {
  assert.deepEqual(Object.values(UNIT_NAMES), ["Soldado", "Moto", "Buggy", "Tanque", "Lanzacohetes"]);
  assert.deepEqual(Object.values(SKILL_NAMES), ["Daño", "Alcance", "Blindaje", "Cadencia", "Velocidad"]);
});

test("a shop card shows the price and the type's upgrades, greyed out without the money or at the cap", () => {
  const s = empty();
  assert.deepEqual(shopEntry(s, "tank"), { label: "Tanque $90", stars: 0, disabled: false, title: "Clic: comprar 1 · Mayús + clic: comprar 5" });
  s.attack.money = 50;
  assert.equal(shopEntry(s, "tank").disabled, true);
  assert.equal(shopEntry(s, "tank").title, "No hay dinero suficiente");
  s.attack.money = 10000;
  upgradeUnitType(s, "tank", "armor");
  upgradeUnitType(s, "tank", "damage");
  assert.equal(shopEntry(s, "tank").stars, 2);
  buyUnits(s, "soldier", 60);
  assert.equal(shopEntry(s, "soldier").disabled, true);
  assert.equal(shopEntry(s, "soldier").title, "Tope de 60 unidades");
});

test("the upgrade rows: level, next level's price, maxed and affordable", () => {
  const s = empty();
  s.attack.money = 100;
  const rows = upgradeRows(s, "buggy");
  assert.deepEqual(rows.map((r) => r.skill), ["damage", "range", "armor", "rate", "speed"]);
  assert.deepEqual(rows[0], { skill: "damage", name: "Daño", level: 0, levels: 5, cost: 60, maxed: false, affordable: true });
  s.attack.upgrades.buggy.range = 5;
  s.attack.upgrades.buggy.armor = 2;
  const later = upgradeRows(s, "buggy");
  assert.equal(later[1].maxed, true);
  assert.equal(later[1].cost, null);
  assert.equal(later[1].affordable, false);
  assert.equal(later[2].cost, 180);
  assert.equal(later[2].affordable, false);
});

test("the HUD: the round and its clock (or the preparation), the base's lives, the money, the army", () => {
  const s = empty(3);
  buyUnits(s, "soldier", 2);
  assert.deepEqual(attackHudLines(s), ["Nivel 3 · Preparación", "Base: ❤ 20", "$120", "Unidades 2/60"]);
  startAttack(s);
  buyUnits(s, "soldier");
  s.attack.round = 4;
  s.attack.roundLeft = 42.3;
  s.attack.money = 87.5;
  assert.deepEqual(attackHudLines(s), ["Nivel 3 · Ronda 4/15 · 0:43", "Base: ❤ 20", "$87", "Unidades 3/60"]);
});

test("the end screen says who won and how it went", () => {
  const s = empty();
  s.attack.winner = "attacker";
  s.attack.round = 9;
  s.attack.stats.livesTaken = 20;
  s.attack.stats.moneySpent = 1234.5;
  s.stats.towersLost = 7;
  s.stats.kills.soldier = 30;
  s.stats.kills.tank = 2;
  assert.deepEqual(attackSummary(s), {
    title: "¡BASE DESTRUIDA!",
    subtitle: "Has ganado",
    rows: [
      ["Ronda alcanzada", "9/15"],
      ["Vidas quitadas a la base", "20"],
      ["Torres destruidas", "7"],
      ["Unidades perdidas", "32"],
      ["Dinero gastado", "$1235"],
      ["Dificultad", "Normal"],
    ],
  });
  s.attack.winner = "defense";
  assert.equal(attackSummary(s).title, "LA BASE HA RESISTIDO");
  assert.equal(attackSummary(s).subtitle, "Has perdido");
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `node --test js/fog.test.js js/attackUI.test.js`
Expected: FAIL — `fogPixels` not exported by fog.js; `Cannot find module .../js/attackUI.js`.

- [ ] **Step 3: The fog's look in `game/js/fog.js`**

Append:

```js
// How the fog looks, one pixel per cell (RGBA, cols x rows, row by row):
// never seen, black; seen before, a dark veil (VEIL_ALPHA); in sight,
// clear. attackDraw.js stretches it over the map, which softens the
// cells' edges into fog.
export const VEIL_ALPHA = 150;

export function fogPixels(fog, out = new Uint8ClampedArray(fog.cols * fog.rows * 4)) {
  for (let i = 0; i < fog.cols * fog.rows; i++) {
    out[i * 4] = 6;
    out[i * 4 + 1] = 8;
    out[i * 4 + 2] = 10;
    out[i * 4 + 3] = fog.visible[i] ? 0 : fog.explored[i] ? VEIL_ALPHA : 255;
  }
  return out;
}

// The grey areas (seen before, not in sight now) as an opaque mid-grey
// mask, the rest clear: drawn with the "saturation" blend, it takes the
// colour out of them -- the design's grey fog.
export function greyPixels(fog, out = new Uint8ClampedArray(fog.cols * fog.rows * 4)) {
  for (let i = 0; i < fog.cols * fog.rows; i++) {
    out[i * 4] = 128;
    out[i * 4 + 1] = 128;
    out[i * 4 + 2] = 128;
    out[i * 4 + 3] = !fog.visible[i] && fog.explored[i] ? 255 : 0;
  }
  return out;
}
```

- [ ] **Step 4: Export the difficulty names from `game/js/menu.js`**

`const DIFFICULTY_NAMES = { easy: "Fácil", normal: "Normal", hard: "Difícil" };` becomes `export const DIFFICULTY_NAMES = { easy: "Fácil", normal: "Normal", hard: "Difícil" };`.

- [ ] **Step 5: Write `game/js/attackUI.js`**

```js
// The attack mode's interface (docs/2026-10-09-modo-atacante-design.md §5):
// the shop of units, the upgrade panel of the selected units' types, the
// HUD's lines and the end screen's summary. What each card, row and line
// says is worked out from the game state by pure functions (tested
// without a page); the panels are built once and refreshed every frame,
// like ui.js's build menu and towers' upgrade panel, whose look they share.
import { UNIT_ORDER, UNIT_PRICES, UNIT_UPGRADES, UNIT_CAP, ROUNDS, unitUpgradeCost } from "./attack.js";
import { DIFFICULTY_NAMES } from "./menu.js";

export const UNIT_NAMES = { soldier: "Soldado", motorcycle: "Moto", buggy: "Buggy", tank: "Tanque", rocket: "Lanzacohetes" };
export const SKILL_NAMES = { damage: "Daño", range: "Alcance", armor: "Blindaje", rate: "Cadencia", speed: "Velocidad" };

const UNIT_ICON = {
  soldier: "assets/enemy_soldier.png",
  motorcycle: "assets/enemy_motorcycle.png",
  buggy: "assets/enemy_buggy.png",
  tank: "assets/enemy_tank.png",
  rocket: "assets/enemy_rocket.png",
};
const SKILL_ICON = {
  damage: "assets/ui_icon_damage.png",
  range: "assets/ui_icon_range.png",
  armor: "assets/ui_icon_armor.png",
  rate: "assets/ui_icon_firerate.png",
  speed: "assets/ui_icon_speed.png",
};

// The army's size, counting the units bought and still to come in.
const armySize = (state) => state.enemies.length + state.attack.queue.length;

// One shop card: its label, the type's upgrade levels in all (shown as
// stars), and whether it can be bought now -- with why not, for its tooltip.
export function shopEntry(state, type) {
  const a = state.attack;
  const price = UNIT_PRICES[type];
  const full = armySize(state) >= UNIT_CAP;
  const poor = a.money < price;
  return {
    label: `${UNIT_NAMES[type]} $${price}`,
    stars: Object.values(a.upgrades[type]).reduce((sum, level) => sum + level, 0),
    disabled: Boolean(state.gameOver) || full || poor,
    title: full ? `Tope de ${UNIT_CAP} unidades` : poor ? "No hay dinero suficiente" : "Clic: comprar 1 · Mayús + clic: comprar 5",
  };
}

// The upgrade panel's five rows for a unit type.
export function upgradeRows(state, type) {
  const levels = state.attack.upgrades[type];
  return Object.entries(UNIT_UPGRADES).map(([skill, def]) => {
    const level = levels[skill];
    const maxed = level >= def.levels;
    const cost = maxed ? null : unitUpgradeCost(skill, level);
    return {
      skill,
      name: SKILL_NAMES[skill],
      level,
      levels: def.levels,
      cost,
      maxed,
      affordable: !maxed && !state.gameOver && state.attack.money >= cost,
    };
  });
}

const clock = (seconds) => {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

// The HUD's lines: the round and the time left in it (or the preparation),
// the base's lives, the money and the army's size.
export function attackHudLines(state) {
  const a = state.attack;
  const head =
    a.phase === "prep" ? `Nivel ${state.level} · Preparación` : `Nivel ${state.level} · Ronda ${a.round}/${ROUNDS} · ${clock(a.roundLeft)}`;
  return [head, `Base: ❤ ${state.economy.lives}`, `$${Math.floor(a.money)}`, `Unidades ${armySize(state)}/${UNIT_CAP}`];
}

// What the end screen says about a finished attack (design §3.7).
export function attackSummary(state) {
  const a = state.attack;
  const won = a.winner === "attacker";
  const lost = Object.values(state.stats.kills).reduce((sum, n) => sum + n, 0);
  return {
    title: won ? "¡BASE DESTRUIDA!" : "LA BASE HA RESISTIDO",
    subtitle: won ? "Has ganado" : "Has perdido",
    rows: [
      ["Ronda alcanzada", `${a.round}/${ROUNDS}`],
      ["Vidas quitadas a la base", String(a.stats.livesTaken)],
      ["Torres destruidas", String(state.stats.towersLost)],
      ["Unidades perdidas", String(lost)],
      ["Dinero gastado", `$${Math.round(a.stats.moneySpent)}`],
      ["Dificultad", DIFFICULTY_NAMES[a.difficulty] || DIFFICULTY_NAMES.normal],
    ],
  };
}

// The shop, built once in `container` (it takes the build menu's place).
// A click buys one unit, Shift + click five.
export function initShop(container, { onBuy }) {
  container.innerHTML = "";
  const title = document.createElement("div");
  title.className = "shop-title";
  title.textContent = "Ejército";
  const list = document.createElement("div");
  list.className = "build-towers-section";
  const refs = {};
  for (const type of UNIT_ORDER) {
    const btn = document.createElement("button");
    btn.className = "build-btn shop-btn";
    btn.style.backgroundImage = `url(${UNIT_ICON[type]})`;
    const label = document.createElement("span");
    label.className = "build-btn-label";
    btn.appendChild(label);
    btn.addEventListener("click", (evt) => onBuy(type, evt.shiftKey ? 5 : 1));
    list.appendChild(btn);
    refs[type] = { btn, label };
  }
  container.append(title, list);
  container._shopRefs = refs;
}

// Every frame: prices, upgrade stars and which cards can be bought.
export function updateShop(container, state) {
  for (const type of UNIT_ORDER) {
    const { btn, label } = container._shopRefs[type];
    const entry = shopEntry(state, type);
    btn.disabled = entry.disabled;
    btn.title = entry.title;
    label.textContent = entry.stars ? `${entry.label} ★${entry.stars}` : entry.label;
  }
}

// The upgrade panel of the selected units' types, built once: a tab per
// type, and the five upgrades of the active one laid out like the towers'.
export function initUnitUpgrades(container, { onUpgrade, onTab }) {
  container.innerHTML = "";
  const tabs = document.createElement("div");
  tabs.className = "unit-tabs";
  const tabRefs = {};
  for (const type of UNIT_ORDER) {
    const tab = document.createElement("button");
    tab.className = "unit-tab";
    tab.textContent = UNIT_NAMES[type];
    tab.addEventListener("click", () => onTab(type));
    tabs.appendChild(tab);
    tabRefs[type] = tab;
  }
  const cols = document.createElement("div");
  cols.className = "unit-upgrade-cols";
  const colRefs = {};
  for (const skill of Object.keys(UNIT_UPGRADES)) {
    const col = document.createElement("div");
    col.className = "upgrade-col";
    const label = document.createElement("div");
    label.className = "upgrade-label";
    label.textContent = SKILL_NAMES[skill];
    const card = document.createElement("div");
    card.className = "upgrade-card";
    card.style.backgroundImage = `url(${SKILL_ICON[skill]})`;
    const stats = document.createElement("div");
    stats.className = "upgrade-stats";
    const levelEl = document.createElement("span");
    levelEl.className = "upgrade-level";
    const costEl = document.createElement("span");
    costEl.className = "upgrade-cost";
    stats.append(levelEl, costEl);
    const pips = document.createElement("div");
    pips.className = "upgrade-pips";
    const pipEls = [];
    for (let i = 0; i < UNIT_UPGRADES[skill].levels; i++) {
      const pip = document.createElement("span");
      pip.className = "upgrade-pip";
      pips.appendChild(pip);
      pipEls.push(pip);
    }
    card.append(stats, pips);
    const btn = document.createElement("button");
    btn.className = "upgrade-btn";
    btn.addEventListener("click", () => onUpgrade(skill));
    col.append(label, card, btn);
    cols.appendChild(col);
    colRefs[skill] = { levelEl, costEl, btn, pipEls };
  }
  container.append(tabs, cols);
  container._unitUpgradeRefs = { tabRefs, colRefs };
}

// Every frame. `types`: the unit types in the selection (none: the panel
// hides); `active`: the one whose upgrades show.
export function updateUnitUpgrades(container, state, types, active) {
  container.classList.toggle("hidden", !types.length || !active);
  if (!types.length || !active) return;
  const { tabRefs, colRefs } = container._unitUpgradeRefs;
  for (const type of UNIT_ORDER) {
    tabRefs[type].classList.toggle("hidden", !types.includes(type));
    tabRefs[type].classList.toggle("active", type === active);
  }
  for (const row of upgradeRows(state, active)) {
    const { levelEl, costEl, btn, pipEls } = colRefs[row.skill];
    levelEl.textContent = `Nv. ${row.level}/${row.levels}`;
    costEl.textContent = row.maxed ? "-" : `$${row.cost}`;
    btn.textContent = row.maxed ? "Máx" : "Mejorar";
    btn.disabled = !row.affordable;
    pipEls.forEach((pip, i) => pip.classList.toggle("filled", i < row.level));
  }
}
```

- [ ] **Step 6: The attack's end screen in `game/js/ui.js`**

After `renderGameEndScreen` add:

```js
// An attack's end screen (attackUI.js's attackSummary): who won and how it
// went. The attack mode has no score or ranking yet (design §3.7), so those
// sections stay hidden -- renderGameEndScreen shows them again for the next
// defence game.
export function renderAttackEndScreen(overlay, summary) {
  overlay.querySelector("#gameend-title").textContent = summary.title;
  for (const id of ["#gameend-save-row", "#gameend-save-status", "#gameend-ranking-title", "#gameend-ranking"]) {
    overlay.querySelector(id).classList.add("hidden");
  }
  const table = overlay.querySelector("#gameend-breakdown");
  table.innerHTML = "";
  for (const [label, value] of summary.rows) {
    const tr = document.createElement("tr");
    tr.className = "gameend-info-row";
    tr.append(scoreCell(label), scoreCell(value));
    table.appendChild(tr);
  }
  overlay.querySelector("#gameend-total").textContent = summary.subtitle;
}
```

- [ ] **Step 7: The «Velocidad» icon**

`tools/make_speed_icon.py`:

```python
# Makes game/assets/ui_icon_speed.png -- the unit upgrade panel's
# «Velocidad» card -- in the style of the other ui_icon_*.png hologram
# cards: ui_icon_ammo.png's dark panel with its art painted out, and cyan
# chevrons, motion streaks and a small speedometer drawn in with a glow.
# Usage: python tools/make_speed_icon.py game/assets/ui_icon_ammo.png game/assets/ui_icon_speed.png
import sys
from PIL import Image, ImageDraw, ImageFilter

src, out = sys.argv[1], sys.argv[2]
base = Image.open(src).convert("RGB")
W, H = base.size
# The panel's own background, from an empty strip (darkened: the strip is
# lit a little by the old art's glow), painted over the old art...
bg = tuple(int(c * 0.55) for c in base.crop((8, H - 30, 60, H - 8)).resize((1, 1), Image.BOX).getpixel((0, 0)))
panel = base.copy()
ImageDraw.Draw(panel).rectangle([10, 10, W - 12, H - 12], fill=bg)
# ...keeping a little of the panel's vignette from a blurred copy.
soft = base.filter(ImageFilter.GaussianBlur(40))
mask = Image.new("L", (W, H), 0)
ImageDraw.Draw(mask).rectangle([10, 10, W - 12, H - 12], fill=255)
panel = Image.composite(Image.blend(panel, soft, 0.2), base, mask)

art = Image.new("RGBA", (W, H), (0, 0, 0, 0))
d = ImageDraw.Draw(art)
cyan = (150, 235, 245, 255)
for i, x in enumerate((70, 115, 160)):  # three chevrons, brighter to the right
    d.line([(x, 50), (x + 38, 90), (x, 130)], fill=(150, 235, 245, 120 + 60 * i), width=9, joint="curve")
for y, x0 in ((70, 22), (90, 10), (110, 22)):  # motion streaks behind them
    d.line([(x0, y), (x0 + 38, y)], fill=(150, 235, 245, 110), width=4)
cx, cy, r = W - 55, 52, 26  # a speedometer badge, like the other cards' corner badges
d.arc([cx - r, cy - r, cx + r, cy + r], 150, 390, fill=cyan, width=4)
d.line([(cx, cy), (cx + 16, cy - 14)], fill=cyan, width=4)

glow = art.filter(ImageFilter.GaussianBlur(6))
img = panel.convert("RGBA")
img.alpha_composite(glow)
img.alpha_composite(glow)
img.alpha_composite(art)
img.convert("RGB").save(out)
print("wrote", out, img.size)
```

Run (from the repo root): `python tools/make_speed_icon.py game/assets/ui_icon_ammo.png game/assets/ui_icon_speed.png`
Expected: `wrote game/assets/ui_icon_speed.png (349, 181)`.

- [ ] **Step 8: Run the whole suite**

Run: `node --test`
Expected: PASS (6 new tests).

- [ ] **Step 9: Commit**

```bash
git add game/js/fog.js game/js/fog.test.js game/js/attackUI.js game/js/attackUI.test.js game/js/ui.js game/js/menu.js tools/make_speed_icon.py game/assets/ui_icon_speed.png
git commit -m "Attack mode interface pieces: the fog's look, the shop, the unit upgrade panel, the HUD and the end screen"
```

---

### Task 3: The menu — «Atacar», the map, the difficulty

**Files:**
- Modify: `game/index.html`, `game/js/menu.js`

**Interfaces:**
- Produces: `handlers.onNewGame(level, options)` — `options` is `{ mode: "attack", difficulty: "easy"|"normal"|"hard" }` for an attack, `undefined` for a defence game; new handler `handlers.attacking()` (the game behind the menu is an attack) for the texts that differ.
- Consumes: `handlers.networked` (co-op at home: «Atacar» greyed out).

No Node test can drive the menu (it's DOM); Task 5's browser run checks the whole flow. The steps below are exact edits.

- [ ] **Step 1: `game/index.html` — the mode choice and the difficulty screen**

Replace the mode screen's two choices:

```html
              <button class="menu-choice" data-go="levels">
                <span class="menu-choice-name">Defender</span>
                <span class="menu-choice-desc">Construye torres y protege la base</span>
              </button>
              <button class="menu-choice" disabled>
                <span class="menu-choice-name">Atacar</span>
                <span class="menu-choice-desc">Próximamente</span>
              </button>
```

with:

```html
              <button class="menu-choice" data-mode="defense">
                <span class="menu-choice-name">Defender</span>
                <span class="menu-choice-desc">Construye torres y protege la base</span>
              </button>
              <button class="menu-choice" data-mode="attack">
                <span class="menu-choice-name">Atacar</span>
                <span class="menu-choice-desc">Forma un ejército y rompe la base</span>
              </button>
```

and right after the levels screen's closing `</div>` (the one after its `<button class="menu-back">Volver</button>`), add:

```html
          <div class="menu-screen hidden" data-screen="difficulty">
            <div class="menu-subtitle">Dificultad de la defensa</div>
            <div class="menu-choices">
              <button class="menu-choice" data-difficulty="easy">
                <span class="menu-choice-name">Fácil</span>
                <span class="menu-choice-desc">Poco dinero para torres</span>
              </button>
              <button class="menu-choice" data-difficulty="normal">
                <span class="menu-choice-name">Normal</span>
                <span class="menu-choice-desc">Una defensa equilibrada</span>
              </button>
              <button class="menu-choice" data-difficulty="hard">
                <span class="menu-choice-name">Difícil</span>
                <span class="menu-choice-desc">Más dinero, elige mejor y levanta muros</span>
              </button>
            </div>
            <button class="menu-back">Volver</button>
          </div>
```

Also, in `#game-container` right after `<div id="upgrade-panel" class="hidden"></div>` add `<div id="unit-upgrade-panel" class="hidden"></div>`, and right after `<div id="build-menu"></div>` add `<div id="attack-shop" class="hidden"></div>`.

- [ ] **Step 2: `game/js/menu.js` — the attack's way through the menu**

1. In the header comment's handler list, change `//   onContinue(), onNewGame(level), onLoad(slot), onSave(slot),` to:

```js
//   attacking()         -- the game behind the menu is an attack
//   onContinue(), onNewGame(level, options), onLoad(slot), onSave(slot),
//     (options: { mode: "attack", difficulty } for an attack)
```

2. After `let answerConfirm = null;` add:

```js
  // «¿Cómo quieres jugar?» -> map -> (attacking:) difficulty: what's been
  // picked on the way.
  let chosenMode = "defense";
  let chosenLevel = null;
```

3. In `show`, after `else if (name === "multiplayer") renderMultiplayer();` add:

```js
    else if (name === "mode") renderMode();
    else if (name === "levels") renderLevels();
```

4. After `renderMultiplayer` add:

```js
  // The attack mode is solo only for now (design §7).
  function renderMode() {
    const attack = root.querySelector('[data-mode="attack"]');
    attack.disabled = Boolean(handlers.networked);
    attack.querySelector(".menu-choice-desc").textContent = handlers.networked
      ? "Solo en partida individual, por ahora"
      : "Forma un ejército y rompe la base";
  }

  function renderLevels() {
    root.querySelector('[data-screen="levels"] .menu-subtitle').textContent =
      chosenMode === "attack" ? "Elige el mapa que atacarás" : "Elige nivel";
  }
```

5. `chooseLevel` takes the options and passes them on: `async function chooseLevel(level) {` → `async function chooseLevel(level, options) {`, and its last line `handlers.onNewGame(level);` → `handlers.onNewGame(level, options);`.

6. In `renderSlots`, the mid-game note:

```js
    else if (mode === "save" && !handlers.canSaveNow()) note.textContent = "Estás en mitad de una oleada: se guardará al terminarla.";
```

becomes:

```js
    else if (mode === "save" && !handlers.canSaveNow()) {
      note.textContent = handlers.attacking()
        ? "Estás en mitad de una ronda: se guardará al empezar la siguiente."
        : "Estás en mitad de una oleada: se guardará al terminarla.";
    }
```

7. In `quitToMain`, the question:

```js
      if (!(await confirm("Lo jugado se conserva hasta la última oleada terminada. ¿Salir al menú principal?"))) return;
```

becomes:

```js
      const kept = handlers.attacking() ? "hasta el comienzo de la última ronda" : "hasta la última oleada terminada";
      if (!(await confirm(`Lo jugado se conserva ${kept}. ¿Salir al menú principal?`))) return;
```

8. In the click handler, replace:

```js
    const levelBtn = target.closest(".start-level-btn");
    if (levelBtn) return chooseLevel(Number(levelBtn.dataset.level));
```

with:

```js
    const modeBtn = target.closest("[data-mode]");
    if (modeBtn) {
      chosenMode = modeBtn.dataset.mode;
      return show("levels");
    }
    const levelBtn = target.closest(".start-level-btn");
    if (levelBtn) {
      const level = Number(levelBtn.dataset.level);
      if (chosenMode !== "attack") return chooseLevel(level);
      chosenLevel = level;
      return show("difficulty");
    }
    const difficultyBtn = target.closest("[data-difficulty]");
    if (difficultyBtn) return chooseLevel(chosenLevel, { mode: "attack", difficulty: difficultyBtn.dataset.difficulty });
```

- [ ] **Step 3: Run the whole suite**

Run: `node --test`
Expected: PASS (nothing in Node imports the menu's DOM code; `describeSave` still green).

- [ ] **Step 4: Commit**

```bash
git add game/index.html game/js/menu.js
git commit -m "Menu: «Atacar» leads to the map and the defence's difficulty (solo only)"
```

---

### Task 4: Drawing the attack, and commanding it with mouse and keyboard

**Files:**
- Create: `game/js/attackDraw.js`, `game/js/attackControls.js`
- Modify: `game/js/minimap.js`

**Interfaces:**
- Consumes: `FOG_CELL`, `fogPixels`, `greyPixels`, `knownStructure` (fog.js); `FOOTPRINT` (enemy.js); Task 1's selection.js; `orderMove`, `orderAttack`, `orderStop`, `setEntry` (attack.js).
- Produces:
  - attackDraw.js: `MARKER_TIME` (0.8 s), `createFogLayer() → { draw(ctx, fog), canvas() }`, `drawSelectionRing(ctx, unit)`, `drawGroupNumber(ctx, unit, n, s)`, `drawEntryFlags(ctx, entries, active, s)`, `drawBaseMarker(ctx, base, time, s)`, `drawOrderMarkers(ctx, markers, now)`, `drawRange(ctx, x, y, r)`, `drawSelectionBox(ctx, box)` — `s` is world px per screen px (1 / zoom), so marks keep their size on screen.
  - attackControls.js: `createAttackControls(env) → { selected(), selectedIds(), groupOf(id), box(), markers(), hoverWorld(), reset(), pointerDown(evt), pointerMove(evt), pointerUp(evt), pointerLeave(), orderAt(point), keyDown(evt) → handled?, escape() → handled?, update(dt) }` where `env = { getState, worldAt(evt), canvasAt(evt), view(), canvasSize: {w, h}, clientToCanvas(), panCanvas(dx, dy), centerOn(point), entries(), now(), onRefused() }`.
  - minimap.js: `drawMinimap(ctx, rect, { ..., units = [], fog = null, entries = [], activeEntry = -1 })` — own units green, the fog drawn over the map, entry flags.

These are canvas and DOM event code, checked in Task 5's browser run (their decisions come from Task 1's tested selection.js and plan A's tested orders).

- [ ] **Step 1: Write `game/js/attackDraw.js`**

```js
// Drawing what only the attack mode has (docs/2026-10-09-modo-atacante-
// design.md §3.10, §5): the fog, the selected units' rings and group
// numbers, the entries' flags, the base's mark, where orders were given, a
// tower's reach and the box being dragged. `s` arguments are world px per
// screen px (1 / zoom): marks and labels drawn at s keep their size on
// screen however far the map is zoomed.
import { FOG_CELL, fogPixels, greyPixels } from "./fog.js";
import { FOOTPRINT } from "./enemy.js";

// How long an order's mark stays on the map, in seconds.
export const MARKER_TIME = 0.8;

// The fog over the map: two tiny canvases, one pixel per fog cell,
// stretched over the world -- the stretching blurs the cells' edges into
// soft fog. The first takes the colour out of the grey areas ("saturation"
// blend), the second darkens them and blacks out what's never been seen.
export function createFogLayer() {
  let veil = null;
  let grey = null;
  let veilImage = null;
  let greyImage = null;
  const make = (w, h) => Object.assign(document.createElement("canvas"), { width: w, height: h });
  return {
    draw(ctx, fog) {
      if (!veil || veil.width !== fog.cols || veil.height !== fog.rows) {
        veil = make(fog.cols, fog.rows);
        grey = make(fog.cols, fog.rows);
        veilImage = veil.getContext("2d").createImageData(fog.cols, fog.rows);
        greyImage = grey.getContext("2d").createImageData(fog.cols, fog.rows);
      }
      fogPixels(fog, veilImage.data);
      greyPixels(fog, greyImage.data);
      veil.getContext("2d").putImageData(veilImage, 0, 0);
      grey.getContext("2d").putImageData(greyImage, 0, 0);
      const w = fog.cols * FOG_CELL;
      const h = fog.rows * FOG_CELL;
      ctx.save();
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.globalCompositeOperation = "saturation";
      ctx.drawImage(grey, 0, 0, w, h);
      ctx.globalCompositeOperation = "source-over";
      ctx.drawImage(veil, 0, 0, w, h);
      ctx.restore();
    },
    // The fog as last drawn, one pixel per cell (the minimap shows it too).
    canvas: () => veil,
  };
}

// A selected unit's green ring, round its body however it's turned.
export function drawSelectionRing(ctx, u) {
  const [len, wid] = FOOTPRINT[u.type] || [30, 30];
  ctx.save();
  ctx.translate(u.x, u.y);
  ctx.rotate(u.angle || 0);
  ctx.strokeStyle = "rgba(93, 255, 122, 0.95)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(0, 0, len / 2 + 5, wid / 2 + 5, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

// A unit's group number, by its side.
export function drawGroupNumber(ctx, u, n, s) {
  ctx.save();
  ctx.font = `bold ${13 * s}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineWidth = 3 * s;
  ctx.strokeStyle = "rgba(0, 0, 0, 0.85)";
  ctx.fillStyle = "#c8ffd2";
  const x = u.x + 14 * s;
  const y = u.y + 14 * s;
  ctx.strokeText(String(n), x, y);
  ctx.fillText(String(n), x, y);
  ctx.restore();
}

// A flag on each entry of the map; the active one (where bought units
// come in) bigger, yellow and labelled.
export function drawEntryFlags(ctx, entries, active, s) {
  entries.forEach((e, i) => {
    const on = i === active;
    const h = (on ? 34 : 26) * s;
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.strokeStyle = "#1b1b1b";
    ctx.lineWidth = 3 * s;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -h);
    ctx.stroke();
    ctx.fillStyle = on ? "#ffd84a" : "#6fd8e6";
    ctx.beginPath();
    ctx.moveTo(0, -h);
    ctx.lineTo(18 * s, -h + 7 * s);
    ctx.lineTo(0, -h + 14 * s);
    ctx.closePath();
    ctx.fill();
    ctx.lineWidth = 1 * s;
    ctx.strokeStyle = "rgba(0, 0, 0, 0.6)";
    ctx.stroke();
    if (on) {
      ctx.font = `bold ${11 * s}px sans-serif`;
      ctx.textAlign = "center";
      ctx.lineWidth = 3 * s;
      ctx.strokeStyle = "rgba(0, 0, 0, 0.85)";
      ctx.fillStyle = "#ffe27a";
      ctx.strokeText("ENTRADA", 0, -h - 6 * s);
      ctx.fillText("ENTRADA", 0, -h - 6 * s);
    }
    ctx.restore();
  });
}

// The base, always marked -- even under the fog: it's the target.
export function drawBaseMarker(ctx, base, time, s) {
  const pulse = 0.5 + 0.5 * Math.sin(time * 3);
  const r = (22 + 4 * pulse) * s;
  ctx.save();
  ctx.translate(base.x, base.y);
  ctx.strokeStyle = `rgba(255, 70, 60, ${0.6 + 0.4 * pulse})`;
  ctx.lineWidth = 3 * s;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.stroke();
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 2;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * (r - 6 * s), Math.sin(a) * (r - 6 * s));
    ctx.lineTo(Math.cos(a) * (r + 8 * s), Math.sin(a) * (r + 8 * s));
    ctx.stroke();
  }
  ctx.font = `bold ${12 * s}px sans-serif`;
  ctx.textAlign = "center";
  ctx.lineWidth = 3 * s;
  ctx.strokeStyle = "rgba(0, 0, 0, 0.85)";
  ctx.fillStyle = "#ff8a80";
  ctx.strokeText("BASE", 0, -r - 10 * s);
  ctx.fillText("BASE", 0, -r - 10 * s);
  ctx.restore();
}

// Where orders were just given: a shrinking ring, green for a move, red
// for an attack or for going into the base.
export function drawOrderMarkers(ctx, markers, now) {
  for (const m of markers) {
    const age = now - m.t;
    if (age < 0 || age > MARKER_TIME) continue;
    const k = age / MARKER_TIME;
    ctx.save();
    ctx.globalAlpha = 1 - k;
    ctx.strokeStyle = m.kind === "move" ? "#5dff7a" : "#ff4a3d";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(m.x, m.y, 20 * (1 - 0.6 * k), 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

// A tower's reach, under the pointer.
export function drawRange(ctx, x, y, r) {
  ctx.save();
  ctx.fillStyle = "rgba(255, 74, 61, 0.08)";
  ctx.strokeStyle = "rgba(255, 120, 100, 0.8)";
  ctx.lineWidth = 1.5;
  ctx.setLineDash([8, 6]);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

// The box being dragged to select units (canvas px, drawn over the map).
export function drawSelectionBox(ctx, b) {
  const x = Math.min(b.x0, b.x1);
  const y = Math.min(b.y0, b.y1);
  const w = Math.abs(b.x1 - b.x0);
  const h = Math.abs(b.y1 - b.y0);
  ctx.save();
  ctx.fillStyle = "rgba(93, 255, 122, 0.12)";
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = "rgba(93, 255, 122, 0.9)";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x, y, w, h);
  ctx.restore();
}
```

- [ ] **Step 2: Write `game/js/attackControls.js`**

```js
// The attack mode's mouse, keyboard and touch, Command & Conquer style
// (docs/2026-10-09-modo-atacante-design.md §4): left click or drag a box
// to select (Shift adds or takes out, a double click picks that type on
// screen, a click on the ground lets go); right click to order -- on the
// ground go there, on a tower or wall block the player knows of attack it,
// on the base go in; Ctrl or Alt + 1-9 keep a group and 1-9 pick it (twice:
// look at it); S stops; Esc lets go. The camera pans at the screen's edges
// and by dragging with the middle button (the arrow keys, the wheel and the
// minimap stay main.js's). On a touch screen a tap on a unit picks it, a tap
// elsewhere orders the selection there, and a drag pans.
//
// main.js creates it once with what it needs (`env`) and hands it its
// canvas events while an attack is on; it keeps the selection, the groups,
// the box and the order marks, and draws nothing itself (attackDraw.js).
import { unitAt, unitsInBox, applyPick, sameTypeInView, createGroups, isDoublePress, attackKey } from "./selection.js";
import { orderMove, orderAttack, orderStop, setEntry } from "./attack.js";
import { knownStructure } from "./fog.js";
import { MARKER_TIME } from "./attackDraw.js";

const BOX_THRESHOLD = 6; // canvas px a press moves before it's a box, not a click
const TAP_THRESHOLD = 12; // client px a touch moves before it's a pan, not a tap
const DOUBLE_CLICK = 0.35; // s between two clicks on a unit for a double click
const EDGE = 14; // canvas px from the screen's edge that pan the map
const EDGE_SPEED = 700; // canvas px per second, like the arrow keys
const FLAG_REACH = 22; // canvas px round an entry's flag that pick it
const STRUCTURE_REACH = 38; // world px round a tower's centre that pick it

export function createAttackControls(env) {
  let selected = new Set();
  const groups = createGroups();
  let box = null; // { x0, y0, x1, y1 (canvas px), start (world), shift, active }
  let pan = null; // middle-button drag: the last client point
  let touch = null; // { x, y (client), moved }
  let lastClick = null; // { id, time }
  let lastGroupPress = null;
  let mouse = null; // canvas px, while the pointer is over the map
  let hover = null; // world point under the pointer
  const markers = [];

  const units = () => env.getState().enemies;
  const alive = () => new Set(units().filter((u) => u.alive).map((u) => u.id));

  // The selection without the units destroyed since.
  function pruned() {
    const living = alive();
    for (const id of [...selected]) if (!living.has(id)) selected.delete(id);
    return selected;
  }

  // The tower or wall block at `p` that the player knows of (in sight, or
  // remembered under the grey fog) -- only those can be ordered attacked.
  function structureAt(p) {
    const state = env.getState();
    const fog = state.attack.fog;
    let best = null;
    let bestD = STRUCTURE_REACH;
    for (const t of state.towers) {
      if (t.hp <= 0 || !knownStructure(fog, t)) continue;
      const d = Math.hypot(t.x - p.x, t.y - p.y);
      if (d < bestD) {
        best = t;
        bestD = d;
      }
    }
    if (best) return best;
    return state.walls.find((w) => w.hp > 0 && knownStructure(fog, w) && Math.abs(w.x - p.x) <= 16 && Math.abs(w.y - p.y) <= 16) || null;
  }

  // A right click (or a tap) at world point `p`: the selection's order, and
  // a mark where it was given.
  function orderAt(p) {
    const ids = [...pruned()];
    if (!ids.length) return;
    const state = env.getState();
    const target = structureAt(p);
    const result = target ? orderAttack(state, ids, target.id) : orderMove(state, ids, p.x, p.y);
    if (!result.ok) {
      env.onRefused();
      return;
    }
    const at = result.stops ? result.stops[0] : result.target;
    markers.push({ x: at.x, y: at.y, kind: result.stops ? "move" : "attack", t: env.now() });
  }

  // The entry whose flag (drawn above it, attackDraw.js) is at world point
  // p, or -1.
  function flagAt(p) {
    const k = env.view().w / env.canvasSize.w; // world px per canvas px
    return env.entries().findIndex((e) => Math.hypot(e.x + 6 * k - p.x, e.y - 22 * k - p.y) <= FLAG_REACH * k);
  }

  function pickClick(p, shift) {
    const u = unitAt(units(), p.x, p.y);
    if (!u) {
      if (!shift) selected = new Set();
      lastClick = null;
      return;
    }
    const now = env.now();
    if (lastClick && lastClick.id === u.id && now - lastClick.time <= DOUBLE_CLICK) {
      selected = applyPick(selected, sameTypeInView(units(), u.type, env.view()), { shift, box: true });
      lastClick = null;
      return;
    }
    lastClick = { id: u.id, time: now };
    selected = applyPick(selected, [u.id], { shift });
  }

  return {
    selected: () => units().filter((u) => pruned().has(u.id)),
    selectedIds: () => pruned(),
    groupOf: (id) => groups.groupOf(id),
    box: () => (box && box.active ? box : null),
    markers: () => markers,
    hoverWorld: () => hover,
    orderAt,

    // A new game, or back from the menu: nothing selected or marked.
    reset() {
      selected = new Set();
      groups.clear();
      box = null;
      pan = null;
      touch = null;
      lastClick = null;
      lastGroupPress = null;
      markers.length = 0;
    },

    pointerDown(evt) {
      const p = env.worldAt(evt);
      if (evt.button === 1) {
        pan = { x: evt.clientX, y: evt.clientY };
        evt.preventDefault();
        evt.target.setPointerCapture?.(evt.pointerId);
        return;
      }
      if (evt.button === 2) {
        orderAt(p);
        return;
      }
      if (evt.button !== 0) return;
      if (evt.pointerType === "touch") {
        touch = { x: evt.clientX, y: evt.clientY, moved: false };
        return;
      }
      const flag = flagAt(p);
      if (flag >= 0) {
        setEntry(env.getState(), flag);
        return;
      }
      const c = env.canvasAt(evt);
      box = { x0: c.x, y0: c.y, x1: c.x, y1: c.y, start: p, shift: evt.shiftKey, active: false };
      evt.target.setPointerCapture?.(evt.pointerId);
    },

    pointerMove(evt) {
      const c = env.canvasAt(evt);
      mouse = evt.pointerType === "touch" ? null : c;
      hover = env.worldAt(evt);
      if (pan) {
        const k = env.clientToCanvas();
        env.panCanvas(-(evt.clientX - pan.x) * k, -(evt.clientY - pan.y) * k);
        pan = { x: evt.clientX, y: evt.clientY };
        return;
      }
      if (touch) {
        const dx = evt.clientX - touch.x;
        const dy = evt.clientY - touch.y;
        if (!touch.moved && Math.hypot(dx, dy) < TAP_THRESHOLD) return;
        touch.moved = true;
        const k = env.clientToCanvas();
        env.panCanvas(-dx * k, -dy * k);
        touch.x = evt.clientX;
        touch.y = evt.clientY;
        return;
      }
      if (box) {
        box.x1 = c.x;
        box.y1 = c.y;
        if (Math.hypot(box.x1 - box.x0, box.y1 - box.y0) >= BOX_THRESHOLD) box.active = true;
      }
    },

    pointerUp(evt) {
      if (pan && evt.button === 1) {
        pan = null;
        return;
      }
      const p = env.worldAt(evt);
      if (touch) {
        const tapped = !touch.moved;
        touch = null;
        if (!tapped) return;
        const u = unitAt(units(), p.x, p.y);
        if (u) selected = new Set([u.id]);
        else orderAt(p);
        return;
      }
      if (!box) return;
      const b = box;
      box = null;
      if (!b.active) {
        pickClick(p, b.shift);
        return;
      }
      const picked = unitsInBox(units(), b.start.x, b.start.y, p.x, p.y).map((u) => u.id);
      selected = applyPick(selected, picked, { shift: b.shift, box: true });
    },

    pointerLeave() {
      mouse = null;
      hover = null;
    },

    // Ctrl/Alt + 1-9, 1-9, S. True if the key was the attack mode's.
    keyDown(evt) {
      const key = attackKey(evt);
      if (!key) return false;
      evt.preventDefault();
      const state = env.getState();
      if (key.kind === "assign") {
        groups.assign(key.n, [...pruned()]);
        return true;
      }
      if (key.kind === "stop") {
        if (pruned().size) orderStop(state, [...selected]);
        return true;
      }
      const ids = groups.members(key.n, units());
      if (!ids.length) return true;
      selected = new Set(ids);
      const now = env.now();
      if (isDoublePress(lastGroupPress, key.n, now)) {
        const members = units().filter((u) => selected.has(u.id));
        env.centerOn({
          x: members.reduce((sum, u) => sum + u.x, 0) / members.length,
          y: members.reduce((sum, u) => sum + u.y, 0) / members.length,
        });
      }
      lastGroupPress = { key: key.n, time: now };
      return true;
    },

    // Esc: lets go of the selection, if there is one.
    escape() {
      if (!pruned().size) return false;
      selected = new Set();
      return true;
    },

    // Every frame: the screen's edges pan the map, and old marks go.
    update(dt) {
      if (mouse && !box?.active && !pan) {
        const dx = mouse.x < EDGE ? -1 : mouse.x > env.canvasSize.w - EDGE ? 1 : 0;
        const dy = mouse.y < EDGE ? -1 : mouse.y > env.canvasSize.h - EDGE ? 1 : 0;
        if (dx || dy) env.panCanvas(dx * EDGE_SPEED * dt, dy * EDGE_SPEED * dt);
      }
      const now = env.now();
      while (markers.length && now - markers[0].t > MARKER_TIME) markers.shift();
    },
  };
}
```

- [ ] **Step 3: The attack's minimap in `game/js/minimap.js`**

`drawMinimap` gains the attack mode's parts. Its signature becomes:

```js
export function drawMinimap(ctx, rect, { mapImage, enemies, towers, walls = [], base, view, units = [], fog = null, entries = [], activeEntry = -1 }) {
```

after the darkening `ctx.fillRect(x, y, w, h);` (the one drawn with `rgba(0, 0, 0, 0.25)`) add:

```js
  // An attack's fog (attackDraw.js's fog layer, a pixel per cell),
  // stretched over the map like on the battlefield.
  if (fog) {
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(fog, x, y, w, h);
  }
```

and before the camera's view rectangle (`const vx = ...`) add:

```js
  // The attacker's own army in green, and the entries' flags (the active
  // one yellow).
  ctx.fillStyle = "#5dff7a";
  for (const u of units) {
    const r = u.type === "soldier" ? 1.3 : 2;
    ctx.fillRect(x + u.x * k - r, y + u.y * k - r, r * 2, r * 2);
  }
  entries.forEach((e, i) => {
    const fx = x + e.x * k;
    const fy = y + e.y * k;
    ctx.fillStyle = i === activeEntry ? "#ffd84a" : "#6fd8e6";
    ctx.beginPath();
    ctx.moveTo(fx, fy - 9);
    ctx.lineTo(fx + 7, fy - 6);
    ctx.lineTo(fx, fy - 3);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(fx - 0.75, fy - 9, 1.5, 9);
  });
```

- [ ] **Step 4: Run the whole suite**

Run: `node --test`
Expected: PASS (attackControls.js and attackDraw.js load in Node only through the page; selection.js's tests cover their decisions).

- [ ] **Step 5: Commit**

```bash
git add game/js/attackDraw.js game/js/attackControls.js game/js/minimap.js
git commit -m "Attack mode drawing (fog, rings, flags, base, marks) and C&C-style mouse and keyboard controls"
```

---

### Task 5: The attack mode in the game — wiring `main.js`, styles, and the browser run

**Files:**
- Modify: `game/js/main.js`, `game/style.css`

**Interfaces:**
- Consumes: everything above; plan A's `stepGame`, `canSaveGame`, `restoreGameSave` (modes.js), `createAttackState`, `startAttack`, `buyUnits`, `upgradeUnitType`, `UNIT_ORDER` (attack.js), `attackMapOf` (roadGraph.js), `isVisible` (fog.js).

`main.js` keeps every defence code path as it is and adds the attack version beside it, chosen by `attacking()` (`state.mode === "attack"`). No Node test can load main.js (it needs a page); Step 7's browser run is this task's test.

- [ ] **Step 1: Imports and the mode switch**

1. `import { topValue } from "./upgrades.js";` becomes `import { topValue, UPGRADE_DEFS } from "./upgrades.js";`.
2. The ui.js import becomes:

```js
import {
  initBuildMenu,
  updateBuildMenu,
  initUpgradePanel,
  updateUpgradePanel,
  renderGameEndScreen,
  renderAttackEndScreen,
  renderRanking,
  renderStatsModal,
} from "./ui.js";
```

3. In the simulate.js import, delete the lines `  stepSimulation,`, `  canSaveNow,` and `  restoreSave,` (modes.js does those for both modes now).
4. After `import { createMenu } from "./menu.js";` add:

```js
import { stepGame, canSaveGame, restoreGameSave } from "./modes.js";
import { createAttackState, startAttack, buyUnits, upgradeUnitType, UNIT_ORDER } from "./attack.js";
import { attackMapOf } from "./roadGraph.js";
import { isVisible } from "./fog.js";
import { createAttackControls } from "./attackControls.js";
import {
  createFogLayer,
  drawSelectionRing,
  drawGroupNumber,
  drawEntryFlags,
  drawBaseMarker,
  drawOrderMarkers,
  drawRange,
  drawSelectionBox,
} from "./attackDraw.js";
import { initShop, updateShop, initUnitUpgrades, updateUnitUpgrades, attackHudLines, attackSummary } from "./attackUI.js";
```

5. After `let networked = false; // set once, before the loop starts (see boot() below)` add:

```js
// An attack (attack.js, docs/2026-10-09-modo-atacante-design.md) rather
// than a defence game: every piece of the screen below has an attack
// version, picked by this.
const attacking = () => state.mode === "attack";
```

- [ ] **Step 2: Layout, bars and HUD**

1. The shop sits where the build menu does. Replace the start of `positionBuildMenu`:

```js
function positionBuildMenu(scale) {
  const buildMenuEl = document.getElementById("build-menu");
```

with:

```js
// The attack mode's shop (#attack-shop) takes the build menu's place, so
// it's laid out the same way.
function positionBuildMenu(scale) {
  for (const id of ["build-menu", "attack-shop"]) positionSidePanel(document.getElementById(id), scale);
}

function positionSidePanel(buildMenuEl, scale) {
```

2. In `drawEnemy`, the health bar's colours:

```js
  ctx.fillStyle = "#3a0d0d";
  ctx.fillRect(e.x - barW / 2, barY, barW, barH);
  ctx.fillStyle = "#e5392f";
```

become:

```js
  // In an attack these are the player's own units: green bars.
  ctx.fillStyle = attacking() ? "#0d3a12" : "#3a0d0d";
  ctx.fillRect(e.x - barW / 2, barY, barW, barH);
  ctx.fillStyle = attacking() ? "#47d35a" : "#e5392f";
```

3. `function drawHud() {` becomes:

```js
function drawHud() {
  if (attacking()) return drawAttackHud();
```

and after `drawHud` add:

```js
// An attack's HUD (attackUI.js's lines): the round and its clock, the
// base's lives, the money and the army -- and, while preparing, what to do.
function drawAttackHud() {
  ctx.save();
  ctx.fillStyle = "#fff";
  ctx.font = "20px sans-serif";
  ctx.shadowColor = "rgba(0, 0, 0, 0.8)";
  ctx.shadowBlur = 4;
  attackHudLines(state).forEach((line, i) => ctx.fillText(line, 20, 30 + i * 25));
  ctx.textAlign = "center";
  if (state.attack.phase === "prep" && !state.gameOver) {
    ctx.font = "bold 18px sans-serif";
    ctx.fillStyle = "#ffe27a";
    ctx.fillText("Compra tu ejército, dale órdenes y pulsa «¡Al ataque!»", CANVAS_WIDTH / 2, 30);
  }
  if (state.paused && !state.gameOver) {
    ctx.font = "36px sans-serif";
    ctx.fillStyle = "#ffd700";
    ctx.fillText("PAUSA", CANVAS_WIDTH / 2, 70);
  }
  ctx.restore();
}
```

(The «¡Al ataque!» button sits at `#skip-wave-btn`'s place, under the HUD lines; with four lines the HUD ends at y ≈ 105, so move the button down: in style.css `#skip-wave-btn { top: 95px;` becomes `top: 118px;` — the defence HUD's three lines end at 80, so it fits both.)

- [ ] **Step 3: The shop, the unit upgrade panel and «¡Al ataque!»**

After the `initUpgradePanel(upgradePanelEl, {...});` call add:

```js
// The attack mode's shop and unit upgrade panel (attackUI.js), in place of
// the build menu and the towers' upgrade panel.
const attackShopEl = document.getElementById("attack-shop");
initShop(attackShopEl, {
  onBuy: (type, count) => {
    if (!attacking() || state.gameOver) return;
    if (!buyUnits(state, type, count).ok) playSound("error");
  },
});
const unitUpgradeEl = document.getElementById("unit-upgrade-panel");
let unitUpgradeType = null; // the type whose upgrades show (a tab per type in the selection)
initUnitUpgrades(unitUpgradeEl, {
  onUpgrade: (skill) => {
    if (attacking() && unitUpgradeType) upgradeUnitType(state, unitUpgradeType, skill);
  },
  onTab: (type) => {
    unitUpgradeType = type;
  },
});
```

and the start button's handler

```js
skipWaveBtn.addEventListener("click", () => {
  if (state.gameOver || state.win || state.levelComplete) return;
  actions.skip();
});
```

becomes:

```js
skipWaveBtn.addEventListener("click", () => {
  if (state.gameOver || state.win || state.levelComplete) return;
  // In an attack's preparation it's «¡Al ataque!».
  if (attacking()) startAttack(state);
  else actions.skip();
});
```

- [ ] **Step 4: Starting, loading, saving and ending an attack**

1. `startNewGame`:

```js
function startNewGame(level) {
  if (networked) {
    postAction({ type: "restart", level });
  } else {
    state = createGameState(level);
```

becomes:

```js
// options: { mode: "attack", difficulty } for an attack (menu.js).
function startNewGame(level, { mode = "defense", difficulty = "normal" } = {}) {
  if (networked) {
    postAction({ type: "restart", level });
  } else {
    state = mode === "attack" ? createAttackState(level, difficulty) : createGameState(level);
```

2. In `loadSlot`, `const restored = restoreSave(readSave(slot));` becomes `const restored = restoreGameSave(readSave(slot));`.
3. In `saveToSlot`, `showToast(result.done ? savedMessage(slot, result.result) : "Se guardará al terminar la oleada");` becomes:

```js
  const later = attacking() ? "Se guardará al empezar la ronda siguiente" : "Se guardará al terminar la oleada";
  showToast(result.done ? savedMessage(slot, result.result) : later);
```

4. In `enterGame`, after `selectedBuildType = null;` add:

```js
  attackControls.reset();
  unitUpgradeType = null;
```

5. In the `createMenu(...)` handlers, `canSaveNow: () => canSaveNow(state),` becomes:

```js
  canSaveNow: () => canSaveGame(state),
  attacking: () => attacking(),
```

6. In `showGameEndScreen`, before `currentMatchScore = renderGameEndScreen(gameEndOverlay, state);` add:

```js
  if (attacking()) {
    // An attack's end: who won and how it went -- no score or ranking.
    renderAttackEndScreen(gameEndOverlay, attackSummary(state));
    gameEndCloseBtn.textContent = "Jugar de nuevo";
    gameEndOverlay.classList.remove("hidden");
    return;
  }
```

- [ ] **Step 5: The attack's battlefield, minimap and panels**

1. Add this block right before the `// --- Networked (multiplayer) mode ---` section:

```js
// --- The attack mode's battlefield ---------------------------------------
// The defence's towers and wall blocks show only where the army can see
// them; elsewhere as they were when last seen (fog.js's memory), greyed by
// the fog drawn over them. Shots and blasts only in sight; the army itself
// always. Over the fog: the base, the entries' flags, the orders' marks
// and the reach of a known tower under the pointer.
const fogLayer = createFogLayer();

// A tower as the attacker last saw it, drawn like a live one.
function rememberedTower(m) {
  return { ...m, id: -1, buildTimeRemaining: m.building ? BUILD_DURATION / 2 : 0, muzzleFlash: 0, ammo: 1, maxAmmo: 1, range: 0 };
}

// A live or remembered tower's reach.
function towerRange(t) {
  if (t.range) return t.range;
  return TOWER_TYPES[t.type].range * UPGRADE_DEFS.range.mult ** ((t.level && t.level.range) || 0);
}

// The defence the attacker knows of: what's in sight as it is, the rest as
// it was when last seen.
function knownDefence(view) {
  const fog = state.attack.fog;
  const remembered = Object.values(fog.memory).filter((m) => !isVisible(fog, m.x, m.y));
  return {
    towers: [...view.towers.filter((t) => isVisible(fog, t.x, t.y)), ...remembered.filter((m) => m.kind === "tower").map(rememberedTower)],
    walls: [...(view.walls || []).filter((w) => isVisible(fog, w.x, w.y)), ...remembered.filter((m) => m.kind === "wall").map((m) => ({ ...m, id: -1 }))],
  };
}

// A laser beam from a tower out of sight shows only its last stretch, as
// it comes out of the fog onto the unit it hits.
function drawBeamInFog(b, fog) {
  if (isVisible(fog, b.x1, b.y1)) return drawBeam(b);
  if (!isVisible(fog, b.x2, b.y2)) return;
  const len = Math.hypot(b.x2 - b.x1, b.y2 - b.y1) || 1;
  const k = Math.max(0, 1 - 60 / len);
  drawBeam({ ...b, x1: b.x1 + (b.x2 - b.x1) * k, y1: b.y1 + (b.y2 - b.y1) * k });
}

function drawAttackWorld(view, now) {
  const fog = state.attack.fog;
  const inSight = (o) => isVisible(fog, o.x, o.y);
  const known = knownDefence(view);
  drawWalls(known.walls);
  for (const t of known.towers) drawTower(t);
  const picked = attackControls.selectedIds();
  for (const e of view.enemies) if (picked.has(e.id)) drawSelectionRing(ctx, e);
  for (const e of view.enemies) drawEnemy(e);
  drawForeground(state.level);
  for (const e of view.enemies) {
    const group = attackControls.groupOf(e.id);
    if (group != null) drawGroupNumber(ctx, e, group, 1 / zoom);
  }
  for (const p of view.projectiles) if (inSight(p)) drawProjectile(p);
  for (const bm of view.beams) drawBeamInFog(bm, fog);
  for (const ex of view.explosions) if (inSight(ex)) drawExplosion(ex);
  drawAirEffects(fx, ctx);
  fogLayer.draw(ctx, fog);
  const map = attackMapOf(levelData(state.level));
  drawBaseMarker(ctx, map.base, now / 1000, 1 / zoom);
  drawEntryFlags(ctx, map.entries, state.attack.entry, 1 / zoom);
  drawOrderMarkers(ctx, attackControls.markers(), now / 1000);
  const hover = attackControls.hoverWorld();
  const hovered = hover && known.towers.find((t) => Math.hypot(t.x - hover.x, t.y - hover.y) < 38);
  if (hovered) drawRange(ctx, hovered.x, hovered.y, towerRange(hovered));
}

// The minimap of an attack: fogged, with the defence the attacker knows
// of, its own army, the entries and the base.
function attackMinimap(view, mapImage) {
  const map = attackMapOf(levelData(state.level));
  const known = knownDefence(view);
  return {
    mapImage: ready(mapImage) ? mapImage : null,
    enemies: [],
    units: view.enemies,
    towers: known.towers,
    walls: known.walls,
    base: map.base,
    view: { camera, w: CANVAS_WIDTH / zoom, h: CANVAS_HEIGHT / zoom },
    fog: fogLayer.canvas(),
    entries: map.entries,
    activeEntry: state.attack.entry,
  };
}

// An attack's panels, every frame: the shop instead of the build menu, the
// upgrade panel of the selected units' types, and «¡Al ataque!» on the
// start button while the attack is being prepared.
function updateAttackPanels() {
  buildMenuEl.classList.add("hidden");
  upgradePanelEl.classList.add("hidden");
  attackShopEl.classList.remove("hidden");
  updateShop(attackShopEl, state);
  const picked = attackControls.selected();
  const types = UNIT_ORDER.filter((type) => picked.some((u) => u.type === type));
  if (!types.includes(unitUpgradeType)) unitUpgradeType = types[0] || null;
  updateUnitUpgrades(unitUpgradeEl, state, types, unitUpgradeType);
  const preparing = state.attack.phase === "prep" && !state.gameOver;
  skipWaveBtn.classList.toggle("hidden", !preparing);
  if (preparing) {
    skipWaveBtn.textContent = "⚔ ¡Al ataque!";
    skipWaveBtn.classList.add("pulse");
    skipWaveBtn.title = "Empezar la ronda 1";
  }
}
```

2. In `loop`: `stepSimulation(state, dt);` becomes `stepGame(state, dt);`, and `updateCameraFromKeys(dt);` is followed by:

```js
  if (attacking() && started && !menu.isOpen()) attackControls.update(dt);
```

3. In `loop`, the world's units-and-shots block

```js
  drawWalls(view.walls || []);
  for (const t of view.towers) drawTower(t);
  for (const e of view.enemies) drawEnemy(e);
  drawForeground(state.level);
  // Over the foreground: a rocket truck shelling from behind a skyscraper
  // still shows where it's firing from.
  for (const e of view.enemies) if (e.holding) drawSiegeDesignator(e);
  for (const p of view.projectiles) drawProjectile(p);
  for (const bm of view.beams) drawBeam(bm);
  for (const ex of view.explosions) drawExplosion(ex);
  drawAirEffects(fx, ctx);
```

becomes:

```js
  if (attacking()) {
    drawAttackWorld(view, now);
  } else {
    drawWalls(view.walls || []);
    for (const t of view.towers) drawTower(t);
    for (const e of view.enemies) drawEnemy(e);
    drawForeground(state.level);
    // Over the foreground: a rocket truck shelling from behind a skyscraper
    // still shows where it's firing from.
    for (const e of view.enemies) if (e.holding) drawSiegeDesignator(e);
    for (const p of view.projectiles) drawProjectile(p);
    for (const bm of view.beams) drawBeam(bm);
    for (const ex of view.explosions) drawExplosion(ex);
    drawAirEffects(fx, ctx);
  }
```

4. In `loop`, the minimap:

```js
  const mini = currentMinimap();
  if (mini) {
    drawMinimap(ctx, mini, {
```

becomes:

```js
  // The box being dragged to select units, over the map in screen space.
  const dragBox = attacking() ? attackControls.box() : null;
  if (dragBox) drawSelectionBox(ctx, dragBox);

  const mini = currentMinimap();
  if (mini && attacking()) {
    drawMinimap(ctx, mini, attackMinimap(view, currentMapImage));
  } else if (mini) {
    drawMinimap(ctx, mini, {
```

5. In `loop`, everything from `  const selectedTower = state.towers.find((t) => t.id === selectedId) || null;` down to (not including) `  pauseBtn.textContent = state.paused ? "▶" : "⏸";` moves, unchanged, into a new function `updateDefencePanels()` placed after `updateAttackPanels`, with these three lines added at its top:

```js
// A defence game's panels, every frame: the build menu, the towers'
// upgrade panel and the start / next-wave button.
function updateDefencePanels() {
  buildMenuEl.classList.remove("hidden");
  attackShopEl.classList.add("hidden");
  unitUpgradeEl.classList.add("hidden");
```

and in `loop` its place takes:

```js
  if (attacking()) updateAttackPanels();
  else updateDefencePanels();
```

- [ ] **Step 6: Mouse and keyboard**

1. Right before `canvas.addEventListener("contextmenu", (evt) => evt.preventDefault());` add:

```js
// The attack mode's mouse, keyboard and touch (attackControls.js).
const attackControls = createAttackControls({
  getState: () => state,
  worldAt: worldPos,
  canvasAt: canvasPoint,
  view: () => ({ x: camera.x, y: camera.y, w: CANVAS_WIDTH / zoom, h: CANVAS_HEIGHT / zoom }),
  canvasSize: { w: CANVAS_WIDTH, h: CANVAS_HEIGHT },
  clientToCanvas: () => CANVAS_WIDTH / canvas.getBoundingClientRect().width,
  panCanvas: (dx, dy) => {
    camera.x += dx / zoom;
    camera.y += dy / zoom;
    clampCamera(state.level);
  },
  centerOn: centerCameraOn,
  entries: () => attackMapOf(levelData(state.level)).entries,
  now: () => performance.now() / 1000,
  onRefused: () => playSound("error"),
});
// The middle button pans the map in an attack: not the browser's autoscroll.
canvas.addEventListener("mousedown", (evt) => {
  if (evt.button === 1) evt.preventDefault();
});
canvas.addEventListener("pointerleave", () => attackControls.pointerLeave());
```

2. The canvas `pointerdown` listener starts:

```js
canvas.addEventListener("pointerdown", (evt) => {
  if (evt.button === 2) {
```

which becomes:

```js
canvas.addEventListener("pointerdown", (evt) => {
  if (attacking()) {
    if (!started || state.gameOver) return;
    // The minimap still moves the camera -- or, right-clicked, sends the
    // selected units there; everything else is the attack controls'.
    const mini = currentMinimap();
    const cp = canvasPoint(evt);
    const onMinimap = mini && minimapToWorld(mini, cp.x, cp.y);
    if (onMinimap && evt.button === 2) return attackControls.orderAt(onMinimap);
    if (onMinimap && evt.button === 0) {
      minimapDragging = true;
      centerCameraOn(onMinimap);
      return;
    }
    attackControls.pointerDown(evt);
    return;
  }
  if (evt.button === 2) {
```

3. In the canvas `pointermove` listener, after `mouseY = pos.y;` add:

```js
  if (attacking() && !minimapDragging) {
    attackControls.pointerMove(evt);
    return;
  }
```

4. The window `pointerup` listener starts:

```js
window.addEventListener("pointerup", (evt) => {
  minimapDragging = false;
  wallPaint = null;
```

which becomes:

```js
window.addEventListener("pointerup", (evt) => {
  const wasOnMinimap = minimapDragging;
  minimapDragging = false;
  wallPaint = null;
  if (attacking()) {
    if (!wasOnMinimap) attackControls.pointerUp(evt);
    return;
  }
```

5. In the `keydown` listener, the Esc branch

```js
    if (selectedBuildType) {
      selectedBuildType = null;
    } else if (menu.isOpen()) {
```

becomes:

```js
    if (selectedBuildType) {
      selectedBuildType = null;
    } else if (!menu.isOpen() && attacking() && attackControls.escape()) {
      // Esc in an attack first lets go of the selected units.
    } else if (menu.isOpen()) {
```

and its last line `  if (PAN_KEYS.has(key)) pressedPanKeys.add(key);` becomes:

```js
  if (attacking()) {
    if (started && !state.gameOver && attackControls.keyDown(evt)) return;
    // WASD don't pan in an attack: S is «stop».
    if (WASD.has(key)) return;
  }
  if (PAN_KEYS.has(key)) pressedPanKeys.add(key);
```

with, next to `PAN_KEYS`:

```js
const WASD = new Set(["w", "a", "s", "d"]);
```

- [ ] **Step 7: Styles in `game/style.css`**

1. Selector lists so the shop looks like the build menu: `#build-menu {` → `#build-menu,\n#attack-shop {`; `#build-menu.sidebar-mode {` → `#build-menu.sidebar-mode,\n#attack-shop.sidebar-mode {`; `#build-menu.sidebar-mode .build-towers-section {` → `#build-menu.sidebar-mode .build-towers-section,\n#attack-shop.sidebar-mode .build-towers-section {`; `#build-menu.sidebar-mode .build-btn {` → `#build-menu.sidebar-mode .build-btn,\n#attack-shop.sidebar-mode .build-btn {`; and in the menu-open rule, `body.menu-open #build-menu,` → `body.menu-open #build-menu,\nbody.menu-open #attack-shop,`.
2. The unit upgrade panel shares the towers' panel's place: `#upgrade-panel {` → `#upgrade-panel,\n#unit-upgrade-panel {`.
3. `#skip-wave-btn`'s `top: 95px;` → `top: 118px;` (Step 2).
4. Append:

```css
/* The attack mode's shop (attackUI.js) in the build menu's place, and the
   unit upgrade panel in the towers' upgrade panel's place, with a tab per
   unit type of the selection above its five cards. */
#build-menu.hidden,
#attack-shop.hidden,
#unit-upgrade-panel.hidden { display: none; }
.shop-title {
  color: #ffe27a;
  font: bold 14px sans-serif;
  letter-spacing: 1px;
  text-align: center;
  text-shadow: 0 1px 3px #000;
}
#attack-shop:not(.sidebar-mode) .shop-title { display: none; }
#attack-shop.sidebar-mode .build-btn { height: 92px; }
#unit-upgrade-panel { flex-direction: column; align-items: center; gap: 6px; }
.unit-upgrade-cols { display: flex; align-items: flex-end; gap: 10px; }
.unit-tabs { display: flex; gap: 6px; }
.unit-tab {
  padding: 4px 14px;
  font: bold 13px sans-serif;
  color: #dffcff;
  background: #163238;
  border: 1px solid #6fd8e6;
  border-radius: 4px;
  cursor: pointer;
}
.unit-tab.active { color: #ffe27a; background: #2b5b62; border-color: #ffe27a; }
.unit-tab.hidden { display: none; }
```

- [ ] **Step 8: Run the whole suite**

Run: `node --test`
Expected: PASS (no Node test loads main.js; this guards everything it imports).

- [ ] **Step 9: Check it in the browser**

The static server on port 8421 serves `game/` (start it if it isn't running: `python <scratchpad>/nocache_server.py game 8421`). In the in-app browser open `http://localhost:8421`, set `localStorage.td_settings = '{"music":false,"effects":false}'`, reload. Check, with screenshots where it says so:

1. **Defence unchanged:** Nueva partida → Defender → Nivel 1: the build menu, building a tower, «Iniciar oleada», the HUD as before. Screenshot.
2. **Into an attack:** Nueva partida → Atacar → Nivel 3 → Normal: HUD «Nivel 3 · Preparación», «¡Al ataque!» button, shop on the side, the map black but for circles round the five entries (flags there, the active one yellow), the base marked, the minimap fogged. Screenshot.
3. **Shop and parking:** click Soldado (one appears by the active entry), Shift + click Buggy (five). A flag click moves the active entry; the next unit appears there. Over the cap or the money, cards grey out.
4. **Selecting:** a box selects (green rings), Shift + click toggles, a double click on a buggy selects all buggies on screen, a click on the ground lets go; the upgrade panel appears with a tab per type; buying «Blindaje» raises the units' bars.
5. **Groups and keys:** Ctrl + 1 (and Alt + 2) keep groups — numbers by the units; 1 picks group 1; 1 twice centres on it; S stops a moving group; Esc lets go, then Esc opens the menu; W/A/D don't pan, the arrows do; the screen's edges pan; the middle button drags the map; the wheel zooms; the minimap moves the camera, right-click on it sends the selection.
6. **Battle:** right-click on a road → green mark, units drive there and spread out; «¡Al ataque!» → the clock runs; the fog opens round the moving units and greys behind them, towers seen stay greyed in place; right-click on a seen tower → red mark, units stop in range and fire; the tower's reach shows under the pointer; shells show only in sight. Screenshot mid-battle.
7. **Saving:** pause menu → Guardar partida mid-round → «Se guardará al empezar la ronda siguiente»; the load list shows «Ataque · Nivel 3 · Ronda …».
8. **End:** send a group into the base until it falls (or let round 15 run out with a temporary dev shortcut, removed before committing) — the end screen with the winner and the summary, no ranking; «Jugar de nuevo» → «¿Cómo quieres jugar?».
9. **Co-op note:** not runnable here without the LAN server; `renderMode` greys «Atacar» when `handlers.networked` (checked by reading the code path).

Any problem found: fix it (systematic-debugging), re-run `node --test`, re-check. Close the browser tab at the end (the game plays music).

- [ ] **Step 10: Commit**

```bash
git add game/js/main.js game/style.css
git commit -m "The attack mode in the game: menu to battle, C&C controls, shop, upgrades, HUD, fog and end screen"
```
