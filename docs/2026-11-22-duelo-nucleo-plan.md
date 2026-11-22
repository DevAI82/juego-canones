# The duel minigame, plan A: the core without a screen — Implementation Plan

> **For agentic workers:** Steps use checkbox (`- [ ]`) syntax for tracking. Each task: the failing test first, then the code, then `node --test` from `game/`, then a commit. Executed inline (no subagents: the user's rule).

**Goal:** The whole duel playable headless: two armies bought, upgraded and placed through actions, an automatic fight by rounds, the first to three; the player's profile (level, skill points, league); and the computer opponent with its five grades.

**Architecture:** Four new DOM-free modules in `game/js/`. `duel.js` is the pure simulation: a state, the players' actions and a fixed-step tick with a seeded random number generator, so the same actions always give the same fight (tests, balance bots, and later the online phase, which will only send purchases). `duelArenas.js` holds the five arenas' geometry. `duelProfile.js` is the profile, as pure functions on a plain object plus load/save in the browser's storage. `duelAI.js` plays one side through `duel.js`'s own actions, seeing only what a player would see.

**Tech Stack:** Vanilla JS ES modules, Node's built-in test runner (`node --test` from `game/`). No new dependencies.

**Spec:** [docs/2026-11-22-duelo-design.md](2026-11-22-duelo-design.md)

This is plan A of four (spec §12): (A) this core; (B) the screen, the menu and the first arena; (C) balance with simulated duels and the other four arenas; (D) the home network.

## Global Constraints

- Nothing in `simulate.js`, `enemy.js`, `attack.js`, `rts.js` or their tests changes: the duel is a module of its own. The whole existing suite stays green (387 tests before this plan).
- The duel's prices are the attack mode's (`UNIT_PRICES`): soldier 10, motorcycle 15, buggy 20, tank 50, rocket 70. A test holds them together.
- Start $100; a destroyed unit pays half its price in all, in proportion to the damage; after a round $50 each and $25 more to the winner; 12 units a side; first to 3 rounds; a fight lasts 60 s at most; buying has a clock only between two players (45 s the first round, 30 s after).
- Upgrades: five skills a unit type, five levels, the attack mode's multipliers (damage ×1.25, range ×1.15, armour: health ×1/0.85, rate ×0.85 between shots, speed ×1.06); level k costs base × k, base 20 (damage, armour, rate) or 15 (range, speed).
- Profile: level n to n + 1 takes 100 × n experience, top level 15; a level gives one skill point and $10 of starting money; league experience factor 1 + 0.25 × (league − 1); promotion after 3 wins against the computer in the highest league reached; no demotion; «Campeón» after 3 wins in Oro.
- The unit numbers and the computer's grades are starting values: plan C tunes them with simulated duels, and tuned values will carry a comment saying so.
- DOM-free, no new dependencies, comments that explain why (the code is read by a learner).

## Rulings this plan takes where the spec leaves room

1. **A fight's hits land at once**; the shot the screen draws is only a picture. Flying projectiles would make the result depend on what moves while they fly, for no gain in a fight nobody steers. Costs, if wrong: fast units can't outrun a rocket.
2. **Money is kept with decimals and shown rounded down.** Paying damage in proportion gives fractions; rounding each hit would lose or invent money. Costs: a player may see $49 and be one cent short of $50.
3. **A round both sides lose in the same tick, or that the clock ends level on army left and on damage done, goes to a seeded coin.** The spec names two tie-breaks and a round must have a winner (a duel is at most five rounds). Costs: a round decided by luck, in a case that takes two identical armies.
4. **A side with no units when the fight starts loses the round at once.** Costs: nothing; it also ends a duel against a player who walked away.
5. **A move or a purchase that doesn't fit is refused, not adjusted** (`{ ok: false, reason }`): the screen can then show why. A new unit takes the first free place of a fixed grid over its side's zone.
6. **While a side is «ready» its other actions are refused**; it can take its «ready» back until the other side is ready too.
7. **Free skill levels (profile points, the computer's grade) are levels the side starts with**: the next level of that skill costs what it would after buying them.
8. **The computer decides its whole turn when the buying starts**, from a view of the duel that holds its own side and the rival's army of the previous fight only. Costs: it never reacts to what the player does during the same purchase, which is the spec's rule.
9. **The round's banner lasts 4 s** before the next purchase; the payouts are made when the fight ends.
10. **Obstacles are circles**, mirrored about the arena's middle; they stop movement and shots (a shot is blocked when the line between the two units crosses one).

## File structure

- Create `game/js/duelArenas.js` — `ARENA`, `ZONES`, `DUEL_ARENAS` (five: id, league name, obstacles), `arenaOf(id)`.
- Create `game/js/duel.js` — constants, `createDuelState`, `buyUnit`, `sellUnit`, `moveUnit`, `upgradeUnit`, `setReady`, `stepDuel`, `duelView`, `upgradeCost`, `unitStats`.
- Create `game/js/duelProfile.js` — the profile.
- Create `game/js/duelAI.js` — `DUEL_GRADES`, `gradeStart`, `planTurn`, `playTurn`.
- Tests beside each: `duelArenas.test.js`, `duel.test.js`, `duelProfile.test.js`, `duelAI.test.js`.

---

### Task 1: The arenas' geometry

**Files:** Create `game/js/duelArenas.js`, `game/js/duelArenas.test.js`.

**Interfaces — Produces:**
- `ARENA = { width: 1200, height: 750 }`
- `ZONES = { left: { x0: 40, x1: 480, y0: 60, y1: 690 }, right: { x0: 720, x1: 1160, y0: 60, y1: 690 } }`
- `DUEL_ARENAS`: array of five `{ id: 1..5, league: "Arena"|"Hierro"|"Bronce"|"Plata"|"Oro", obstacles: [{ x, y, r }] }`
- `arenaOf(id)` → the arena, or arena 1 for an unknown id.
- `mirrorX(x)` → `ARENA.width - x`.

- [ ] Test (fails: no module): five arenas, ids 1..5, the five league names in order; each has 3 to 7 obstacles; every obstacle has its mirror image (same y and r, x mirrored) in the same arena; every obstacle lies inside the arena; no two obstacles of an arena overlap; each zone keeps at least 60 % of a 40-px grid of places free of obstacles (room to deploy 12 units); `arenaOf(99)` is arena 1.
- [ ] Write `duelArenas.js`: each arena written as its left half and middle, mirrored by a helper.
- [ ] `node --test js/duelArenas.test.js` passes; whole suite passes; commit.

### Task 2: The duel's state, the shop and the placement

**Files:** Create `game/js/duel.js`, `game/js/duel.test.js`.

**Interfaces — Consumes:** `ARENA`, `ZONES`, `arenaOf` (Task 1).

**Interfaces — Produces:**
- `SIDES = ["left", "right"]`, `otherSide(side)`.
- `DUEL_ORDER = ["soldier", "motorcycle", "buggy", "tank", "rocket"]`.
- `DUEL_UNITS[type] = { price, hp, speed, range, damage, cooldown, radius, armored?, splash? }`.
- `SKILLS = ["damage", "range", "armor", "rate", "speed"]`, `DUEL_UPGRADES[skill] = { levels: 5, baseCost, mult }`.
- `START_MONEY = 100`, `UNIT_CAP = 12`, `ROUNDS_TO_WIN = 3`, `ROUND_INCOME = 50`, `WIN_BONUS = 25`, `KILL_SHARE = 0.5`, `COMBAT_TIME = 60`, `BUY_TIME_FIRST = 45`, `BUY_TIME = 30`, `ROUND_END_TIME = 4`, `STEP = 1 / 30`, `LIGHT_VS_ARMOR = 0.5`, `SPLASH_SHARE = 0.6`.
- `createDuelState({ arena = 1, seed = 1, timed = false, left = {}, right = {} })` where a side's options are `{ money = START_MONEY, free = {} }` (`free[type][skill]` = starting levels). Returns `{ mode: "duel", arena, timed, phase: "buy", round: 1, clock, wins: { left, right }, sides: { left, right }, units: [], shots: [], lastRound: null, winner: null, rng, nextId, acc: 0 }`; a side is `{ money, upgrades, ready, army: [{ id, type, x, y, round }], lastArmy: [], earned, damage, destroyed: { [type]: n }, xp }`.
- `upgradeCost(state, side, type, skill)` → price of the next level, or `null` at the top.
- `unitStats(type, levels)` → `{ maxHp, speed, range, damage, cooldown }` with the upgrades applied.
- `buyUnit(state, side, type)`, `sellUnit(state, side, id)`, `moveUnit(state, side, id, x, y)`, `upgradeUnit(state, side, type, skill)`, `setReady(state, side, ready = true)` → `{ ok: true, ... }` or `{ ok: false, reason }` with reasons `"phase"`, `"ready"`, `"type"`, `"money"`, `"cap"`, `"room"`, `"unit"`, `"zone"`, `"blocked"`, `"max"`, `"skill"`.
- `canPlace(state, side, x, y, radius, ignoreId)` → boolean.

- [ ] Tests (fail: no module):
  - the prices equal `attack.js`'s `UNIT_PRICES`;
  - a fresh duel: phase `"buy"`, round 1, both sides $100, no units, not ready; with `timed`, the clock is 45, else `null` (no clock);
  - `left: { money: 130, free: { tank: { damage: 2 } } }` starts with $130 and tank damage at level 2, and `upgradeCost(…, "tank", "damage")` is 60 (level 3 × 20);
  - buying a tank takes $50, adds a unit inside the left zone, clear of obstacles and of the other units; the right side's purchases land in the right zone;
  - refused: an unknown type (`"type"`), not enough money (`"money"`), a 13th unit (`"cap"`);
  - selling a unit bought this round gives its whole price back; one bought in an earlier round, half; an unknown id is `"unit"`;
  - moving: inside the zone and free → ok; outside the zone → `"zone"`; onto an obstacle or another own unit → `"blocked"`; the unit stays where it was when refused;
  - upgrading costs base × (level + 1), raises the level, stops at 5 (`"max"`), refuses an unknown skill (`"skill"`) and a lack of money;
  - `unitStats("tank", { damage: 1, range: 0, armor: 1, rate: 0, speed: 0 })` has damage × 1.25 and health × 1/0.85 (rounded);
  - a ready side is refused its other actions (`"ready"`) and can take the ready back; when both are ready the phase is `"combat"`.
- [ ] Write the state, the shop and the placement in `duel.js` (the fight itself is Task 3; `setReady` calls a `startCombat` that for now only changes the phase and the clock).
- [ ] Tests pass; whole suite passes; commit.

### Task 3: The fight

**Files:** Modify `game/js/duel.js`, `game/js/duel.test.js`.

**Interfaces — Produces:** `stepDuel(state, dt)`; the units of a fight, `{ id, side, type, x, y, angle, hp, maxHp, speed, range, damage, cooldown, fireTimer, radius, targetId, alive, home: { x, y } }`; `state.shots` entries `{ from: { x, y }, to: { x, y }, type, side, age }` (pictures only, dropped after 0.4 s); `state.lastRound = { winner, reason: "wipe"|"time"|"damage"|"coin"|"empty", income: { left, right } }`.

How a tick goes (`STEP` seconds; `stepDuel` runs as many as fit in `dt`, eight at most):
1. Each living unit, in id order: keep its target while it lives, else take the nearest living enemy. If the target is within range and no obstacle crosses the line, stand and shoot when `fireTimer` reaches 0 (then `fireTimer = cooldown`). Otherwise move towards it at `speed`, sliding round an obstacle it would run into.
2. A hit: `damage`, halved when a light unit (soldier, motorcycle, buggy) hits an armoured one; a splash weapon also deals `SPLASH_SHARE` of it to the other enemies within `splash` of the target. The shooter's side earns `price × KILL_SHARE × (health taken / maxHp)` and the same figure adds to its `damage` of the round; a destroyed unit adds to `destroyed[type]` and its price to `xp`.
3. Units are pushed apart where they overlap, out of obstacles and into the arena.
4. The fight ends when a side has no living unit or the clock reaches 0: winner by the rules of the spec §4 and ruling 3; `wins` goes up; $50 each and $25 to the winner; phase `"roundEnd"` for 4 s, or `"over"` with `state.winner` at 3 wins.
5. After the banner: next round, phase `"buy"`, nobody ready, armies whole again at their places (`side.army` never changed during the fight), `earned` and `damage` back to 0.

- [ ] Tests (fail: `stepDuel` missing):
  - two tanks against one soldier: the soldier's side loses the round by `"wipe"`, wins 1–0, and the money is right to the cent: winner 100 − 100 + 5 (half a soldier) + 50 + 25, loser its part of the damage done + 50;
  - a side with no units loses at once (`"empty"`);
  - an armoured tank takes half damage from a soldier and whole damage from a tank (one tick each, health compared);
  - a rocket's shot also hurts a second enemy 30 px from its target, and not one 80 px away;
  - an obstacle on the line stops the shot: with the obstacle between two units in range of each other nobody is hurt in the first second, and both still end the fight (they walk round it);
  - no unit ever ends a tick inside an obstacle or outside the arena (checked every tick of a crowded fight in every arena);
  - the clock: a fight cut short by setting `clock` low is won by the side with more army left, by `"time"`;
  - after the banner the next purchase starts: round 2, phase `"buy"`, both armies back whole and at their places, not ready;
  - first to three: a one-sided duel ends `"over"` after three fights with the winner set, and `stepDuel` changes nothing after that;
  - the same seed and actions give exactly the same state after a whole fight (`JSON.stringify` equal); a different seed may differ;
  - with `timed`, the buy clock runs out and the fight starts on its own.
- [ ] Write the fight.
- [ ] Tests pass; whole suite passes; commit.

### Task 4: What each side may see

**Files:** Modify `game/js/duel.js`, `game/js/duel.test.js`.

**Interfaces — Produces:** `duelView(state, side)` → a copy of the state for that side: during `"buy"` the rival's `army` is its `lastArmy` (what it fielded in the previous fight, empty in round 1), its `money` and `upgrades` are those it had when that fight started, and its `ready` is kept; in the other phases, everything.

- [ ] Tests (fail): in round 1's purchase the rival's army is empty in the view whatever it bought; in round 2's it is the army of round 1's fight; the view is a copy (changing it leaves the state alone); during the fight both armies and all units are there.
- [ ] Write `duelView` (the snapshots are taken in `startCombat`).
- [ ] Tests pass; commit.

### Task 5: The profile

**Files:** Create `game/js/duelProfile.js`, `game/js/duelProfile.test.js`.

**Interfaces — Consumes:** `DUEL_ORDER`, `SKILLS`, `DUEL_UPGRADES`, `START_MONEY` (Task 2).

**Interfaces — Produces:**
- `LEAGUES = ["Arena", "Hierro", "Bronce", "Plata", "Oro"]`, `MAX_LEVEL = 15`, `WINS_TO_PROMOTE = 3`, `MONEY_PER_LEVEL = 10`.
- `freshProfile()` → `{ xp: 0, level: 1, league: 1, leagueWins: 0, champion: false, points: {}, duels: 0, wins: 0 }` (`points[type][skill]` = points put there).
- `xpToNext(level)` → `100 × level`, `null` at the top; `leagueFactor(league)`.
- `pointsSpent(profile)`, `pointsFree(profile)` (level − 1 − spent).
- `assignPoint(profile, type, skill)`, `removePoint(profile, type, skill)` → `{ ok, profile }` or `{ ok: false, reason: "points"|"max"|"type"|"skill"|"none" }`; they never change the profile given.
- `startOf(profile)` → `{ money, free }` for `createDuelState` against the computer.
- `recordDuel(profile, { arena, won, xp, rival })` (`rival`: `"computer"` or `"player"`) → `{ profile, gained: { xp, levels, promoted, champion } }`.
- `loadProfile(storage)`, `saveProfile(profile, storage)` under the key `td_duel_profile`; `cleanProfile(any)` → a valid profile.

- [ ] Tests (fail: no module): a fresh profile; 100 experience makes level 2, 300 level 3; the level stops at 15 however much comes in; experience is multiplied by the arena's league factor (150 in arena 3 counts 225); one point a level, assigned and removed, never more than the levels allow, never past 5 in a skill; `startOf` at level 4 with two points in tank damage is `{ money: 130, free: { tank: { damage: 2 } } }`; three wins against the computer in the highest league promote and reset the count; a win in a lower league or against a player doesn't count for the league but gives experience; a loss gives experience and no win; three wins in Oro make the champion and the league stays 5; a broken or missing saved profile loads as a fresh one, and a saved one with silly values is cleaned (level from its experience, league 1 to 5, points cut to what the level allows); save then load gives the same profile.
- [ ] Write `duelProfile.js`.
- [ ] Tests pass; whole suite passes; commit.

### Task 6: The computer

**Files:** Create `game/js/duelAI.js`, `game/js/duelAI.test.js`.

**Interfaces — Consumes:** `duel.js`'s actions, `duelView`, `DUEL_UNITS`, `upgradeCost`, `canPlace`; `ZONES`.

**Interfaces — Produces:**
- `DUEL_GRADES` — five entries `{ money, freeLevels, counter, upgradeShare, formation }`: starting money, how many free skill levels it starts with, how strongly it buys against the rival's last army (0 to 1), the share of its money it puts in upgrades, and whether it sets a formation.
- `gradeStart(grade, seed)` → `{ money, free }` for `createDuelState`.
- `planTurn(view, side, grade, random)` → a list of actions `{ type: "buy"|"upgrade"|"move"|"sell", ... }` decided from the view alone.
- `playTurn(state, side, grade)` → runs `planTurn` on `duelView(state, side)` with the state's random numbers, applies each action through `duel.js`, then `setReady`. Returns the actions that were accepted.

- [ ] Tests (fail: no module): each grade's start has more money or more free levels than the one before; after `playTurn` the side is ready, its money isn't negative, it has at least one unit when it could afford one, every unit is inside its zone and clear of obstacles; it never has more than 12; in round 1 two different rival purchases get the same turn from it (it can't see them); at grade 5, against a last army of ten soldiers it buys at least one rocket when it can afford it, and against tanks no soldiers; with a formation, its armoured units stand nearer the middle than its rockets; a whole duel of grade 5 against grade 1 (twenty seeds) is won by grade 5 most of the time, and every duel ends within 5 rounds.
- [ ] Write `duelAI.js`.
- [ ] Tests pass; whole suite passes; commit.

### Task 7: Review and hand-over

- [ ] Read the diff of the whole plan against the spec §3–§8 and the constraints above; fix what is off, each fix with a test that failed first.
- [ ] Note in `CLAUDE.md` what the duel's core is and where its design and plans live.
- [ ] Whole suite passes; commit.
