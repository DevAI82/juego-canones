"""Level 1's map ("Campo"): a muddy track winding through a meadow, lined
with sandbags and tank traps, out to a checkpoint at the map's east edge.

  python tools/blender/maps/level1_layout.py <level1.json> <out_dir>

Writes ground_color.png and ground_height.png (2 px to the world px: this
map is only 1200 x 750 and the game zooms into it) and layout.json for
build_map.py. Nothing solid stands on a build slot or on the track.
"""
import json
import math
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
from paintkit import Canvas, smooth, mix, dist_to, nearest, scatter, along

ROAD_HALF = 33

src, out = Path(sys.argv[1]), Path(sys.argv[2])
out.mkdir(parents=True, exist_ok=True)
level = json.loads(src.read_text())
W, H = level["width"], level["height"]
c = Canvas(W, H, seed=11, scale=2)
rng = c.rng
roads = level["paths"]
track = roads[0]
slots = [(s["x"], s["y"]) for s in level["slots"]]


def road_d(x, y):
    return dist_to(roads, x, y)


def edge_pull(x, y):
    """0 in the middle of the map, 1 at its edges: where the trees gather."""
    return max(0.0, 1 - min(x, y, W - x, H - y) / 190)


# -------------------------------------------------------------- the layout

sandbags, hedgehogs = [], []
for side in (1, -1):
    run, gap = 0, 0
    for (x, y, turn) in along(track, 8.6, side * (ROAD_HALF + 7)):
        if gap > 0:
            gap -= 1
            continue
        if not (6 < x < W - 6 and 6 < y < H - 6) or nearest(slots, x, y) < 37 or road_d(x, y) < ROAD_HALF + 3:
            run = 0
            continue
        sandbags.append({"x": round(x, 1), "y": round(y, 1), "turn": round(turn, 1), "layers": 2 if run % 9 else 3})
        run += 1
        if run > rng.randrange(9, 22):
            run, gap = 0, rng.randrange(3, 9)
    for (x, y, turn) in along(track, 46, side * (ROAD_HALF + 27), start=rng.uniform(0, 30)):
        if not (12 < x < W - 12 and 12 < y < H - 12) or nearest(slots, x, y) < 36 or road_d(x, y) < ROAD_HALF + 18:
            continue
        if rng.random() < 0.45:
            hedgehogs.append({"x": round(x, 1), "y": round(y, 1), "turn": round(rng.uniform(0, 90), 1)})

trees = [{"x": round(x, 1), "y": round(y, 1), "r": round(rng.uniform(11, 18), 1), "h": round(rng.uniform(24, 38), 1),
          "kind": rng.choice(["oak", "oak", "oak", "pine"]), "tint": round(rng.uniform(0.8, 1.15), 2)}
         for x, y in scatter(rng, 70, lambda x, y, f: nearest(slots, x, y) > 47 and road_d(x, y) > ROAD_HALF + 28 and nearest(f, x, y) > 26
                             and rng.random() < 0.2 + 0.8 * edge_pull(x, y), W, H, margin=8)]
tree_at = [(t["x"], t["y"]) for t in trees]
bushes = [{"x": round(x, 1), "y": round(y, 1), "r": round(rng.uniform(3.5, 7), 1)}
          for x, y in scatter(rng, 150, lambda x, y, f: nearest(slots, x, y) > 34 and road_d(x, y) > ROAD_HALF + 14 and nearest(f, x, y) > 9, W, H, margin=6)]
rocks = [{"x": round(x, 1), "y": round(y, 1), "r": round(rng.uniform(3, 8.5), 1)}
         for x, y in scatter(rng, 55, lambda x, y, f: nearest(slots, x, y) > 35 and road_d(x, y) > ROAD_HALF + 12 and nearest(f, x, y) > 14, W, H, margin=6)]
tents = [{"x": round(x, 1), "y": round(y, 1), "turn": round(rng.uniform(0, 180), 1)}
         for x, y in scatter(rng, 6, lambda x, y, f: nearest(slots, x, y) > 46 and road_d(x, y) > ROAD_HALF + 40 and nearest(f, x, y) > 170
                             and nearest(tree_at, x, y) > 24, W, H, margin=40)]
crates = [{"x": round(x, 1), "y": round(y, 1), "turn": round(rng.uniform(0, 90), 1), "n": rng.randrange(2, 5)}
          for x, y in scatter(rng, 10, lambda x, y, f: nearest(slots, x, y) > 40 and ROAD_HALF + 16 < road_d(x, y) < ROAD_HALF + 60 and nearest(f, x, y) > 90, W, H, margin=20)]
wrecks = [{"x": round(x, 1), "y": round(y, 1), "turn": round(rng.uniform(0, 360), 1), "kind": rng.choice(["car", "truck"])}
          for x, y in scatter(rng, 4, lambda x, y, f: nearest(slots, x, y) > 44 and ROAD_HALF + 18 < road_d(x, y) < ROAD_HALF + 50 and nearest(f, x, y) > 260, W, H, margin=30)]
fences = []
for _ in range(400):
    if len(fences) >= 7:
        break
    row = rng.choice([97, 182, 267, 352, 437, 522, 607, 692])
    x0 = rng.uniform(20, W - 220)
    x1 = x0 + rng.uniform(90, 200)
    pts = [(x0 + (x1 - x0) * k / 10, row) for k in range(11)]
    if all(road_d(x, y) > ROAD_HALF + 30 and nearest(slots, x, y) > 38 for x, y in pts) and all(abs(f["ay"] - row) > 1 or f["bx"] < x0 - 40 or f["ax"] > x1 + 40 for f in fences):
        fences.append({"ax": round(x0, 1), "ay": row, "bx": round(x1, 1), "by": row})
craters = [{"x": round(x, 1), "y": round(y, 1), "r": rng.choice([6, 7, 9, 11, 14, 17])}
           for x, y in scatter(rng, 30, lambda x, y, f: road_d(x, y) > ROAD_HALF + 20 and nearest(f, x, y) > 60, W, H, margin=20)]
# The checkpoint the track leaves by.
gx, gy, gturn = min(along(track, 4), key=lambda p: abs(p[0] - (W - 62)))
gates = [{"x": round(gx, 1), "y": round(gy, 1), "turn": round(gturn, 1), "half": ROAD_HALF}]

layout = {"width": W, "height": H, "sandbags": sandbags, "hedgehogs": hedgehogs, "trees": trees, "bushes": bushes, "rocks": rocks,
          "tents": tents, "crates": crates, "wrecks": wrecks, "fences": fences, "gates": gates}
(out / "layout.json").write_text(json.dumps(layout))
print(", ".join(f"{len(v)} {k}" for k, v in layout.items() if isinstance(v, list)))

# -------------------------------------------------------------- the ground

n1, n2, n3, n4 = c.fbm(360, 5, 1), c.fbm(110, 4, 2), c.fbm(24, 3, 3), c.fbm(55, 4, 4)
d_road, a_road = c.polyline_field(roads)

# The meadow: several greens, dry and dark patches, and flowers.
color = mix(c.flat((0.14, 0.24, 0.07)), (0.25, 0.34, 0.11), n2)
color = mix(color, (0.09, 0.17, 0.05), smooth(0.55, 0.75, n4) * 0.65)
color = mix(color, (0.36, 0.36, 0.15), smooth(0.58, 0.82, c.fbm(170, 4, 5)) * 0.6)
color = mix(color, (0.19, 0.3, 0.09), smooth(0.4, 0.6, n3) * 0.5)
blades = c.fbm(5, 2, 9)      # the grass's fine texture
color = mix(color, (0.3, 0.4, 0.14), blades * 0.18)
for hue, cut in (((0.85, 0.75, 0.2), 0.9972), ((0.85, 0.85, 0.8), 0.9984), ((0.6, 0.25, 0.5), 0.9992)):
    flowers = c.blur(((c.speck > cut) & (n2 > 0.42)).astype(np.float32), 0.45) * 2.4
    color = mix(color, hue, np.clip(flowers, 0, 1) * 0.9)
# Bare earth showing through, and stones.
bare = smooth(0.66, 0.8, c.fbm(75, 4, 6)) * 0.75
color = mix(color, (0.36, 0.28, 0.18), bare)
height = (n2 - 0.5) * 3 + (n3 - 0.5) * 1.8 + (n4 - 0.5) * 2 + blades * 0.5

# A patch of trodden ground at each build slot: where an emplacement would go.
pads = np.zeros_like(n1)
for sx, sy in slots:
    sl, wx, wy = c.window(sx, sy, 34)
    pads[sl] = np.maximum(pads[sl], smooth(30, 20, np.hypot(wx - sx, wy - sy)))
color = mix(color, (0.33, 0.29, 0.18), pads * (0.25 + 0.3 * n3))

for k in craters:
    c.crater(color, height, k["x"], k["y"], k["r"])

# The track: churned mud with wheel ruts and standing water, its edges
# trampled into the grass.
edge = d_road + (n3 - 0.5) * 12 + (n4 - 0.5) * 8
verge = smooth(ROAD_HALF + 26, ROAD_HALF + 2, edge)
color = mix(color, (0.3, 0.25, 0.15), verge * 0.8)
mud = smooth(ROAD_HALF + 2, ROAD_HALF - 5, edge)
mud_color = mix(c.flat((0.19, 0.14, 0.09)), (0.3, 0.23, 0.15), n3)
mud_color = mix(mud_color, (0.13, 0.1, 0.07), smooth(0.5, 0.72, n4) * 0.7)
ruts = np.maximum.reduce([smooth(2.6, 1.0, np.abs(d_road - r + (n3 - 0.5) * 3)) for r in (7.5, 13, 21, 26.5)])
mud_color = mix(mud_color, (0.08, 0.06, 0.04), ruts * 0.75)
tread = (np.mod(a_road + d_road * 0.5, 3.2) < 1.3).astype(np.float32)
mud_color = mix(mud_color, (0.24, 0.18, 0.12), ruts * tread * 0.5)
puddle = smooth(0.7, 0.76, c.fbm(42, 3, 8)) * smooth(ROAD_HALF - 6, ROAD_HALF - 14, d_road)
mud_color = mix(mud_color, (0.1, 0.12, 0.13), puddle * 0.9)
color = color + (mud_color - color) * mud[..., None]
height += -mud * 1.6 - ruts * mud * 1.8 - puddle * 0.6
# Earth thrown up where the sandbags stand.
bank = smooth(8, 3, np.abs(d_road - (ROAD_HALF + 7))) * (1 - mud)
color = mix(color, (0.34, 0.27, 0.17), bank * 0.6)

color *= (0.86 + 0.28 * c.grain)[..., None]
c.save(color, height, out)
print("ground painted")
