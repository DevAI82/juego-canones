# Attack mode, plan C: balance and the final playthrough — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tune the attack mode so the design's simple bot wins most games on Fácil, about half on Normal and few on Difícil, on all four maps — then play it through in the browser.

**Architecture:** The bot (`js/attackBot.js`) becomes the design's bot: it buys an army, **gathers it** at the entry the towers cover least, and sends it into the base **together**. A balance script outside the game (the session scratchpad's `balance/run.mjs`: N bot games per map and difficulty, win rate, lives taken, rounds, towers destroyed, units lost) measures; the tuning knobs are the values already in the code — the attacker's income (`roundIncome`), unit prices (`UNIT_PRICES`), the defence's money (`DIFFICULTIES`) and the bounty the defence earns per unit destroyed. Each change is measured before and after.

**Tech Stack:** as before. **Spec:** [docs/2026-10-09-modo-atacante-design.md](2026-10-09-modo-atacante-design.md) §9 («Partidas completas automáticas … Objetivos de equilibrio para ese bot: en Fácil gana la mayoría de partidas; en Normal, alrededor de la mitad; en Difícil, pocas. Precios, ingresos y presupuestos de la defensa se ajustan hasta conseguirlo»).

## Global Constraints

- Targets, per difficulty, over the four maps together and with no map an outlier the other way: Fácil ≥ 70 % wins; Normal 35–65 %; Difícil ≤ 30 %.
- The defence game is untouched (its values live in `enemy.js`/`tower.js`/`waves.js`; attack-only values live in `attack.js`/`defenseAI.js`).
- Every tuned value keeps a comment saying it was tuned with the bot, like the defence game's tuned values.
- Commit locally only; never touch port 8420; close the browser tab after testing.

## Rulings this plan takes

1. **The bot gathers before it attacks** (the spec's «las agrupa»): a group of at least `GROUP_SIZE` units (or whatever it has in the last two rounds) goes in together; a new group gathers at that moment's least-defended entry.
2. **The defence's bounty is an attack-mode knob**: in attack mode the defence earns a share (`BOUNTY_SHARE`) of each destroyed unit's defence-game bounty — measured first; changed only if income and prices alone can't reach the targets.

---

### Task 1: The design's bot — gather, then go in together

**Files:** Modify `game/js/attackBot.js`, `game/js/attack-game.test.js`.

- [ ] **Step 1: Failing test** — in `attack-game.test.js`:

```js
test("the bot gathers its army at one entry and sends it in together", () => {
  const s = createAttackState(2, "normal", { aiSetup: false });
  s.economy.money = 0;
  s.attack.money = 1000;
  botRound(s);
  assert.ok(s.enemies.length >= GROUP_SIZE);
  sendIn(s);
  const going = s.enemies.filter((u) => u.order?.kind === "enter").length;
  assert.equal(going, s.enemies.length);
  const t = createAttackState(2, "normal", { aiSetup: false });
  t.attack.money = 60; // a few soldiers: not a group yet
  botRound(t);
  sendIn(t);
  assert.ok(t.enemies.length > 0 && t.enemies.every((u) => !u.order));
});
```

(with `import { playBotGame, botRound, sendIn, GROUP_SIZE } from "./attackBot.js";` and `import { createAttackState } from "./attack.js";`)

- [ ] **Step 2:** `node --test js/attack-game.test.js` → FAIL (`GROUP_SIZE` not exported).
- [ ] **Step 3:** In `attackBot.js`: export `GROUP_SIZE = 12`; `botRound` sets the entry only when no units are waiting (a new group gathers where the towers cover least) and buys as before without sending; `sendIn(state)` sends the waiting units when there are at least `GROUP_SIZE` of them, or in the last two rounds whatever there is.
- [ ] **Step 4:** `node --test` → PASS.
- [ ] **Step 5:** Commit: «The attack bot gathers its army and sends it in together».

### Task 2: Measure, tune, measure

**Files:** Modify (values only, with comments) `game/js/attack.js`, `game/js/defenseAI.js`; maybe `game/js/attack.js`'s bounty share (ruling 2).

- [ ] **Step 1:** Baseline with the new bot: `node <scratchpad>/balance/run.mjs game 20` — record the table in the ledger.
- [ ] **Step 2:** Adjust one knob family at a time (attacker income → unit prices → defence budgets → bounty share), re-run 20 games per cell after each change, keep what moves toward the targets, ledger every run (values and table).
- [ ] **Step 3:** When the targets hold, re-run with 40 games per cell to confirm; update the tests whose expected numbers come from the tuned values (`attack.test.js`'s design-numbers test, `defenseAI.test.js`'s difficulty-money test, `attackUI.test.js`'s card/HUD numbers) — each such change is a ledgered ruling, since it changes the design's initial values (spec §3.4–3.8 say these are «valores iniciales … se ajustan con partidas automáticas»).
- [ ] **Step 4:** `node --test` → PASS. Commit: «Attack mode tuned with the bot: …» (the values in the message).
- [ ] **Step 5:** Update the design doc's tables (§3.4, §3.5, §3.8) to the tuned values, marked «ajustados con partidas automáticas»; commit.

### Task 3: The browser playthrough

- [ ] **Step 1:** Static server on 8421, `td_settings` with music and effects off, every js file refreshed (`fetch(url, { cache: "reload" })`) before reloading (the in-app browser caches modules). If the pane is hidden, drive frames through a temporary `window` hook, removed before committing (`grep -c __td game/js/main.js` → 0).
- [ ] **Step 2:** Menu → Atacar → Nivel 2 → Fácil; buy, group, order, «¡Al ataque!», fight to a natural end (win or loss) with screenshots: preparation, mid-battle with fog, end screen.
- [ ] **Step 3:** Close the tab; ledger what was seen; fix anything broken with a failing test first.
