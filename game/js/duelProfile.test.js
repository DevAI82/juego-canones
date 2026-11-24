import { test } from "node:test";
import assert from "node:assert/strict";
import {
  LEAGUES,
  MAX_LEVEL,
  WINS_TO_PROMOTE,
  freshProfile,
  xpToNext,
  leagueFactor,
  pointsSpent,
  pointsFree,
  assignPoint,
  removePoint,
  startOf,
  recordDuel,
  cleanProfile,
  loadProfile,
  saveProfile,
} from "./duelProfile.js";
import { createDuelState, upgradeCost } from "./duel.js";

// A profile with this much experience, as a duel would have left it.
function withXp(xp) {
  return recordDuel(freshProfile(), { arena: 1, won: false, xp, rival: "computer" }).profile;
}

function fakeStorage(initial = {}) {
  const data = { ...initial };
  return { data, getItem: (key) => (key in data ? data[key] : null), setItem: (key, value) => (data[key] = String(value)) };
}

test("a new profile: level 1, the Arena league, nothing won", () => {
  assert.deepEqual(freshProfile(), { xp: 0, level: 1, league: 1, leagueWins: 0, champion: false, points: {}, duels: 0, wins: 0 });
  assert.deepEqual(LEAGUES, ["Arena", "Hierro", "Bronce", "Plata", "Oro"]);
  assert.equal(MAX_LEVEL, 15);
  assert.equal(WINS_TO_PROMOTE, 3);
});

test("level n to n + 1 takes 300 x n experience, up to level 15", () => {
  assert.equal(xpToNext(1), 300);
  assert.equal(xpToNext(7), 2100);
  assert.equal(xpToNext(15), null);
  assert.equal(withXp(299).level, 1);
  assert.equal(withXp(300).level, 2);
  assert.equal(withXp(899).level, 2);
  assert.equal(withXp(900).level, 3);
  assert.equal(withXp(31499).level, 14);
  assert.equal(withXp(31500).level, 15);
  assert.equal(withXp(999999).level, 15);
});

test("a duel's experience counts by the arena's league", () => {
  assert.deepEqual([1, 2, 3, 4, 5].map(leagueFactor), [1, 1.25, 1.5, 1.75, 2]);
  const { profile, gained } = recordDuel(freshProfile(), { arena: 3, won: false, xp: 300, rival: "computer" });
  assert.equal(gained.xp, 450);
  assert.equal(profile.xp, 450);
  assert.equal(profile.level, 2);
  assert.equal(gained.levels, 1);
  assert.equal(profile.duels, 1);
  assert.equal(profile.wins, 0);
});

test("recordDuel leaves the profile it was given alone", () => {
  const before = freshProfile();
  recordDuel(before, { arena: 1, won: true, xp: 500, rival: "computer" });
  assert.deepEqual(before, freshProfile());
});

test("a level gives a skill point, to put in a skill of a unit type", () => {
  const p = withXp(900); // level 3: two points
  assert.equal(pointsFree(p), 2);
  assert.equal(pointsSpent(p), 0);

  const one = assignPoint(p, "tank", "damage");
  assert.equal(one.ok, true);
  assert.deepEqual(one.profile.points, { tank: { damage: 1 } });
  assert.deepEqual(p.points, {}, "the profile given is not changed");
  const two = assignPoint(one.profile, "tank", "damage");
  assert.deepEqual(two.profile.points, { tank: { damage: 2 } });
  assert.equal(pointsFree(two.profile), 0);
  assert.deepEqual(assignPoint(two.profile, "buggy", "speed"), { ok: false, reason: "points" });

  assert.deepEqual(assignPoint(p, "plane", "damage"), { ok: false, reason: "type" });
  assert.deepEqual(assignPoint(p, "tank", "luck"), { ok: false, reason: "skill" });
});

test("points can be taken back and put elsewhere, at no cost", () => {
  const p = assignPoint(withXp(900), "tank", "damage").profile;
  const back = removePoint(p, "tank", "damage");
  assert.equal(back.ok, true);
  assert.deepEqual(back.profile.points, {});
  assert.equal(pointsFree(back.profile), 2);
  assert.deepEqual(removePoint(back.profile, "tank", "damage"), { ok: false, reason: "none" });
  assert.deepEqual(removePoint(p, "tank", "range"), { ok: false, reason: "none" });
});

test("a skill takes five points at most", () => {
  let p = withXp(31500); // level 15: fourteen points
  for (let i = 0; i < 5; i++) p = assignPoint(p, "rocket", "range").profile;
  assert.equal(p.points.rocket.range, 5);
  assert.deepEqual(assignPoint(p, "rocket", "range"), { ok: false, reason: "max" });
  assert.equal(pointsFree(p), 9);
});

test("against the computer a profile starts with its money and its free levels", () => {
  assert.deepEqual(startOf(freshProfile()), { money: 100, free: {} });
  let p = withXp(1800); // level 4
  p = assignPoint(p, "tank", "damage").profile;
  p = assignPoint(p, "tank", "damage").profile;
  const start = startOf(p);
  assert.deepEqual(start, { money: 130, free: { tank: { damage: 2 } } });
  // It is what a duel takes for a side.
  const s = createDuelState({ left: start });
  assert.equal(s.sides.left.money, 130);
  assert.equal(upgradeCost(s, "left", "tank", "damage"), 60);
  // And a copy: the duel can't change the profile through it.
  start.free.tank.damage = 5;
  assert.equal(p.points.tank.damage, 2);
});

test("three wins against the computer in the highest league reached promote", () => {
  const win = (profile, arena = profile.league, rival = "computer") => recordDuel(profile, { arena, won: true, xp: 0, rival });
  let p = freshProfile();
  let r = win(p);
  assert.equal(r.profile.leagueWins, 1);
  assert.equal(r.gained.promoted, false);
  r = win(r.profile);
  // A loss in between doesn't undo anything.
  r = recordDuel(r.profile, { arena: 1, won: false, xp: 0, rival: "computer" });
  assert.equal(r.profile.leagueWins, 2);
  r = win(r.profile);
  assert.equal(r.gained.promoted, true);
  assert.equal(r.profile.league, 2);
  assert.equal(r.profile.leagueWins, 0);
  assert.equal(r.profile.wins, 3);
  assert.equal(r.profile.duels, 4);

  // Now in Hierro: a win back in the Arena, or against a player, counts
  // as a win but not for the league.
  p = r.profile;
  assert.equal(win(p, 1).profile.leagueWins, 0);
  assert.equal(win(p, 1).profile.wins, 4);
  assert.equal(win(p, 2, "player").profile.leagueWins, 0);
  assert.equal(win(p, 2, "player").profile.league, 2);
  assert.equal(win(p, 2).profile.leagueWins, 1);
});

test("a duel against a player gives its experience", () => {
  const { profile, gained } = recordDuel(freshProfile(), { arena: 5, won: true, xp: 150, rival: "player" });
  assert.equal(gained.xp, 300);
  assert.equal(profile.level, 2);
  assert.equal(profile.league, 1);
});

test("three wins in Oro make a champion, and there is nowhere higher", () => {
  let p = { ...freshProfile(), league: 5 };
  let r;
  for (let i = 0; i < 3; i++) {
    r = recordDuel(p, { arena: 5, won: true, xp: 0, rival: "computer" });
    p = r.profile;
  }
  assert.equal(p.champion, true);
  assert.equal(r.gained.champion, true);
  assert.equal(r.gained.promoted, false);
  assert.equal(p.league, 5);
  r = recordDuel(p, { arena: 5, won: true, xp: 0, rival: "computer" });
  assert.equal(r.profile.champion, true);
  assert.equal(r.gained.champion, false, "it is news only once");
  assert.equal(r.profile.league, 5);
});

test("a saved profile comes back as it was", () => {
  const storage = fakeStorage();
  let p = withXp(700);
  p = assignPoint(p, "buggy", "rate").profile;
  p = recordDuel(p, { arena: 1, won: true, xp: 0, rival: "computer" }).profile;
  assert.equal(saveProfile(p, storage), true);
  assert.deepEqual(loadProfile(storage), p);
  assert.ok("td_duel_profile" in storage.data);
});

test("a missing or broken saved profile is a new one", () => {
  assert.deepEqual(loadProfile(fakeStorage()), freshProfile());
  assert.deepEqual(loadProfile(fakeStorage({ td_duel_profile: "{not json" })), freshProfile());
  assert.deepEqual(loadProfile(fakeStorage({ td_duel_profile: "null" })), freshProfile());
  assert.deepEqual(loadProfile(fakeStorage({ td_duel_profile: "[1,2]" })), freshProfile());
  assert.deepEqual(loadProfile(null), freshProfile());
  assert.equal(saveProfile(freshProfile(), null), false);
});

test("a saved profile with silly values is put right", () => {
  const cleaned = cleanProfile({
    xp: 950,
    level: 99, // the level is what the experience says
    league: 12,
    leagueWins: -4,
    champion: "yes",
    points: { tank: { damage: 9, luck: 2 }, plane: { damage: 1 }, buggy: { speed: 1.7 } },
    duels: "many",
    wins: 3.9,
    extra: true,
  });
  assert.equal(cleaned.xp, 950);
  assert.equal(cleaned.level, 3);
  assert.equal(cleaned.league, 5);
  assert.equal(cleaned.leagueWins, 0);
  assert.equal(cleaned.duels, 0);
  assert.equal(cleaned.wins, 3);
  assert.equal(cleaned.extra, undefined);
  // Level 3 allows two points: the rest are dropped.
  assert.equal(pointsSpent(cleaned), 2);
  assert.ok(pointsFree(cleaned) >= 0);
  assert.equal(cleaned.points.plane, undefined);
  assert.equal(cleaned.points.tank.luck, undefined);
  assert.deepEqual(cleanProfile({ xp: -5 }), freshProfile());
  assert.deepEqual(cleanProfile("nonsense"), freshProfile());
  // A champion is of the top league only.
  assert.equal(cleanProfile({ league: 3, champion: true }).champion, false);
  assert.equal(cleanProfile({ league: 5, champion: true }).champion, true);
});
