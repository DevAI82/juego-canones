// The musical duel's long presses, and its recorded songs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { STEP, DUEL_UNITS, ROUND_END_TIME, buyUnit, setReady } from "./duel.js";
import { LANES, songOf, chartOf, fightChart, beatLines, songList, drawSong } from "./duelSongs.js";
import { TRACKS } from "./duelTracks.js";
import { HIT_WINDOW, RELEASE_SLACK, LEAD_IN, streakPower, createMusicalDuel, stepMusicalDuel, pressKey, releaseKey, songClock } from "./duelRhythm.js";

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
  // (The rival, who misses nothing, is on a streak by now: its volley is
  // as heavy as that makes it.)
  const volley = DUEL_UNITS.tank.damage * streakPower(s.musical.tally.right.streak);
  stepMusicalDuel(s, STEP);
  assert.ok(Math.abs(hurt(s, "left") - volley) < 1e-9, "the rival's volley");
  assert.equal(s.musical.tally.left.streak, 0);
  // Once, not again when its time ends.
  run(s, note.hold);
  assert.ok(Math.abs(hurt(s, "left") - volley) < 1e-9);
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
  const volley = DUEL_UNITS.tank.damage * streakPower(s.musical.tally.right.streak);
  run(s, HIT_WINDOW + 3 * STEP);
  assert.equal(s.musical.marks.left[index], 2);
  const once = hurt(s, "left");
  assert.ok(Math.abs(once - volley) < 1e-9);
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

test("a song's beats are even, from its first bar on, when it says no more", () => {
  // The song written as notes: a bar every four beats, from its start.
  const beat = songOf(1).beat;
  const written = beatLines(1, 0, 4 * beat + 0.01);
  assert.equal(written.length, 5);
  assert.deepEqual(written.map((line) => line.bar), [true, false, false, false, true]);
  assert.ok(Math.abs(written[4].t - 4 * beat) < 1e-9);
  withTape(() => {
    // first 0.25, a beat every 0.5 s.
    const lines = beatLines(90, 1, 3);
    assert.deepEqual(lines.map((line) => line.t), [1.25, 1.75, 2.25, 2.75]);
    assert.deepEqual(lines.map((line) => line.bar), [false, false, true, false]);
    assert.deepEqual(beatLines(90, 0, 0.2), [], "none before the first bar");
  });
});

test("a recording whose tempo wanders gives its beats one by one", () => {
  // (The tool's: every beat from the first bar line on, four to a bar.)
  TRACKS[90] = { ...TAPE, beats: [0.25, 0.8, 1.35, 1.9, 2.44, 2.97, 3.5, 4.03, 4.56] };
  try {
    assert.deepEqual(beatLines(90, 1, 3), [
      { t: 1.35, bar: false },
      { t: 1.9, bar: false },
      { t: 2.44, bar: true },
      { t: 2.97, bar: false },
    ]);
    assert.deepEqual(beatLines(90, 4.5, 30), [{ t: 4.56, bar: true }], "and no more than it gives");
  } finally {
    delete TRACKS[90];
  }
});

test("the songs there are to play: the recordings, or the one written as notes", () => {
  assert.deepEqual(songList(), [1]);
  TRACKS[91] = { ...TAPE, name: "Otra" };
  TRACKS[90] = TAPE;
  try {
    assert.deepEqual(songList(), [90, 91]);
  } finally {
    delete TRACKS[90];
    delete TRACKS[91];
  }
});

test("each musical duel takes another song: all of them before one comes back", () => {
  for (const id of [90, 91, 92]) TRACKS[id] = { ...TAPE, name: `Cinta ${id}` };
  try {
    // A die that is not the same every time, and is the same every run.
    let seed = 7;
    const roll = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    let bag;
    const played = [];
    for (let i = 0; i < 12; i++) {
      const drawn = drawSong(bag, roll);
      bag = drawn.bag;
      played.push(drawn.song);
    }
    for (let round = 0; round < 12; round += 3) {
      assert.deepEqual([...played.slice(round, round + 3)].sort(), [90, 91, 92], `songs ${round} to ${round + 2}: ${played}`);
    }
    for (let i = 1; i < played.length; i++) assert.notEqual(played[i], played[i - 1], `the same song twice running: ${played}`);
    // A song taken away meanwhile is not played.
    delete TRACKS[91];
    for (let i = 0; i < 6; i++) {
      const drawn = drawSong(bag, roll);
      bag = drawn.bag;
      assert.notEqual(drawn.song, 91);
    }
  } finally {
    for (const id of [90, 91, 92]) delete TRACKS[id];
  }
  // With one song there is, it is that one every time.
  const only = drawSong(undefined, Math.random);
  assert.equal(only.song, 1);
  assert.equal(drawSong(only.bag, Math.random).song, 1);
});

test("a musical duel plays the song it is given", () => {
  withTape(() => {
    const s = createMusicalDuel({ arena: 1, seed: 3, song: 90 });
    assert.equal(s.musical.song, 90);
    assert.equal(s.arena, 1);
  });
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
