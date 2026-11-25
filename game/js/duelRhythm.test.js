import { test } from "node:test";
import assert from "node:assert/strict";
import { STEP, DUEL_UNITS, LIGHT_VS_ARMOR, ROUND_END_TIME, buyUnit, moveUnit, upgradeUnit, setReady, stepDuel, createDuelState } from "./duel.js";
import { fightChart } from "./duelSongs.js";
import { TRACKS } from "./duelTracks.js";
import { HIT_WINDOW, VOLLEY_RELOAD, createMusicalDuel, stepMusicalDuel, pressKey, songClock } from "./duelRhythm.js";

// These tests are about the song written as notes: a recording made for
// its league since (duelTracks.js) is put aside while they run.
for (const id of Object.keys(TRACKS)) delete TRACKS[id];

// A musical duel with these armies, both sides ready: the fight is on.
// `bots`: the sides the computer plays, and how often it hits (0 to 1).
function fight({ left = ["tank"], right = ["tank"], bots = {}, seed = 7 } = {}) {
  const s = createMusicalDuel({ arena: 1, seed, bots, left: { money: 2000 }, right: { money: 2000 } });
  for (const type of left) assert.ok(buyUnit(s, "left", type).ok);
  for (const type of right) assert.ok(buyUnit(s, "right", type).ok);
  setReady(s, "left");
  setReady(s, "right");
  return s;
}

const run = (s, seconds) => {
  for (let i = 0; i < Math.round(seconds / STEP); i++) stepMusicalDuel(s, STEP);
};
// On to the moment this key of the fight is on the line (to within a tick).
const runTo = (s, t) => {
  for (let i = 0; songClock(s) < t - STEP / 2; i++) {
    assert.ok(i < 1e5 && s.phase === "combat", `the fight never got to ${t} s`);
    stepMusicalDuel(s, STEP);
  }
};
// On to the end of the fight.
const fightOut = (s) => {
  for (let i = 0; i < 1e5 && s.phase === "combat"; i++) stepMusicalDuel(s, STEP);
};
const notes = () => fightChart(1).notes;
const health = (s, side) => s.units.filter((u) => u.side === side).reduce((sum, u) => sum + u.hp, 0);
const whole = (s, side) => s.units.filter((u) => u.side === side).reduce((sum, u) => sum + u.maxHp, 0);

test("a musical duel shops like any other, and its fight starts with the song", () => {
  const s = createMusicalDuel({ arena: 1, seed: 3 });
  assert.equal(s.mode, "duel");
  assert.equal(s.phase, "buy");
  assert.equal(s.musical.song, 1);
  assert.ok(buyUnit(s, "left", "soldier").ok);
  assert.ok(buyUnit(s, "right", "soldier").ok);
  stepMusicalDuel(s, 1); // shopping has no clock against the computer
  assert.equal(s.phase, "buy");
  assert.equal(pressKey(s, "left", "up").ok, false, "no keys while shopping");
  setReady(s, "left");
  setReady(s, "right");
  assert.equal(s.phase, "combat");
  stepMusicalDuel(s, STEP);
  assert.ok(Math.abs(songClock(s) - STEP) < 1e-9);
  assert.ok(Math.abs(s.clock - (fightChart(1).length - STEP)) < 1e-6, "the clock is what is left of the music");
  // Nobody moves: the armies stand where they were placed.
  const before = s.units.map((u) => [u.x, u.y]);
  run(s, 2);
  assert.deepEqual(s.units.map((u) => [u.x, u.y]), before);
});

test("an ordinary duel is none of this module's business", () => {
  const a = createDuelState({ seed: 5 });
  const b = createDuelState({ seed: 5 });
  for (const s of [a, b]) {
    buyUnit(s, "left", "tank");
    buyUnit(s, "right", "soldier");
    setReady(s, "left");
    setReady(s, "right");
  }
  for (let i = 0; i < 300; i++) {
    stepDuel(a, STEP);
    stepMusicalDuel(b, STEP);
  }
  assert.deepEqual(b, a);
});

test("a key pressed as its note is on the line is a hit; a note let go by brings the rival's volley", () => {
  const s = fight();
  const first = notes()[0];
  runTo(s, first.t);
  const pressed = pressKey(s, "left", first.lane);
  assert.equal(pressed.ok, true);
  assert.equal(pressed.hit, true);
  assert.equal(s.musical.marks.left[0], 1);
  // The right side presses nothing: when the note is out of reach, the left
  // army fires at it.
  run(s, HIT_WINDOW + 3 * STEP);
  assert.equal(s.musical.marks.right[0], 2);
  assert.equal(health(s, "left"), whole(s, "left"));
  assert.ok(Math.abs(whole(s, "right") - health(s, "right") - DUEL_UNITS.tank.damage) < 1e-9, "one shot of the one tank");
  assert.equal(s.shots.filter((shot) => shot.side === "left").length, 1);
  assert.equal(s.musical.tally.left.hits, 1);
  assert.equal(s.musical.tally.right.misses, 1);
});

test("a little early or a little late still hits; too early doesn't", () => {
  const first = notes()[0];
  for (const off of [-HIT_WINDOW + 0.03, HIT_WINDOW - 0.03]) {
    const s = fight({ bots: { right: 1 } });
    runTo(s, first.t + off);
    assert.equal(pressKey(s, "left", first.lane).hit, true, `${off} s off`);
  }
  const s = fight({ bots: { right: 1 } });
  runTo(s, first.t - HIT_WINDOW - 0.1);
  assert.equal(pressKey(s, "left", first.lane).hit, false);
});

test("the wrong key is a mistake and loses the note: one volley, not two", () => {
  const s = fight({ bots: { right: 1 } });
  const first = notes()[0];
  const wrong = first.lane === "up" ? "down" : "up";
  runTo(s, first.t);
  const pressed = pressKey(s, "left", wrong);
  assert.equal(pressed.ok, true);
  assert.equal(pressed.hit, false);
  assert.equal(s.musical.marks.left[0], 2, "the note went with it");
  stepMusicalDuel(s, STEP);
  const hurt = whole(s, "left") - health(s, "left");
  assert.ok(Math.abs(hurt - DUEL_UNITS.tank.damage) < 1e-9);
  // Pressing the right one now is late; and the note's time running out
  // costs nothing more.
  assert.equal(pressKey(s, "left", first.lane).hit, false);
  run(s, HIT_WINDOW + 3 * STEP);
  assert.ok(Math.abs(whole(s, "left") - health(s, "left") - hurt) < 1e-9, "the rival's army was still loading");
});

test("a key pressed with no note near is a mistake too", () => {
  const s = fight({ bots: { right: 1 } });
  run(s, 1); // the song's opening bars: nothing to press
  assert.equal(pressKey(s, "left", "1").hit, false);
  stepMusicalDuel(s, STEP);
  assert.ok(health(s, "left") < whole(s, "left"));
  assert.equal(pressKey(s, "left", "W").ok, false, "not one of the game's keys");
});

test("an army fires again only once it has reloaded", () => {
  const s = fight({ bots: { right: 1 } });
  run(s, 1);
  pressKey(s, "left", "1");
  stepMusicalDuel(s, STEP);
  const one = whole(s, "left") - health(s, "left");
  pressKey(s, "left", "2");
  run(s, VOLLEY_RELOAD / 2);
  assert.ok(Math.abs(whole(s, "left") - health(s, "left") - one) < 1e-9, "still loading");
  run(s, VOLLEY_RELOAD);
  pressKey(s, "left", "3");
  stepMusicalDuel(s, STEP);
  assert.ok(Math.abs(whole(s, "left") - health(s, "left") - 2 * one) < 1e-9, "loaded again");
});

test("both miss the same note: both volleys land", () => {
  const s = fight({ left: ["tank", "tank"], right: ["tank", "tank"] });
  runTo(s, notes()[0].t + HIT_WINDOW + 3 * STEP);
  assert.ok(health(s, "left") < whole(s, "left"));
  assert.ok(Math.abs(health(s, "left") - health(s, "right")) < 1e-9, "neither side is ahead for it");
});

test("a volley is one shot of each unit left, at the enemies in front first", () => {
  // Three soldiers at one tank: light weapons on armour.
  let s = fight({ left: ["soldier", "soldier", "soldier"], right: ["tank"], bots: { left: 1 } });
  runTo(s, notes()[0].t + HIT_WINDOW + 3 * STEP);
  assert.ok(Math.abs(whole(s, "right") - health(s, "right") - 3 * DUEL_UNITS.soldier.damage * LIGHT_VS_ARMOR) < 1e-9);
  assert.equal(s.shots.length, 3);
  // Three tanks' shells are what a soldier can take: the next three go
  // for the next soldier, and nothing is left for the third.
  s = fight({ left: ["tank", "tank", "tank", "tank", "tank", "tank"], right: ["soldier", "soldier", "soldier"], bots: { left: 1 } });
  runTo(s, notes()[0].t + HIT_WINDOW + 3 * STEP);
  const soldiers = s.units.filter((u) => u.side === "right");
  assert.equal(soldiers.filter((u) => !u.alive).length, 2);
  assert.equal(soldiers.filter((u) => u.hp === u.maxHp).length, 1);
  // The one left standing was no nearer the middle than the others.
  const standing = soldiers.find((u) => u.alive);
  for (const u of soldiers) assert.ok(Math.abs(u.x - 600) <= Math.abs(standing.x - 600));
  assert.equal(s.sides.left.destroyed.soldier, 2);
  assert.ok(s.sides.left.money > 2000 - 300, "destroying pays, as in any duel");
});

test("what stands in front shields what stands behind", () => {
  const s = createMusicalDuel({ arena: 1, seed: 7, bots: { left: 1 }, left: { money: 2000 }, right: { money: 2000 } });
  for (let i = 0; i < 3; i++) buyUnit(s, "left", "soldier");
  const tank = buyUnit(s, "right", "tank").unit;
  const rocket = buyUnit(s, "right", "rocket").unit;
  assert.ok(moveUnit(s, "right", tank.id, 780, 375).ok);
  assert.ok(moveUnit(s, "right", rocket.id, 1100, 600).ok);
  setReady(s, "left");
  setReady(s, "right");
  runTo(s, notes()[0].t + HIT_WINDOW + 3 * STEP);
  const unit = (id) => s.units.find((u) => u.id === id);
  assert.equal(unit(rocket.id).hp, unit(rocket.id).maxHp);
  assert.ok(Math.abs(unit(tank.id).maxHp - unit(tank.id).hp - 3 * DUEL_UNITS.soldier.damage * LIGHT_VS_ARMOR) < 1e-9);
  // Each soldier's gun points at what it shot.
  for (const u of s.units.filter((v) => v.side === "left")) assert.equal(u.targetId, tank.id);
});

test("faster guns make a heavier volley", () => {
  const s = createMusicalDuel({ arena: 1, seed: 7, bots: { left: 1 }, left: { money: 2000 }, right: { money: 2000 } });
  buyUnit(s, "left", "tank");
  buyUnit(s, "right", "tank");
  upgradeUnit(s, "left", "tank", "rate");
  setReady(s, "left");
  setReady(s, "right");
  runTo(s, notes()[0].t + HIT_WINDOW + 3 * STEP);
  const tank = s.units.find((u) => u.side === "left");
  const expected = DUEL_UNITS.tank.damage * (DUEL_UNITS.tank.cooldown / tank.cooldown);
  assert.ok(expected > DUEL_UNITS.tank.damage);
  assert.ok(Math.abs(whole(s, "right") - health(s, "right") - expected) < 1e-9);
});

test("the computer hits as often as it was told to", () => {
  // Never wrong on either side: nobody is hurt, and when the music ends the
  // round is settled as a fight out of time is.
  let s = fight({ bots: { left: 1, right: 1 } });
  run(s, fightChart(1).length - 1);
  assert.equal(s.phase, "combat");
  assert.equal(health(s, "left") + health(s, "right"), whole(s, "left") + whole(s, "right"));
  assert.equal(s.musical.tally.right.hits, notes().filter((n) => n.t <= songClock(s)).length);
  fightOut(s);
  assert.equal(s.phase, "roundEnd");
  assert.equal(s.lastRound.reason, "coin");
  assert.ok(songClock(s) >= fightChart(1).length - STEP);
  // Always wrong: the other side's volleys finish it long before.
  s = fight({ bots: { left: 1, right: 0 } });
  fightOut(s);
  assert.equal(s.phase, "roundEnd");
  assert.ok(songClock(s) < fightChart(1).loop);
  assert.deepEqual([s.lastRound.winner, s.lastRound.reason], ["left", "wipe"]);
  assert.equal(s.wins.left, 1);
  // Somewhere between: about that share of the notes.
  s = fight({ left: ["tank", "tank", "tank", "tank"], right: ["soldier"], bots: { left: 0.7, right: 1 } });
  run(s, fightChart(1).loop);
  const { hits, misses } = s.musical.tally.left;
  assert.ok(hits + misses > 50);
  assert.ok(Math.abs(hits / (hits + misses) - 0.7) < 0.15, `${hits} of ${hits + misses}`);
});

test("the next round's fight starts the song again", () => {
  const s = fight({ bots: { left: 1, right: 0 } });
  fightOut(s);
  assert.equal(s.phase, "roundEnd");
  run(s, ROUND_END_TIME + 2 * STEP);
  assert.equal(s.phase, "buy");
  assert.equal(s.round, 2);
  setReady(s, "left");
  setReady(s, "right");
  stepMusicalDuel(s, STEP);
  assert.ok(Math.abs(songClock(s) - STEP) < 1e-9);
  assert.equal(s.musical.marks.right[0], 0);
  assert.deepEqual(s.musical.tally.right, { hits: 0, misses: 0, streak: 0 });
  assert.equal(health(s, "right"), whole(s, "right"), "and both armies are whole again");
});

test("the same keys on the same seed give the same duel", () => {
  const play = () => {
    const s = fight({ left: ["tank", "soldier", "buggy"], right: ["rocket", "soldier"], bots: { right: 0.6 }, seed: 11 });
    const chart = notes();
    for (let i = 0; i < 40 && s.phase === "combat"; i++) {
      runTo(s, chart[i].t);
      if (i % 4 !== 3) pressKey(s, "left", chart[i].lane);
    }
    return JSON.stringify(s);
  };
  const first = play();
  assert.equal(play(), first);
  assert.doesNotThrow(() => JSON.parse(first));
});

test("a long freeze doesn't play the music it missed", () => {
  const s = fight({ bots: { left: 1, right: 1 } });
  stepMusicalDuel(s, 30);
  assert.ok(songClock(s) < 1);
});
