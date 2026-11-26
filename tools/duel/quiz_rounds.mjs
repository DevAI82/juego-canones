// How long a Duelo Matemático's round lasts, and who wins it, with players
// of several kinds: rounds played without a screen, to set the volleys'
// numbers by (duelRhythm.js's QUIZ_VOLLEY, QUIZ_STREAK_VOLLEY, ...). The
// user's aim, 2026-11-27: a round of two or three minutes -- shorter for
// somebody who fails a lot -- and no shot that kills an army at once.
//
//   node tools/duel/quiz_rounds.mjs [game folder] [rounds a pairing]
//
// A player is how long they take to answer (s, from-to) and how often they
// are right. A slow one may not answer in time at the higher levels: that
// is a mistake, as at the table.
import path from "node:path";
import { pathToFileURL } from "node:url";

const game = path.resolve(process.argv[2] || "game");
const rounds = Number(process.argv[3]) || 200;
const load = (file) => import(pathToFileURL(path.join(game, "js", file)).href);
const { STEP, buyUnit, setReady } = await load("duel.js");
const { QUIZ_LANES } = await load("duelQuiz.js");
const rhythm = await load("duelRhythm.js");
const { createMusicalDuel, stepMusicalDuel, pressKey, songClock, questionOf, BOT_ACCURACY } = rhythm;
const { gradeStart, playTurn } = await load("duelAI.js");

const PLAYERS = {
  "niño (6-11 s, 80 %)": { think: [6, 11], right: 0.8 },
  "niño que duda (8-14 s, 65 %)": { think: [8, 14], right: 0.65 },
  "adulto (2-4 s, 97 %)": { think: [2, 4], right: 0.97 },
  "adulto que no falla (2-3 s)": { think: [2, 3], right: 1 },
  "adulto muy rápido que no falla (1-2 s)": { think: [1, 2], right: 1 },
  // The game's own rival of the first league: it buys its own army and
  // answers as duelRhythm.js has it answer.
  "la máquina": { machine: true },
  "nadie contesta": { think: [99, 99], right: 0 },
};
const ARMIES = {
  "2 tanques": ["tank", "tank"],
  "tanque + 5 soldados": ["tank", "soldier", "soldier", "soldier", "soldier", "soldier"],
  "lanzacohetes + 3 soldados": ["rocket", "soldier", "soldier", "soldier"],
  "5 buggies": ["buggy", "buggy", "buggy", "buggy", "buggy"],
};

// A small generator of numbers of its own, apart from the duel's.
function dice(seed) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function play(seed, left, right, armyLeft, armyRight) {
  const machine = Boolean(right.machine);
  const s = machine
    ? createMusicalDuel({ arena: 1, seed, quiz: true, right: gradeStart(1, seed), bots: { right: BOT_ACCURACY[0] } })
    : createMusicalDuel({ arena: 1, seed, quiz: true, left: { money: 5000 }, right: { money: 5000 } });
  for (const type of armyLeft) buyUnit(s, "left", type);
  if (machine) playTurn(s, "right", 1);
  else for (const type of armyRight) buyUnit(s, "right", type);
  setReady(s, "left");
  setReady(s, "right");
  stepMusicalDuel(s, STEP);
  const roll = dice(seed * 7919 + 13);
  const who = { left, right };
  const plan = { left: null, right: null }; // { n, at, right }: what a side will do with its question
  const start = songClock(s);
  let end = start;
  while (s.phase === "combat") {
    end = songClock(s);
    for (const side of ["left", "right"]) {
      const m = s.musical;
      if (m.bots[side] !== undefined) continue; // (the machine answers by itself)
      const asked = m.asks[side][m.from[side]];
      if (!asked) continue;
      if (!plan[side] || plan[side].n !== asked.n) {
        const [from, to] = who[side].think;
        plan[side] = { n: asked.n, at: asked.open + from + roll() * (to - from), right: roll() < who[side].right };
      }
      if (end >= plan[side].at && end >= asked.open && end <= asked.t) {
        const question = questionOf(m, asked);
        pressKey(s, side, plan[side].right ? question.lane : QUIZ_LANES.find((lane) => lane !== question.lane));
      }
    }
    stepMusicalDuel(s, STEP);
  }
  const health = (side) => {
    const army = s.units.filter((u) => u.side === side);
    return army.reduce((sum, u) => sum + Math.max(0, u.alive ? u.hp : 0), 0) / army.reduce((sum, u) => sum + u.maxHp, 0);
  };
  return { time: end - start, winner: s.lastRound.winner, reason: s.lastRound.reason, left: health("left"), right: health("right"), tally: s.musical.tally };
}

const median = (list) => [...list].sort((a, b) => a - b)[Math.floor(list.length / 2)];
const mean = (list) => list.reduce((sum, v) => sum + v, 0) / list.length;
const pct = (share) => `${Math.round(share * 100)} %`.padStart(5);

console.log(`QUIZ_VOLLEY ${rhythm.QUIZ_VOLLEY} · racha desde ${rhythm.QUIZ_STREAK_FROM}: ${rhythm.QUIZ_STREAK_VOLLEY} cada ${rhythm.QUIZ_STREAK_RELOAD} s · ${rounds} asaltos por pareja\n`);
const PAIRS = [
  ["adulto muy rápido que no falla (1-2 s)", "la máquina", "2 tanques", "el suyo"],
  ["adulto (2-4 s, 97 %)", "la máquina", "2 tanques", "el suyo"],
  ["niño (6-11 s, 80 %)", "la máquina", "2 tanques", "el suyo"],
  ["niño que duda (8-14 s, 65 %)", "la máquina", "2 tanques", "el suyo"],
  ["niño (6-11 s, 80 %)", "niño (6-11 s, 80 %)", "2 tanques", "2 tanques"],
  ["niño (6-11 s, 80 %)", "niño que duda (8-14 s, 65 %)", "2 tanques", "2 tanques"],
  ["niño que duda (8-14 s, 65 %)", "niño que duda (8-14 s, 65 %)", "2 tanques", "2 tanques"],
  ["adulto (2-4 s, 97 %)", "niño (6-11 s, 80 %)", "2 tanques", "2 tanques"],
  ["adulto que no falla (2-3 s)", "niño (6-11 s, 80 %)", "2 tanques", "2 tanques"],
  ["adulto (2-4 s, 97 %)", "adulto (2-4 s, 97 %)", "2 tanques", "2 tanques"],
  ["niño (6-11 s, 80 %)", "nadie contesta", "2 tanques", "2 tanques"],
  ["niño (6-11 s, 80 %)", "niño (6-11 s, 80 %)", "tanque + 5 soldados", "5 buggies"],
  ["niño (6-11 s, 80 %)", "niño (6-11 s, 80 %)", "2 tanques", "lanzacohetes + 3 soldados"],
  ["niño que duda (8-14 s, 65 %)", "adulto (2-4 s, 97 %)", "2 tanques", "lanzacohetes + 3 soldados"],
];
for (const [a, b, armyA, armyB] of PAIRS) {
  const played = Array.from({ length: rounds }, (_, i) => play(1000 + i, PLAYERS[a], PLAYERS[b], ARMIES[armyA], ARMIES[armyB]));
  const times = played.map((r) => r.time);
  const wiped = played.filter((r) => r.reason === "wipe").length / rounds;
  const leftWins = played.filter((r) => r.winner === "left").length / rounds;
  const answers = (side) => mean(played.map((r) => r.tally[side].hits + r.tally[side].misses));
  console.log(`${a} [${armyA}]  contra  ${b} [${armyB}]`);
  console.log(
    `   dura ${Math.round(median(times))} s de mediana (de ${Math.round(Math.min(...times))} a ${Math.round(Math.max(...times))}) · acaba destruido ${pct(wiped)} · gana el primero ${pct(leftWins)}` +
      ` · contestan ${answers("left").toFixed(0)} y ${answers("right").toFixed(0)} · les queda ${pct(mean(played.map((r) => r.left)))} y ${pct(mean(played.map((r) => r.right)))}\n`,
  );
}
