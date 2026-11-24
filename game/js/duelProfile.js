// A player's profile in the duel minigame (docs/2026-11-22-duelo-design.md
// §8): what stays from one duel to the next. A level, from the experience
// earned by destroying units; skill points, one a level, put in skills the
// player's units then start with against the computer; and a league, from
// duels won against the computer.
//
// The profile is a plain object and these functions never change the one
// they are given: they return a new one. It is remembered in the browser,
// like the settings -- each device keeps its own, and there are no
// accounts.
import { DUEL_ORDER, SKILLS, DUEL_UPGRADES, START_MONEY } from "./duel.js";
import { browserStorage } from "./util.js";

export const LEAGUES = ["Arena", "Hierro", "Bronce", "Plata", "Oro"];
export const MAX_LEVEL = 15;
export const WINS_TO_PROMOTE = 3; // wins against the computer in a league to leave it
export const MONEY_PER_LEVEL = 10; // $ more to start a duel with, a level

const KEY = "td_duel_profile";

// league: 1 to 5, the highest reached. leagueWins: wins against the
// computer in it so far. champion: won the last league too. points:
// points[type][skill] = skill points put there.
export function freshProfile() {
  return { xp: 0, level: 1, league: 1, leagueWins: 0, champion: false, points: {}, duels: 0, wins: 0 };
}

// Experience from one level to the next; null at the top. (300 a level:
// with the design's first figure, 100, simulated careers reached the top
// level in some 17 duels, before the last league.)
export function xpToNext(level) {
  return level >= MAX_LEVEL ? null : 300 * level;
}

// The level this much experience (in all) makes.
function levelFor(xp) {
  let level = 1;
  let left = xp;
  while (level < MAX_LEVEL && left >= xpToNext(level)) {
    left -= xpToNext(level);
    level++;
  }
  return level;
}

// How far into its level a profile is: the experience it has of the
// `need` to the next one (need: null at the top level).
export function xpProgress(profile) {
  let have = profile.xp;
  for (let level = 1; level < profile.level; level++) have -= xpToNext(level);
  const need = xpToNext(profile.level);
  return need === null ? { have: 0, need: null } : { have: Math.max(0, have), need };
}

// A duel in a higher league's arena is worth more experience.
export function leagueFactor(league) {
  return 1 + 0.25 * (league - 1);
}

// ------------------------------------------------------------ skill points

export function pointsSpent(profile) {
  let spent = 0;
  for (const type of Object.keys(profile.points)) {
    for (const skill of Object.keys(profile.points[type])) spent += profile.points[type][skill];
  }
  return spent;
}

// One point a level gained.
export function pointsFree(profile) {
  return profile.level - 1 - pointsSpent(profile);
}

const copyPoints = (points) => JSON.parse(JSON.stringify(points));

function knownSkill(type, skill) {
  if (!DUEL_ORDER.includes(type)) return "type";
  if (!SKILLS.includes(skill)) return "skill";
  return null;
}

export function assignPoint(profile, type, skill) {
  const unknown = knownSkill(type, skill);
  if (unknown) return { ok: false, reason: unknown };
  if (pointsFree(profile) <= 0) return { ok: false, reason: "points" };
  const there = profile.points[type]?.[skill] || 0;
  if (there >= DUEL_UPGRADES[skill].levels) return { ok: false, reason: "max" };
  const points = copyPoints(profile.points);
  points[type] = { ...points[type], [skill]: there + 1 };
  return { ok: true, profile: { ...profile, points } };
}

// Points can be moved about between duels at no cost: take one back here,
// put it elsewhere with assignPoint.
export function removePoint(profile, type, skill) {
  const there = profile.points[type]?.[skill] || 0;
  if (there <= 0) return { ok: false, reason: "none" };
  const points = copyPoints(profile.points);
  if (there > 1) points[type][skill] = there - 1;
  else {
    delete points[type][skill];
    if (Object.keys(points[type]).length === 0) delete points[type];
  }
  return { ok: true, profile: { ...profile, points } };
}

// ------------------------------------------------------------ duels

// What this profile starts a duel against the computer with: its side's
// options for duel.js's createDuelState. (Between two players both start
// alike, with no profile.)
export function startOf(profile) {
  return { money: START_MONEY + MONEY_PER_LEVEL * (profile.level - 1), free: copyPoints(profile.points) };
}

// The profile after a duel. arena: 1 to 5, where it was fought. xp: the
// prices of the enemy units this player destroyed (duel.js's side.xp).
// rival: "computer" or "player" -- only duels against the computer, in the
// highest league reached, count for the league. Returns the new profile
// and what the duel brought: { xp, levels, promoted, champion }.
export function recordDuel(profile, { arena, won, xp, rival }) {
  const gainedXp = Math.round(Math.max(0, xp) * leagueFactor(arena));
  const next = { ...profile, points: copyPoints(profile.points) };
  next.xp = profile.xp + gainedXp;
  next.level = levelFor(next.xp);
  next.duels = profile.duels + 1;
  next.wins = profile.wins + (won ? 1 : 0);
  let promoted = false;
  let champion = false;
  if (won && rival === "computer" && arena === profile.league && !profile.champion) {
    next.leagueWins = profile.leagueWins + 1;
    if (next.leagueWins >= WINS_TO_PROMOTE) {
      if (profile.league < LEAGUES.length) {
        next.league = profile.league + 1;
        next.leagueWins = 0;
        promoted = true;
      } else {
        next.champion = true;
        champion = true;
      }
    }
  }
  return { profile: next, gained: { xp: gainedXp, levels: next.level - profile.level, promoted, champion } };
}

// ------------------------------------------------------------ remembering

const wholeNumber = (value, least, most) => {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) ? Math.max(least, Math.min(most, n)) : least;
};

// A valid profile out of whatever was saved: a file from an older version,
// or one somebody edited, must not break the game.
export function cleanProfile(raw) {
  const fresh = freshProfile();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return fresh;
  const xp = wholeNumber(raw.xp, 0, Number.MAX_SAFE_INTEGER);
  const level = levelFor(xp); // the level is what the experience says
  const league = wholeNumber(raw.league, 1, LEAGUES.length);
  // The points: known skills only, five a skill at most, and no more in
  // all than the level gives.
  const points = {};
  let free = level - 1;
  for (const type of DUEL_ORDER) {
    for (const skill of SKILLS) {
      const wanted = wholeNumber(raw.points?.[type]?.[skill], 0, DUEL_UPGRADES[skill].levels);
      const given = Math.min(wanted, free);
      if (given <= 0) continue;
      points[type] = { ...points[type], [skill]: given };
      free -= given;
    }
  }
  return {
    xp,
    level,
    league,
    leagueWins: wholeNumber(raw.leagueWins, 0, WINS_TO_PROMOTE),
    champion: raw.champion === true && league === LEAGUES.length,
    points,
    duels: wholeNumber(raw.duels, 0, Number.MAX_SAFE_INTEGER),
    wins: wholeNumber(raw.wins, 0, Number.MAX_SAFE_INTEGER),
  };
}

export function loadProfile(storage = browserStorage()) {
  try {
    return cleanProfile(JSON.parse((storage && storage.getItem(KEY)) || "null"));
  } catch {
    return freshProfile();
  }
}

export function saveProfile(profile, storage = browserStorage()) {
  if (!storage) return false;
  try {
    storage.setItem(KEY, JSON.stringify(cleanProfile(profile)));
    return true;
  } catch {
    return false;
  }
}
