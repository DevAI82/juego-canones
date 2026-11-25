import { test } from "node:test";
import assert from "node:assert/strict";
import { LANES, ARROWS, DIGITS, MAX_LOOPS, songOf, chartOf, fightChart } from "./duelSongs.js";

const near = (a, b) => Math.abs(a - b) < 1e-6;

test("a song is so many bars at its tempo, and its events are in order", () => {
  const song = songOf(1);
  assert.equal(song.name, "Arena");
  assert.ok(near(song.beat, 60 / song.bpm));
  assert.ok(near(song.length, song.bars * 4 * song.beat));
  assert.ok(song.length > 45 && song.length < 120, `a round's song lasts about a minute (${song.length} s)`);
  for (let i = 1; i < song.events.length; i++) assert.ok(song.events[i].t >= song.events[i - 1].t);
  for (const e of song.events) {
    assert.ok(e.t >= 0 && e.t < song.length);
    assert.ok(["lead", "bass", "pad", "dum", "tek", "ka"].includes(e.voice), e.voice);
  }
  // Every voice plays.
  for (const voice of ["lead", "bass", "pad", "dum", "tek"]) assert.ok(song.events.some((e) => e.voice === voice), voice);
});

test("a song that isn't there is the first one", () => {
  assert.equal(songOf(99), songOf(1));
  assert.equal(songOf(undefined), songOf(1));
});

test("the keys to press are the song's own tune: arrows and numbers, in order", () => {
  const song = songOf(1);
  const chart = chartOf(1);
  assert.ok(chart.length >= 60, `enough to play (${chart.length})`);
  const tune = song.events.filter((e) => e.voice === "lead");
  for (let i = 0; i < chart.length; i++) {
    const note = chart[i];
    assert.ok(LANES.includes(note.lane), note.lane);
    if (i > 0) assert.ok(note.t > chart[i - 1].t, "one key at a time, in order");
    assert.ok(tune.some((e) => near(e.t, note.t)), `a note of the tune sounds at ${note.t}`);
  }
  assert.ok(chart.some((n) => ARROWS.includes(n.lane)));
  assert.ok(chart.some((n) => DIGITS.includes(n.lane)));
  // Each key has its turn.
  for (const lane of LANES) assert.ok(chart.some((n) => n.lane === lane), lane);
});

test("the first league's song leaves time to get ready and to press", () => {
  const chart = chartOf(1);
  assert.ok(chart[0].t >= 4, "nothing to press in the first seconds");
  for (let i = 1; i < chart.length; i++) {
    assert.ok(chart[i].t - chart[i - 1].t >= 0.29, `keys ${i - 1} and ${i} are too close`);
  }
  // Mostly on the beat: the half-beats are the exception.
  const beat = songOf(1).beat;
  const quick = chart.filter((n, i) => i > 0 && n.t - chart[i - 1].t < beat - 1e-6).length;
  assert.ok(quick / chart.length < 0.3, `${quick} quick keys of ${chart.length}`);
});

test("a fight's keys are the song's, played again when it ends", () => {
  const song = songOf(1);
  const once = chartOf(1);
  const fight = fightChart(1);
  assert.ok(near(fight.loop, song.length));
  assert.ok(near(fight.length, song.length * MAX_LOOPS));
  assert.equal(fight.notes.length, once.length * MAX_LOOPS);
  assert.ok(near(fight.notes[once.length].t, once[0].t + song.length));
  assert.equal(fight.notes[once.length].lane, once[0].lane);
  assert.equal(fightChart(1), fight, "worked out once");
});
