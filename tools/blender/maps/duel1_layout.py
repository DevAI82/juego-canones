"""The duel minigame's first arena ("Arena"): a sand pit fenced with a
palisade, a mound of rocks in its middle and a sandbagged post before each
side.

  python tools/blender/maps/duel1_layout.py <arena1.json> <out_dir>

<arena1.json> comes from dump_arena.mjs. Writes ground_color.png and
ground_height.png (2 px to the arena's px, like levels 1 and 2: an arena is
1200 x 750 and fills the screen) and layout.json for build_map.py.

The game's obstacles are circles (game/js/duelArenas.js): what stands up
here stands inside them, and nothing solid stands anywhere else -- units
walk and are placed all over the rest.
"""
import json
import math
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
from paintkit import Canvas, smooth, mix, nearest, scatter

src, out = Path(sys.argv[1]), Path(sys.argv[2])
out.mkdir(parents=True, exist_ok=True)
arena = json.loads(src.read_text())
W, H = arena["width"], arena["height"]
obstacles = arena["obstacles"]
zones = arena["zones"]
c = Canvas(W, H, seed=31, scale=2)
rng = c.rng

# -------------------------------------------------------------- the layout

rocks, sandbags, crates = [], [], []
for o in obstacles:
    x, y, r = o["x"], o["y"], o["r"]
    if abs(x - W / 2) < 1:
        # The mound in the middle: one big rock and smaller ones at its foot.
        rocks.append({"x": x, "y": y - 2, "r": round(r * 0.86, 1)})
        for k in range(8):
            a = k * 2 * math.pi / 8 + rng.uniform(-0.25, 0.25)
            d = r * rng.uniform(0.6, 0.68)
            rocks.append({"x": round(x + d * math.cos(a), 1), "y": round(y + d * math.sin(a), 1), "r": round(r * rng.uniform(0.28, 0.38), 1)})
    else:
        # A post: a ring of sandbags, three high, round a stack of crates.
        ring = r - 6.5
        bags = max(8, round(2 * math.pi * ring / 8.8))
        for k in range(bags):
            a = k * 2 * math.pi / bags
            sandbags.append({"x": round(x + ring * math.cos(a), 1), "y": round(y + ring * math.sin(a), 1),
                             "turn": round(math.degrees(a) + 90, 1), "layers": 4})
        crates.append({"x": x, "y": y, "turn": round(rng.uniform(0, 90), 1), "n": 4})

# The palisade round the pit, with a gap in the middle of each short side
# (where each army comes in from).
EDGE = 9
fences = [
    {"ax": EDGE, "ay": EDGE, "bx": W - EDGE, "by": EDGE},
    {"ax": EDGE, "ay": H - EDGE, "bx": W - EDGE, "by": H - EDGE},
]
for x in (EDGE, W - EDGE):
    fences.append({"ax": x, "ay": EDGE, "bx": x, "by": H / 2 - 70})
    fences.append({"ax": x, "ay": H / 2 + 70, "bx": x, "by": H - EDGE})

spots = [(o["x"], o["y"]) for o in obstacles]
craters = [{"x": round(x, 1), "y": round(y, 1), "r": rng.choice([5, 6, 7, 9, 11])}
           for x, y in scatter(rng, 14, lambda x, y, f: nearest(spots, x, y) > 70 and nearest(f, x, y) > 110, W, H, margin=50)]

layout = {"width": W, "height": H, "rocks": rocks, "sandbags": sandbags, "crates": crates, "fences": fences}
(out / "layout.json").write_text(json.dumps(layout))
print(", ".join(f"{len(v)} {k}" for k, v in layout.items() if isinstance(v, list)))

# -------------------------------------------------------------- the ground

n2, n3, n4 = c.fbm(110, 4, 2), c.fbm(24, 3, 3), c.fbm(55, 4, 4)
xx, yy = c.xx, c.yy

# Sand: warm tones in broad patches, damper and darker here and there, and
# the wind's ripples across it.
color = mix(c.flat((0.60, 0.48, 0.29)), (0.71, 0.59, 0.37), n2)
color = mix(color, (0.50, 0.40, 0.24), smooth(0.55, 0.8, n4) * 0.5)
color = mix(color, (0.76, 0.66, 0.44), smooth(0.6, 0.85, c.fbm(170, 4, 5)) * 0.45)
ripples = np.sin((yy + n2 * 46 + xx * 0.12) * 0.85) * 0.5 + 0.5
color = mix(color, (0.78, 0.67, 0.45), ripples * 0.09)
height = (n2 - 0.5) * 2.4 + (n3 - 0.5) * 1.1 + (ripples - 0.5) * 0.7

# The middle, where the armies meet, churned by tracks and boots.
churned = smooth(150, 40, np.abs(xx - W / 2)) * (0.35 + 0.4 * n3)
color = mix(color, (0.47, 0.37, 0.23), churned * 0.55)
height += -churned * 0.8 + churned * (n3 - 0.5) * 1.6

# Tracks: each army has driven in through its gap in the palisade and
# fanned out over its half, time and again.
tracks = []
for gate_x, way in ((0, 1), (W, -1)):
    for _ in range(7):
        end_x = gate_x + way * rng.uniform(260, 560)
        end_y = rng.uniform(90, H - 90)
        bend = rng.uniform(-70, 70)
        gauge = rng.choice([7, 9, 11])
        for side in (-1, 1):
            pts = []
            for k in range(25):
                t = k / 24
                x = gate_x + (end_x - gate_x) * t
                y = H / 2 + (end_y - H / 2) * t * t + bend * math.sin(t * math.pi) + side * gauge
                pts.append((x, y))
            tracks.append(pts)
ruts = c.blur(c.lines(tracks, 2.4), 0.7) * (0.35 + 0.65 * smooth(0.35, 0.7, n4))
tread = (np.mod(xx + yy * 0.3, 3.4) < 1.5).astype(np.float32)
color = mix(color, (0.43, 0.34, 0.21), ruts * (0.4 + 0.25 * tread))
height -= ruts * 1.3

# Stones, small and flat enough to drive over.
pebbles = c.blur(((c.speck > 0.9987) & (n4 > 0.35)).astype(np.float32), 0.5) * 2.2
color = mix(color, (0.46, 0.43, 0.38), np.clip(pebbles, 0, 1) * 0.85)

# Packed earth along the palisade.
edge = np.minimum(np.minimum(xx, W - xx), np.minimum(yy, H - yy)) + (n3 - 0.5) * 10
rim = smooth(40, 12, edge)
color = mix(color, (0.36, 0.28, 0.18), rim * 0.75)

# Each side's zone and the middle line, marked in lime on the sand: worn,
# and missing in places.
rect = lambda z: [(z["x0"], z["y0"]), (z["x1"], z["y0"]), (z["x1"], z["y1"]), (z["x0"], z["y1"]), (z["x0"], z["y0"])]
dashes = [[(W / 2, y0), (W / 2, y0 + 26)] for y0 in range(24, H - 30, 52)]
lime = c.blur(c.lines([rect(zones["left"]), rect(zones["right"])] + dashes, 2.6), 0.5)
color = mix(color, (0.90, 0.86, 0.74), lime * (0.2 + 0.5 * smooth(0.3, 0.7, n4)) * 0.75)

# Trodden, shaded ground at the foot of what stands up.
for o in obstacles:
    d = np.hypot(xx - o["x"], yy - o["y"])
    foot = smooth(o["r"] + 24, o["r"] - 2, d + (n3 - 0.5) * 8)
    color = mix(color, (0.40, 0.31, 0.19), foot * 0.6)
    height += foot * 0.9

for k in craters:
    c.crater(color, height, k["x"], k["y"], k["r"])

color *= (0.88 + 0.24 * c.grain)[..., None]
c.save(color, height, out)
print("ground painted")
