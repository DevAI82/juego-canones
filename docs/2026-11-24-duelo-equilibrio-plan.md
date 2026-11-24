# The duel minigame, plan C: balance and the other four arenas — Implementation Plan

> **For agentic workers:** Steps use checkbox (`- [ ]`) syntax for tracking. Each task: the failing test first, then the code, then `node --test` from `game/`, then a commit. Executed inline (no subagents: the user's rule).

**Goal:** Unit numbers under which no kind of unit beats every other; a computer opponent whose five grades suit the players who reach each league; a level that isn't reached too soon; and the pictures of arenas 2 to 5.

**Architecture:** The duel's fight is deterministic and has no screen (plan A), so thousands of duels are played headless: `tools/duel/matrix.mjs` pits armies of one kind of unit against each other at the same money, and `tools/duel/career.mjs` takes simulated players from a new profile to champion. The numbers they led to are in `duel.js`, `duelAI.js` and `duelProfile.js`, each with a comment saying it was tuned, and tests keep the outcome. The arenas' pictures are built like arena 1's.

**Spec:** [docs/2026-11-22-duelo-design.md](2026-11-22-duelo-design.md) §5–§8, §12.

## What the simulations showed, and what was changed

**Units** (`node tools/duel/matrix.mjs game 100 200 350`: each army against each, on the five arenas and both sides; the money left after 12 units goes into the unit's upgrades).

With plan A's first numbers tanks won every fight against every other kind at every sum, and nothing answered them. Now:

| at $200 | soldier | motorcycle | buggy | tank | rocket |
|---|---|---|---|---|---|
| **tank** beats | 100 % | 100 % | 100 % | – | 0 % |
| **rocket** beats | 60–90 % | 0 % | 0 % | 100 % | – |
| **motorcycle** beats | 100 % | – | 20 % | 0 % | 100 % |
| **buggy** beats | 100 % | 80 % | – | 0 % | 100 % |

Tanks crush what is light; rockets break tanks; motorcycles and buggies get under the rockets' guns. Ten soldiers are the best army $100 buys against anything but tanks, and are outgrown once there is money for more than twelve units' worth.

Two rules were added for it, both of the rocket truck: its damage on an armoured unit is multiplied (`antiArmor: 2.5`), and it can't shoot what is nearer than 80 px (`minRange`) — the spec's «frágil de cerca». A light weapon now does an armoured unit 65 % of its damage (was half) and a splash 40 % (was 60 %: five rockets firing at one unit wiped out everything round it).

**Levels and grades** (`node tools/duel/career.mjs game <head> <careers>`: the «player» buys with one of the computer's own heads — 1 careless, 3 sensible, 5 the best — and starts each duel with what the profile has earned).

- With the design's 100 × n experience a level, the top level came after some 17 duels, before the last league. It is now **300 × n**: champion at about level 11, the top level some twenty duels later.
- The grades' first starting money and free levels fell behind the players' own profiles: from the second league a sensible player won more than nine duels in ten. They now start with $95, $135, $165, $190 and $220, and 0, 3, 5, 7 and 10 free skill levels.

| a sensible player (head 3) | Arena | Hierro | Bronce | Plata | Oro |
|---|---|---|---|---|---|
| level on arriving | 1 | 3.7 | 5.9 | 8.3 | 11.0 |
| duels won | 92 % | 69 % | 63 % | 53 % | 45 % |
| duels to leave it | 3.3 | 4.4 | 4.8 | 5.7 | 6.6 |

A careless one (head 1) wins 72, 42, 34, 53 and 30 %, and takes 36 duels to be champion instead of 25. Nobody gets stuck: a lost duel still brings experience, and so money and skill levels for the next.

## Rulings

1. **The balance tests field the armies the tuning did** (one kind of unit, the change in soldiers, what is left in upgrades), on two arenas: they hold the triangle, not exact shares.
2. **«A sensible player» is the computer's own grade-3 head.** There are no people's duels to measure against yet; the figures above are a starting point for the user's own playing. Costs, if wrong: leagues too easy or too hard for the family, to be set again with `career.mjs` after they have played.
3. **The first league stays easy** (nine wins in ten for a sensible player): it is where the game is learnt.

## Tasks

### Task 1: The rocket truck's rules, the units' numbers, the grades and the level
**Files:** `game/js/duel.js`, `game/js/duelAI.js`, `game/js/duelProfile.js` and their tests; `tools/duel/matrix.mjs`, `tools/duel/career.mjs`.
- [ ] Tests: the rocket's bonus on armour and its blind spot; the triangle; no kind wins everything or nothing; 300 × n; the grades' starts; the top grade's answer to rockets; each grade beats the one before.
- [ ] The code and the numbers; whole suite green; commit.

### Task 2: Arenas 2 to 5
**Files:** `tools/blender/maps/duel_layout.py`, `tools/blender/maps/build_map.py` (shapes and paints a layout composes its own props from), `game/js/duelArenas.js`, `game/assets/maps/duel<N>.jpg`, `duel<N>_fg.webp`.
- [ ] Hierro (a scrapyard), Bronce (a foundry yard), Plata (a snowed-in base), Oro (a palace courtyard): what stands up inside the arena's obstacle circles, nothing solid elsewhere.
- [ ] `art: true` for each; the pictures' test; a look at each in the browser; commit.
