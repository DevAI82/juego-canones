"""Level 2's map ("Ciudad"): two avenues through a bombed city meeting above
a bunker at the bottom of the map, where the defence stands.

  python tools/blender/maps/level2_layout.py <level2.json> <out_dir>

Writes ground_color.png and ground_height.png (2 px to the world px) and
layout.json for build_map.py. A building hides what is behind it, so none
stands where its picture -- its ground plan and, up the screen from it, its
height -- would cover a build slot or a road.
"""
import json
import math
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
from paintkit import Canvas, smooth, mix, dist_to, nearest, scatter, along

ROAD_HALF = 34
LEAN = 0.625     # how far up the picture a px of height shows (scenekit's camera)

src, out = Path(sys.argv[1]), Path(sys.argv[2])
out.mkdir(parents=True, exist_ok=True)
level = json.loads(src.read_text())
W, H = level["width"], level["height"]
c = Canvas(W, H, seed=23, scale=2)
rng = c.rng
roads = level["paths"]
base = level["base"]
slots = [(s["x"], s["y"]) for s in level["slots"]]


def road_d(x, y):
    return dist_to(roads, x, y)


def shown(x0, y0, x1, y1, h):
    """The rectangle a building's picture takes: its plan and its height above it."""
    return x0, y0 - h * LEAN, x1, y1


def clear(x0, y0, x1, y1, h, taken, slot_gap=38, road_gap=ROAD_HALF + 12):
    """Whether a building there hides no slot and no road, and touches no other."""
    sx0, sy0, sx1, sy1 = shown(x0, y0, x1, y1, h)
    if sx0 < 4 or sx1 > W - 4 or y1 > H - 4 or sy0 < -30:
        return False
    for px, py in slots + [(base["x"], base["y"])]:
        if sx0 - slot_gap < px < sx1 + slot_gap and sy0 - slot_gap < py < sy1 + slot_gap:
            return False
    for u in range(9):
        for v in range(9):
            if road_d(sx0 + (sx1 - sx0) * u / 8, sy0 + (sy1 - sy0) * v / 8) < road_gap:
                return False
    return all(x1 + 14 < t[0] or t[2] + 14 < x0 or y1 + 14 < t[1] - t[4] * LEAN or t[3] + 14 < y0 - h * LEAN for t in taken)


# -------------------------------------------------------------- the layout

taken = []          # (x0, y0, x1, y1, h) of every building
blocks, ruins = [], []
for _ in range(9000):
    if len(taken) >= 26:
        break
    w, d = rng.uniform(70, 190), rng.uniform(55, 130)
    x0, y0 = rng.uniform(0, W - w), rng.uniform(20, H - d)
    standing = rng.random() < 0.55
    h = rng.uniform(26, 58) if standing else rng.uniform(12, 24)
    if not clear(x0, y0, x0 + w, y0 + d, h, taken):
        continue
    taken.append((x0, y0, x0 + w, y0 + d, h))
    tone = rng.choice(["plaster", "plaster", "brick", "concrete", "stone"])
    if standing:
        blocks.append({"x0": round(x0, 1), "y0": round(y0, 1), "x1": round(x0 + w, 1), "y1": round(y0 + d, 1), "h": round(h, 1), "tone": tone,
                       "ruined": True, "clutter": rng.randrange(2, 5)})
    else:
        walls = []

        def run(ax, ay, bx, by, standing_part):
            n = max(1, round(math.hypot(bx - ax, by - ay) / 30))
            for k in range(n):
                if rng.random() > standing_part:
                    continue
                walls.append({"ax": ax + (bx - ax) * k / n, "ay": ay + (by - ay) * k / n, "bx": ax + (bx - ax) * (k + 1) / n,
                              "by": ay + (by - ay) * (k + 1) / n, "h": round(h * rng.choice([1, 1, 0.8, 0.55, 0.35]), 1)})
        x1, y1 = x0 + w, y0 + d
        run(x0, y0, x1, y0, 0.85)
        run(x0, y1, x1, y1, 0.6)
        run(x0, y0, x0, y1, 0.75)
        run(x1, y0, x1, y1, 0.75)
        mid = x0 + w * rng.uniform(0.35, 0.65)
        run(mid, y0, mid, y1, 0.5)
        rubble = [{"x": rng.uniform(x0 + 8, x1 - 8), "y": rng.uniform(y0 + 8, y1 - 8), "r": round(rng.uniform(5, 11), 1)} for _ in range(int(w * d / 1500) + 2)]
        ruins.append({"tone": tone, "thick": 7, "walls": walls, "rubble": rubble, "x0": x0, "y0": y0, "x1": x1, "y1": y1})


def off_buildings(x, y, gap=6):
    return all(not (t[0] - gap < x < t[2] + gap and t[1] - t[4] * LEAN - gap < y < t[3] + gap) for t in taken)


# Rubble heaps in the open, craters, wrecks, lamp posts, barricades.
heaps = [{"x": round(x, 1), "y": round(y, 1), "r": round(rng.uniform(6, 13), 1)}
         for x, y in scatter(rng, 46, lambda x, y, f: nearest(slots, x, y) > 34 and road_d(x, y) > ROAD_HALF + 8 and off_buildings(x, y) and nearest(f, x, y) > 34, W, H)]
ruins.append({"tone": "brick", "walls": [], "rubble": heaps})
craters = [{"x": round(x, 1), "y": round(y, 1), "r": rng.choice([7, 9, 11, 14, 18, 22])}
           for x, y in scatter(rng, 34, lambda x, y, f: road_d(x, y) > ROAD_HALF + 14 and off_buildings(x, y, 0) and nearest(f, x, y) > 55, W, H, margin=16)]
wrecks = [{"x": round(x, 1), "y": round(y, 1), "turn": round(rng.uniform(0, 360), 1), "kind": rng.choice(["car", "car", "truck"])}
          for x, y in scatter(rng, 9, lambda x, y, f: nearest(slots, x, y) > 44 and ROAD_HALF + 14 < road_d(x, y) < ROAD_HALF + 60 and off_buildings(x, y, 14)
                              and nearest(f, x, y) > 130, W, H, margin=24)]
posts = []
for road in roads:
    side = 1
    for (x, y, turn) in along(road, 118, 0):
        side = -side
        px = x + math.sin(math.radians(turn)) * side * (ROAD_HALF + 6)
        py = y - math.cos(math.radians(turn)) * side * (ROAD_HALF + 6)
        if 16 < px < W - 16 and 30 < py < H - 10 and nearest(slots, px, py) > 30 and road_d(px, py) > ROAD_HALF + 3 and off_buildings(px, py, 4) \
                and nearest([(p["x"], p["y"]) for p in posts], px, py) > 60 and math.hypot(px - base["x"], py - base["y"]) > 90:
            posts.append({"x": round(px, 1), "y": round(py, 1), "lean": rng.choice([0, 0, 7, -10, 16]), "turn": round(-turn + (90 if side > 0 else -90), 1)})
hedgehogs = [{"x": round(x, 1), "y": round(y, 1), "turn": round(rng.uniform(0, 90), 1)}
             for x, y in scatter(rng, 16, lambda x, y, f: nearest(slots, x, y) > 36 and ROAD_HALF + 10 < road_d(x, y) < ROAD_HALF + 34 and off_buildings(x, y, 8)
                                 and nearest(f, x, y) > 40, W, H, margin=20)]
trees = [{"x": round(x, 1), "y": round(y, 1), "r": round(rng.uniform(9, 13), 1), "h": round(rng.uniform(22, 32), 1), "kind": "dead", "tint": 1.0}
         for x, y in scatter(rng, 14, lambda x, y, f: nearest(slots, x, y) > 40 and road_d(x, y) > ROAD_HALF + 16 and off_buildings(x, y, 10) and nearest(f, x, y) > 70, W, H, margin=14)]
crates = [{"x": round(x, 1), "y": round(y, 1), "turn": round(rng.uniform(0, 90), 1), "n": rng.randrange(2, 5)}
          for x, y in scatter(rng, 8, lambda x, y, f: nearest(slots, x, y) > 40 and road_d(x, y) > ROAD_HALF + 14 and off_buildings(x, y, 10) and nearest(f, x, y) > 110
                              and math.hypot(x - base["x"], y - base["y"]) < 330, W, H, margin=20)]

# The command post the roads lead to: its flag, on the paved round the
# road ends in (build slots crowd in here, so nothing bigger stands).
flags = [{"x": base["x"] - 16, "y": base["y"] + 4}]

layout = {"width": W, "height": H, "blocks": blocks, "ruins": ruins, "wrecks": wrecks, "posts": posts, "hedgehogs": hedgehogs, "trees": trees,
          "crates": crates, "flags": flags}
(out / "layout.json").write_text(json.dumps(layout))
print(", ".join(f"{len(v)} {k}" for k, v in layout.items() if isinstance(v, list)), f"and {len(craters)} craters")

# -------------------------------------------------------------- the ground

n1, n2, n3, n4 = c.fbm(360, 5, 1), c.fbm(110, 4, 2), c.fbm(24, 3, 3), c.fbm(55, 4, 4)
d_road, a_road = c.polyline_field(roads)

# A city's ground under its own ruin: grey dust and brick dust, broken paving.
color = mix(c.flat((0.27, 0.25, 0.22)), (0.42, 0.39, 0.34), n2)
color = mix(color, (0.2, 0.18, 0.16), smooth(0.55, 0.75, n4) * 0.6)
color = mix(color, (0.42, 0.3, 0.23), smooth(0.6, 0.8, c.fbm(140, 4, 5)) * 0.45)       # brick dust
paving = ((np.mod(c.xx + (np.floor(c.yy / 12) % 2) * 9, 18) < 0.9) | (np.mod(c.yy, 12) < 0.9)).astype(np.float32)
slabbed = smooth(0.38, 0.55, c.fbm(90, 4, 6) * 0.7 + n3 * 0.4)
color = mix(color, (0.4, 0.39, 0.37), slabbed * 0.55)
color = mix(color, (0.2, 0.19, 0.18), slabbed * paving * 0.55)
litter = c.blur((c.speck > 0.9925).astype(np.float32), 0.5) * 2.2
color = mix(color, (0.6, 0.57, 0.5), np.clip(litter, 0, 1) * (c.grain > 0.5))
color = mix(color, (0.1, 0.09, 0.08), np.clip(litter, 0, 1) * (c.grain <= 0.5) * 0.85)
height = (n2 - 0.5) * 3 + (n3 - 0.5) * 2.2 + (n4 - 0.5) * 2

# Each building's floor, and the debris spilled round it.
spill = np.zeros_like(n1)
for (x0, y0, x1, y1, h) in taken:
    spill = np.maximum(spill, c.rect(x0 - 16, y0 - 16, x1 + 16, y1 + 16))
spill = c.blur(spill, 14)
color = mix(color, (0.45, 0.42, 0.38), spill * (0.3 + 0.5 * n3))
for r in ruins:
    if "x0" not in r:
        continue
    floor = c.rect(r["x0"], r["y0"], r["x1"], r["y1"])
    tiles = ((np.mod(c.xx - r["x0"], 15) < 0.9) | (np.mod(c.yy - r["y0"], 15) < 0.9)).astype(np.float32)
    color = mix(color, (0.44, 0.42, 0.38), floor * 0.85)
    color = mix(color, (0.22, 0.2, 0.18), floor * tiles * 0.55)
    color = mix(color, (0.09, 0.08, 0.07), floor * smooth(0.55, 0.72, n4) * 0.75)

for k in craters:
    c.crater(color, height, k["x"], k["y"], k["r"])

# The avenues: asphalt with tram rails down the middle, kerbs and pavements.
edge = d_road + (n3 - 0.5) * 7
pavement = smooth(ROAD_HALF + 13, ROAD_HALF + 10, edge)
slabs = (np.mod(a_road, 10) < 0.9).astype(np.float32)
color = mix(color, (0.43, 0.42, 0.4), pavement * smooth(0.25, 0.5, n4 + 0.25) * 0.92)
color = mix(color, (0.24, 0.23, 0.22), pavement * slabs * 0.5)
asphalt = smooth(ROAD_HALF + 1.5, ROAD_HALF - 2.5, edge)
color = mix(color, (0.55, 0.54, 0.51), smooth(1.7, 0.6, np.abs(edge - ROAD_HALF)) * 0.8)       # kerb
tar = mix(c.flat((0.11, 0.11, 0.12)), (0.19, 0.19, 0.2), n2)
tar = mix(tar, (0.07, 0.07, 0.08), smooth(0.6, 0.75, c.fbm(55, 3, 9)) * 0.85)
tar = mix(tar, (0.27, 0.24, 0.2), smooth(0.66, 0.9, c.fbm(40, 3, 12)) * 0.6)                   # dust blown over it
setts = smooth(9.5, 8, d_road)                                                                 # the cobbled strip the rails run in
cobble = ((np.mod(a_road, 5) < 0.7) | (np.mod(d_road, 4.5) < 0.6)).astype(np.float32)
tar = mix(tar, (0.26, 0.25, 0.24), setts * 0.9)
tar = mix(tar, (0.13, 0.13, 0.13), setts * cobble * 0.6)
rails = smooth(1.3, 0.5, np.abs(d_road - 5.5))
tar = mix(tar, (0.5, 0.5, 0.52), rails * 0.85)
cracks = smooth(0.012, 0.0, np.abs(c.fbm(34, 4, 11) - 0.5))
tar = mix(tar, (0.03, 0.03, 0.03), cracks * 0.8)
color = color + (tar - color) * asphalt[..., None]
height -= asphalt * 0.7

# The command post's round at the end of the road: stone setts in rings, a
# yellow band round its edge.
yard_d = np.hypot(c.xx - base["x"], c.yy - base["y"])
yard = smooth(40, 37, yard_d)
ang = np.arctan2(c.yy - base["y"], c.xx - base["x"])
setts = mix(c.flat((0.36, 0.35, 0.33)), (0.46, 0.45, 0.42), n3)
joints = ((np.mod(yard_d, 7) < 0.8) | (np.mod(ang * np.maximum(yard_d, 4), 9) < 0.8)).astype(np.float32)
setts = mix(setts, (0.2, 0.19, 0.18), joints * 0.7)
setts = mix(setts, (0.7, 0.52, 0.08), smooth(2.2, 1.2, np.abs(yard_d - 33)) * 0.9)
color = color + (setts - color) * yard[..., None]

color *= (0.86 + 0.28 * c.grain)[..., None]
c.save(color, height, out)
print("ground painted")
