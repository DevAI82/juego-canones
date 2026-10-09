# One against the other on the home network — Implementation Plan

> **For agentic workers:** Steps use checkbox (`- [ ]`) syntax for tracking. Each task: failing test first where the code is DOM-free, then the code, then `node --test` from `game/`, then a commit.

**Goal:** One player defends and the other attacks, each on their own computer (or phone or tablet) on the same WiFi, through the home server (`node server.js`), with the attack mode's rules and a person in place of the computer's defence.

**Architecture:** The home server already runs the authoritative game and every browser polls it. It grows a DOM-free, HTTP-free core, `js/host.js`, that holds the game (a co-op defence or a one-against-the-other attack), ticks it, knows which browser tab plays which side (`js/versus.js`, pure seat logic), applies each tab's actions only for its own side and gives each tab its view. `server.js` only wires that core to HTTP, the saves file and the static files. In the browser, `main.js` picks the screen by the player's **side**, not only by the game's mode: the defender of an attack gets the defence game's screen (build menu, upgrade panel, walls) over the attack's state, the attacker gets the attack screen; every action goes to the server.

**Tech Stack:** Vanilla JS ES modules, Node's built-in test runner (`node --test` from `game/`), Node's `http` for the server. No new dependencies.

**Spec:** [docs/2026-10-09-uno-contra-otro-design.md](2026-10-09-uno-contra-otro-design.md)

## Global Constraints

- The solo game (defence and attack against the computer) and the co-op game at home behave as before; the whole existing suite stays green.
- The attack mode's rules and numbers don't change (rounds, prices, income, upgrades, cap, lives, fog).
- The defender's money: Poco $250 + $60 a round, Normal $350 + $90, Mucho $450 + $120 (the computer's Fácil, Normal and Difícil), plus a quarter of each destroyed unit's bounty.
- The entries' safe stretch binds both defenders, the computer and the person, through the defence's own actions.
- DOM-free modules where possible, no new dependencies, comments that explain why (the code is read by a learner).
- Never touch the family's server on port 8420 or its `data/` folder: test servers run on another port with `DATA_DIR` in the scratchpad.

## Rulings this plan takes where the spec leaves room

1. **Waiting for the other player is a banner over the game**, not a screen of its own: the one who created the game can already prepare (build or buy) while the other opens the address.
2. **Towers built during the preparation are ready at once**, like the computer's opening towers: the preparation has no clock, so they would otherwise never finish.
3. **A player is a browser tab**: its id lives in the tab's `sessionStorage`, so a reload keeps the side, and two tabs on one computer are two players (that's how it's tested).
4. **The defence's money levels reuse the difficulty keys** (`easy`, `normal`, `hard`), shown as Poco, Normal and Mucho.
5. **Opening the menu pauses a one-against-the-other game for both**, and closing it resumes it if this player was the one who paused, like the solo game's menu.
6. **A seat is free after 5 s without news from its tab**; the game pauses on its own then if a round is running, and that pause belongs to the missing side.
7. **Both players receive the whole state** (the fog in a compact form); the attacker's screen hides what the fog hides. It's a family game at home: no protection against a player reading the other side's data.
8. **The computer's defence keeps its own choices**: it already never builds where the new rule would refuse it, so its games don't change.

## Review Focus

1. A reload in the middle of a round: the same tab returns to its side; the game waited paused.
2. A third device opening the address during a match: it can't change the game.
3. Actions from the wrong side (an attacker's tab posting a tower): refused by the server.
4. Loading a one-against-the-other save, and resuming after a server restart: sides free to join, game paused.
5. The fog in transit: the attacker's screen shows the same fog as in solo.

---

## File Structure

```
game/
├── js/entryRoads.js        (create) the entries' safe stretch, shared by both defenders
├── js/entryRoads.test.js   (create)
├── js/simulate.js          (modify) in an attack, no tower or range upgrade reaching the safe stretch
├── js/defenseAI.js         (modify) uses entryRoads.js
├── js/attack.js            (modify) a defender that is a person: no computer, money by level; preparation towers ready at once
├── js/fog.js               (modify) fogForWire / fogFromWire
├── js/versus.js            (create) seats, joining, disconnections, «¡Listo!», pause ownership, rematch
├── js/versus.test.js       (create)
├── js/host.js              (create) the home server's game: kinds, ticks, views, actions by side, saves
├── js/host.test.js         (create)
├── server.js               (modify) HTTP on top of host.js
├── server.test.js          (create) two tabs against a real server on a test port
├── js/attackControls.js    (modify) orders through env.orders (local or to the server)
├── js/attackUI.js          (modify) the defender's HUD lines; end summary per side
├── js/menu.js, index.html  (modify) «Defender juntos» / «Uno contra otro», side, money, join, full
├── js/main.js              (modify) the side, the network layer, the defender's screen, banners, rematch
└── style.css               (modify) the new screens and banners
```

---

### Task 1: The entries' safe stretch, for both defenders

- [x] Failing tests (`entryRoads.test.js`): a slot whose basic tower would reach an entry's first 320 px of road reaches it; one far away doesn't; the stretch stops 400 px of road short of the base (level 3's southern road). In `simulate-steps.test.js` (or a new test): in an attack, `canPlaceTower` there answers `{ ok: false, reason: "entry-road" }`, and a range upgrade that would reach it `{ ok: false, reason: "entry-road" }`; in a defence game the same slot is fine.
- [x] `entryRoads.js`: `entrySafePoints(level)` (cached per level) and `reachesEntryRoad(level, x, y, range)`. `defenseAI.js` uses them instead of its own copy. `simulate.js`'s `canPlaceTower` and `upgradeTower` check them when `state.mode === "attack"`.
- [x] `node --test` (the bot's tests unchanged). Commit.

### Task 2: A defender that is a person

- [x] Failing tests (`attack.test.js`): `createAttackState(level, "hard", { defender: "player" })` has no towers and $450; rounds pay $120 and the computer never builds; a tower placed in preparation is finished; the attacker's fog sees a tower built in preparation in sight; saves keep `defender`, and the summary says it.
- [x] `attack.js`: `state.attack.defender` ("computer" by default); no `aiPrepare`/`aiStep` for a person; in preparation, towers under construction are finished and the fog refreshed.
- [x] `node --test`. Commit.

### Task 3: The fog in transit

- [x] Failing test (`fog.test.js`): `fogFromWire(JSON.parse(JSON.stringify(fogForWire(fog))))` answers the same `isVisible`, `isExplored` and memory.
- [x] `fog.js`: both functions (hex strings, like `saveFog`, for `explored` and `visible`).
- [x] Commit.

### Task 4: Seats and turns (`versus.js`)

- [x] Failing tests: create with a side and money; join the free side; can't join a taken, connected side; the same id gets its side back; after 5 s without news the side is free, and a running round pauses, owned by that side; «¡Listo!» from both starts round 1; pause by either, resume only by its owner or by anyone once the owner is gone; rematch: same level and money, sides swapped, preparation; `mayChangeGame`: only the seated players while both are connected.
- [x] `versus.js`: pure functions on a small seats object and the attack state.
- [x] Commit.

### Task 5: The home server's game (`host.js`)

- [x] Failing tests (`host.test.js`, with an in-memory saves store): a co-op game as before (actions from anyone); a new 1v1 game seats its creator; the other tab joins; actions are refused from the wrong side; the attacker's orders, buys and upgrades work; the view for each tab says its side, the seats, the pause and its owner; the fog arrives in wire form; the attacker's automatic army runs on the server when that tab says so; autosave at the start of each round; load keeps who was playing; a third tab can't start a game during a match.
- [x] `host.js`: `createHost({ store, now })` with `tick(dt)`, `view(playerId, info)`, `act(playerId, body)`.
- [x] Commit.

### Task 6: HTTP on top (`server.js`)

- [x] Failing test (`server.test.js`): a server on a free port with `DATA_DIR` in a temporary folder; two players create, join, get ready, the round starts; a wrong-side action is refused.
- [x] `server.js`: `GET /api/state?player=…&auto=…`, `POST /api/action` with `player`, the rest as before; the startup message mentions both ways to play. The server can be started by a test (exported `startServer({ port, dataDir })`, `node server.js` unchanged).
- [x] Commit.

### Task 7: The browser speaks for its side

- [x] `attackControls.js` sends orders through `env.orders` (tests keep a local implementation); `main.js` routes buying, unit upgrades, entries, «¡Listo!» and pause to the server in networked play; the tab's id in `sessionStorage`; the poll sends it and the automatic-army flag; snapshots bring `{ state, net }` and the fog is revived.
- [x] `mySide()` replaces `attacking()` wherever the screen depends on who is playing.
- [x] Commit.

### Task 8: The defender's screen and the menus

- [x] The defender of an attack: defence screen, HUD (round, clock, lives, money, units), «¡Listo!», safe stretch striped red while building, red bars on the units, camera on the base.
- [x] Menu at home: «Defender juntos» / «Uno contra otro» → map → side → money; «Unirse a la partida»; «Hay una partida uno contra otro en marcha»; banners for waiting, pause and disconnection; end screen per side with «Revancha»; saves listed as «Uno contra otro».
- [x] Commit.

### Task 9: Two tabs, one game

- [x] A test server on port 8423 with `DATA_DIR` in the scratchpad; two browser pages: create, join, prepare, rounds, pause, a reload mid-round, the end and the rematch; screenshots of both screens. Fix anything broken with a failing test first.
- [x] Update the design's state line; commit and push.
