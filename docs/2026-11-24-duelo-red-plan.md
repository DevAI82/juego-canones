# The duel minigame, plan D: two players on the home network — Implementation Plan

> **For agentic workers:** Steps use checkbox (`- [ ]`) syntax for tracking. Each task: the failing test first where the code is DOM-free, then the code, then `node --test` from `game/`, then a commit; what only two browsers show is checked with two tabs against a test server. Executed inline (no subagents: the user's rule).

**Goal:** Two people at home duel each other, each on their own computer, phone or tablet, through the home server (`node server.js`), as «Uno contra otro» is played today.

**Architecture:** The home server already holds one game for the house and knows which browser tab plays which side (`host.js`, `versus.js`). A duel between two players is one more kind of that game: `host.js` creates it, seats its two sides (`left`, `right`), runs it with `duel.js`, and answers each tab with the duel as that tab may see it (`duelView`). In the browser `duelScreen.js` learns a second way of running a duel: instead of playing it itself against the computer, it draws what the server sends and posts the player's actions.

**Spec:** [docs/2026-11-22-duelo-design.md](2026-11-22-duelo-design.md) §8 (between two players), §9, §11.

## Global Constraints

- Both players start alike: $100 and no profile advantages. The purchase has its clock: 45 s the first round, 30 s after.
- While shopping, a tab receives only its own side's army; the rival's travels when the fight starts.
- A duel between players gives each their experience, in their own browser, and never counts for the league. It is never saved.
- «Defender juntos», «Uno contra otro» and the solo games behave as before; the whole suite stays green (470 tests before this plan).
- Never touch the family's server (port 8421) or its `data/`: the test server runs on port 8432 with `DATA_DIR` in the scratchpad.

## Rulings this plan takes where the spec leaves room

1. **Whoever creates the duel is the left side; the second player to open the address is offered the right.** A third device sees the duel (neither army while they shop) and can't change the game while the two are there, as in «Uno contra otro».
2. **The clock doesn't run until both players are there**: the creator can shop meanwhile. The screen says what address the other must open.
3. **A side gone pauses the duel; it carries on by itself when that side is back.** (In «Uno contra otro» the one who paused must resume; a duel's purchase has a clock, and a reload shouldn't cost the round.) Either player's own pause is theirs to lift, as there.
4. **«Revancha» keeps each player on their side.** The arena is mirrored, so the sides are alike.
5. **Between a tab's actions and the server's answer the screen shows the server's last word**: a unit bought appears, and one dragged settles, with the next news (some 120 ms). The unit being dragged follows the pointer meanwhile.
6. **On the home server's page «Duelo» asks first against whom**: the computer (in this browser, with the profile, as plan B built it) or the other player.
7. **The experience of a duel between players is recorded once**, by the duel's seed and the tab: a reload after the end doesn't count it twice.

## Tasks

### Task 1: The server's side
**Files:** `game/js/versus.js`, `game/js/duel.js`, `game/js/modes.js`, `game/js/host.js` and their tests.
- [ ] Tests: seats for any two sides; `duelView(state, null)` hides both armies; `stepGame` moves a duel on unless it is paused; in `host.js`: creating, waiting, joining, the clock, what each tab sees, whose actions count, the fight, a side gone and back, pause, rematch, a third tab, no saving.
- [ ] The code; whole suite green; commit.

### Task 2: The browser's side
**Files:** `game/js/duelScreen.js`, `game/js/duelDraw.js`, `game/js/duelUI.js` (+ test), `game/js/main.js`, `game/js/menu.js`, `game/index.html`.
- [ ] `duelScreen.js` runs a duel from the server's news (units drawn between the last two snapshots, sounds and blasts from what changed, actions posted); the notices (waiting, pause, gone); the result and the experience; the menu's «contra quién», the arena choice with all five open, and joining.
- [ ] Two tabs against a test server: create, join, shop hidden from each other, fight, rounds, pause, reload, a tab closed and back, the end, rematch; a third tab. The solo duel and the other modes still work. Commit.

### Task 3: Review and hand-over
- [ ] The spec's status, `CLAUDE.md`, the whole suite, the published files' test; commit.
