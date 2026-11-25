"""The musical duel's keys, written by listening to a recording.

    python tools/duel/chart_from_audio.py <sound file> <league 1-6> [--name "..."] [--bpm N]

Finds the song's tempo and where its beats and bars fall, puts keys on the
beats where its drums, its bass and its tune sound (numbers on the low
strokes, arrows on the tune, long keys where a note is held), and then:

  - copies the song to game/assets/music/duel<league>.mp3,
  - keeps what it found in tools/duel/tracks/<league>.json,
  - writes game/js/duelTracks.js again from all the tracks kept there.

It needs ffmpeg on the PATH, numpy and scipy. It prints what it found, with
how sure it is of the beat: read that before trusting the keys.

How dense the keys are goes by the league (LEAGUES below): the first one is
mostly a key a beat.
"""
import argparse
import json
import subprocess
import sys
from pathlib import Path

import numpy as np
from scipy.ndimage import median_filter, uniform_filter1d

REPO = Path(__file__).resolve().parents[2]
TRACKS_DIR = Path(__file__).resolve().parent / "tracks"

SR = 22050
N_FFT = 1024
HOP = 256
FPS = SR / HOP
# A sound's start shows in the frames a little before it is heard (measured
# on songs made with a known beat, test_chart_from_audio.py): s to add to a
# frame's time.
LATE = 0.012

ARROWS = ["left", "down", "up", "right"]

# By league: keys a beat where the song is at its usual loudness; the share
# of them that may fall between beats; the share that are long.
LEAGUES = {
    1: dict(density=0.62, halves=0.12, holds=0.12),
    2: dict(density=0.72, halves=0.2, holds=0.12),
    3: dict(density=0.82, halves=0.3, holds=0.12),
    4: dict(density=0.92, halves=0.4, holds=0.12),
    5: dict(density=1.05, halves=0.5, holds=0.1),
    6: dict(density=1.2, halves=0.6, holds=0.1),
}

LEAD_BARS = 2  # bars of the song before its first key
MAX_LENGTH = 210.0  # s of a song that are played, at most
ROUND_STARTS = 5


# ---------------------------------------------------------------- listening

def decode(path):
    """The recording as one channel of samples at SR."""
    cmd = ["ffmpeg", "-v", "error", "-i", str(path), "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"]
    raw = subprocess.run(cmd, capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32).astype(np.float32)


def spectrum(x):
    """|STFT|: frame i is centred on sample i * HOP."""
    pad = N_FFT // 2
    x = np.concatenate([np.zeros(pad, np.float32), x, np.zeros(pad, np.float32)])
    count = 1 + (len(x) - N_FFT) // HOP
    index = np.arange(N_FFT)[None, :] + HOP * np.arange(count)[:, None]
    frames = x[index] * np.hanning(N_FFT).astype(np.float32)
    return np.abs(np.fft.rfft(frames, axis=1)).astype(np.float32)


def band(lo, hi):
    return slice(int(round(lo * N_FFT / SR)), int(round(hi * N_FFT / SR)) + 1)


def flux(mag, lo, hi):
    """How much a band's sound rises from one frame to the next: it peaks
    where something starts. Evened out, so that 1 is a strong start."""
    part = np.log1p(100.0 * mag[:, band(lo, hi)])
    rise = np.clip(np.diff(part, axis=0, prepend=part[:1]), 0, None).sum(axis=1)
    rise = np.clip(rise - uniform_filter1d(rise, int(0.4 * FPS)), 0, None)
    top = np.percentile(rise, 98) or 1.0
    return rise / top


def at(env, frames):
    return np.interp(frames, np.arange(len(env)), env, left=0.0, right=0.0)


def peak_near(env, frames, reach=3):
    """The most of `env` within `reach` frames of each of `frames`."""
    out = np.zeros(len(frames))
    for shift in range(-reach, reach + 1):
        out = np.maximum(out, at(env, np.asarray(frames) + shift))
    return out


# ---------------------------------------------------------------- the beat

def find_tempo(env, hint=None):
    """(beats a minute, frame of a beat): the grid of evenly spaced beats on
    which the starts of the song's sounds fall best."""
    n = len(env)
    spec = np.fft.rfft(env - env.mean(), 2 * n)
    auto = np.fft.irfft(spec * np.conj(spec))[:n]
    auto /= auto[0] or 1.0

    def likeness(bpm):
        lag = 60.0 * FPS / bpm
        own = at(auto, lag) + 0.5 * at(auto, 2 * lag) + 0.25 * at(auto, 4 * lag)
        return own * np.exp(-0.5 * (np.log2(bpm / 118.0) / 0.55) ** 2)

    if hint:
        coarse = float(hint)
    else:
        candidates = np.arange(62.0, 200.0, 0.1)
        coarse = float(candidates[np.argmax([likeness(b) for b in candidates])])

    best = (-1.0, coarse, 0.0)
    for bpm in np.arange(coarse * 0.97, coarse * 1.03, 0.01):
        period = 60.0 * FPS / bpm
        for phase in np.linspace(0, period, 40, endpoint=False):
            score = at(env, np.arange(phase, n, period)).mean()
            if score > best[0]:
                best = (score, bpm, phase)
    return best[1], best[2]


def track_grid(env, bpm):
    """The frames of the song's quarter-beats (four to a beat), all along it.

    A recording's tempo is seldom one number: a song from a generator may
    play half a minute a little slow and then settle. So the grid is not
    laid out evenly from one end: the song is listened to six seconds at a
    time, each time asking where its quarter-beats fall against an even
    ruler at `bpm` (every start of a sound on the grid pulls the same way,
    whichever quarter it is on), and the answers, followed along the song,
    say how far the ruler has to slide at each moment.

    Returns (frames, strength): strength, 0 to 1, is how much of the song's
    starts agree on the grid (the median of the windows')."""
    n = len(env)
    quarter = 60.0 * FPS / bpm / 4  # frames
    frames = np.arange(n)
    ruler = np.exp(-2j * np.pi * frames / quarter)
    win, hop = int(6 * FPS), int(FPS)
    shape = np.hanning(win)
    centres, turns, strengths = [], [], []
    for a in range(0, max(1, n - win + 1), hop):
        part = env[a:a + win] * shape[: len(env[a:a + win])]
        pull = (part * ruler[a:a + win]).sum()
        centres.append(a + win / 2)
        turns.append(np.angle(pull))
        strengths.append(abs(pull) / (part.sum() + 1e-9))
    centres, turns, strengths = np.array(centres), np.array(turns), np.array(strengths)
    # Where nothing keeps the beat (a break, a held chord) the answer is
    # noise: the grid goes straight on from the last sure place to the next.
    sure = strengths >= max(0.08, 0.3 * np.median(strengths))
    if sure.sum() < 2:
        sure[:] = True
    slide = -np.unwrap(turns[sure]) * quarter / (2 * np.pi)  # frames
    if len(slide) >= 5:
        slide = median_filter(slide, 3, mode="nearest")
    # (Before the first window's middle and after the last one's, it goes on
    # sliding as it was.)
    where = centres[sure]
    if len(slide) >= 4:
        head = np.polyfit(where[:4], slide[:4], 1)
        tail = np.polyfit(where[-4:], slide[-4:], 1)
        where = np.concatenate([[0.0], where, [float(n)]])
        slide = np.concatenate([[np.polyval(head, 0.0)], slide, [np.polyval(tail, float(n))]])
    slide_at = np.interp(frames, where, slide)
    # Counting quarter-beats along the song: one falls wherever the count is whole.
    count = np.maximum.accumulate((frames - slide_at) / quarter)
    whole = np.arange(np.ceil(count[0]), np.floor(count[-1]) + 1)
    grid = np.interp(whole, count, frames)
    # (The ruler's answer is where each start's weight lies, a hair after it
    # begins: the grid is set on the starts themselves.)
    shifts = np.arange(-3, 3.01, 0.25)
    grid = grid + shifts[int(np.argmax([at(env, grid + s).sum() for s in shifts]))]
    return grid, float(np.median(strengths[sure]))


def z(values):
    values = np.asarray(values, float)
    return (values - values.mean()) / (values.std() + 1e-9)


def folded(values, period):
    """The usual value at each place of a pattern `period` grid points long."""
    values = np.asarray(values, float)
    place = np.arange(len(values)) % period
    return np.array([values[place == r].mean() if (place == r).any() else 0.0 for r in range(period)])


def find_beat(mag, pulse, grid):
    """Which of the grid's quarter-beats are the beats (0 to 3), with how
    sure (the winner's lead over the next, in the scores' own spread: under
    0.5 is doubtful).

    Most starts fall on the beats -- but in a song with a tune or a bass
    off the beat as many may fall between them (the first real song put
    through this: 1.03 times as many). What tells then is the drums' body
    (150 to 400 Hz: a kick's punch, a snare's), which keeps to the beats."""
    body = flux(mag, 150, 400)
    scores = z(folded(peak_near(pulse, grid, reach=1), 4)) + z(folded(peak_near(body, grid, reach=1), 4))
    best = int(np.argmax(scores))
    return best, float(scores[best] - np.delete(scores, best).max())


def cells(values, grid):
    """Each quarter-beat's rows of `values`, as their mean."""
    edges = np.clip(grid.astype(int), 0, len(values) - 1)
    total = np.concatenate([np.zeros((1, values.shape[1])), np.cumsum(values, axis=0)])
    a, b = edges[:-1], np.maximum(edges[1:], edges[:-1] + 1)
    return (total[b] - total[a]) / (b - a)[:, None]


def apart(cell, span):
    """At each quarter-beat, how unlike the `span` of them from it on are to
    the `span` before it (0: the same sound)."""
    total = np.concatenate([np.zeros((1, cell.shape[1])), np.cumsum(cell, axis=0)])
    out = np.zeros(len(cell))
    i = np.arange(span, len(cell) - span + 1)
    if len(i) == 0:
        return out
    before, after = total[i] - total[i - span], total[i + span] - total[i]
    out[i] = 1.0 - (before * after).sum(axis=1) / (np.linalg.norm(before, axis=1) * np.linalg.norm(after, axis=1) + 1e-9)
    return out


def find_bar(mag, low, grid, which):
    """Which beat opens the bars (0 to 3, counting the beats from the grid's
    quarter-beat `which`), with how sure (as find_beat).

    A bar opens where the harmony changes and where the song's sections do
    (a bar before against a bar after) -- or half a beat earlier: a chord
    is often played ahead of its bar. The low strokes on the first and
    third beats count too, for less: a bass may not keep to them."""
    tone = cells(np.log1p(30.0 * mag[:, band(80, 2000)]), grid)
    tone = tone / (np.linalg.norm(tone, axis=1, keepdims=True) + 1e-9)
    harmony = folded(apart(tone, 4), 16)
    sections = folded(apart(cells(np.log1p(30.0 * mag[:, band(40, 9000)]), grid), 16), 16)
    strokes = folded(peak_near(low, grid, reach=1), 16)

    def ahead(pattern, place):
        return max(pattern[place % 16], pattern[(place - 1) % 16], pattern[(place - 2) % 16])

    places = [which + 4 * b for b in range(4)]
    scores = (
        z([ahead(harmony, p) + 0.5 * ahead(harmony, p + 8) for p in places])
        + z([ahead(sections, p) for p in places])
        + 0.5 * z([strokes[p % 16] + 0.5 * strokes[(p + 8) % 16] for p in places])
    )
    best = int(np.argmax(scores))
    return best, float(scores[best] - np.delete(scores, best).max())


# ---------------------------------------------------------------- the keys

def write_keys(mag, envs, beats, first_bar, league, length):
    """The keys: [[s, lane, s held], ...]."""
    spec = LEAGUES[league]
    low, mid, high = envs
    beat_len = float(np.median(np.diff(beats))) / FPS  # s

    # Every beat and the half-beat after it.
    slots = []
    for k in range(len(beats) - 1):
        slots.append((beats[k], k, False))
        slots.append(((beats[k] + beats[k + 1]) / 2, k, True))
    frames = np.array([s[0] for s in slots])
    beat_of = np.array([s[1] for s in slots])
    half = np.array([s[2] for s in slots])
    times = frames / FPS

    L, M, H = (peak_near(env, frames) for env in (low, mid, high))
    score = 0.6 * np.maximum(L, M) + 0.3 * np.minimum(L + M, 2) / 2 + 0.1 * H
    score = np.where(half, 0.8 * score, score)

    # How loud the song is, two bars at a time, against how loud it usually is.
    loud = np.sqrt((mag ** 2).sum(axis=1))
    usual = np.median(loud[loud > 0.05 * loud.max()]) or 1.0

    lead = beats[first_bar] / FPS + LEAD_BARS * 4 * beat_len
    chosen = np.zeros(len(slots), bool)
    for start in range(first_bar, len(beats) - 1, 8):
        inside = np.where((beat_of >= start) & (beat_of < start + 8) & (times >= max(lead, 3.0)) & (times < length - 2.0))[0]
        if len(inside) == 0:
            continue
        a, b = int(beats[start]), int(beats[min(start + 8, len(beats) - 1)])
        swell = float(np.clip(loud[a:b].mean() / usual, 0.35, 1.3)) if b > a else 1.0
        want = int(round(spec["density"] * len(set(beat_of[inside])) * swell))
        halves_left = int(round(spec["halves"] * want))
        for i in inside[np.argsort(-score[inside])]:
            if want <= 0 or score[i] < 0.12:
                break
            if half[i]:
                if halves_left <= 0:
                    continue
                halves_left -= 1
            chosen[i] = True
            want -= 1

    # No more than three quick keys in a row.
    picked = list(np.where(chosen)[0])
    run = 1
    for a, b in zip(picked, picked[1:]):
        run = run + 1 if b - a == 1 else 1
        if run > 3:
            chosen[b] = False
            run = 1
    picked = np.where(chosen)[0]

    # Numbers on the low strokes (about a third of the keys), arrows on the rest.
    lowness = np.where(half[picked], -1.0, L[picked] - M[picked])
    on_beat = lowness[lowness > -1.0]
    cut = np.percentile(on_beat, 100 - 100 * min(1.0, 0.32 * len(picked) / max(1, len(on_beat)))) if len(on_beat) else 0.0
    is_digit = lowness >= cut

    # An arrow by the note that starts there (what is new in the sound at
    # that moment: what is being held under it -- a bass, a chord -- would
    # give the same arrow for bars on end): the song's notes, from the lowest
    # up, take the four arrows in turn, so a phrase that comes back is the
    # same keys.
    lo_bin, hi_bin = band(250, 3000).start, band(250, 3000).stop
    notes_heard = []
    for i in picked:
        f = int(np.clip(frames[i], 4, len(mag) - 6))
        new = np.clip(mag[f + 1:f + 5, lo_bin:hi_bin].mean(axis=0) - mag[f - 4:f - 1, lo_bin:hi_bin].mean(axis=0), 0, None)
        hz = (lo_bin + int(np.argmax(new))) * SR / N_FFT
        notes_heard.append(int(round(69 + 12 * np.log2(max(hz, 1.0) / 440.0))))
    ladder = sorted(set(n for n, digit in zip(notes_heard, is_digit) if not digit))

    # A number by its beat of the bar, the same one every time. Which beat
    # gets which is set by the song, so that the three get their share: its
    # busiest beat is 1, the next 2, the next 3, and the fourth whichever
    # has had least. (1 on the bar's first beat and 3 on its third would
    # leave a song that plays its chords ahead of the bar with hardly a 1.)
    on_beat_of = [int((beat_of[i] - first_bar) % 4) for j, i in enumerate(picked) if is_digit[j]]
    busy = sorted(range(4), key=lambda b: (-on_beat_of.count(b), b))
    digit_of = {busy[0]: "1", busy[1]: "2", busy[2]: "3"}
    share = {d: on_beat_of.count(b) for b, d in digit_of.items()}
    digit_of[busy[3]] = min("123", key=lambda d: (share[d], d))

    keys = []
    run = 0
    for j, i in enumerate(picked):
        if is_digit[j]:
            lane = digit_of[int((beat_of[i] - first_bar) % 4)]
        else:
            at_arrow = ladder.index(notes_heard[j]) % 4
            # (No more than three of the same arrow running: the fourth is the next one.)
            previous = [k[1] for k in keys if k[1] in ARROWS]
            run = run + 1 if previous and previous[-1] == ARROWS[at_arrow] else 1
            if run > 3:
                at_arrow = (at_arrow + 1) % 4
                run = 1
            lane = ARROWS[at_arrow]
        keys.append([float(times[i]), lane, 0.0, i])

    # Long keys: where a note goes on sounding and nothing else starts.
    body = uniform_filter1d((mag[:, band(150, 2500)] ** 2).sum(axis=1), 5)
    everything = np.maximum(low, np.maximum(mid, high))

    def lasting(t, seconds):
        a, b = int((t + 0.08) * FPS), int((t + seconds) * FPS)
        head = body[int(t * FPS):int((t + 0.12) * FPS) + 1].max() if a < len(body) else 0
        if b <= a or head <= 0:
            return 0.0
        quiet = everything[a + int(0.1 * FPS):b].max(initial=0.0) < 0.6
        return float(np.median(body[a:b]) / head) * (1.0 if quiet else 0.6)

    wanted = int(round(spec["holds"] * len(keys)))
    # First the keys that already have room after them...
    room = []
    for j, key in enumerate(keys):
        gap = (keys[j + 1][0] if j + 1 < len(keys) else length) - key[0]
        if gap >= 2 * beat_len - 1e-6:
            hold = min(gap - max(0.5 * beat_len, 0.25), 4 * beat_len)
            room.append((lasting(key[0], hold), j, hold))
    made = set()
    for strength, j, hold in sorted(room, reverse=True):
        if len(made) >= wanted or strength < 0.25:
            break
        keys[j][2] = hold
        made.add(j)
    # ...then the best-held notes on a beat, making room by dropping the keys
    # that would come while they are down.
    if len(made) < wanted:
        hold = 1.5 * beat_len
        candidates = sorted(((lasting(k[0], hold), j) for j, k in enumerate(keys) if not half[k[3]] and j not in made), reverse=True)
        gone = set()
        for strength, j in candidates:
            if len(made) >= wanted or strength < 0.45:
                break
            t = keys[j][0]
            if j in gone or any(abs(keys[m][0] - t) < 4 * beat_len for m in made):
                continue
            inside = [m for m in range(j + 1, len(keys)) if keys[m][0] < t + 2 * beat_len - 1e-6]
            if any(m in made for m in inside):
                continue
            gone.update(inside)
            keys[j][2] = hold
            made.add(j)
        keys = [k for j, k in enumerate(keys) if j not in gone]

    return [[round(t + LATE, 3), lane, round(hold, 3)] for t, lane, hold, _ in keys]


def round_starts(beats, first_bar, length):
    """Bar lines for a duel's rounds to start at, spread over the song."""
    bars = beats[first_bar::4] / FPS + LATE
    bars = bars[bars < length - 30]
    if len(bars) == 0:
        return [0.0]
    starts = [0.0]
    for share in np.linspace(0, 0.72, ROUND_STARTS)[1:]:
        nearest = float(bars[int(np.argmin(np.abs(bars - share * length)))])
        if nearest - starts[-1] > 10:
            starts.append(round(nearest, 3))
    return starts


# ---------------------------------------------------------------- the whole of it

def analyse(path, league, bpm_hint=None, move=0):
    x = decode(path)
    duration = len(x) / SR
    # (What is played ends where the sound does.)
    loud = np.abs(x) > 0.02 * np.abs(x).max()
    length = min(MAX_LENGTH, (np.where(loud)[0][-1] + 1) / SR if loud.any() else duration)
    mag = spectrum(x[: int(length * SR)])
    low, mid, high = flux(mag, 30, 150), flux(mag, 150, 2500), flux(mag, 2500, 9000)
    pulse = low + 0.7 * mid + 0.3 * high
    rough, _ = find_tempo(pulse, bpm_hint)
    grid, strength = track_grid(pulse, rough)
    which, beat_lead = find_beat(mag, pulse, grid)
    beats = grid[which::4]
    first_bar, bar_lead = find_bar(mag, low, grid, which)
    if move:
        # (Told to: the bar line moved by so many half-beats.)
        at_grid = which + 4 * first_bar + 2 * move
        which, first_bar = at_grid % 4, (at_grid % 16) // 4
        beats = grid[which::4]
    keys = write_keys(mag, (low, mid, high), beats, first_bar, league, length)

    # How sure of the grid: how much more starts on its quarter-beats than
    # half-way between them.
    on = at(pulse, grid).mean()
    off = at(pulse, (grid[:-1] + grid[1:]) / 2).mean()
    # The tempo, eight beats at a time: the usual one, and how far it goes from it.
    spans = (beats[8:] - beats[:-8]) / 8
    tempos = 60.0 * FPS / spans if len(spans) else np.array([rough])
    bpm = float(np.median(tempos))
    return {
        "bpm": round(bpm, 3),
        "first": round(float(beats[first_bar] / FPS + LATE), 3),
        "length": round(float(length), 3),
        "starts": round_starts(beats, first_bar, length),
        # Every beat from the first bar line on (four to a bar): the tempo
        # may wander, so they are given one by one.
        "beats": [round(float(b / FPS + LATE), 3) for b in beats[first_bar:] if b / FPS < length],
        "notes": keys,
        "report": {
            "seconds": round(duration, 1),
            "grid_contrast": round(float(on / (off + 1e-9)), 2),
            "grid_strength": round(strength, 2),
            "beat_lead": round(beat_lead, 2),
            "bar_lead": round(bar_lead, 2),
            "tempo_from_to": [round(float(tempos.min()), 2), round(float(tempos.max()), 2)],
            "keys": len(keys),
            "long": sum(1 for k in keys if k[2] > 0),
            "numbers": sum(1 for k in keys if k[1] in "123"),
            "keys_a_beat": round(float(len(keys) / max(1.0, (length - beats[first_bar] / FPS) * bpm / 60)), 2),
        },
    }


def write_module(game):
    tracks = {}
    for path in sorted(TRACKS_DIR.glob("*.json")):
        tracks[int(path.stem)] = json.loads(path.read_text(encoding="utf-8"))
    head = (game / "js" / "duelTracks.js").read_text(encoding="utf-8").split("export const TRACKS")[0]
    lines = ["export const TRACKS = {"]
    for league, t in sorted(tracks.items()):
        lines.append(f"  {league}: {{")
        for field in ("name", "file", "bpm", "first", "length", "starts", "beats"):
            if field in t:
                lines.append(f"    {field}: {json.dumps(t[field], ensure_ascii=False)},")
        lines.append("    notes: [")
        row = []
        for note in t["notes"]:
            row.append(json.dumps(note))
            if len(row) == 6:
                lines.append("      " + ", ".join(row) + ",")
                row = []
        if row:
            lines.append("      " + ", ".join(row) + ",")
        lines.append("    ],")
        lines.append("  },")
    lines.append("};")
    (game / "js" / "duelTracks.js").write_text(head + "\n".join(lines) + "\n", encoding="utf-8", newline="\n")
    return sorted(tracks)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("audio", type=Path)
    parser.add_argument("league", type=int, choices=sorted(LEAGUES))
    parser.add_argument("--name", help="the song's name (the file's, unless told)")
    parser.add_argument("--bpm", type=float, help="its tempo, if the one found is half or twice the real one")
    parser.add_argument("--move", type=int, default=0, help="half-beats to move the bar line by, if the keys feel off the beat (1: half a beat later; 2, 4, 6: another beat of the same ones)")
    parser.add_argument("--game", type=Path, default=REPO / "game")
    args = parser.parse_args()

    # The game's own copy is what is listened to: the keys are written for
    # the very file the browser will play.
    music = args.game / "assets" / "music"
    music.mkdir(parents=True, exist_ok=True)
    shipped = music / f"duel{args.league}.mp3"
    subprocess.run(
        ["ffmpeg", "-v", "error", "-y", "-i", str(args.audio), "-t", str(MAX_LENGTH), "-vn", "-ac", "2", "-ar", "44100", "-b:a", "160k", str(shipped)],
        check=True,
    )
    found = analyse(shipped, args.league, args.bpm, args.move)
    report = found.pop("report")
    track = {"name": args.name or args.audio.stem, "file": f"assets/music/{shipped.name}", **found}
    TRACKS_DIR.mkdir(exist_ok=True)
    (TRACKS_DIR / f"{args.league}.json").write_text(json.dumps(track, ensure_ascii=False), encoding="utf-8")
    leagues = write_module(args.game)

    print(f"{track['name']}: {report['seconds']} s, {track['bpm']} beats a minute, first bar at {track['first']} s")
    low_bpm, high_bpm = report["tempo_from_to"]
    print(f"  the tempo goes from {low_bpm} to {high_bpm}; the grid: {report['grid_contrast']} times more starts on it than between (under 2: doubtful)")
    print(f"  the beat leads the next best by {report['beat_lead']}, the bar line by {report['bar_lead']} (under 0.5: doubtful -- try --move)")
    print(f"  keys: {report['keys']} ({report['keys_a_beat']} a beat), {report['numbers']} numbers, {report['long']} long")
    print(f"  rounds start at {track['starts']}")
    print(f"  written: {shipped.relative_to(args.game.parent)}, game/js/duelTracks.js (leagues {leagues})")


if __name__ == "__main__":
    sys.exit(main())
