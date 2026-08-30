// Procedurally synthesized sound effects via the Web Audio API -- no sound
// files to source or ship, and it's trivial to make the three weapon
// categories the user asked for clearly distinct (machine gun vs. cannon
// vs. missile) by shaping noise/oscillators rather than picking samples.
//
// Browsers refuse to start audio before a user gesture, so the
// AudioContext is created lazily on first use, not at module load.

let ctx = null;
function getCtx() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

let muted = false;
export function setMuted(value) {
  muted = value;
  syncMusicMute();
}
export function isMuted() {
  return muted;
}
export function toggleMuted() {
  return setMutedReturning(!muted);
}
function setMutedReturning(value) {
  setMuted(value);
  return muted;
}

// Looping background music -- a real <audio> element rather than decoding
// the file through the Web Audio API, since it's several minutes long and
// just needs to loop and be volume-controlled, not shaped/mixed like the
// short synthesized effects above. Kept quiet by default (per user
// request: soft, balanced against gunfire/explosions, not competing with
// them) -- MUSIC_VOLUME is deliberately well below the perceived loudness
// of the sound effects' short, punchy envelopes.
const MUSIC_VOLUME = 0.22;
let musicEl = null;
function getMusicEl() {
  if (!musicEl) {
    musicEl = new Audio("assets/music.mp3");
    musicEl.loop = true;
    musicEl.volume = MUSIC_VOLUME;
  }
  return musicEl;
}
function syncMusicMute() {
  if (musicEl) musicEl.muted = muted;
}

// Browsers block audio (even a plain <audio> element) from starting before
// a user gesture -- call this from the first click/keydown handler in
// main.js, same moment the SFX AudioContext gets its own unlock.
export function startMusic() {
  const el = getMusicEl();
  syncMusicMute();
  el.play().catch(() => {
    // Autoplay can still be refused in some contexts (e.g. no real
    // gesture yet) -- harmless, the next user gesture will retry via the
    // same startMusic() call.
  });
}

// A single ramp-up-then-decay shape reused by every sound below.
function envelope(gainNode, ac, attack, decay, peak) {
  const now = ac.currentTime;
  gainNode.gain.cancelScheduledValues(now);
  gainNode.gain.setValueAtTime(0.0001, now);
  gainNode.gain.linearRampToValueAtTime(peak, now + attack);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, now + attack + decay);
}

function noiseBuffer(ac, duration) {
  const n = Math.max(1, Math.floor(ac.sampleRate * duration));
  const buffer = ac.createBuffer(1, n, ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < n; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

// Short, sharp, high-pitched crack -- soldier/buggy/motorcycle small arms.
function playMachineGun() {
  const ac = getCtx();
  const src = ac.createBufferSource();
  src.buffer = noiseBuffer(ac, 0.05);
  const filter = ac.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = 1700 + Math.random() * 400; // slight variation per shot
  filter.Q.value = 0.9;
  const gain = ac.createGain();
  envelope(gain, ac, 0.001, 0.045, 0.22);
  src.connect(filter).connect(gain).connect(ac.destination);
  src.start();
  src.stop(ac.currentTime + 0.07);
}

// Deep thump (dropping-pitch tone) plus a short filtered-noise punch --
// tank cannon and the player's basic/double towers.
function playCannon() {
  const ac = getCtx();
  const now = ac.currentTime;

  const osc = ac.createOscillator();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(150, now);
  osc.frequency.exponentialRampToValueAtTime(45, now + 0.2);
  const oscGain = ac.createGain();
  envelope(oscGain, ac, 0.004, 0.2, 0.5);
  osc.connect(oscGain).connect(ac.destination);

  const noise = ac.createBufferSource();
  noise.buffer = noiseBuffer(ac, 0.15);
  const noiseFilter = ac.createBiquadFilter();
  noiseFilter.type = "lowpass";
  noiseFilter.frequency.value = 900;
  const noiseGain = ac.createGain();
  envelope(noiseGain, ac, 0.002, 0.13, 0.35);
  noise.connect(noiseFilter).connect(noiseGain).connect(ac.destination);

  osc.start(now);
  osc.stop(now + 0.24);
  noise.start(now);
  noise.stop(now + 0.16);
}

// Rising whoosh (band-pass noise sweeping upward) followed by a low boom --
// the rocket launcher's missile.
function playMissile() {
  const ac = getCtx();
  const now = ac.currentTime;

  const noise = ac.createBufferSource();
  noise.buffer = noiseBuffer(ac, 0.35);
  const filter = ac.createBiquadFilter();
  filter.type = "bandpass";
  filter.Q.value = 0.7;
  filter.frequency.setValueAtTime(500, now);
  filter.frequency.exponentialRampToValueAtTime(2200, now + 0.3);
  const gain = ac.createGain();
  envelope(gain, ac, 0.02, 0.3, 0.28);
  noise.connect(filter).connect(gain).connect(ac.destination);
  noise.start(now);
  noise.stop(now + 0.35);

  const osc = ac.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(90, now + 0.05);
  osc.frequency.exponentialRampToValueAtTime(35, now + 0.3);
  const oscGain = ac.createGain();
  envelope(oscGain, ac, 0.01, 0.26, 0.45);
  osc.connect(oscGain).connect(ac.destination);
  osc.start(now + 0.05);
  osc.stop(now + 0.35);
}

// Descending-pitch sawtooth zap -- the player's laser tower. Not one of
// the three categories the user explicitly asked to distinguish, but
// every other weapon in the game has a sound, so the laser needed one too
// rather than staying silent.
function playLaser() {
  const ac = getCtx();
  const now = ac.currentTime;
  const osc = ac.createOscillator();
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(1600, now);
  osc.frequency.exponentialRampToValueAtTime(300, now + 0.13);
  const gain = ac.createGain();
  envelope(gain, ac, 0.002, 0.13, 0.18);
  osc.connect(gain).connect(ac.destination);
  osc.start(now);
  osc.stop(now + 0.15);
}

const PLAYERS = { machinegun: playMachineGun, cannon: playCannon, missile: playMissile, laser: playLaser };

// Minimum time (ms) between two plays of the same sound category. Late
// waves can have dozens of units firing at once; without this a real
// machine-gun-fire wall of overlapping noise becomes unpleasant static
// rather than reading as "lots of gunfire."
const MIN_INTERVAL_MS = { machinegun: 40, cannon: 90, missile: 140, laser: 60 };
const lastPlayedAt = {};

export function playSound(name) {
  if (muted) return;
  const fn = PLAYERS[name];
  if (!fn) return;
  const now = performance.now();
  const minInterval = MIN_INTERVAL_MS[name] || 0;
  if (now - (lastPlayedAt[name] || 0) < minInterval) return;
  lastPlayedAt[name] = now;
  try {
    fn();
  } catch {
    // Audio can fail to start before the first user gesture on some
    // browsers even after resume() -- never let a sound glitch break
    // the game loop that called this.
  }
}
