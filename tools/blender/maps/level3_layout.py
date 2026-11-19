"""Level 3's new map, step 1: lays the town out and paints its ground.

  python tools/blender/maps/level3_layout.py <level3.json> <out_dir>

Reads what the game fixes (dump_level.mjs: roads, streets, wall, gates,
build slots, the RTS mode's bases and ore fields) and writes, into
<out_dir>:
  ground_color.png, ground_height.png   the ground, top-down, 1 px = 1 world px
  layout.json                           what stands on it, for build_map.py

Everything keeps to the game's own geometry. Towers can go on any build
slot (a 75 px grid over the whole map, away from the roads), so: ruins are
shells whose walls run along the lines half-way between slots, each room
holding one; trees stand where four slots' squares meet; nothing solid
stands on a road.
"""
import json
import math
import random
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

SEED = 3
GRID, FIRST = 75, 60            # the build slots' grid
HALF = FIRST - GRID / 2         # the lines half-way between slots: 22.5 + 75 k
ROAD_HALF = 32                  # asphalt each side of a road's middle
MOAT_IN, MOAT_OUT = 9, 27       # the moat: this far inside the fortress wall

src, out = Path(sys.argv[1]), Path(sys.argv[2])
out.mkdir(parents=True, exist_ok=True)
level = json.loads(src.read_text())
W, H = level["width"], level["height"]
rng = random.Random(SEED)
nrng = np.random.default_rng(SEED)
yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)


# ------------------------------------------------------------------ helpers

def fbm(scale, octaves=4, seed=0):
    """Smooth noise in 0..1, its largest blobs about `scale` px across."""
    r = np.random.default_rng(SEED * 1000 + seed)
    total = np.zeros((H, W), np.float32)
    amp, norm = 1.0, 0.0
    for o in range(octaves):
        n = max(2, int(W / scale * 2 ** o) + 2)
        small = Image.fromarray((r.random((n, n)) * 255).astype(np.uint8))
        total += amp * np.asarray(small.resize((W, H), Image.BICUBIC), np.float32) / 255
        norm += amp
        amp *= 0.5
    return total / norm


def smooth(lo, hi, v):
    t = np.clip((v - lo) / (hi - lo), 0, 1)
    return t * t * (3 - 2 * t)


def polyline_field(lines):
    """For every pixel: how far the nearest of these polylines is, and how
    far along it that nearest point is (for dashes)."""
    best = np.full((H, W), 1e9, np.float32)
    along = np.zeros((H, W), np.float32)
    for pts in lines:
        run = 0.0
        for a, b in zip(pts, pts[1:]):
            ax, ay, bx, by = a["x"], a["y"], b["x"], b["y"]
            dx, dy = bx - ax, by - ay
            length = math.hypot(dx, dy)
            if length < 1e-6:
                continue
            t = np.clip(((xx - ax) * dx + (yy - ay) * dy) / (length * length), 0, 1)
            d = np.hypot(xx - ax - t * dx, yy - ay - t * dy)
            closer = d < best
            best = np.where(closer, d, best)
            along = np.where(closer, run + t * length, along)
            run += length
    return best, along


def mask_of(draw):
    """A 0..1 mask painted with PIL: draw(ImageDraw) in white on black."""
    im = Image.new("L", (W, H), 0)
    draw(ImageDraw.Draw(im))
    return np.asarray(im, np.float32) / 255


def blur(mask, radius):
    return np.asarray(Image.fromarray((np.clip(mask, 0, 1) * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(radius)), np.float32) / 255


def mix(base, color, mask):
    return base + (np.asarray(color, np.float32) - base) * mask[..., None]


def seg_dist(px, py, a, b):
    ax, ay, bx, by = a["x"], a["y"], b["x"], b["y"]
    dx, dy = bx - ax, by - ay
    L = dx * dx + dy * dy
    t = max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / L)) if L else 0
    return math.hypot(px - ax - t * dx, py - ay - t * dy)


def dist_to(lines, px, py):
    return min(seg_dist(px, py, a, b) for pts in lines for a, b in zip(pts, pts[1:]))


def inside(poly, px, py):
    hit = False
    for a, b in zip(poly, poly[1:] + poly[:1]):
        if (a["y"] > py) != (b["y"] > py) and px < a["x"] + (py - a["y"]) / (b["y"] - a["y"]) * (b["x"] - a["x"]):
            hit = not hit
    return hit


# ----------------------------------------------------------- what is fixed

roads, streets = level["paths"], level["streets"]
wall = level["wall"]
corners = wall["corners"]
base = level["base"]
slots = {(s["x"], s["y"]) for s in level["slots"]}
minerals = level["rts"]["minerals"]
red_base = level["rts"]["redBase"]

road_d, road_along = polyline_field(roads)
street_d, _ = polyline_field(streets)
fort = mask_of(lambda d: d.polygon([(c["x"], c["y"]) for c in corners], fill=255))
wall_d, _ = polyline_field([corners + corners[:1]])
in_fort = fort > 0.5
moat = in_fort & (wall_d > MOAT_IN) & (wall_d < MOAT_OUT)
# The bridges: where a road crosses the moat.
bridge = moat & (road_d < 24)
moat = moat & ~bridge


def clear_of_roads(px, py, margin):
    return dist_to(roads, px, py) > margin


# -------------------------------------------------------------- the layout

def place_ruins():
    """Bombed-out buildings: rectangles on the half-way lines, a room to
    each slot, away from the roads, the fortress, the bases and the ore."""
    found = []
    tries = 0
    while len(found) < 46 and tries < 9000:
        tries += 1
        cols, rows = rng.choice([(2, 2), (3, 2), (2, 3), (3, 3), (4, 2), (2, 4), (3, 2), (2, 2)])
        i, j = rng.randrange(0, 27 - cols), rng.randrange(0, 27 - rows)
        x0, y0 = HALF + GRID * i, HALF + GRID * j
        x1, y1 = x0 + GRID * cols, y0 + GRID * rows
        if x0 < 10 or y0 < 10 or x1 > W - 10 or y1 > H - 10:
            continue
        probe = [(x0 + (x1 - x0) * u / 6, y0 + (y1 - y0) * v / 6) for u in range(7) for v in range(7)]
        if any(not clear_of_roads(px, py, 46) for px, py in probe):
            continue
        if any(dist_to(streets, px, py) < 24 for px, py in probe):
            continue
        if any(inside(corners, px, py) for px, py in probe) or dist_to([corners + corners[:1]], (x0 + x1) / 2, (y0 + y1) / 2) < 190:
            continue
        cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
        if math.hypot(cx - red_base["x"], cy - red_base["y"]) < 260:
            continue
        if any(math.hypot(cx - m["x"], cy - m["y"]) < m["radius"] * 0.4 for m in minerals):
            continue
        if any(x0 < r["x1"] + 36 and r["x0"] < x1 + 36 and y0 < r["y1"] + 36 and r["y0"] < y1 + 36 for r in found):
            continue
        found.append({"x0": x0, "y0": y0, "x1": x1, "y1": y1, "cols": cols, "rows": rows})
    for r in found:
        r["tone"] = rng.choice(["plaster", "plaster", "brick", "concrete"])
        top = rng.uniform(15, 27)
        walls = []
        # Outer walls in stretches of half a room, some fallen; partitions
        # between rooms, mostly fallen.
        def run(ax, ay, bx, by, standing):
            n = max(1, round(math.hypot(bx - ax, by - ay) / (GRID / 2)))
            for k in range(n):
                if rng.random() > standing:
                    continue
                h = top * rng.choice([1, 1, 0.85, 0.6, 0.4, 0.25])
                walls.append({"ax": ax + (bx - ax) * k / n, "ay": ay + (by - ay) * k / n,
                              "bx": ax + (bx - ax) * (k + 1) / n, "by": ay + (by - ay) * (k + 1) / n, "h": round(h, 1)})
        run(r["x0"], r["y0"], r["x1"], r["y0"], 0.8)
        run(r["x0"], r["y1"], r["x1"], r["y1"], 0.62)
        run(r["x0"], r["y0"], r["x0"], r["y1"], 0.75)
        run(r["x1"], r["y0"], r["x1"], r["y1"], 0.75)
        for c in range(1, r["cols"]):
            run(r["x0"] + GRID * c, r["y0"], r["x0"] + GRID * c, r["y1"], 0.32)
        for c in range(1, r["rows"]):
            run(r["x0"], r["y0"] + GRID * c, r["x1"], r["y0"] + GRID * c, 0.32)
        r["walls"] = walls
        # Rubble against the walls and in the corners of the rooms, never in a room's middle.
        r["rubble"] = []
        for _ in range(r["cols"] * r["rows"] * 3):
            c, w = rng.randrange(r["cols"]), rng.randrange(r["rows"])
            side = rng.choice([(-1, 0), (1, 0), (0, -1), (0, 1), (-1, -1), (1, 1), (1, -1), (-1, 1)])
            r["rubble"].append({"x": r["x0"] + GRID * (c + 0.5) + side[0] * rng.uniform(26, 33),
                                "y": r["y0"] + GRID * (w + 0.5) + side[1] * rng.uniform(26, 33), "r": round(rng.uniform(4, 9), 1)})
    return found


def green_bias(px, py):
    """How much this spot wants to be grass rather than bare earth: the
    west and the south-west fields, thinning toward the town."""
    west = max(0.0, 1 - px / 520)
    north_west = max(0.0, 1 - math.hypot(px - 150, py - 150) / 520)
    south = max(0.0, 1 - math.hypot(px - 1150, py - 2000) / 620) * 0.8
    return min(1.0, max(west, north_west, south))


def place_trees(ruins):
    """Trees where four slots' squares meet, mostly in the green west and
    along the fortress; dead ones in the town."""
    trees = []
    for i in range(0, 28):
        for j in range(0, 28):
            px, py = HALF + GRID * i + rng.uniform(-9, 9), HALF + GRID * j + rng.uniform(-9, 9)
            if not (12 < px < W - 12 and 16 < py < H - 6):
                continue
            if not clear_of_roads(px, py, ROAD_HALF + 10) or dist_to(streets, px, py) < 22:
                continue
            if any(r["x0"] - 14 < px < r["x1"] + 14 and r["y0"] - 14 < py < r["y1"] + 14 for r in ruins):
                continue
            in_garden = inside(corners, px, py)
            if in_garden and (dist_to([corners + corners[:1]], px, py) < MOAT_OUT + 14 or math.hypot(px - base["x"], py - base["y"]) < 150):
                continue
            if math.hypot(px - red_base["x"], py - red_base["y"]) < 150:
                continue
            want = 0.4 if in_garden else 0.16 + 0.8 * green_bias(px, py)
            if rng.random() > want:
                continue
            dead = not in_garden and green_bias(px, py) < 0.25 and rng.random() < 0.7
            trees.append({"x": round(px, 1), "y": round(py, 1), "r": round(rng.uniform(10, 16), 1), "h": round(rng.uniform(22, 34), 1),
                          "kind": "dead" if dead else rng.choice(["oak", "oak", "pine"]), "tint": round(rng.uniform(0.8, 1.15), 2)})
    return trees


def place_roadside(ruins):
    """Lamp posts along the roads, some knocked askew, and burnt-out cars."""
    posts, wrecks = [], []
    for pts in roads:
        run = 0.0
        side = 1
        for a, b in zip(pts, pts[1:]):
            dx, dy = b["x"] - a["x"], b["y"] - a["y"]
            length = math.hypot(dx, dy)
            if length < 1:
                continue
            ux, uy = dx / length, dy / length
            t = 130 - (run % 130)
            while t < length:
                px, py = a["x"] + ux * t + -uy * side * (ROAD_HALF + 5), a["y"] + uy * t + ux * side * (ROAD_HALF + 5)
                side = -side
                t += 130
                if not (20 < px < W - 20 and 30 < py < H - 10) or inside(corners, px, py):
                    continue
                if dist_to(roads, px, py) < ROAD_HALF + 3 or dist_to([corners + corners[:1]], px, py) < 30:
                    continue
                if min(math.hypot(px - sx, py - sy) for sx, sy in slots) < 26:
                    continue
                posts.append({"x": round(px, 1), "y": round(py, 1), "lean": round(rng.choice([0, 0, 0, 6, -8, 14]), 1), "turn": round(math.degrees(math.atan2(-uy * side, -ux * side)), 1)})
            run += length
    tries = 0
    while len(wrecks) < 16 and tries < 3000:
        tries += 1
        px, py = rng.uniform(60, W - 60), rng.uniform(60, H - 60)
        d = dist_to(roads, px, py)
        if not (ROAD_HALF + 12 < d < ROAD_HALF + 30) or inside(corners, px, py):
            continue
        if min(math.hypot(px - sx, py - sy) for sx, sy in slots) < 40:
            continue
        if any(math.hypot(px - w["x"], py - w["y"]) < 200 for w in wrecks):
            continue
        wrecks.append({"x": round(px, 1), "y": round(py, 1), "turn": round(rng.uniform(0, 360), 1), "kind": rng.choice(["car", "car", "truck"])})
    return posts, wrecks


def place_craters(ruins):
    craters = []
    tries = 0
    while len(craters) < 170 and tries < 8000:
        tries += 1
        # Thickest over the middle of the town, where the fighting was.
        px, py = rng.gauss(1050, 480), rng.gauss(950, 480)
        if not (20 < px < W - 20 and 20 < py < H - 20) or inside(corners, px, py):
            continue
        if not clear_of_roads(px, py, ROAD_HALF + 16):
            continue
        r = rng.choice([6, 7, 8, 9, 11, 13, 16, 19, 23])
        if any(math.hypot(px - c["x"], py - c["y"]) < c["r"] + r + 6 for c in craters):
            continue
        craters.append({"x": round(px, 1), "y": round(py, 1), "r": r})
    return craters


def place_bushes(ruins):
    """Low scrub anywhere a tower wouldn't stand on it."""
    bushes = []
    tries = 0
    while len(bushes) < 320 and tries < 12000:
        tries += 1
        px, py = rng.uniform(10, W - 10), rng.uniform(10, H - 10)
        if inside(corners, px, py) or not clear_of_roads(px, py, ROAD_HALF + 12) or dist_to(streets, px, py) < 22:
            continue
        if rng.random() > 0.2 + 0.8 * green_bias(px, py):
            continue
        if min(math.hypot(px - sx, py - sy) for sx, sy in slots) < 36:
            continue
        if any(r["x0"] - 6 < px < r["x1"] + 6 and r["y0"] - 6 < py < r["y1"] + 6 for r in ruins):
            continue
        bushes.append({"x": round(px, 1), "y": round(py, 1), "r": round(rng.uniform(3.5, 6.5), 1)})
    return bushes


ruins = place_ruins()
trees = place_trees(ruins)
bushes = place_bushes(ruins)
posts, wrecks = place_roadside(ruins)
craters = place_craters(ruins)

# The fortress garden: gravel walks, hedged lawns and flower beds, laid out
# on the same half-way lines so no hedge crosses a slot.
garden = {"hedges": [], "beds": [], "fountains": []}
gx = [HALF + GRID * k for k in range(2, 11)]
gy = [HALF + GRID * k for k in range(17, 26)]
for x in gx:
    for y0g, y1g in zip(gy, gy[1:]):
        mx, my = x, (y0g + y1g) / 2
        if not inside(corners, mx, my) or dist_to([corners + corners[:1]], mx, my) < MOAT_OUT + 16:
            continue
        if not clear_of_roads(mx, my, 44) or math.hypot(mx - base["x"], my - base["y"]) < 120:
            continue
        if rng.random() < 0.55:
            garden["hedges"].append({"ax": x, "ay": y0g + 10, "bx": x, "by": y1g - 10})
for y in gy:
    for x0g, x1g in zip(gx, gx[1:]):
        mx, my = (x0g + x1g) / 2, y
        if not inside(corners, mx, my) or dist_to([corners + corners[:1]], mx, my) < MOAT_OUT + 16:
            continue
        if not clear_of_roads(mx, my, 44) or math.hypot(mx - base["x"], my - base["y"]) < 120:
            continue
        if rng.random() < 0.55:
            garden["hedges"].append({"ax": x0g + 10, "ay": y, "bx": x1g - 10, "by": y})
for x0g in gx[:-1]:
    for y0g in gy[:-1]:
        cx, cy = x0g + GRID / 2, y0g + GRID / 2
        if not inside(corners, cx, cy) or dist_to([corners + corners[:1]], cx, cy) < MOAT_OUT + 40:
            continue
        if not clear_of_roads(cx, cy, 50) or math.hypot(cx - base["x"], cy - base["y"]) < 130:
            continue
        if rng.random() < 0.3:
            garden["beds"].append({"x": cx, "y": cy, "w": GRID - 22, "h": GRID - 22, "hue": rng.choice(["red", "yellow", "violet", "white"])})

layout = {
    "width": W, "height": H, "roads": roads, "wall": wall, "base": base,
    "moat": {"inner": MOAT_IN, "outer": MOAT_OUT},
    "ruins": ruins, "trees": trees, "bushes": bushes, "posts": posts, "wrecks": wrecks, "craters": craters, "garden": garden,
}
(out / "layout.json").write_text(json.dumps(layout))
print(f"{len(ruins)} ruins, {len(trees)} trees, {len(posts)} lamp posts, {len(wrecks)} wrecks, {len(craters)} craters, "
      f"{len(garden['hedges'])} hedges, {len(garden['beds'])} flower beds")


# -------------------------------------------------------------- the ground

n1, n2, n3 = fbm(420, 5, 1), fbm(120, 4, 2), fbm(26, 3, 3)
n4 = fbm(60, 4, 4)
grain = nrng.random((H, W)).astype(np.float32)
speck = nrng.random((H, W)).astype(np.float32)


def flat(c):
    return np.broadcast_to(np.float32(c), (H, W, 3)).copy()


# Bare earth in several browns, greyer and dustier toward the middle of the town.
color = mix(flat((0.30, 0.24, 0.16)), (0.47, 0.39, 0.27), n2)
color = mix(color, (0.24, 0.19, 0.13), smooth(0.55, 0.75, n4) * 0.6)
color = mix(color, (0.55, 0.48, 0.36), smooth(0.6, 0.85, fbm(200, 4, 5)) * 0.5)
town = smooth(0.2, 0.75, 1 - np.hypot(xx - 1150, yy - 850) / 1150) * (0.45 + 0.55 * n1)
color = mix(color, (0.41, 0.39, 0.35), town * 0.75)
# The ruins' rubble strewn round them.
near_ruin = np.zeros((H, W), np.float32)
for r in ruins:
    near_ruin = np.maximum(near_ruin, mask_of(lambda d: d.rectangle((r["x0"] - 14, r["y0"] - 14, r["x1"] + 14, r["y1"] + 14), fill=255)))
near_ruin = blur(near_ruin, 16)
color = mix(color, (0.45, 0.43, 0.39), near_ruin * (0.35 + 0.5 * n3))

# Grass: the west and south-west fields and the town's edges, patchy, with
# dark scrub and dry yellowed stretches.
bias = np.maximum.reduce([np.clip(1.15 - xx / 560, 0, 1), np.clip(1.1 - np.hypot(xx - 150, yy - 150) / 560, 0, 1),
                          np.clip(1.1 - np.hypot(xx - 1100, yy - 2050) / 700, 0, 1), 0.75 * np.clip(1 - np.hypot(xx - 2000, yy - 1250) / 420, 0, 1),
                          0.45 * (1 - town)])
grass = smooth(0.4, 0.6, 0.6 * bias + 0.55 * n2 + 0.3 * n3 - 0.15) * (1 - near_ruin * 0.8)
grass_color = mix(flat((0.15, 0.22, 0.08)), (0.26, 0.31, 0.12), n3)
grass_color = mix(grass_color, (0.38, 0.36, 0.17), smooth(0.55, 0.8, fbm(90, 3, 6)) * 0.7)
grass_color = mix(grass_color, (0.08, 0.14, 0.05), smooth(0.62, 0.72, fbm(18, 3, 7)) * 0.8)       # scrub
color = color + (grass_color - color) * (grass * 0.95)[..., None]
# Ploughed plots out in the western fields.
for (fx0, fy0, fx1, fy1, lean, tone) in ((97, 397, 247, 547, 0.5, (0.33, 0.26, 0.16)), (97, 697, 247, 922, -0.3, (0.3, 0.3, 0.14)),
                                         (1222, 1897, 1447, 2030, 0.2, (0.34, 0.27, 0.17)), (1897, 1297, 2030, 1522, 1.2, (0.29, 0.3, 0.15))):
    plot = blur(mask_of(lambda d: d.rectangle((fx0, fy0, fx1, fy1), fill=255)), 2.5) * smooth(ROAD_HALF + 4, ROAD_HALF + 14, road_d)
    furrow = 0.5 + 0.5 * np.sin((xx * math.cos(lean) + yy * math.sin(lean)) / 2.2)
    color = mix(color, tone, plot * 0.9)
    color = mix(color, (tone[0] * 0.6, tone[1] * 0.6, tone[2] * 0.6), plot * furrow * 0.55)

# Stones and litter everywhere, thicker in the town.
stones = (speck > 0.9965 - 0.004 * town - 0.004 * near_ruin).astype(np.float32)
stones = blur(stones, 0.8) * 2.2
color = mix(color, (0.6, 0.57, 0.5), np.clip(stones, 0, 1) * (grain > 0.5))
color = mix(color, (0.12, 0.1, 0.08), np.clip(stones, 0, 1) * (grain <= 0.5) * 0.8)

# Dust worn pale along the roads, and wheel tracks wandering off them.
color = mix(color, (0.5, 0.44, 0.33), smooth(95, 40, road_d) * 0.45)
tracks = Image.new("L", (W, H), 0)
td = ImageDraw.Draw(tracks)
for _ in range(46):
    x, y, a = rng.uniform(100, W - 100), rng.uniform(100, H - 100), rng.uniform(0, 6.28)
    pts = []
    for _ in range(rng.randrange(14, 40)):
        pts.append((x, y))
        a += rng.uniform(-0.25, 0.25)
        x, y = x + math.cos(a) * 22, y + math.sin(a) * 22
    for off in (-4, 4):
        td.line([(px + off * math.sin(a), py - off * math.cos(a)) for px, py in pts], fill=170, width=3, joint="curve")
tracks = blur(np.asarray(tracks, np.float32) / 255, 1.3) * (1 - fort)
color = mix(color, (0.55, 0.48, 0.36), tracks * 0.7)

# Craters: a scorched bowl, a pale rim of thrown earth and rays of soot.
height = (n2 - 0.5) * 3 + (n3 - 0.5) * 1.6 + (n4 - 0.5) * 2
for c in craters:
    x0c, x1c = int(max(0, c["x"] - c["r"] * 3.2)), int(min(W, c["x"] + c["r"] * 3.2))
    y0c, y1c = int(max(0, c["y"] - c["r"] * 3.2)), int(min(H, c["y"] + c["r"] * 3.2))
    sx, sy = xx[y0c:y1c, x0c:x1c], yy[y0c:y1c, x0c:x1c]
    d = np.hypot(sx - c["x"], sy - c["y"]) / c["r"]
    ang = np.arctan2(sy - c["y"], sx - c["x"])
    bowl = np.clip(1 - d, 0, 1) ** 1.3
    rim = np.exp(-((d - 1.15) / 0.3) ** 2)
    rays = np.clip(np.sin(ang * 7 + c["x"]) * 0.5 + np.sin(ang * 13 + c["y"]) * 0.5, 0, 1) * np.clip(2.8 - d, 0, 1) * (d > 1.2)
    patch = color[y0c:y1c, x0c:x1c]
    patch = mix(patch, (0.07, 0.06, 0.05), bowl * 0.92)
    patch = mix(patch, (0.58, 0.51, 0.39), rim * 0.6)
    patch = mix(patch, (0.1, 0.09, 0.08), rays * 0.5)
    color[y0c:y1c, x0c:x1c] = patch
    height[y0c:y1c, x0c:x1c] += rim * 2.6 - bowl * c["r"] * 0.6

# The ruins' floors: cracked slabs under dust, soot and fallen plaster.
for r in ruins:
    x0c, x1c, y0c, y1c = int(r["x0"]), int(r["x1"]) + 1, int(r["y0"]), int(r["y1"]) + 1
    sx, sy = xx[y0c:y1c, x0c:x1c], yy[y0c:y1c, x0c:x1c]
    slab = {"brick": (0.44, 0.34, 0.28), "plaster": (0.5, 0.46, 0.38), "concrete": (0.43, 0.43, 0.41)}[r["tone"]]
    tiles = ((np.mod(sx - r["x0"], 18.75) < 1.1) | (np.mod(sy - r["y0"], 18.75) < 1.1)).astype(np.float32)
    k3, k2, k4 = n3[y0c:y1c, x0c:x1c], n2[y0c:y1c, x0c:x1c], n4[y0c:y1c, x0c:x1c]
    worn = smooth(0.2, 0.5, k3 * 0.7 + k4 * 0.5)
    patch = color[y0c:y1c, x0c:x1c]
    patch = mix(patch, slab, worn * 0.92)
    patch = mix(patch, (0.22, 0.2, 0.18), worn * tiles * 0.6)
    patch = mix(patch, (0.09, 0.08, 0.07), smooth(0.56, 0.72, fbm(60, 3, 40 + ruins.index(r))[y0c:y1c, x0c:x1c]) * 0.8)      # soot
    patch = mix(patch, (0.62, 0.58, 0.5), smooth(0.66, 0.74, k2 * 0.5 + k3 * 0.6) * 0.6)                                    # plaster dust
    color[y0c:y1c, x0c:x1c] = patch
    height[y0c:y1c, x0c:x1c] += (grain[y0c:y1c, x0c:x1c] - 0.5) * 1.8

# The streets: old concrete, broken up and half buried.
street = smooth(21, 17, street_d + (n3 - 0.5) * 9) * (1 - fort)
whole = street * smooth(0.28, 0.5, n4 * 0.7 + n3 * 0.5)
setts = ((np.mod(xx, 9) < 1.0) | (np.mod(yy + (np.floor(xx / 9) % 2) * 4.5, 9) < 1.0)).astype(np.float32)
color = mix(color, (0.38, 0.37, 0.35), whole * 0.9)
color = mix(color, (0.24, 0.23, 0.22), whole * setts * 0.55)
color = mix(color, (0.5, 0.49, 0.46), smooth(2.0, 0.8, np.abs(street_d - 18)) * whole * 0.7)             # kerbs

# The roads: asphalt with ragged edges, patches, cracks and a worn middle line.
edge = road_d + (n3 - 0.5) * 7
asphalt = smooth(ROAD_HALF + 1.5, ROAD_HALF - 2.5, edge) * (1 - fort)
shoulder = smooth(ROAD_HALF + 12, ROAD_HALF, edge) * (1 - fort)
color = mix(color, (0.44, 0.39, 0.31), shoulder * 0.8)
# Pavements along the roads through the town, their slabs cracked and missing in places.
pavement = smooth(ROAD_HALF + 10.5, ROAD_HALF + 8.5, edge) * (1 - asphalt) * (1 - fort) * smooth(0.25, 0.5, town + n4 * 0.5 - 0.2)
slabs = (np.mod(road_along, 9) < 1.0).astype(np.float32)
color = mix(color, (0.46, 0.45, 0.42), pavement * 0.92)
color = mix(color, (0.27, 0.26, 0.24), pavement * slabs * 0.6)
color = mix(color, (0.56, 0.55, 0.52), smooth(1.6, 0.6, np.abs(edge - ROAD_HALF)) * (1 - fort) * 0.75)   # kerb
tar = mix(flat((0.11, 0.11, 0.12)), (0.19, 0.19, 0.2), n2)
tar = mix(tar, (0.07, 0.07, 0.08), smooth(0.6, 0.75, fbm(55, 3, 9)) * 0.85)      # patches
tar = mix(tar, (0.24, 0.23, 0.22), smooth(0.25, 0.0, np.abs(np.mod(road_d, 21) - 10.5) / 10.5) * 0.3)    # wheel lanes
tar = mix(tar, (0.3, 0.26, 0.2), smooth(0.7, 0.9, fbm(40, 3, 12)) * 0.5)        # dirt blown over it
cracks = smooth(0.012, 0.0, np.abs(fbm(34, 4, 11) - 0.5))
tar = mix(tar, (0.03, 0.03, 0.03), cracks * 0.8)
color = color + (tar - color) * asphalt[..., None]
dash = (road_d < 1.6) & (np.mod(road_along, 44) < 20) & (grain > 0.25)
color = mix(color, (0.7, 0.68, 0.6), dash.astype(np.float32) * asphalt * 0.75)
side_line = (np.abs(road_d - (ROAD_HALF - 5)) < 0.9) & (n3 > 0.42)
color = mix(color, (0.62, 0.6, 0.55), side_line.astype(np.float32) * asphalt * 0.5)
height -= asphalt * 0.6

# The paved square in front of the north-east bridge.
square = mask_of(lambda d: d.polygon([(640, 1240), (760, 1240), (800, 1300), (730, 1380), (660, 1330)], fill=255)) * (1 - fort)
square = blur(square, 3)
paving = ((np.mod(xx + yy, 16) < 1.2) | (np.mod(xx - yy, 16) < 1.2)).astype(np.float32)
color = mix(color, (0.4, 0.39, 0.36), square * 0.9)
color = mix(color, (0.25, 0.24, 0.22), square * paving * 0.6)

# The fortress garden: striped lawn, gravel walks, flower beds, and the
# paved court in its middle where every road ends.
stripes = 0.5 + 0.5 * np.sin((xx + yy * 0.2) / 7.5)
lawn = mix(flat((0.12, 0.25, 0.07)), (0.18, 0.32, 0.09), stripes * 0.7 + n3 * 0.3)
lawn = mix(lawn, (0.09, 0.19, 0.05), smooth(0.6, 0.75, n4) * 0.6)
color = np.where(in_fort[..., None], lawn, color)
gravel_color = mix(flat((0.5, 0.44, 0.33)), (0.62, 0.56, 0.44), grain)
walks = mask_of(lambda d: [d.line([(gxv, gy[0]), (gxv, gy[-1])], fill=255, width=6) for gxv in gx] +
                          [d.line([(gx[0], gyv), (gx[-1], gyv)], fill=255, width=6) for gyv in gy])
walk = np.maximum(walks, smooth(25, 21, road_d)) * fort
ring = smooth(4.5, 3, np.abs(np.hypot(xx - base["x"], yy - base["y"]) - 108))
walk = np.maximum(walk, ring * fort)
color = color + (gravel_color - color) * (walk * (wall_d > MOAT_OUT + 4))[..., None]
for b in garden["beds"]:
    bed = mask_of(lambda d: d.rounded_rectangle((b["x"] - b["w"] / 2, b["y"] - b["h"] / 2, b["x"] + b["w"] / 2, b["y"] + b["h"] / 2), radius=8, fill=255))
    hue = {"red": (0.62, 0.1, 0.1), "yellow": (0.75, 0.6, 0.1), "violet": (0.45, 0.2, 0.55), "white": (0.8, 0.8, 0.72)}[b["hue"]]
    color = mix(color, (0.16, 0.25, 0.1), bed)
    color = mix(color, hue, bed * (grain > 0.55) * (n3 > 0.35))
court_d = np.hypot(xx - base["x"], yy - base["y"])
court = smooth(88, 85, court_d)
stone = mix(flat((0.44, 0.42, 0.37)), (0.54, 0.51, 0.45), n3)
ang = np.arctan2(yy - base["y"], xx - base["x"])
joints = ((np.mod(court_d, 14) < 1.1) | ((np.mod(ang, math.pi / 12) < 0.012 * 85 / np.maximum(court_d, 8)) & (court_d > 14))).astype(np.float32)
stone = mix(stone, (0.26, 0.24, 0.21), joints * 0.7)
star = (np.cos(ang * 8) * 0.5 + 0.5) * smooth(60, 20, court_d) > 0.42
stone = mix(stone, (0.42, 0.36, 0.3), star.astype(np.float32) * smooth(64, 60, court_d) * 0.55)
stone = mix(stone, (0.3, 0.27, 0.22), smooth(2.5, 1.2, np.abs(court_d - 64)) * 0.8)
color = color + (stone - color) * court[..., None]

# The moat (the water itself is laid over this in 3D), its stone banks and the bridges' decks.
color = np.where(moat[..., None], np.float32((0.06, 0.13, 0.14)), color)
bank = in_fort & ((np.abs(wall_d - MOAT_OUT - 2.5) < 2.5) | (wall_d <= MOAT_IN)) & ~bridge
color = np.where(bank[..., None], mix(np.broadcast_to(np.float32((0.5, 0.48, 0.43)), (H, W, 3)).copy(), (0.4, 0.38, 0.34), n3), color)
deck = bridge | (in_fort & (wall_d < MOAT_OUT + 5) & (road_d < 24))
planks = (np.mod(road_along, 7) < 1.2).astype(np.float32)
color = np.where(deck[..., None], mix(np.broadcast_to(np.float32((0.5, 0.47, 0.42)), (H, W, 3)).copy(), (0.33, 0.31, 0.27), planks * 0.7), color)

# Grain everywhere, so nothing is flat.
color *= (0.86 + 0.28 * grain)[..., None]
color = np.clip(color, 0, 1)

# The colours above are as displayed (sRGB); the height as 16 bits about a mid grey.
Image.fromarray((np.clip(color, 0, 1) * 255).astype(np.uint8)).save(out / "ground_color.png")
h16 = np.clip(32768 + height * 900, 0, 65535).astype(np.uint16)
Image.fromarray(h16).save(out / "ground_height.png")
water = (moat.astype(np.uint8) * 255)
Image.fromarray(water).save(out / "moat_mask.png")
print("ground painted")
