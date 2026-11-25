"""Checks chart_from_audio.py on songs made here, whose beat is known:

    python tools/duel/test_chart_from_audio.py [folder to keep the songs in]

Each is a drum machine, a bass, some chords and a tune with long notes, at
a tempo and a start that the tool is not told. It must find them.
"""
import sys
import tempfile
import wave
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import chart_from_audio as tool  # noqa: E402

SR = 44100


def make_song(bpm, offset, bars, seed):
    rng = np.random.default_rng(seed)
    beat = 60.0 / bpm
    out = np.zeros(int((offset + bars * 4 * beat + 2.0) * SR))

    def add(t, sound):
        a = int(t * SR)
        out[a:a + len(sound)] += sound[: len(out) - a]

    def tone(hz, seconds, harmonics, fade=0.03):
        t = np.arange(int(seconds * SR)) / SR
        wave_ = sum(np.sin(2 * np.pi * hz * (h + 1) * t) / (h + 1) for h in range(harmonics))
        shape = np.minimum(1, t / 0.005) * np.minimum(1, (seconds - t) / fade)
        return wave_ * shape

    def kick():
        t = np.arange(int(0.18 * SR)) / SR
        return np.sin(2 * np.pi * (50 * t + (120 - 50) * 0.05 * (1 - np.exp(-t / 0.05)))) * np.exp(-t / 0.06)

    def noise(seconds, lo, hi):
        n = int(seconds * SR)
        spec = np.fft.rfft(rng.standard_normal(n))
        freqs = np.fft.rfftfreq(n, 1 / SR)
        spec[(freqs < lo) | (freqs > hi)] = 0
        t = np.arange(n) / SR
        return np.fft.irfft(spec, n) * np.exp(-t / (seconds / 4))

    midi = lambda m: 440.0 * 2 ** ((m - 69) / 12)  # noqa: E731
    chords = [(45, [57, 60, 64]), (41, [57, 60, 65]), (48, [55, 60, 64]), (43, [55, 59, 62])]  # Am F C G
    scale = [69, 72, 74, 76, 79, 81]
    for bar in range(bars):
        at = offset + bar * 4 * beat
        root, triad = chords[bar % 4]
        for m in triad:
            add(at, 0.08 * tone(midi(m), 4 * beat, 4, fade=0.1))
        for b in range(4):
            add(at + b * beat, 0.9 * kick() if b % 2 == 0 else 0.5 * noise(0.12, 1200, 6000))
            add(at + (b + 0.5) * beat, 0.12 * noise(0.04, 7000, 12000))
            add(at + b * beat, 0.35 * tone(midi(root), 0.8 * beat, 3))
        if bar < 2:
            continue  # drums and chords alone, to begin with
        if bar % 4 == 3:
            # A long note to close the phrase.
            add(at, 0.3 * tone(midi(scale[(bar // 4) % len(scale)]), 3 * beat, 6, fade=0.08))
        else:
            for b in (0, 1, 2, 2.5, 3)[: 3 + bar % 3]:
                add(at + b * beat, 0.3 * tone(midi(scale[int(rng.integers(len(scale)))]), 0.45 * beat, 6))
    return out / np.abs(out).max() * 0.8


def write_wav(path, samples):
    with wave.open(str(path), "wb") as f:
        f.setnchannels(1)
        f.setsampwidth(2)
        f.setframerate(SR)
        f.writeframes((samples * 32767).astype(np.int16).tobytes())


def check(folder, bpm, offset, league, seed):
    path = folder / f"song_{bpm}.wav"
    write_wav(path, make_song(bpm, offset, 40, seed))
    found = tool.analyse(path, league)
    report = found["report"]
    beat = 60.0 / bpm
    bar = 4 * beat
    # The first bar found is one of the song's bar lines.
    off_bar = (found["first"] - offset + bar / 2) % bar - bar / 2
    keys = found["notes"]
    off_grid = [abs((t - offset + beat / 4) % (beat / 2) - beat / 4) for t, _, _ in keys]
    gaps = np.diff([t for t, _, _ in keys])
    print(f"{bpm} bpm, start {offset}: found {found['bpm']} bpm, first bar {found['first']} ({1000 * off_bar:+.0f} ms from a bar line)")
    print(f"   {report}")
    print(f"   keys off the grid: {1000 * max(off_grid):.0f} ms at most; starts {found['starts']}")
    problems = []
    if abs(found["bpm"] - bpm) > 0.1:
        problems.append("tempo")
    if abs(off_bar) > 0.03:
        problems.append("bar line")
    if max(off_grid) > 0.03:
        problems.append("keys off the beat")
    if report["beat_contrast"] < 1.5:
        problems.append("unsure of the beat")
    if not 0.4 <= report["keys_a_beat"] <= 1.3:
        problems.append("too few or too many keys")
    if report["long"] < 3 or report["numbers"] < 10 or report["numbers"] > 0.6 * len(keys):
        problems.append("long keys or numbers")
    if keys[0][0] < 3 or gaps.min() < 0.2:
        problems.append("no time to get ready, or keys too close")
    for t, _, hold in keys:
        later = [u for u, _, _ in keys if u > t]
        if hold and later and t + hold > later[0] - 0.2:
            problems.append("a long key runs into the next one")
            break
    if any(lane not in ("left", "down", "up", "right", "1", "2", "3") for _, lane, _ in keys):
        problems.append("lanes")
    print("   " + ("OK" if not problems else "PROBLEMS: " + ", ".join(problems)))
    return not problems


def main():
    keep = Path(sys.argv[1]) if len(sys.argv) > 1 else None
    with tempfile.TemporaryDirectory() as tmp:
        folder = keep or Path(tmp)
        folder.mkdir(parents=True, exist_ok=True)
        ok = [check(folder, 110.0, 0.0, 1, 1), check(folder, 112.5, 0.413, 1, 2), check(folder, 96.0, 1.27, 3, 3), check(folder, 140.0, 0.2, 5, 4)]
    return 0 if all(ok) else 1


if __name__ == "__main__":
    sys.exit(main())
