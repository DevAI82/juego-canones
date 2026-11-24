// A middling player's whole way up the leagues:  node career.mjs <game dir> [head] [careers]
// From a new profile, duels against each league's computer until three are
// won there, the profile gaining experience and points as in the game (the
// points put on tanks and rockets by turns). Says, a league: the level on
// reaching it, how many duels it took and the share won.
import { pathToFileURL } from "node:url";
import path from "node:path";

const game = path.resolve(process.argv[2]);
const head = Number(process.argv[3] || 3);
const careers = Number(process.argv[4] || 30);
const load = (file) => import(pathToFileURL(path.join(game, "js", file)).href);
const { createDuelState, stepDuel, STEP } = await load("duel.js");
const { gradeStart, playTurn } = await load("duelAI.js");
const { freshProfile, recordDuel, assignPoint, pointsFree, startOf } = await load("duelProfile.js");

const PICKS = [["tank", "armor"], ["tank", "damage"], ["rocket", "damage"], ["buggy", "rate"], ["tank", "rate"], ["rocket", "range"], ["soldier", "damage"], ["motorcycle", "speed"], ["tank", "range"], ["buggy", "damage"], ["rocket", "rate"], ["tank", "speed"], ["buggy", "armor"], ["rocket", "armor"]];

const stats = Array.from({ length: 5 }, () => ({ level: 0, duels: 0, wins: 0, stuck: 0 }));
let total = 0;
for (let c = 1; c <= careers; c++) {
  let profile = freshProfile();
  let seed = c * 1000;
  let next = 0;
  for (let league = 1; league <= 5; league++) {
    stats[league - 1].level += profile.level;
    let duels = 0;
    while (profile.league === league && !profile.champion && duels < 60) {
      while (pointsFree(profile) > 0) {
        const r = assignPoint(profile, ...PICKS[next++ % PICKS.length]);
        if (r.ok) profile = r.profile;
      }
      seed++;
      const s = createDuelState({ arena: league, seed, left: startOf(profile), right: gradeStart(league, seed) });
      while (s.phase !== "over") {
        playTurn(s, "right", league);
        playTurn(s, "left", head);
        while (s.phase === "combat") stepDuel(s, STEP);
        while (s.phase === "roundEnd") stepDuel(s, STEP);
      }
      const won = s.winner === "left";
      profile = recordDuel(profile, { arena: league, won, xp: s.sides.left.xp, rival: "computer" }).profile;
      duels++;
      stats[league - 1].duels++;
      if (won) stats[league - 1].wins++;
    }
    if (duels >= 60) stats[league - 1].stuck++;
    total += duels;
  }
}
const names = ["Arena", "Hierro", "Bronce", "Plata", "Oro"];
stats.forEach((s, i) => {
  console.log(`${names[i].padEnd(7)} reached at level ${(s.level / careers).toFixed(1)}, ${(s.duels / careers).toFixed(1)} duels to leave it, ${Math.round((100 * s.wins) / s.duels)}% won${s.stuck ? `, ${s.stuck} stuck` : ""}`);
});
console.log(`a career: ${(total / careers).toFixed(0)} duels (head ${head})`);
