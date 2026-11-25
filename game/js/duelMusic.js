// The musical duel's songs, heard, with the Web Audio API. A song comes in
// one of two ways (duelSongs.js):
//
//   - written as notes: played here with a reed-like lead, a bass, a soft
//     pad for the chords and a hand drum, all made of oscillators and noise.
//     The fight's clock is the game's (it stops with a pause, or behind a
//     menu) and the music follows it: every frame the screen says how far
//     into the song the fight is, and the notes of the next moment are
//     handed to the browser, each at its own time.
//   - recorded: its sound file is played, and it is the fight that follows
//     the music -- the screen moves the fight on by as much as has been
//     heard since the last frame, so the keys can't drift from the beat.
import { songOf } from "./duelSongs.js";

const AHEAD = 0.3; // s of music handed over beyond the moment on screen
const VOLUME = 0.6;

const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);

// A note's loudness over time: up fast, down to `hold`, and off at `end`.
function shape(gain, when, end, peak, { attack = 0.012, hold = 0.7, release = 0.03 } = {}) {
  gain.gain.setValueAtTime(0.0001, when);
  gain.gain.linearRampToValueAtTime(peak, when + attack);
  gain.gain.setTargetAtTime(peak * hold, when + attack, 0.12);
  gain.gain.setTargetAtTime(0.0001, Math.max(when + attack, end - release * 2), release);
}

// The tune: a saw and a square a hair apart through a filter, sliding up
// into each note, and wavering on the long ones -- a desert pipe.
function lead(ac, out, when, e) {
  const end = when + Math.max(0.14, e.dur * 0.94);
  const gain = ac.createGain();
  const filter = ac.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 2400;
  filter.Q.value = 2.5;
  shape(gain, when, end, 0.27, { hold: 0.75 });
  filter.connect(gain).connect(out);
  const voices = [["sawtooth", 0], ["square", 9]].map(([type, detune]) => {
    const osc = ac.createOscillator();
    osc.type = type;
    osc.detune.value = detune;
    osc.frequency.setValueAtTime(hz(e.midi - 1), when);
    osc.frequency.exponentialRampToValueAtTime(hz(e.midi), when + 0.045);
    osc.connect(filter);
    osc.start(when);
    osc.stop(end + 0.2);
    return osc;
  });
  if (e.dur > 0.5) {
    const waver = ac.createOscillator();
    const depth = ac.createGain();
    waver.frequency.value = 5.5;
    depth.gain.setValueAtTime(0, when);
    depth.gain.linearRampToValueAtTime(14, when + 0.5);
    waver.connect(depth);
    for (const osc of voices) depth.connect(osc.detune);
    waver.start(when);
    waver.stop(end + 0.2);
  }
}

function bass(ac, out, when, e) {
  const end = when + Math.max(0.12, e.dur * 0.9);
  const gain = ac.createGain();
  shape(gain, when, end, 0.17, { attack: 0.008, hold: 0.6 });
  gain.connect(out);
  // (The octave above it too: small loudspeakers have nothing that low.)
  for (const [type, octave] of [["triangle", 0], ["sine", 12]]) {
    const osc = ac.createOscillator();
    osc.type = type;
    osc.frequency.value = hz(e.midi + octave);
    osc.connect(gain);
    osc.start(when);
    osc.stop(end + 0.2);
  }
}

// One note of a chord, held under everything else.
function pad(ac, out, when, e) {
  const end = when + e.dur;
  const gain = ac.createGain();
  const filter = ac.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 750;
  gain.gain.setValueAtTime(0.0001, when);
  gain.gain.linearRampToValueAtTime(0.04, when + 0.25);
  gain.gain.setTargetAtTime(0.0001, end - 0.2, 0.12);
  const osc = ac.createOscillator();
  osc.type = "sawtooth";
  osc.frequency.value = hz(e.midi);
  osc.connect(filter).connect(gain).connect(out);
  osc.start(when);
  osc.stop(end + 0.5);
}

// The drum: "dum", the low stroke on the middle of the skin; "tek", the
// sharp one on its edge; "ka", a soft one between them.
function dum(ac, out, when) {
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.frequency.setValueAtTime(150, when);
  osc.frequency.exponentialRampToValueAtTime(50, when + 0.16);
  gain.gain.setValueAtTime(0.0001, when);
  gain.gain.linearRampToValueAtTime(0.6, when + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.24);
  osc.connect(gain).connect(out);
  osc.start(when);
  osc.stop(when + 0.26);
}

const noises = new WeakMap();
function noise(ac) {
  if (!noises.has(ac)) {
    const buffer = ac.createBuffer(1, Math.floor(ac.sampleRate * 0.2), ac.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    noises.set(ac, buffer);
  }
  return noises.get(ac);
}

function stroke(ac, out, when, { type, frequency, q = 1, length, peak, ring = 0 }) {
  const src = ac.createBufferSource();
  src.buffer = noise(ac);
  const filter = ac.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = frequency;
  filter.Q.value = q;
  const gain = ac.createGain();
  gain.gain.setValueAtTime(peak, when);
  gain.gain.exponentialRampToValueAtTime(0.0001, when + length);
  src.connect(filter).connect(gain).connect(out);
  src.start(when);
  src.stop(when + length + 0.02);
  if (ring) {
    // The skin itself, under the slap.
    const osc = ac.createOscillator();
    const body = ac.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(ring, when);
    osc.frequency.exponentialRampToValueAtTime(ring * 0.7, when + 0.07);
    body.gain.setValueAtTime(peak * 0.7, when);
    body.gain.exponentialRampToValueAtTime(0.0001, when + 0.08);
    osc.connect(body).connect(out);
    osc.start(when);
    osc.stop(when + 0.1);
  }
}

const VOICES = {
  lead,
  bass,
  pad,
  dum,
  tek: (ac, out, when) => stroke(ac, out, when, { type: "bandpass", frequency: 3200, q: 1.2, length: 0.06, peak: 0.26, ring: 620 }),
  ka: (ac, out, when) => stroke(ac, out, when, { type: "highpass", frequency: 6000, length: 0.035, peak: 0.09 }),
};

const TAPE_VOLUME = 0.85; // a recorded song's

// audioContext(): the page's AudioContext (audio.js). audible(): whether
// music is to be heard (the mute button, the settings' music switch): the
// song goes on in silence otherwise, since the fight needs its time.
// fetchFile(path): a sound file's bytes (an ArrayBuffer); the page's fetch,
// unless told.
export function createDuelMusic({ audioContext, audible, fetchFile = (path) => fetch(path).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status))))) }) {
  let ac = null;
  let out = null;
  // --- a song written as notes
  let playing = null; // the song's id
  let cursor = null; // s of the fight's music handed over so far
  // --- a recorded song
  const tapes = new Map(); // file -> { buffer } once decoded, { failed: true }, or { pending: true }
  let tape = null; // what is playing: { file, source, gain, from (s into the song), at (the context's time) }

  function context() {
    ac = audioContext();
    if (!out) {
      out = ac.createGain();
      out.gain.value = 0;
      const squash = ac.createDynamicsCompressor();
      out.connect(squash).connect(ac.destination);
    }
    return ac;
  }

  // Fetches a recorded song's file ahead of its fight (a written song needs
  // nothing).
  function load(songId) {
    const { audio } = songOf(songId);
    if (!audio || tapes.has(audio)) return;
    tapes.set(audio, { pending: true });
    Promise.resolve()
      .then(() => fetchFile(audio))
      .then((bytes) => context().decodeAudioData(bytes))
      .then(
        (buffer) => tapes.set(audio, { buffer }),
        () => tapes.set(audio, { failed: true }), // the fight goes on without its music
      );
  }

  // Whether this song's fight can start: a written song's always can; a
  // recorded one's once its file has come (or has failed to).
  function ready(songId) {
    const { audio } = songOf(songId);
    if (!audio) return true;
    if (!tapes.has(audio)) load(songId);
    return !tapes.get(audio).pending;
  }

  function stopTape() {
    if (!tape) return;
    try {
      tape.gain.gain.setTargetAtTime(0, ac.currentTime, 0.02);
      tape.source.stop(ac.currentTime + 0.1);
    } catch {
      // (already over)
    }
    tape = null;
  }

  function startTape(file, buffer, from) {
    stopTape();
    const source = ac.createBufferSource();
    source.buffer = buffer;
    const gain = ac.createGain();
    gain.gain.value = audible() ? TAPE_VOLUME : 0;
    source.connect(gain).connect(ac.destination);
    const at = ac.currentTime + 0.03;
    source.start(at, Math.max(0, Math.min(from, buffer.duration)));
    tape = { file, source, gain, from, at };
  }

  // The notes of a written song from where it has been handed over to a
  // moment beyond `now`.
  function hand(song, now) {
    out.gain.setTargetAtTime(audible() ? VOLUME : 0, ac.currentTime, 0.02);
    // A new fight, or one gone back to its start: from here.
    if (playing !== song.id || cursor === null || now < cursor - AHEAD - 0.1) cursor = now;
    playing = song.id;
    // What a hitch of the page skipped is not played late.
    if (cursor < now) cursor = now;
    const until = now + AHEAD;
    for (let k = Math.floor(cursor / song.length); k * song.length < until; k++) {
      const base = k * song.length;
      for (const e of song.events) {
        const t = base + e.t;
        if (t < cursor || t >= until) continue;
        try {
          VOICES[e.voice](ac, out, ac.currentTime + (t - now), e);
        } catch {
          // (a note the browser wouldn't take: the next one may do)
        }
      }
    }
    cursor = until;
  }

  // Call it every frame of a fight that is going on. songId: duelSongs.js's;
  // now: s into the song the fight is at.
  //
  // A written song is played from there, and null is returned: the fight
  // moves on by the frame's own time. A recorded song leads instead: the
  // seconds returned are how far what is being heard has got ahead of
  // `now`, and the fight moves on by that much -- so the keys on screen
  // keep to the music, whatever the frames do. (null too when its file
  // could not be had: the fight goes on in silence.)
  function follow(songId, now) {
    const song = songOf(songId);
    try {
      context();
    } catch {
      return null; // no sound here: the fight goes on without
    }
    if (!song.audio) {
      stopTape();
      hand(song, now);
      return null;
    }
    const kept = tapes.get(song.audio);
    if (!kept || !kept.buffer) return null;
    // A browser that isn't letting sound out (no press of the player's yet,
    // or it took the sound away): nothing is heard, so there is nothing to
    // follow -- the fight keeps its own time until the sound is back.
    if (ac.state !== "running") {
      stopTape();
      return null;
    }
    if (!tape || tape.file !== song.audio) {
      startTape(song.audio, kept.buffer, now);
      return 0;
    }
    tape.gain.gain.setTargetAtTime(audible() ? TAPE_VOLUME : 0, ac.currentTime, 0.02);
    // What is heard now left the browser a moment ago.
    const late = ac.outputLatency || ac.baseLatency || 0;
    const heard = tape.from + (ac.currentTime - tape.at) - late;
    const ahead = heard - now;
    // Too far apart to catch up (the page hung, or the fight went back to
    // an earlier moment): the recording starts again from where the fight is.
    if (ahead > 0.5 || ahead < -0.35) {
      startTape(song.audio, kept.buffer, now);
      return 0;
    }
    return Math.max(0, Math.min(ahead, 0.25));
  }

  // The fight stopped, or is over: what was handed over fades out.
  function stop() {
    cursor = null;
    if (out && ac) out.gain.setTargetAtTime(0, ac.currentTime, 0.04);
    stopTape();
  }

  return { load, ready, follow, stop };
}
