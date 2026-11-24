"""The duel minigame's arenas 2 to 5: Hierro (a scrapyard), Bronce (a
foundry yard), Plata (a snowed-in base) and Oro (a palace courtyard).
Arena 1 has its own script, duel1_layout.py.

  python tools/blender/maps/duel_layout.py <arena<N>.json> <out_dir>

<arena<N>.json> comes from dump_arena.mjs. Writes ground_color.png and
ground_height.png (2 px to the arena's px) and layout.json for
build_map.py: here a layout brings its own surfaces ("paints") and builds
its props out of plain shapes ("solids").

The game's obstacles are circles (game/js/duelArenas.js): what stands up
stands inside them, and nothing solid stands anywhere else -- except the
wall round the arena, which is outside both zones.
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
N = arena["arena"]
obstacles = arena["obstacles"]
zones = arena["zones"]
c = Canvas(W, H, seed=40 + N, scale=2)
rng = c.rng
xx, yy = c.xx, c.yy
MID = W / 2

solids = []
paints = {}


def box(x, y, z, size, mat, turn=0, bevel=0.4):
    solids.append({"shape": "box", "x": round(x, 1), "y": round(y, 1), "z": z, "size": list(size), "mat": mat, "turn": round(turn, 1), "bevel": bevel})


def cyl(x, y, z, r, h, mat, r2=None, segments=16, bevel=0.3):
    solids.append({"shape": "cyl", "x": round(x, 1), "y": round(y, 1), "z": z, "r": r, "h": h, "r2": r2, "mat": mat, "segments": segments, "bevel": bevel})


def ball(x, y, z, r, mat, squash=1.0):
    solids.append({"shape": "ball", "x": round(x, 1), "y": round(y, 1), "z": z, "r": r, "mat": mat, "squash": squash})


def wall(mat, height, thick=6, cap=None):
    """The wall round the arena, with a gap in the middle of each short
    side (where each army comes in from)."""
    e = thick / 2 + 3
    runs = [(e, e, W - e, e), (e, H - e, W - e, H - e)]
    for x in (e, W - e):
        runs += [(x, e, x, H / 2 - 70), (x, H / 2 + 70, x, H - e)]
    for ax, ay, bx, by in runs:
        length = math.hypot(bx - ax, by - ay)
        turn = math.degrees(math.atan2(by - ay, bx - ax))
        box((ax + bx) / 2, (ay + by) / 2, height / 2, (length, thick, height), mat, turn, bevel=0.5)
        if cap:
            box((ax + bx) / 2, (ay + by) / 2, height + 0.9, (length, thick + 2, 1.8), cap, turn, bevel=0.5)


def chalk(color, strength=0.6):
    """Each side's zone and the middle line, marked on the ground."""
    rect = lambda z: [(z["x0"], z["y0"]), (z["x1"], z["y0"]), (z["x1"], z["y1"]), (z["x0"], z["y1"]), (z["x0"], z["y0"])]
    dashes = [[(MID, y0), (MID, y0 + 26)] for y0 in range(24, H - 30, 52)]
    lines = c.blur(c.lines([rect(zones["left"]), rect(zones["right"])] + dashes, 2.6), 0.5)
    return lines * (0.25 + 0.5 * smooth(0.3, 0.7, n4)) * strength, color


def tracks(count, dark, depth=1.0):
    """Tyre and track marks from each side's gap in the wall over its half."""
    runs = []
    for gate_x, way in ((0, 1), (W, -1)):
        for _ in range(count):
            end_x = gate_x + way * rng.uniform(260, 560)
            end_y = rng.uniform(90, H - 90)
            bend = rng.uniform(-70, 70)
            gauge = rng.choice([7, 9, 11])
            for side in (-1, 1):
                runs.append([(gate_x + (end_x - gate_x) * k / 24,
                              H / 2 + (end_y - H / 2) * (k / 24) ** 2 + bend * math.sin(k / 24 * math.pi) + side * gauge) for k in range(25)])
    ruts = c.blur(c.lines(runs, 2.4), 0.7) * (0.35 + 0.65 * smooth(0.35, 0.7, n4))
    return ruts, dark, depth


def foot(color, height, tone, reach=24, rise=0.9):
    """Trodden, shaded ground at the foot of what stands up."""
    for o in obstacles:
        d = np.hypot(xx - o["x"], yy - o["y"])
        f = smooth(o["r"] + reach, o["r"] - 2, d + (n3 - 0.5) * 8)
        color = mix(color, tone, f * 0.6)
        height += f * rise
    return color


n2, n3, n4 = c.fbm(110, 4, 2), c.fbm(24, 3, 3), c.fbm(55, 4, 4)
edge = np.minimum(np.minimum(xx, W - xx), np.minimum(yy, H - yy)) + (n3 - 0.5) * 10
spots = [(o["x"], o["y"]) for o in obstacles]
is_mid = lambda o: abs(o["x"] - MID) < 1
craters = [{"x": round(x, 1), "y": round(y, 1), "r": rng.choice([5, 6, 7, 9, 11])}
           for x, y in scatter(rng, 12, lambda x, y, f: nearest(spots, x, y) > 70 and nearest(f, x, y) > 110, W, H, margin=50)]

# ==================================================================== 2. Hierro
if N == 2:
    paints.update({
        "scrap": {"color": [0.33, 0.17, 0.09], "rough": 0.9, "blotch": 0.5},
        "scrap_dark": {"color": [0.2, 0.12, 0.08], "rough": 0.9, "blotch": 0.5},
        "paint_green": {"color": [0.16, 0.27, 0.2], "rough": 0.7, "blotch": 0.45},
        "paint_orange": {"color": [0.5, 0.22, 0.07], "rough": 0.7, "blotch": 0.45},
        "paint_blue": {"color": [0.12, 0.2, 0.33], "rough": 0.7, "blotch": 0.45},
        "tyre": {"color": [0.05, 0.05, 0.05], "rough": 0.95},
        "sheet": {"color": [0.34, 0.33, 0.31], "rough": 0.55, "metal": 0.6, "blotch": 0.45},
    })
    for o in obstacles:
        x, y, r = o["x"], o["y"], o["r"]
        if is_mid(o):
            # A heap of scrap: car bodies thrown one on another, drums, tyres.
            for k in range(9):
                a = k * 2 * math.pi / 9 + rng.uniform(-0.4, 0.4)
                d = r * rng.uniform(0.2, 0.58)
                box(x + d * math.cos(a), y + d * math.sin(a), 4.5 + (k % 3) * 8, (rng.uniform(24, 30), rng.uniform(12, 15), 8.5),
                    rng.choice(["scrap", "scrap_dark", "paint_orange", "paint_blue", "sheet"]), rng.uniform(0, 180), bevel=1.2)
            for k in range(7):
                a = k * 2 * math.pi / 7 + 0.5
                cyl(x + r * 0.84 * math.cos(a), y + r * 0.84 * math.sin(a), 5, 3.8, 10, rng.choice(["paint_orange", "paint_blue", "scrap"]), segments=10)
            for k in range(3):
                cyl(x - r * 0.55, y + r * 0.45, 1.6 + k * 3.2, 5.5, 3, "tyre", segments=12, bevel=1.0)
        else:
            # Two shipping containers side by side, a third across them.
            turn = rng.uniform(-12, 12)
            t = math.radians(turn)
            for side, mat in ((-1, "paint_green"), (1, "paint_orange")):
                box(x - side * 9.5 * math.sin(t), y + side * 9.5 * math.cos(t), 8.5, (42, 17, 17), mat, turn, bevel=0.6)
            box(x, y, 25.5, (40, 17, 17), "paint_blue", turn + 78, bevel=0.6)
    wall("sheet", 13, thick=4, cap="scrap_dark")

    # Packed dirt and gravel, oil where engines stood, rust where scrap lay.
    color = mix(c.flat((0.27, 0.25, 0.22)), (0.36, 0.33, 0.28), n2)
    color = mix(color, (0.2, 0.18, 0.16), smooth(0.55, 0.8, n4) * 0.6)
    oil = smooth(0.66, 0.78, c.fbm(70, 4, 6))
    color = mix(color, (0.07, 0.07, 0.08), oil * 0.75)
    rust = smooth(0.62, 0.8, c.fbm(90, 4, 7))
    color = mix(color, (0.4, 0.22, 0.12), rust * 0.5)
    gravel = c.blur((c.speck > 0.994).astype(np.float32), 0.45) * 2.0
    color = mix(color, (0.5, 0.48, 0.44), np.clip(gravel, 0, 1) * 0.6)
    height = (n2 - 0.5) * 1.8 + (n3 - 0.5) * 1.4 - oil * 0.5
    ruts, dark, depth = tracks(8, (0.13, 0.12, 0.11))
    color = mix(color, dark, ruts * 0.6)
    height -= ruts * depth
    color = mix(color, (0.16, 0.14, 0.12), smooth(40, 12, edge) * 0.7)
    lines, tone = chalk((0.85, 0.8, 0.3))            # yellow paint, as on a yard's floor
    color = mix(color, tone, lines)
    color = foot(color, height, (0.14, 0.11, 0.09))

# ==================================================================== 3. Bronce
elif N == 3:
    paints.update({
        "iron": {"color": [0.11, 0.1, 0.1], "rough": 0.6, "metal": 0.5},
        "bronze": {"color": [0.42, 0.26, 0.1], "rough": 0.4, "metal": 0.85},
        "melt": {"color": [1.0, 0.42, 0.06], "rough": 0.3, "blotch": 0.6},
        "firebrick": {"color": [0.37, 0.19, 0.13], "rough": 0.9, "blotch": 0.45},
    })
    for o in obstacles:
        x, y, r = o["x"], o["y"], o["r"]
        if abs(x - MID) < 90:
            # A furnace: a brick stack on a plinth, banded in bronze, its mouth alight.
            cyl(x, y, 3, r * 0.92, 6, "stone_dark", segments=10)
            cyl(x, y, 32, r * 0.7, 52, "firebrick", r2=r * 0.46, segments=14)
            for z in (16, 34, 50):
                cyl(x, y, z, r * (0.7 - (z - 6) / 52 * 0.24) + 0.8, 2.4, "bronze", segments=14)
            cyl(x, y, 59, r * 0.5, 3, "iron", segments=14)
            away = 1 if x < MID else -1
            box(x - away * r * 0.66, y, 10, (5, 14, 14), "melt", bevel=1.5)
        else:
            # A crucible of molten bronze on its stand, ingots stacked beside it.
            cyl(x, y, 2, r * 0.9, 4, "stone_dark", segments=10)
            cyl(x, y, 15, r * 0.62, 22, "iron", r2=r * 0.72, segments=16)
            cyl(x, y, 25.6, r * 0.62, 1.6, "melt", segments=16, bevel=0)
            cyl(x, y, 26, r * 0.74, 2.4, "bronze", segments=16)
            for k in range(4):
                a = math.radians(40 + k * 90)
                box(x + r * 0.8 * math.cos(a), y + r * 0.8 * math.sin(a), 6, (4, 4, 12), "iron", bevel=0.5)
            for k in range(3):
                box(x - r * 0.1 + k * 0.6, y + r * 0.78, 1.6 + k * 2.6, (13, 5.5, 2.6), "bronze", 8 * k, bevel=0.6)
    wall("firebrick", 15, thick=7, cap="stone_dark")

    # Brick paving, blackened by soot, slag spilt between the furnaces.
    color = mix(c.flat((0.33, 0.21, 0.15)), (0.42, 0.27, 0.19), n2)
    row = np.floor(yy / 9)
    joint = (np.mod(yy, 9) < 1.1) | (np.mod(xx + (np.mod(row, 2)) * 9, 18) < 1.1)
    color = mix(color, (0.17, 0.13, 0.11), joint.astype(np.float32) * 0.7)
    tint = np.mod(np.floor((xx + np.mod(row, 2) * 9) / 18) * 37 + row * 17, 7) / 7
    color = mix(color, (0.27, 0.16, 0.12), tint * 0.35)
    soot = smooth(0.5, 0.78, c.fbm(80, 4, 6))
    color = mix(color, (0.07, 0.065, 0.06), soot * 0.72)
    height = (n3 - 0.5) * 0.8 - joint.astype(np.float32) * 0.5
    slag = smooth(0.74, 0.8, c.fbm(46, 3, 8)) * smooth(170, 60, np.abs(xx - MID))
    color = mix(color, (0.55, 0.2, 0.05), slag * 0.7)
    color = mix(color, (0.12, 0.1, 0.09), smooth(40, 12, edge) * 0.7)
    lines, tone = chalk((0.9, 0.86, 0.78))
    color = mix(color, tone, lines)
    color = foot(color, height, (0.09, 0.07, 0.06))
    # The furnaces' and crucibles' glow on the ground round them.
    for o in obstacles:
        d = np.hypot(xx - o["x"], yy - o["y"])
        color = mix(color, (0.95, 0.42, 0.08), smooth(o["r"] + 46, o["r"], d) * 0.22)

# ==================================================================== 4. Plata
elif N == 4:
    paints.update({
        "snow": {"color": [0.86, 0.89, 0.93], "rough": 0.6, "blotch": 0.12, "grain": 0.03},
        "bunker": {"color": [0.38, 0.4, 0.4], "rough": 0.9, "blotch": 0.4},
        "steel": {"color": [0.3, 0.32, 0.35], "rough": 0.45, "metal": 0.75},
        "signal": {"color": [0.6, 0.12, 0.08], "rough": 0.6},
    })
    for o in obstacles:
        x, y, r = o["x"], o["y"], o["r"]
        if is_mid(o):
            # A crag under the snow.
            for k in range(6):
                a = k * 2 * math.pi / 6 + rng.uniform(-0.3, 0.3)
                d = r * rng.uniform(0.2, 0.5)
                s = r * rng.uniform(0.34, 0.5)
                ball(x + d * math.cos(a), y + d * math.sin(a), s * 0.7, s, "rock", squash=1.1)
                ball(x + d * math.cos(a), y + d * math.sin(a) - 1.5, s * 1.25, s * 0.78, "snow", squash=0.55)
            ball(x, y, r * 0.75, r * 0.5, "rock", squash=1.2)
            ball(x, y - 1.5, r * 1.18, r * 0.42, "snow", squash=0.5)
        elif min(x, W - x) < 300:
            # Deep in the zone: a radar on its concrete footing.
            cyl(x, y, 4, r * 0.86, 8, "bunker", segments=8)
            ball(x, y, 8.5, r * 0.8, "snow", squash=0.16)
            cyl(x, y, 26, 2.2, 36, "steel", segments=8)
            ball(x, y, 46, r * 0.62, "steel", squash=0.42)
            cyl(x, y, 50, 1.2, 12, "signal", segments=6)
            box(x + r * 0.5, y + r * 0.5, 11, (9, 9, 6), "bunker", 20)
        else:
            # A pillbox, its roof under the snow.
            cyl(x, y, 7, r * 0.88, 14, "bunker", segments=8)
            ball(x, y, 14, r * 0.92, "snow", squash=0.24)
            toward = 1 if x < MID else -1
            box(x + toward * r * 0.8, y, 8.5, (5, 13, 3.2), "soot", bevel=0.3)
            for k in range(4):
                box(x - toward * r * 0.25 + (k - 1.5) * 8, y + r * 0.93, 1.4, (8.4, 4.6, 2.6), "snow", bevel=1.1)
    wall("bunker", 13, thick=6, cap="snow")

    # Snow: drifts and blue shade, ice here and there, rock showing through,
    # and the grey ruts of what has driven over it.
    drift = np.sin((yy * 0.7 + n2 * 60 + xx * 0.2) * 0.12) * 0.5 + 0.5
    color = mix(c.flat((0.8, 0.84, 0.9)), (0.93, 0.95, 0.98), n2)
    color = mix(color, (0.68, 0.76, 0.88), smooth(0.5, 0.8, n4) * 0.45)
    color = mix(color, (0.96, 0.97, 1.0), drift * 0.25)
    ice = smooth(0.7, 0.78, c.fbm(90, 4, 6))
    color = mix(color, (0.6, 0.74, 0.86), ice * 0.7)
    bare = smooth(0.74, 0.82, c.fbm(60, 4, 7))
    color = mix(color, (0.3, 0.3, 0.31), bare * 0.8)
    height = (n2 - 0.5) * 3.2 + drift * 1.6 + (n3 - 0.5) * 0.8 - ice * 1.2 - bare * 1.6
    ruts, dark, depth = tracks(8, (0.46, 0.47, 0.5), 2.0)
    color = mix(color, dark, ruts * 0.75)
    height -= ruts * depth
    churned = smooth(150, 40, np.abs(xx - MID)) * (0.3 + 0.4 * n3)
    color = mix(color, (0.62, 0.65, 0.7), churned * 0.55)
    height -= churned * 1.2
    color = mix(color, (0.6, 0.66, 0.76), smooth(36, 10, edge) * 0.6)
    lines, tone = chalk((0.75, 0.16, 0.12), 0.9)     # red dye on snow
    color = mix(color, tone, lines)
    color = foot(color, height, (0.55, 0.6, 0.7), rise=1.6)
    craters = craters[:7]

# ==================================================================== 5. Oro
else:
    paints.update({
        "marble": {"color": [0.8, 0.77, 0.7], "rough": 0.45, "blotch": 0.16, "grain": 0.03},
        "gold": {"color": [0.83, 0.6, 0.16], "rough": 0.28, "metal": 1.0, "blotch": 0.2, "grain": 0.02},
        "pool": {"color": [0.1, 0.34, 0.42], "rough": 0.12, "blotch": 0.2, "grain": 0.02},
        "terracotta": {"color": [0.5, 0.25, 0.15], "rough": 0.8},
    })
    for o in obstacles:
        x, y, r = o["x"], o["y"], o["r"]
        if is_mid(o):
            # The fountain: a basin, its water, and a gilded figure on a column.
            cyl(x, y, 3.5, r * 0.96, 7, "marble", segments=24, bevel=0.8)
            cyl(x, y, 6.6, r * 0.8, 1.4, "pool", segments=24, bevel=0)
            cyl(x, y, 13, r * 0.26, 20, "marble", segments=12)
            cyl(x, y, 23.5, r * 0.46, 2.2, "marble", segments=16, bevel=0.6)
            ball(x, y, 30, r * 0.26, "gold")
            cyl(x, y, 37, r * 0.07, 9, "gold", r2=0.3, segments=8)
        else:
            # A column on its plinth, a gilded capital and an urn of fire on top.
            box(x, y, 4, (r * 1.5, r * 1.5, 8), "marble", bevel=0.9)
            cyl(x, y, 10, r * 0.5, 4, "marble", segments=16, bevel=0.8)
            cyl(x, y, 37, r * 0.38, 50, "marble", r2=r * 0.33, segments=16)
            cyl(x, y, 63.5, r * 0.5, 3, "gold", segments=16, bevel=0.6)
            box(x, y, 66.5, (r * 1.05, r * 1.05, 3), "marble", bevel=0.6)
            cyl(x, y, 71, r * 0.3, 6, "gold", r2=r * 0.42, segments=12)
            ball(x, y, 76, r * 0.3, "terracotta", squash=1.2)
    wall("marble", 12, thick=7, cap="gold")

    # Marble paving in two tones, gilded bands round the fountain and along
    # the middle, worn where armies have crossed it.
    tile = 37.5
    check = np.mod(np.floor(xx / tile) + np.floor(yy / tile), 2)
    color = mix(c.flat((0.74, 0.7, 0.62)), (0.57, 0.36, 0.26), check * 0.55)
    veins = smooth(0.47, 0.5, np.abs(c.fbm(38, 4, 6) - 0.5) * 2)
    color = mix(color, (0.86, 0.84, 0.8), (1 - veins) * 0.3)
    joint = (np.mod(xx, tile) < 1.0) | (np.mod(yy, tile) < 1.0)
    color = mix(color, (0.3, 0.27, 0.23), joint.astype(np.float32) * 0.6)
    height = -joint.astype(np.float32) * 0.5 + (n3 - 0.5) * 0.3
    d_mid = np.hypot(xx - MID, yy - H / 2)
    rings = np.maximum.reduce([smooth(3.4, 1.6, np.abs(d_mid - radius)) for radius in (62, 70, 118)])
    color = mix(color, (0.78, 0.58, 0.18), rings * 0.85)
    star = smooth(118, 70, d_mid) * (np.mod(np.arctan2(yy - H / 2, xx - MID) / math.pi * 8, 2) < 1)
    color = mix(color, (0.5, 0.3, 0.22), star * 0.4)
    worn = smooth(0.5, 0.8, n4) * 0.4 + smooth(150, 40, np.abs(xx - MID)) * 0.25
    color = mix(color, (0.45, 0.42, 0.37), worn * 0.5)
    color = mix(color, (0.4, 0.37, 0.32), smooth(34, 10, edge) * 0.5)
    lines, tone = chalk((0.8, 0.6, 0.18), 1.1)       # inlaid in brass
    color = mix(color, tone, lines)
    color = foot(color, height, (0.34, 0.31, 0.27), reach=18, rise=0.3)
    craters = craters[:6]

for k in craters:
    c.crater(color, height, k["x"], k["y"], k["r"])

layout = {"width": W, "height": H, "paints": paints, "solids": solids}
(out / "layout.json").write_text(json.dumps(layout))
print(f"arena {N}: {len(solids)} solids, {len(paints)} paints, {len(craters)} craters")

color *= (0.9 + 0.2 * c.grain)[..., None]
c.save(color, height, out)
print("ground painted")
