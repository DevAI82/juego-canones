// The musical duel's long presses, and its recorded songs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { STEP, DUEL_UNITS, ROUND_END_TIME, buyUnit, setReady } from "./duel.js";
import { LANES, songOf, chartOf, fightChart } from "./duelSongs.js";
import { TRACKS } from "./duelTracks.js";
import { HIT_WINDOW, RELEASE_SLACK, LEAD_IN, createMusicalDuel, stepMusicalDuel, pressKey, releaseKey, songClock } from "./duelRhythm.js";

// The long presses are tried on the song written as notes: the recordings
// made since (duelTracks.js) are put aside, and back for their own test.
const RECORDED = { ...TRACKS };
for (const id of Object.keys(TRACKS)) delete TRACKS[id];

function fight({ song = 1, bots = { right: 1 }, seed = 7 } = {}) {
  const s = createMusicalDuel({ arena: 1, song, seed, bots, left: { money: 2000 }, right: { money: 2000 } });
  assert.ok(buyUnit(s, "left", "tank").ok);
  assert.ok(buyUnit(s, "right", "tank").ok);
  setReady(s, "left");
  setReady(s, "right");
  return s;
}
const run = (s, seconds) => {
  for (let i = 0; i < Math.round(seconds / STEP); i++) stepMusicalDuel(s, STEP);
};
const runTo = (s, t) => {
  for (let i = 0; songClock(s) < t - STEP / 2; i++) {
    assert.ok(i < 1e5 && s.phase === "combat", `the fight never got to ${t} s`);
    stepMusicalDuel(s, STEP);
  }
};
const hurt = (s, side) => s.units.filter((u) => u.side === side).reduce((sum, u) => sum + u.maxHp - u.hp, 0);

// Plays every key of song 1 before the one numbered `index`, well, and
// stops with that one on the line.
function playUpTo(s, index) {
  const notes = fightChart(1).notes;
  for (let i = 0; i < index; i++) {
    runTo(s, notes[i].t);
    assert.equal(pressKey(s, "left", notes[i].lane).hit, true, `key ${i}`);
    if (notes[i].hold) {
      runTo(s, notes[i].t + notes[i].hold);
      releaseKey(s, "left", notes[i].lane);
    }
  }
  runTo(s, notes[index].t);
  return notes[index];
}

// ---------------------------------------------------------------- the song

test("the song's long notes are keys to hold down", () => {
  const chart = chartOf(1);
  const beat = songOf(1).beat;
  const holds = chart.filter((n) => n.hold > 0);
  assert.ok(holds.length >= 5, `${holds.length} long keys`);
  assert.ok(holds.length < chart.length / 3, "most keys are still a tap");
  for (const note of chart) assert.ok(note.hold >= 0);
  chart.forEach((note, i) => {
    if (!note.hold) return;
    assert.ok(note.hold >= beat, "long enough to feel held");
    const next = chart[i + 1];
    if (next) assert.ok(note.t + note.hold <= next.t - 0.2, `key ${i} is let go before the next one`);
  });
  // A fight's keys keep them.
  const index = chart.findIndex((n) => n.hold > 0);
  assert.equal(fightChart(1).notes[index].hold, chart[index].hold);
});

// ---------------------------------------------------------------- holding

const firstHold = () => fightChart(1).notes.findIndex((n) => n.hold > 0);

test("a long key held to its end is one hit; nothing else is asked for meanwhile", () => {
  const s = fight();
  const index = firstHold();
  const note = playUpTo(s, index);
  const before = s.musical.tally.left.hits;
  const pressed = pressKey(s, "left", note.lane);
  assert.equal(pressed.hit, true);
  assert.ok(Math.abs(pressed.hold - note.hold) < 1e-9);
  assert.equal(s.musical.marks.left[index], 3, "being held");
  assert.equal(s.musical.tally.left.hits, before + 1);
  run(s, note.hold / 2);
  assert.equal(s.musical.marks.left[index], 3);
  run(s, note.hold / 2 + 3 * STEP);
  assert.equal(s.musical.marks.left[index], 1, "done, without letting go");
  assert.ok(s.musical.events.some((e) => e.side === "left" && e.kind === "held"));
  assert.equal(hurt(s, "left"), 0);
  // Letting go afterwards is nothing.
  assert.deepEqual(releaseKey(s, "left", note.lane), { ok: true, held: null });
  assert.equal(hurt(s, "left"), 0);
});

test("a long key let go too soon is a mistake", () => {
  const s = fight();
  const index = firstHold();
  const note = playUpTo(s, index);
  pressKey(s, "left", note.lane);
  run(s, note.hold / 2);
  const released = releaseKey(s, "left", note.lane);
  assert.deepEqual(released, { ok: true, held: false });
  assert.equal(s.musical.marks.left[index], 2);
  stepMusicalDuel(s, STEP);
  assert.ok(Math.abs(hurt(s, "left") - DUEL_UNITS.tank.damage) < 1e-9, "the rival's volley");
  assert.equal(s.musical.tally.left.streak, 0);
  // Once, not again when its time ends.
  run(s, note.hold);
  assert.ok(Math.abs(hurt(s, "left") - DUEL_UNITS.tank.damage) < 1e-9);
});

test("a long key may be let go a little before its end", () => {
  const s = fight();
  const index = firstHold();
  const note = playUpTo(s, index);
  pressKey(s, "left", note.lane);
  runTo(s, note.t + note.hold - RELEASE_SLACK + 0.05);
  assert.deepEqual(releaseKey(s, "left", note.lane), { ok: true, held: true });
  assert.equal(s.musical.marks.left[index], 1);
  run(s, 0.3);
  assert.equal(hurt(s, "left"), 0);
});

test("a long key never pressed is one mistake, not two", () => {
  const s = fight();
  const index = firstHold();
  const note = playUpTo(s, index);
  run(s, HIT_WINDOW + 3 * STEP);
  assert.equal(s.musical.marks.left[index], 2);
  const once = hurt(s, "left");
  assert.ok(Math.abs(once - DUEL_UNITS.tank.damage) < 1e-9);
  run(s, note.hold);
  assert.equal(hurt(s, "left"), once);
});

test("letting go of a key that held nothing is nothing", () => {
  const s = fight();
  run(s, 1);
  assert.deepEqual(releaseKey(s, "left", "up"), { ok: true, held: null });
  assert.equal(releaseKey(s, "left", "W").ok, false);
  stepMusicalDuel(s, STEP);
  assert.equal(hurt(s, "left"), 0);
  const shopping = createMusicalDuel({ arena: 1 });
  assert.equal(releaseKey(shopping, "left", "up").ok, false);
});

test("the computer plays a long key as one key", () => {
  const s = fight({ bots: { left: 1, right: 1 } });
  const index = firstHold();
  const note = fightChart(1).notes[index];
  runTo(s, note.t + note.hold + 0.1);
  assert.equal(s.musical.marks.left[index], 1);
  assert.equal(s.musical.tally.left.hits, index + 1);
  assert.equal(hurt(s, "left") + hurt(s, "right"), 0);
});

// ---------------------------------------------------------------- recorded songs

// A recorded song as tools/duel/chart_from_audio.py writes it.
const TAPE = {
  name: "Cinta de prueba",
  file: "assets/music/duel90.mp3",
  bpm: 120,
  first: 0.25,
  length: 60,
  starts: [0, 20, 40],
  notes: [
    [4.25, "1", 0],
    [4.75, "up", 0],
    [5.25, "left", 1],
    [21.25, "2", 0],
    [22.25, "down", 0],
    [23.25, "right", 0],
    [41.25, "3", 0],
    [58, "up", 0],
  ],
};

function withTape(run) {
  TRACKS[90] = TAPE;
  try {
    run();
  } finally {
    delete TRACKS[90];
  }
}

test("every recorded song there is can be played", () => {
  Object.assign(TRACKS, RECORDED);
  try {
    everyRecording();
  } finally {
    for (const id of Object.keys(TRACKS)) delete TRACKS[id];
  }
});

function everyRecording() {
  for (const id of Object.keys(TRACKS)) {
    const song = songOf(Number(id));
    const chart = chartOf(Number(id));
    assert.ok(song.audio.startsWith("assets/"), song.audio);
    assert.ok(song.length > 30);
    assert.ok(chart.length > 20);
    assert.ok(chart[0].t >= 2, "time to get ready");
    chart.forEach((note, i) => {
      assert.ok(LANES.includes(note.lane));
      assert.ok(note.t + note.hold < song.length);
      if (i > 0) assert.ok(note.t > chart[i - 1].t);
    });
    for (const start of song.starts) assert.ok(start >= 0 && start < song.length - 20);
    // A long key is let go before the next key comes.
    chart.forEach((note, i) => {
      if (note.hold && chart[i + 1]) assert.ok(note.t + note.hold <= chart[i + 1].t - 0.2);
    });
  }
}

test("a recorded song is its sound file and the keys written for it, played once", () => {
  withTape(() => {
    const song = songOf(90);
    assert.equal(song.name, "Cinta de prueba");
    assert.equal(song.audio, "assets/music/duel90.mp3");
    assert.equal(song.length, 60);
    assert.equal(song.beat, 0.5);
    assert.equal(song.first, 0.25);
    assert.deepEqual(song.events, [], "nothing to synthesize");
    assert.deepEqual(chartOf(90)[2], { t: 5.25, lane: "left", hold: 1 });
    const whole = fightChart(90);
    assert.equal(whole.length, 60);
    assert.equal(whole.notes.length, TAPE.notes.length);
    assert.deepEqual(whole.starts, [0, 20, 40]);
  });
  assert.equal(songOf(90), songOf(1), "gone again");
});

test("each round of a recorded song starts further into it", () => {
  withTape(() => {
    const s = fight({ song: 90, bots: { left: 1, right: 0 } });
    stepMusicalDuel(s, STEP);
    assert.ok(Math.abs(songClock(s) - STEP) < 1e-9, "the first round from the top");
    assert.ok(Math.abs(s.clock - (60 - STEP)) < 1e-6);
    // The right side misses everything: its one tank lasts a few volleys...
    for (let i = 0; i < 1e5 && s.phase === "combat"; i++) stepMusicalDuel(s, STEP);
    assert.equal(s.phase, "roundEnd");
    run(s, ROUND_END_TIME + 2 * STEP);
    assert.equal(s.round, 2);
    setReady(s, "left");
    setReady(s, "right");
    stepMusicalDuel(s, STEP);
    assert.ok(Math.abs(songClock(s) - (20 + STEP)) < 1e-9, "the second from its second start");
    // The keys before it are not asked for, nor the ones right upon it.
    assert.ok(21.25 < 20 + LEAD_IN && 22.25 >= 20 + LEAD_IN, "(what this test stands on)");
    run(s, 1.5);
    assert.deepEqual(s.musical.tally.right, { hits: 0, misses: 0, streak: 0 });
    run(s, 1.2);
    assert.equal(s.musical.tally.right.misses, 1, "the first key asked for is the one at 22.25");
    assert.equal(s.musical.tally.left.hits, 1);
  });
});

test("when a recorded song ends the round is settled", () => {
  withTape(() => {
    const s = fight({ song: 90, bots: { left: 1, right: 1 } });
    for (let i = 0; i < 1e5 && s.phase === "combat"; i++) stepMusicalDuel(s, STEP);
    assert.equal(s.phase, "roundEnd");
    assert.ok(Math.abs(songClock(s) - 60) < 2 * STEP);
  });
});
