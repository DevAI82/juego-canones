"""Level 4's map ("Ciudad en ruinas"): a seaside city of towers between a
river and the sea, its roads ringing the towers on their way to the
headquarters in the south-west.

  python tools/blender/maps/level4_layout.py <level4.json> <out_dir>

Writes ground_color.png, ground_height.png and layout.json for
build_map.py. A tower hides what is behind it, so none stands where its
picture -- its plan and, up the screen from it, its height -- would cover a
build slot, a road or the water; each is as tall as that leaves room for.
"""
import json
import math
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
from paintkit import Canvas, smooth, mix, dist_to, nearest, scatter, along, inside

ROAD_HALF = 32
STREET_HALF = 22
LEAN = 0.625     # how far up the picture a px of height shows (scenekit's camera)

src, out = Path(sys.argv[1]), Path(sys.argv[2])
out.mkdir(parents=True, exist_ok=True)
level = json.loads(src.read_text())
W, H = level["width"], level["height"]
c = Canvas(W, H, seed=41, scale=1)
rng = c.rng
roads, streets, water = level["paths"], level["streets"], level["water"]
base = level["base"]
slots = [(s["x"], s["y"]) for s in level["slots"]]
shores = [w + w[:1] for w in water]
sea = water[-1]


def road_d(x, y):
    return min(dist_to(roads, x, y), dist_to(streets, x, y) + (ROAD_HALF - STREET_HALF))


def in_water(x, y):
    return any(inside(w, x, y) for w in water)


def shore_d(x, y):
    return dist_to(shores, x, y)


def clear(x0, y0, x1, y1, h, taken, slot_gap=40, road_gap=ROAD_HALF + 10):
    """Whether a building there hides no slot, road or water, and touches no other."""
    sy0 = y0 - h * LEAN
    if x0 < 4 or x1 > W - 4 or y1 > H - 4 or sy0 < -60:
        return False
    for px, py in slots + [(base["x"], base["y"])]:
        if x0 - slot_gap < px < x1 + slot_gap and sy0 - slot_gap < py < y1 + slot_gap:
            return False
    for u in range(7):
        for v in range(9):
            px, py = x0 + (x1 - x0) * u / 6, sy0 + (y1 - sy0) * v / 8
            if road_d(px, py) < road_gap:
                return False
            if py >= y0 - 6 and (in_water(px, py) or shore_d(px, py) < 10):
                return False
    return all(x1 + 12 < t[0] or t[2] + 12 < x0 or y1 + 12 < t[1] - t[4] * LEAN or t[3] + 12 < sy0 for t in taken)


# -------------------------------------------------------------- the layout

taken = []          # (x0, y0, x1, y1, h) of every building
blocks, ruins = [], []

# The headquarters, by the door the roads end at: the largest that fits to its west.
for w, d, h in ((170, 120, 26), (150, 110, 26), (130, 100, 24), (110, 90, 22), (90, 80, 20), (70, 64, 18)):
    for dy in (-20, 0, 20, -40, 40):
        x1 = base["x"] - 34
        y0 = base["y"] - d / 2 + dy
        if clear(x1 - w, y0, x1, y0 + d, h, taken, road_gap=ROAD_HALF + 4):
            taken.append((x1 - w, y0, x1, y0 + d, h))
            blocks.append({"x0": x1 - w, "y0": y0, "x1": x1, "y1": y0 + d, "h": h, "tone": "white", "clutter": 3, "helipad": True})
            break
    if taken:
        break

# The towers: as tall as what's behind each one allows.
for _ in range(14000):
    if len(taken) >= 60:
        break
    w, d = rng.uniform(64, 150), rng.uniform(56, 120)
    x0, y0 = rng.uniform(0, W - w), rng.uniform(40, H - d)
    core = math.hypot(x0 + w / 2 - 1000, y0 + d / 2 - 950) < 560        # the cluster the roads ring
    want = rng.uniform(90, 190) if core else rng.uniform(20, 60)
    h = None
    for trial in (want, want * 0.7, want * 0.45, 22):
        if trial >= 18 and clear(x0, y0, x0 + w, y0 + d, trial, taken):
            h = trial
            break
    if h is None:
        continue
    taken.append((x0, y0, x0 + w, y0 + d, h))
    if h < 26 and rng.random() < 0.5:
        walls = []

        def run(ax, ay, bx, by, part):
            n = max(1, round(math.hypot(bx - ax, by - ay) / 30))
            for k in range(n):
                if rng.random() <= part:
                    walls.append({"ax": ax + (bx - ax) * k / n, "ay": ay + (by - ay) * k / n, "bx": ax + (bx - ax) * (k + 1) / n,
                                  "by": ay + (by - ay) * (k + 1) / n, "h": round(h * rng.choice([1, 1, 0.8, 0.55, 0.35]), 1)})
        x1, y1 = x0 + w, y0 + d
        run(x0, y0, x1, y0, 0.85)
        run(x0, y1, x1, y1, 0.6)
        run(x0, y0, x0, y1, 0.75)
        run(x1, y0, x1, y1, 0.75)
        ruins.append({"tone": rng.choice(["plaster", "concrete", "brick"]), "thick": 7, "walls": walls, "x0": x0, "y0": y0, "x1": x1, "y1": y1,
                      "rubble": [{"x": rng.uniform(x0 + 8, x1 - 8), "y": rng.uniform(y0 + 8, y1 - 8), "r": round(rng.uniform(5, 11), 1)} for _ in range(int(w * d / 1600) + 2)]})
    else:
        blocks.append({"x0": round(x0, 1), "y0": round(y0, 1), "x1": round(x0 + w, 1), "y1": round(y0 + d, 1), "h": round(h, 1),
                       "tone": rng.choice(["concrete", "glass_tower", "glass_tower", "white", "stone"]) if h > 60 else rng.choice(["plaster", "concrete", "white", "brick"]),
                       "ruined": rng.random() < (0.75 if core else 0.35), "clutter": rng.randrange(2, 6)})


# If nothing fitted right at the door, the nearest building to it is the headquarters.
if not any(b.get("helipad") for b in blocks):
    hq = min(blocks, key=lambda b: math.hypot((b["x0"] + b["x1"]) / 2 - base["x"], (b["y0"] + b["y1"]) / 2 - base["y"]))
    hq.update({"tone": "white", "helipad": True, "ruined": False})


def off_buildings(x, y, gap=6):
    return all(not (t[0] - gap < x < t[2] + gap and t[1] - t[4] * LEAN - gap < y < t[3] + gap) for t in taken)


def dry(x, y, gap=12):
    return not in_water(x, y) and shore_d(x, y) > gap


def green(x, y):
    """Parks and verges: the east and the south-east, and along the river."""
    return max(0.0, 1 - math.hypot(x - 1900, y - 1250) / 520, 1 - math.hypot(x - 150, y - 1900) / 420, 0.7 * (1 - math.hypot(x - 60, y - 1000) / 360))


heaps = [{"x": round(x, 1), "y": round(y, 1), "r": round(rng.uniform(6, 14), 1)}
         for x, y in scatter(rng, 90, lambda x, y, f: nearest(slots, x, y) > 34 and road_d(x, y) > ROAD_HALF + 8 and off_buildings(x, y) and dry(x, y)
                             and nearest(f, x, y) > 34 and math.hypot(x - 1000, y - 950) < 620, W, H)]
ruins.append({"tone": "concrete", "walls": [], "rubble": heaps})
craters = [{"x": round(x, 1), "y": round(y, 1), "r": rng.choice([7, 9, 11, 14, 18, 22])}
           for x, y in scatter(rng, 60, lambda x, y, f: road_d(x, y) > ROAD_HALF + 14 and off_buildings(x, y, 0) and dry(x, y, 20) and nearest(f, x, y) > 60, W, H, margin=16)]
wrecks = [{"x": round(x, 1), "y": round(y, 1), "turn": round(rng.uniform(0, 360), 1), "kind": rng.choice(["car", "car", "truck"])}
          for x, y in scatter(rng, 22, lambda x, y, f: nearest(slots, x, y) > 44 and ROAD_HALF + 12 < road_d(x, y) < ROAD_HALF + 50 and off_buildings(x, y, 14)
                              and dry(x, y, 16) and nearest(f, x, y) > 150, W, H, margin=24)]
trees = [{"x": round(x, 1), "y": round(y, 1), "r": round(rng.uniform(10, 16), 1), "h": round(rng.uniform(22, 34), 1),
          "kind": rng.choice(["oak", "oak", "pine"]) if green(x, y) > 0.25 else "dead", "tint": round(rng.uniform(0.8, 1.15), 2)}
         for x, y in scatter(rng, 150, lambda x, y, f: nearest(slots, x, y) > 44 and road_d(x, y) > ROAD_HALF + 16 and off_buildings(x, y, 12) and dry(x, y, 14)
                             and nearest(f, x, y) > 28 and rng.random() < 0.08 + 0.92 * green(x, y), W, H, margin=12)]
bushes = [{"x": round(x, 1), "y": round(y, 1), "r": round(rng.uniform(3.5, 6.5), 1)}
          for x, y in scatter(rng, 260, lambda x, y, f: nearest(slots, x, y) > 34 and road_d(x, y) > ROAD_HALF + 10 and off_buildings(x, y, 6) and dry(x, y, 8)
                              and nearest(f, x, y) > 9 and rng.random() < 0.1 + 0.9 * green(x, y), W, H, margin=8)]
posts = []
for road in roads:
    side = 1
    for (x, y, turn) in along(road, 150, 0):
        side = -side
        px = x + math.sin(math.radians(turn)) * side * (ROAD_HALF + 6)
        py = y - math.cos(math.radians(turn)) * side * (ROAD_HALF + 6)
        if 16 < px < W - 16 and 30 < py < H - 10 and nearest(slots, px, py) > 30 and road_d(px, py) > ROAD_HALF + 3 and off_buildings(px, py, 4) \
                and nearest([(p["x"], p["y"]) for p in posts], px, py) > 90 and not in_water(px, py):
            posts.append({"x": round(px, 1), "y": round(py, 1), "lean": rng.choice([0, 0, 0, 7, -10, 16]), "turn": round(-turn + (90 if side > 0 else -90), 1)})
hedgehogs = [{"x": round(x, 1), "y": round(y, 1), "turn": round(rng.uniform(0, 90), 1)}
             for x, y in scatter(rng, 26, lambda x, y, f: nearest(slots, x, y) > 36 and ROAD_HALF + 10 < road_d(x, y) < ROAD_HALF + 30 and off_buildings(x, y, 8)
                                 and dry(x, y) and nearest(f, x, y) > 60, W, H, margin=20)]

# The bridges: the roads' parapets where they run between two waters.
rails = []
for road in roads:
    run = []
    for (x, y, turn) in along(road, 8, 0):
        over = 0 < x < W and 0 < y < H and shore_d(x, y) < ROAD_HALF + 14 and not in_water(x, y) \
            and sum(in_water(x + math.sin(math.radians(turn)) * s, y - math.cos(math.radians(turn)) * s) for s in (ROAD_HALF + 16, -(ROAD_HALF + 16))) == 2
        if over:
            run.append((x, y, turn))
        else:
            if len(run) > 5:
                rails.append(run)
            run = []
    if len(run) > 5:
        rails.append(run)
fences = []
seen = []
for run in rails:
    mid = run[len(run) // 2]
    if nearest(seen, mid[0], mid[1]) < 60:
        continue
    seen.append((mid[0], mid[1]))
    for side in (1, -1):
        for a, b in zip(run, run[1:]):
            off = lambda p: (p[0] + math.sin(math.radians(p[2])) * side * (ROAD_HALF + 3), p[1] - math.cos(math.radians(p[2])) * side * (ROAD_HALF + 3))
            (ax, ay), (bx, by) = off(a), off(b)
            fences.append({"ax": round(ax, 1), "ay": round(ay, 1), "bx": round(bx, 1), "by": round(by, 1)})
flags = [{"x": base["x"] + 24, "y": base["y"] + 30}] if nearest(slots, base["x"] + 24, base["y"] + 30) > 30 else []

layout = {"width": W, "height": H, "water": water, "blocks": blocks, "ruins": ruins, "wrecks": wrecks, "trees": trees, "bushes": bushes, "posts": posts,
          "hedgehogs": hedgehogs, "fences": fences, "flags": flags}
(out / "layout.json").write_text(json.dumps(layout))
print(", ".join(f"{len(v)} {k}" for k, v in layout.items() if isinstance(v, list)), f"and {len(craters)} craters; {len(seen)} bridges")

# -------------------------------------------------------------- the ground

n1, n2, n3, n4 = c.fbm(420, 5, 1), c.fbm(120, 4, 2), c.fbm(26, 3, 3), c.fbm(60, 4, 4)
d_road, a_road = c.polyline_field(roads)
d_street, a_street = c.polyline_field(streets)
wet = np.zeros_like(n1)
for poly in water:
    wet = np.maximum(wet, c.polygon([(q["x"], q["y"]) for q in poly]))
d_shore, _ = c.polyline_field(shores)
d_sea, _ = c.polyline_field([sea + sea[:1]])
land = 1 - wet

# The city's ground: paving and dust in the middle, parks and sand outside.
core = smooth(680, 420, np.hypot(c.xx - 1000, c.yy - 950))
color = mix(c.flat((0.3, 0.27, 0.22)), (0.44, 0.4, 0.33), n2)
color = mix(color, (0.21, 0.19, 0.16), smooth(0.55, 0.75, n4) * 0.6)
paving = ((np.mod(c.xx + (np.floor(c.yy / 14) % 2) * 10, 20) < 1.0) | (np.mod(c.yy, 14) < 1.0)).astype(np.float32)
slabbed = core * smooth(0.3, 0.5, c.fbm(90, 4, 6) * 0.7 + n3 * 0.4)
color = mix(color, (0.42, 0.41, 0.39), slabbed * 0.7)
color = mix(color, (0.22, 0.21, 0.2), slabbed * paving * 0.5)
park = np.maximum.reduce([np.clip(1 - np.hypot(c.xx - 1900, c.yy - 1250) / 520, 0, 1), np.clip(1 - np.hypot(c.xx - 150, c.yy - 1900) / 420, 0, 1),
                          0.7 * np.clip(1 - np.hypot(c.xx - 60, c.yy - 1000) / 360, 0, 1), 0.35 * (1 - core)])
grass = smooth(0.38, 0.58, 0.65 * park + 0.5 * n2 + 0.25 * n3 - 0.12)
grass_color = mix(c.flat((0.14, 0.22, 0.08)), (0.26, 0.31, 0.12), n3)
grass_color = mix(grass_color, (0.08, 0.14, 0.05), smooth(0.62, 0.72, c.fbm(18, 3, 7)) * 0.8)
color = color + (grass_color - color) * (grass * 0.95)[..., None]
# The beach along the sea, and stone quays along the river.
beach = smooth(95, 40, d_sea + (n4 - 0.5) * 40) * land
sand = mix(c.flat((0.62, 0.55, 0.4)), (0.74, 0.68, 0.52), n3)
sand = mix(sand, (0.5, 0.44, 0.32), smooth(14, 0, d_sea) * 0.7)          # wet at the water's edge
color = color + (sand - color) * beach[..., None]
quay = smooth(11, 8, d_shore) * land * (1 - beach)
color = mix(color, (0.45, 0.44, 0.41), quay * 0.95)
color = mix(color, (0.25, 0.24, 0.22), quay * (np.mod(c.xx + c.yy, 9) < 1.0) * 0.6)
litter = c.blur((c.speck > 0.9945 - 0.004 * core).astype(np.float32), 0.8) * 2.2
color = mix(color, (0.6, 0.57, 0.5), np.clip(litter, 0, 1) * (c.grain > 0.5) * land)
color = mix(color, (0.1, 0.09, 0.08), np.clip(litter, 0, 1) * (c.grain <= 0.5) * 0.85 * land)
height = (n2 - 0.5) * 3 + (n3 - 0.5) * 2 + (n4 - 0.5) * 2

# Each building's plot, and the debris spilled round the ruined ones.
spill = np.zeros_like(n1)
for (x0, y0, x1, y1, h) in taken:
    sl, wx, wy = c.window((x0 + x1) / 2, (y0 + y1) / 2, max(x1 - x0, y1 - y0) / 2 + 30)
    spill[sl] = np.maximum(spill[sl], ((wx > x0 - 14) & (wx < x1 + 14) & (wy > y0 - 14) & (wy < y1 + 14)).astype(np.float32))
spill = c.blur(spill, 12)
color = mix(color, (0.45, 0.43, 0.39), spill * (0.35 + 0.5 * n3) * land)
for r in ruins:
    if "x0" not in r:
        continue
    sl, wx, wy = c.window((r["x0"] + r["x1"]) / 2, (r["y0"] + r["y1"]) / 2, max(r["x1"] - r["x0"], r["y1"] - r["y0"]) / 2 + 2)
    floor = ((wx > r["x0"]) & (wx < r["x1"]) & (wy > r["y0"]) & (wy < r["y1"])).astype(np.float32)
    tiles = ((np.mod(wx - r["x0"], 15) < 1.0) | (np.mod(wy - r["y0"], 15) < 1.0)).astype(np.float32)
    patch = mix(color[sl], (0.44, 0.42, 0.38), floor * 0.85)
    patch = mix(patch, (0.22, 0.2, 0.18), floor * tiles * 0.55)
    color[sl] = mix(patch, (0.09, 0.08, 0.07), floor * smooth(0.55, 0.72, n4[sl]) * 0.75)

for k in craters:
    c.crater(color, height, k["x"], k["y"], k["r"])

# Streets and roads: asphalt, kerbs and pavements; the roads with a middle line.
for d_line, a_line, half, lined in ((d_street, a_street, STREET_HALF, False), (d_road, a_road, ROAD_HALF, True)):
    edge = d_line + (n3 - 0.5) * 6
    pavement = smooth(half + 12, half + 9, edge) * land
    slabs = (np.mod(a_line, 10) < 1.0).astype(np.float32)
    color = mix(color, (0.43, 0.42, 0.4), pavement * smooth(0.2, 0.45, n4 + 0.3) * 0.92)
    color = mix(color, (0.24, 0.23, 0.22), pavement * slabs * 0.5)
    asphalt = smooth(half + 1.5, half - 2.5, edge)
    color = mix(color, (0.55, 0.54, 0.51), smooth(1.7, 0.6, np.abs(edge - half)) * 0.8)
    tar = mix(c.flat((0.11, 0.11, 0.12)), (0.19, 0.19, 0.2), n2)
    tar = mix(tar, (0.07, 0.07, 0.08), smooth(0.6, 0.75, c.fbm(55, 3, 9)) * 0.85)
    tar = mix(tar, (0.27, 0.24, 0.2), smooth(0.68, 0.9, c.fbm(40, 3, 12)) * 0.55)
    tar = mix(tar, (0.24, 0.23, 0.22), smooth(0.25, 0.0, np.abs(np.mod(d_line, 21) - 10.5) / 10.5) * 0.3)
    cracks = smooth(0.012, 0.0, np.abs(c.fbm(34, 4, 11) - 0.5))
    tar = mix(tar, (0.03, 0.03, 0.03), cracks * 0.8)
    if lined:
        dash = ((d_line < 1.6) & (np.mod(a_line, 44) < 20) & (c.grain > 0.25)).astype(np.float32)
        tar = mix(tar, (0.7, 0.68, 0.6), dash * 0.75)
        tar = mix(tar, (0.62, 0.6, 0.55), ((np.abs(d_line - (half - 5)) < 0.9) & (n3 > 0.42)).astype(np.float32) * 0.5)
    color = color + (tar - color) * asphalt[..., None]
    height -= asphalt * 0.7

# The water under the sheets laid over it in 3D: deep in the middle, pale in the shallows.
deep = mix(c.flat((0.05, 0.13, 0.17)), (0.03, 0.08, 0.12), n2)
deep = mix(deep, (0.16, 0.3, 0.3), smooth(60, 0, d_shore) * 0.7)
color = np.where(wet[..., None] > 0.5, deep, color)

color *= (0.86 + 0.28 * c.grain)[..., None]
c.save(color, height, out)
print("ground painted")
