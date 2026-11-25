// The musical duel's songs (docs/2026-11-25-duelo-musical-prueba.md): one
// a league, written here as notes -- there are no sound files. A song is
// both what is heard (duelMusic.js plays its events) and what is played:
// the keys that fall down the screen are its own tune (chartOf).
//
// Like the duel's other core files this one knows nothing of the page or
// of sound: it only says what happens when, in seconds from the song's
// start.

// The keys of the game: the four arrows on one hand, numbers on the other,
// as on a keyboard's arrow keys and number pad.
export const ARROWS = ["left", "down", "up", "right"];
export const DIGITS = ["1", "2", "3"];
export const LANES = [...ARROWS, ...DIGITS];

// A fight plays its song this many times at most (duelRhythm.js then
// settles it as a fight out of time).
export const MAX_LOOPS = 2;

const SEMITONE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

// "F#4" -> its MIDI number (A4 is 69).
function pitch(name) {
  const m = /^([A-G])([#b]?)(\d)$/.exec(name);
  if (!m) throw new Error(`not a note: ${name}`);
  return 12 * (Number(m[3]) + 1) + SEMITONE[m[1]] + (m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0);
}

// The chords, as the three notes the pad holds (the bass plays the first
// one an octave lower).
const CHORDS = {
  D: ["D3", "F#3", "A3"],
  Eb: ["Eb3", "G3", "Bb3"],
  Cm: ["C3", "Eb3", "G3"],
  Gm: ["G3", "Bb3", "D4"],
};

// A bar of the tune: "D4:1 F#4:.5 -:2" -- a note and how many beats it
// lasts, one after the other; "-" is a silence.
function tune(text) {
  const notes = [];
  let beat = 0;
  for (const token of text.split(/\s+/).filter(Boolean)) {
    const [name, length] = token.split(":");
    const dur = Number(length);
    if (name !== "-") notes.push({ beat, dur, midi: pitch(name) });
    beat += dur;
  }
  return notes;
}

// The drums of a bar, in beats: the "maqsum" of the darbuka -- dum, tek,
// tek, dum, tek -- with soft strokes between them once the song is going.
const DRUMS = {
  light: { dum: [0, 2], tek: [0.5, 1.5, 3], ka: [] },
  full: { dum: [0, 2], tek: [0.5, 1.5, 3], ka: [1, 2.5, 3.5] },
};

// ---------------------------------------------------------------- Arena
// The first league's song: a desert tune in D (the "Hijaz" scale: D Eb F#
// G A Bb C), 100 beats a minute, mostly one note a beat. Two bars of drums
// to get ready, the tune (A), a higher answer with some quick notes (B),
// the tune again with turns in it, and two bars to close.
const ARENA = {
  name: "Arena",
  bpm: 100,
  sections: [
    { drums: "light", keys: false, bars: [["D"], ["D"]] },
    {
      drums: "light",
      bars: [
        ["D", "D4:1 F#4:1 A4:1 F#4:1"],
        ["D", "G4:1 F#4:1 Eb4:1 D4:1"],
        ["Eb", "Eb4:1 G4:1 Bb4:1 G4:1"],
        ["D", "A4:2 F#4:2"],
        ["D", "D4:1 F#4:1 A4:1 C5:1"],
        ["D", "Bb4:1 A4:1 G4:1 F#4:1"],
        ["Cm", "G4:1 Eb4:1 C4:1 Eb4:1"],
        ["D", "D4:2 -:2"],
      ],
    },
    {
      drums: "full",
      bars: [
        ["Gm", "G4:1 Bb4:.5 A4:.5 G4:1 D5:1"],
        ["Gm", "C5:1 Bb4:1 A4:2"],
        ["D", "F#4:1 A4:.5 G4:.5 F#4:1 D4:1"],
        ["D", "Eb4:1 F#4:1 D4:2"],
        ["Eb", "Eb4:1 G4:.5 Bb4:.5 A4:1 G4:1"],
        ["Eb", "Bb4:1 A4:1 G4:1 Eb4:1"],
        ["D", "D4:.5 Eb4:.5 F#4:1 A4:1 D5:1"],
        ["D", "D5:2 -:2"],
      ],
    },
    {
      drums: "full",
      bars: [
        ["D", "D4:1 F#4:1 A4:.5 Bb4:.5 A4:1"],
        ["D", "G4:1 F#4:1 Eb4:.5 F#4:.5 D4:1"],
        ["Eb", "Eb4:1 G4:1 Bb4:.5 C5:.5 Bb4:1"],
        ["D", "A4:1 G4:1 F#4:2"],
        ["D", "D5:1 C5:1 Bb4:1 A4:1"],
        ["Gm", "G4:.5 A4:.5 Bb4:1 A4:1 F#4:1"],
        ["Cm", "G4:1 Eb4:1 F#4:1 Eb4:1"],
        ["D", "D4:1 A4:1 D5:2"],
      ],
    },
    { drums: "light", keys: false, bars: [["D", "D4:1 -:1 D4:1 -:1"], ["D", "D5:3 -:1"]] },
  ],
};

const WRITTEN = { 1: ARENA };

// ---------------------------------------------------------------- building

const BEATS = 4; // a bar

// A song as written -> what happens in it, in seconds:
//   events  [{ t, dur, voice, midi }] in order of time; voice: "lead" (the
//           tune), "bass", "pad" (the chords), and the drums "dum", "tek",
//           "ka" (no midi)
//   keys    the notes of the tune that are played on the keyboard:
//           [{ t, midi, first }] -- first: the first note of its bar
function build(id, written) {
  const beat = 60 / written.bpm;
  const events = [];
  const keys = [];
  let bar = 0;
  for (const section of written.sections) {
    const drums = DRUMS[section.drums];
    for (const [chord, lead] of section.bars) {
      const at = (b) => (bar * BEATS + b) * beat;
      const [root, ...rest] = CHORDS[chord].map(pitch);
      for (const midi of [root, ...rest]) events.push({ t: at(0), dur: BEATS * beat, voice: "pad", midi });
      events.push({ t: at(0), dur: 1.5 * beat, voice: "bass", midi: root - 12 });
      events.push({ t: at(2), dur: beat, voice: "bass", midi: root - 12 });
      events.push({ t: at(3), dur: beat, voice: "bass", midi: root - 5 });
      for (const voice of ["dum", "tek", "ka"]) {
        for (const b of drums[voice]) events.push({ t: at(b), dur: 0, voice });
      }
      for (const note of lead ? tune(lead) : []) {
        events.push({ t: at(note.beat), dur: note.dur * beat, voice: "lead", midi: note.midi });
        if (section.keys !== false) keys.push({ t: at(note.beat), midi: note.midi, first: note.beat === 0 });
      }
      bar++;
    }
  }
  events.sort((a, b) => a.t - b.t);
  return { id, name: written.name, bpm: written.bpm, beat, bars: bar, length: bar * BEATS * beat, events, keys };
}

const SONGS = new Map();

// The song of this league's arena; the first one for a number that has
// none (the others are still to be written).
export function songOf(id) {
  const known = WRITTEN[id] ? id : 1;
  if (!SONGS.has(known)) SONGS.set(known, build(known, WRITTEN[known]));
  return SONGS.get(known);
}

// The keys of one playing of a song, in order: [{ t, lane }]. Each note of
// the tune has its own arrow, always the same one (the notes of the song,
// from the lowest up, take the four arrows in turn), so the hand learns the
// tune; the note that opens a bar is a number instead, 1, 2, 3 and round
// again -- the other hand keeps the bars.
const CHARTS = new Map();
export function chartOf(id) {
  const song = songOf(id);
  if (!CHARTS.has(song.id)) {
    const pitches = [...new Set(song.keys.map((k) => k.midi))].sort((a, b) => a - b);
    let opened = 0;
    CHARTS.set(
      song.id,
      song.keys.map((k) => ({
        t: k.t,
        lane: k.first ? DIGITS[opened++ % DIGITS.length] : ARROWS[pitches.indexOf(k.midi) % ARROWS.length],
      })),
    );
  }
  return CHARTS.get(song.id);
}

// The keys of a whole fight: the song's, again each time it is played.
// { notes, loop (s a playing lasts), length (s the fight's music lasts) }
const FIGHTS = new Map();
export function fightChart(id) {
  const song = songOf(id);
  if (!FIGHTS.has(song.id)) {
    const once = chartOf(song.id);
    const notes = [];
    for (let k = 0; k < MAX_LOOPS; k++) {
      for (const note of once) notes.push({ t: note.t + k * song.length, lane: note.lane });
    }
    FIGHTS.set(song.id, { notes, loop: song.length, length: song.length * MAX_LOOPS });
  }
  return FIGHTS.get(song.id);
}
