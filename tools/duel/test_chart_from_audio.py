"""Checks chart_from_audio.py on songs made here, whose beat is known:

    python tools/duel/test_chart_from_audio.py [folder to keep the songs in]

Each is a drum machine, a bass, some chords and a tune with long notes, at
a tempo and a start that the tool is not told. It must find them. Two of
them are harder, the way songs from a generator are: a busy one (a tune in
quick notes, hats as loud between the beats as the drums on them, a bass
off the beat, two bars with no drums) and one whose tempo changes on the
way.
"""
import sys
import tempfile
import wave
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import chart_from_audio as tool  # noqa: E402

SR = 44100


def even(bpm, offset, bars):
    """The times of a song's beats at one tempo (and of the one after its last)."""
    return offset + np.arange(bars * 4 + 1) * 60.0 / bpm


def changing(tempos, offset):
    """The same for a song that plays so many bars at each tempo: [(bpm, bars), ...]."""
    gaps = np.concatenate([np.full(bars * 4, 60.0 / bpm) for bpm, bars in tempos])
    return offset + np.concatenate([[0.0], np.cumsum(gaps)])


def make_song(beats, seed, busy=False):
    """beats: when each beat of the song comes, in s (four to a bar)."""
    rng = np.random.default_rng(seed)
    bars = (len(beats) - 1) // 4
    out = np.zeros(int((beats[-1] + 2.0) * SR))

    def when(bar, b):
        """The time of beat `b` (it may have a fraction) of a bar."""
        return float(np.interp(bar * 4 + b, np.arange(len(beats)), beats))

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
        at = when(bar, 0)
        beat = when(bar, 1) - at
        root, triad = chords[bar % 4]
        for m in triad:
            add(at, 0.08 * tone(midi(m), 4 * beat, 4, fade=0.1))
        drums = not (busy and bar in (20, 21))  # the busy song's break
        if drums:
            for b in range(4):
                add(when(bar, b), 0.9 * kick() if b % 2 == 0 else 0.5 * noise(0.12, 1200, 6000))
                add(when(bar, b + 0.5), (0.45 if busy else 0.12) * noise(0.04, 7000, 12000))
        # The bass: on the beats, or (busy) three, three and two half-beats long.
        for b in ((0, 1.5, 3) if busy else (0, 1, 2, 3)):
            add(when(bar, b), 0.35 * tone(midi(root), 0.8 * beat, 3))
        if bar < 2:
            continue  # drums and chords alone, to begin with
        if busy and drums:
            # Quick notes up and down the chord, four to a beat.
            for q in range(16):
                add(when(bar, q / 4), 0.16 * tone(midi(triad[(q * 5 + bar) % 3] + 12), 0.2 * beat, 5, fade=0.01))
        if bar % 4 == 3:
            # A long note to close the phrase.
            add(at, 0.3 * tone(midi(scale[(bar // 4) % len(scale)]), 3 * beat, 6, fade=0.08))
        else:
            for b in (0, 1, 2, 2.5, 3)[: 3 + bar % 3]:
                add(when(bar, b), 0.3 * tone(midi(scale[int(rng.integers(len(scale)))]), 0.45 * beat, 6))
    return out / np.abs(out).max() * 0.8


def write_wav(path, samples):
    with wave.open(str(path), "wb") as f:
        f.setnchannels(1)
        f.setsampwidth(2)
        f.setframerate(SR)
        f.writeframes((samples * 32767).astype(np.int16).tobytes())


def off(times, marks):
    """How far each of `times` is from the nearest of `marks`, in s."""
    marks = np.asarray(marks)
    return np.array([np.abs(marks - t).min() for t in times])


def check(folder, name, beats, league, seed, busy=False):
    path = folder / f"song_{name}.wav"
    write_wav(path, make_song(beats, seed, busy))
    found = tool.analyse(path, league)
    report = found["report"]
    halves = np.concatenate([beats, (beats[:-1] + beats[1:]) / 2])
    usual = 60.0 / float(np.median(np.diff(beats)))
    keys = found["notes"]
    off_bar = off([found["first"]], beats[::4])[0]
    off_beat = off(found["beats"], beats)
    off_grid = off([t for t, _, _ in keys], halves)
    gaps = np.diff([t for t, _, _ in keys])
    print(f"{name}: found {found['bpm']} bpm (it is {usual:.2f}), first bar {found['first']} ({1000 * off_bar:.0f} ms from a bar line)")
    print(f"   {report}")
    print(f"   beats off the song's: {1000 * off_beat.max():.0f} ms at most; keys off its half-beats: {1000 * off_grid.max():.0f} ms at most; starts {found['starts']}")
    problems = []
    if abs(found["bpm"] - usual) > 0.1:
        problems.append("tempo")
    if off_bar > 0.03:
        problems.append("bar line")
    if off_beat.max() > 0.03:
        problems.append("beats off the song's")
    if abs(found["beats"][0] - found["first"]) > 1e-6 or np.diff(found["beats"]).min() < 0.2:
        problems.append("the beats given don't start at the first bar, or crowd")
    if off_grid.max() > 0.03:
        problems.append("keys off the beat")
    if report["grid_contrast"] < 2 or report["beat_lead"] < 0.5 or report["bar_lead"] < 0.5:
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
        ok = [
            check(folder, "110", even(110.0, 0.0, 40), 1, 1),
            check(folder, "112.5", even(112.5, 0.413, 40), 1, 2),
            check(folder, "96", even(96.0, 1.27, 40), 3, 3),
            check(folder, "140", even(140.0, 0.2, 40), 5, 4),
            check(folder, "busy", even(111.24, 0.4, 48), 1, 5, busy=True),
            # (Like the first real song put through the tool: a little slow
            # for half a minute, then at its tempo.)
            check(folder, "changing", changing([(110.1, 16), (111.24, 36)], 0.4), 1, 6, busy=True),
        ]
    return 0 if all(ok) else 1


if __name__ == "__main__":
    sys.exit(main())
