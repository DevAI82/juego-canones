// The musical duel's songs, heard: duelSongs.js says what sounds when, and
// this plays it with the Web Audio API -- a reed-like lead, a bass, a soft
// pad for the chords and a hand drum, all made of oscillators and noise.
// No sound files, so a song is exactly as long and as fast as its notes
// say: the keys on screen and the music can't drift apart.
//
// The fight's clock is the game's, not the sound card's (it stops with a
// pause, or behind a menu), so the music follows the game: every frame the
// screen says how far into the music the fight is, and the notes of the
// next moment are handed to the browser, each at its own time.
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

// audioContext(): the page's AudioContext (audio.js). audible(): whether
// music is to be heard (the mute button, the settings' music switch): the
// song goes on in silence otherwise, since the fight needs its time.
export function createDuelMusic({ audioContext, audible }) {
  let ac = null;
  let out = null;
  let playing = null; // the song's id
  let cursor = null; // s of the fight's music handed over so far

  // Call it every frame of a fight that is going on. songId: duelSongs.js's;
  // now: s into the fight's music (the song starts again when it ends).
  function play(songId, now) {
    try {
      ac = audioContext();
    } catch {
      return; // no sound here: the fight goes on without
    }
    if (!out) {
      out = ac.createGain();
      out.gain.value = 0;
      const squash = ac.createDynamicsCompressor();
      out.connect(squash).connect(ac.destination);
    }
    out.gain.setTargetAtTime(audible() ? VOLUME : 0, ac.currentTime, 0.02);
    const song = songOf(songId);
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

  // The fight stopped, or is over: what was handed over fades out.
  function stop() {
    cursor = null;
    if (out && ac) out.gain.setTargetAtTime(0, ac.currentTime, 0.04);
  }

  return { play, stop };
}
