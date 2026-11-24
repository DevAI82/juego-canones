# The duel minigame, plan B: the screen, the menu and the first arena — Implementation Plan

> **For agentic workers:** Steps use checkbox (`- [ ]`) syntax for tracking. Each task: the failing test first where the code is DOM-free, then the code, then `node --test` from `game/`, then a commit; what only a browser shows is checked in one. Executed inline (no subagents: the user's rule).

**Goal:** A duel against the computer, played in the browser from the menu to the result: the profile's screen, the purchase (shop, upgrades, placing by dragging, «¡Listo!»), the fight drawn with the game's 3D-rendered units in each side's colour, the rounds' and the duel's results, and the first arena's art.

**Architecture:** `js/duelUI.js` says what every panel shows (pure functions, tested) and builds the panels; `js/duelDraw.js` draws a duel on the canvas; `js/duelScreen.js` runs one (the duel's state, the computer's turns, the pointer, the profile at the end). `main.js` hands the frame and the pointer over to it while the game's mode is `"duel"`, the way it already branches for the RTS mode, and `menu.js` gets one more way to play. The arena's picture and its foreground are built by the maps' Blender scripts from `duelArenas.js`'s own obstacles.

**Tech Stack:** Vanilla JS ES modules, Canvas 2D, Node's test runner, Blender 5.3 headless for the art.

**Spec:** [docs/2026-11-22-duelo-design.md](2026-11-22-duelo-design.md) §3, §5 (colours), §8–§10. Plan A (the core): [2026-11-22-duelo-nucleo-plan.md](2026-11-22-duelo-nucleo-plan.md).

## Global Constraints

- Defender, Atacar, the RTS mode and the home network's games behave as before; the whole suite stays green (450 tests before this plan).
- `duel.js`, `duelArenas.js`' geometry, `duelProfile.js` and `duelAI.js` keep their rules and numbers (plan C tunes them).
- A duel is never saved; the profile is saved when a duel ends. A duel left half-way gives nothing.
- No Command & Conquer images. Before a browser test: `td_settings` = `{"music":false,"effects":false}`, the tab closed afterwards; test servers on a port that isn't the family's (8421): the static one on 8431.
- Every file the browser loads must be published (`js/deploy.test.js`).

## Rulings this plan takes where the spec leaves room

1. **The duel's shop and unit panel use the attack mode's elements** (`#attack-shop`, `#unit-upgrade-panel`), refilled on entering a duel and put back on leaving it: the same look and the same place on every screen size, with no second copy of their styles. Costs: two modes share two elements, so each must refill them when it starts.
2. **«¡Listo!» is the first card of the duel's shop.** (First built on the button that starts an attack, `#skip-wave-btn`; inside the game's scaled box it came out 26 px wide on a phone held upright.)
3. **A duel against the computer runs in the browser even on the home server's page**, like the RTS mode. The duel between two players is plan D.
4. **While shopping, the rival's army of the last fight is drawn faded in its zone**: it is what the player may know (spec §4), and it shows what they are buying against.
5. **An arena without its picture yet is drawn plain** (flat ground, its obstacles as rocks): arenas 2 to 5 can be played before plan C makes their art.
6. **The computer takes its turn when the purchase begins** and is ready at once; the fight starts when the player says «¡Listo!».
7. **The pause menu hides «Guardar partida» during a duel.**
8. **Each side's units are painted its colour as they are drawn**: the frame goes through a small canvas where the side's hue replaces the paint's and the model's light and shade stay (`drawSpriteUnit`, for a unit whose `paint` is `"blue"` or `"red"`). A ring of the side's colour lies under every unit. Rendering a second set of sheets was tried first: the models' team pieces are too small to show at this size, and two more sets would add some 10 MB. Costs, if wrong: the colour is a wash over the whole vehicle, not a paint scheme.
9. **The skill points are assigned in the profile's screen by clicking a skill, and taken back all at once** («Reiniciar puntos»): moving one point is taking all back and putting them again, which costs nothing (spec §8).

## Tasks

### Task 1: What the panels say
**Files:** Create `game/js/duelUI.js`, `game/js/duelUI.test.js`; modify `game/js/duelProfile.js` (+ test): `xpProgress(profile)` → `{ have, need }` within the level (`need: null` at the top).
- [ ] Tests, then the pure functions: `duelShopEntries(view, side)`, `duelUpgradeRows(view, side, type)`, `duelRefund(view, unit)`, `duelHud(view, side)`, `duelHint(view, side)`, `roundBanner(view, side)`, `duelResult(state, side, gained, profile)`, `lobbyInfo(profile)`.

### Task 2: A duel on screen
**Files:** Create `game/js/duelDraw.js`, `game/js/duelScreen.js`, `game/duel.css`; modify `game/js/duelUI.js` (the panels), `game/js/main.js`, `game/js/menu.js`, `game/js/modes.js`, `game/index.html`.
- [ ] The panels' builders in `duelUI.js`; the drawing; the controller; the hooks in `main.js` (frame, pointer, keys, buttons, panels) and `menu.js` (the «Duelo» card and the profile's screen).
- [ ] Whole suite green; in a browser: menu → Duelo → arena 1 → buy, drag, upgrade, sell, «¡Listo!», three rounds, result, profile updated; then a defence game and an attack still work.

### Task 3: The first arena's picture
**Files:** Create `tools/blender/maps/dump_arena.mjs`, `tools/blender/maps/duel1_layout.py`; modify `tools/blender/maps/build_map.py` if it needs a new prop; `game/js/duelArenas.js` (the pictures' paths), `game/assets/maps/duel1.jpg`, `duel1_fg.webp`; a test that an arena's pictures exist.
- [ ] A sand pit: mound, palisades and sandbags where the obstacles are, nothing solid elsewhere.

### Task 4: Each side in its colour
**Files:** Modify `game/js/main.js` (`drawSpriteUnit`), `game/js/duelDraw.js`.
- [ ] `drawSpriteUnit` paints a unit whose `paint` is `"blue"` or `"red"` in that colour (ruling 8); checked in the browser.

### Task 5: Review and hand-over
- [ ] A whole duel in the browser, on a phone's size too; the published files' test; `CLAUDE.md`; commit.
