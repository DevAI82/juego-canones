import { test } from "node:test";
import assert from "node:assert/strict";
import {
  duelShopEntries,
  duelUpgradeRows,
  duelRefund,
  duelHud,
  duelHint,
  roundBanner,
  duelResult,
  lobbyInfo,
} from "./duelUI.js";
import { createDuelState, buyUnit, upgradeUnit, setReady, stepDuel, duelView, STEP, ROUND_END_TIME } from "./duel.js";
import { freshProfile, recordDuel, assignPoint, xpProgress } from "./duelProfile.js";

const entry = (view, side, type) => duelShopEntries(view, side).find((e) => e.type === type);

// The fight under way, to its end.
function fight(state) {
  while (state.phase === "combat") stepDuel(state, STEP);
}

// A duel the left side wins 3-0 against a rival that fields one soldier.
function wonDuel() {
  const s = createDuelState();
  buyUnit(s, "left", "tank");
  buyUnit(s, "left", "tank");
  buyUnit(s, "right", "soldier");
  while (s.phase !== "over") {
    setReady(s, "left");
    setReady(s, "right");
    fight(s);
    while (s.phase === "roundEnd") stepDuel(s, STEP);
  }
  return s;
}

test("the shop shows each unit, its price and its upgrades, and what can be bought", () => {
  const s = createDuelState({ left: { money: 60 } });
  upgradeUnit(s, "left", "soldier", "damage"); // $20: $40 left
  const view = duelView(s, "left");
  const cards = duelShopEntries(view, "left");
  assert.deepEqual(cards.map((c) => c.type), ["soldier", "motorcycle", "buggy", "tank", "rocket"]);
  assert.equal(entry(view, "left", "soldier").label, "Soldado $10");
  assert.equal(entry(view, "left", "soldier").stars, 1);
  assert.equal(entry(view, "left", "soldier").disabled, false);
  assert.equal(entry(view, "left", "tank").label, "Tanque $50");
  assert.equal(entry(view, "left", "tank").stars, 0);
  assert.equal(entry(view, "left", "tank").disabled, true);
  assert.equal(entry(view, "left", "tank").title, "No hay dinero suficiente");
});

test("the shop is shut with a full army, once ready, and during the fight", () => {
  const full = createDuelState({ left: { money: 1000 } });
  for (let i = 0; i < 12; i++) buyUnit(full, "left", "soldier");
  assert.equal(entry(duelView(full, "left"), "left", "soldier").disabled, true);
  assert.equal(entry(duelView(full, "left"), "left", "soldier").title, "Tope de 12 unidades");

  const s = createDuelState();
  buyUnit(s, "left", "soldier");
  setReady(s, "left");
  assert.equal(entry(duelView(s, "left"), "left", "soldier").disabled, true);
  buyUnit(s, "right", "soldier");
  setReady(s, "right");
  assert.equal(s.phase, "combat");
  assert.equal(entry(duelView(s, "left"), "left", "soldier").disabled, true);
});

test("a unit type's five upgrades, each with its level, its price and whether it can be paid", () => {
  const s = createDuelState({ left: { money: 45, free: { tank: { damage: 5, range: 1 } } } });
  const rows = duelUpgradeRows(duelView(s, "left"), "left", "tank");
  assert.deepEqual(rows.map((r) => r.skill), ["damage", "range", "armor", "rate", "speed"]);
  assert.deepEqual(rows.map((r) => r.name), ["Daño", "Alcance", "Blindaje", "Cadencia", "Velocidad"]);
  const [damage, range, armor] = rows;
  assert.deepEqual({ level: damage.level, levels: damage.levels, maxed: damage.maxed, cost: damage.cost, affordable: damage.affordable }, { level: 5, levels: 5, maxed: true, cost: null, affordable: false });
  assert.deepEqual({ level: range.level, cost: range.cost, affordable: range.affordable }, { level: 1, cost: 30, affordable: true });
  assert.deepEqual({ level: armor.level, cost: armor.cost, affordable: armor.affordable }, { level: 0, cost: 20, affordable: true });
  setReady(s, "left");
  assert.ok(duelUpgradeRows(duelView(s, "left"), "left", "tank").every((r) => !r.affordable), "nothing to buy once ready");
});

test("selling gives the whole price back for a unit bought in this purchase, half for an older one", () => {
  const s = createDuelState();
  const { unit } = buyUnit(s, "left", "tank");
  assert.equal(duelRefund(duelView(s, "left"), unit), 50);
  assert.equal(duelRefund(duelView(s, "left"), { ...unit, round: 0 }), 25);
});

test("the HUD: the league, the round, the money, the army and the score", () => {
  const s = createDuelState({ arena: 2, left: { money: 123.9 } });
  buyUnit(s, "left", "soldier");
  let hud = duelHud(duelView(s, "left"), "left");
  assert.deepEqual(hud, { head: "Duelo · Liga Hierro · Asalto 1", money: "$113", army: "Unidades 1/12", clock: null, mine: 0, theirs: 0, toWin: 3 });

  buyUnit(s, "right", "tank");
  setReady(s, "left");
  setReady(s, "right");
  hud = duelHud(duelView(s, "left"), "left");
  assert.equal(hud.clock, "1:00");
  for (let i = 0; i < 31; i++) stepDuel(s, STEP);
  assert.equal(duelHud(duelView(s, "left"), "left").clock, "0:59");
  fight(s);
  assert.equal(duelHud(duelView(s, "left"), "left").theirs, 1);
  assert.equal(duelHud(duelView(s, "right"), "right").mine, 1);
  assert.equal(duelHud(duelView(s, "left"), "left").clock, null, "no clock on the round's result");

  // Between two players the purchase has its clock.
  assert.equal(duelHud(duelView(createDuelState({ timed: true }), "left"), "left").clock, "0:45");
});

test("the hint says what to do next", () => {
  const s = createDuelState();
  assert.equal(duelHint(duelView(s, "left"), "left"), "Compra tu ejército en la tienda");
  buyUnit(s, "left", "soldier");
  assert.equal(duelHint(duelView(s, "left"), "left"), "Arrastra tus unidades para colocarlas y pulsa «¡Listo!»");
  setReady(s, "left");
  assert.equal(duelHint(duelView(s, "left"), "left"), "Esperando al rival…");
  buyUnit(s, "right", "soldier");
  setReady(s, "right");
  assert.equal(duelHint(duelView(s, "left"), "left"), "");
});

test("the round's banner tells each side how it went and what it earned", () => {
  const s = createDuelState();
  buyUnit(s, "left", "tank");
  buyUnit(s, "left", "tank");
  buyUnit(s, "right", "buggy");
  assert.equal(roundBanner(duelView(s, "left"), "left"), null);
  setReady(s, "left");
  setReady(s, "right");
  assert.equal(roundBanner(duelView(s, "left"), "left"), null);
  fight(s);

  const mine = roundBanner(duelView(s, "left"), "left");
  assert.equal(mine.won, true);
  assert.equal(mine.title, "¡ASALTO GANADO!");
  assert.equal(mine.detail, "Has destruido su ejército");
  assert.equal(mine.income, "+$75");
  assert.equal(mine.earned, "+$10");
  const theirs = roundBanner(duelView(s, "right"), "right");
  assert.equal(theirs.won, false);
  assert.equal(theirs.title, "ASALTO PERDIDO");
  assert.equal(theirs.detail, "Han destruido tu ejército");
  assert.equal(theirs.income, "+$50");

  for (let i = 0; i < ROUND_END_TIME / STEP + 2; i++) stepDuel(s, STEP);
  assert.equal(roundBanner(duelView(s, "left"), "left"), null, "gone when the next purchase starts");
});

test("the banner explains a round that wasn't decided by destroying an army", () => {
  const banner = (reason, winner, side) =>
    roundBanner({ phase: "roundEnd", lastRound: { winner, reason, income: { left: 75, right: 50 } }, sides: { left: { earned: 0 }, right: { earned: 0 } } }, side);
  assert.equal(banner("time", "left", "left").detail, "Se acabó el tiempo: te quedaba más ejército");
  assert.equal(banner("time", "left", "right").detail, "Se acabó el tiempo: al rival le quedaba más ejército");
  assert.equal(banner("damage", "left", "left").detail, "Fuerzas igualadas: hiciste más daño");
  assert.equal(banner("damage", "left", "right").detail, "Fuerzas igualadas: el rival hizo más daño");
  assert.equal(banner("coin", "left", "left").detail, "Empate total: se decidió a suertes");
  assert.equal(banner("empty", "left", "left").detail, "El rival no presentó ejército");
  assert.equal(banner("empty", "left", "right").detail, "No presentaste ejército");
});

test("the duel's result: the score, what was destroyed and what the profile gained", () => {
  const s = wonDuel();
  const before = { ...freshProfile(), xp: 95 };
  const { profile, gained } = recordDuel(before, { arena: 1, won: true, xp: s.sides.left.xp, rival: "computer" });
  const result = duelResult(s, "left", gained, profile);
  assert.equal(result.won, true);
  assert.equal(result.title, "¡VICTORIA!");
  assert.equal(result.score, "3 – 0");
  assert.deepEqual(result.rows, [
    ["Unidades destruidas", "3"],
    ["Experiencia", "+30"],
    ["Nivel", "2"],
  ]);
  assert.deepEqual(result.news, ["¡Subes al nivel 2! Tienes 1 punto de habilidad por asignar"]);
  assert.equal(result.league, "Liga Arena · 1/3 victorias para ascender");

  const lost = duelResult(s, "right", { xp: 0, levels: 0, promoted: false, champion: false }, freshProfile());
  assert.equal(lost.won, false);
  assert.equal(lost.title, "DERROTA");
  assert.equal(lost.score, "0 – 3");
  assert.deepEqual(lost.news, []);
});

test("the result announces a promotion and a championship", () => {
  const s = wonDuel();
  const promoted = duelResult(s, "left", { xp: 30, levels: 0, promoted: true, champion: false }, { ...freshProfile(), league: 2 });
  assert.deepEqual(promoted.news, ["¡Asciendes a la liga Hierro!"]);
  assert.equal(promoted.league, "Liga Hierro · 0/3 victorias para ascender");

  const champ = duelResult(s, "left", { xp: 30, levels: 2, promoted: false, champion: true }, { ...freshProfile(), xp: 300, level: 3, league: 5, leagueWins: 3, champion: true });
  assert.deepEqual(champ.news, ["¡Subes al nivel 3! Tienes 2 puntos de habilidad por asignar", "¡Campeón de la liga Oro!"]);
  assert.equal(champ.league, "Campeón de la liga Oro");
});

test("experience within the level, for the profile's bar", () => {
  assert.deepEqual(xpProgress(freshProfile()), { have: 0, need: 100 });
  assert.deepEqual(xpProgress({ ...freshProfile(), xp: 350, level: 3 }), { have: 50, need: 300 });
  assert.deepEqual(xpProgress({ ...freshProfile(), xp: 20000, level: 15 }), { have: 0, need: null });
});

test("the profile's screen: level, league, points and which arenas are open", () => {
  let p = recordDuel(freshProfile(), { arena: 1, won: true, xp: 350, rival: "computer" }).profile; // level 3
  p = assignPoint(p, "tank", "armor").profile;
  p = { ...p, league: 3, leagueWins: 2 };
  const info = lobbyInfo(p);
  assert.equal(info.level, 3);
  assert.deepEqual(info.xp, { have: 50, need: 300 });
  assert.equal(info.league, "Liga Bronce · 2/3 victorias para ascender");
  assert.equal(info.pointsFree, 1);
  assert.equal(info.points.tank.armor, 1);
  assert.equal(info.points.soldier.damage, 0);
  assert.deepEqual(info.arenas, [
    { id: 1, name: "Arena", locked: false, top: false },
    { id: 2, name: "Hierro", locked: false, top: false },
    { id: 3, name: "Bronce", locked: false, top: true },
    { id: 4, name: "Plata", locked: true, top: false },
    { id: 5, name: "Oro", locked: true, top: false },
  ]);
  assert.equal(lobbyInfo({ ...p, league: 5, leagueWins: 1 }).league, "Liga Oro · 1/3 victorias para ser campeón");
  assert.equal(lobbyInfo({ ...p, league: 5, leagueWins: 3, champion: true }).league, "Campeón de la liga Oro");
});
