"""Builds a map in Blender from its layout.json on its painted ground, and
renders the game's pictures of it (levels 1, 2 and 4; level 3 has its own
level3_build.py).

  blender -b --factory-startup -P tools/blender/maps/build_map.py -- <dir> <name> render [samples] [scale]
  blender -b --factory-startup -P tools/blender/maps/build_map.py -- <dir> <name> glb

<dir> holds layout.json, ground_color.png and ground_height.png
(level<N>_layout.py); into it go <name>_bg.png and <name>_fg.png, or
<name>.glb. The layout lists what stands on the map, by kind; whatever
kinds it has are built.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from scenekit import Scene, rot
from mathutils import Vector

args = sys.argv[sys.argv.index("--") + 1:]
DIR, NAME, JOB = args[0], args[1], args[2] if len(args) > 2 else "render"
SAMPLES = int(args[3]) if len(args) > 3 else 96
SCALE = float(args[4]) if len(args) > 4 else 1.0

s = Scene(DIR, plain=JOB == "glb")
L = s.layout
s.ground()
if L.get("water"):
    s.water(L["water"])


def gates(places):
    """A checkpoint over the road: a bunker either side and a beam across,
    for the units to pass under. Each {x, y, turn (degrees), half}."""
    p = s.part("gates")
    for g in places:
        turn = rot("Z", -g["turn"])
        c = s.at(g["x"], g["y"], 0)
        reach = g["half"] + 12
        for side in (-1, 1):
            at = c + turn @ Vector((0, side * reach, 0))
            p.box((20, 18, 30), at + Vector((0, 0, 15)), "concrete", bevel=0.8, rot=turn)
            p.box((23, 21, 3), at + Vector((0, 0, 30)), "stone_dark", bevel=0.4, rot=turn)
            p.box((8, 2, 5), at + turn @ Vector((-10.2, 0, 20)), "soot", bevel=0.3, rot=turn)       # a firing slit
            p.box((8, 2, 5), at + turn @ Vector((10.2, 0, 20)), "soot", bevel=0.3, rot=turn)
            for k in range(4):
                p.box((8.4, 4.6, 2.6), at + turn @ Vector((-8 + k * 5.4, side * 12.5, 1.4)), "sandbag", bevel=1.1, rot=turn)
        p.box((7, reach * 2 - 16, 6), c + Vector((0, 0, 34)), "stone_dark", bevel=0.5, rot=turn)   # the beam
        p.box((1.2, reach * 2 - 20, 3.4), c + turn @ Vector((-3.8, 0, 33)), "hazard", bevel=0, rot=turn)
        p.cyl(0.7, 22, c + turn @ Vector((0, reach, 42)), "metal", segments=6, bevel=0)             # flagpole
        p.box((0.5, 12, 7), c + turn @ Vector((0, reach - 6.5, 49)), "flag", bevel=0, rot=turn)
    return s.done(p)


def ruins(ruins):
    p = s.part("ruins")
    for r in ruins:
        s.ruin_walls(p, r["walls"], r["tone"], r.get("thick", 6))
        s.rubble(p, r.get("rubble", []), r["tone"])
    return s.done(p)


def blocks(blocks):
    """Solid buildings: each {x0, y0, x1, y1, h, tone}, flat-roofed, with a
    parapet, windows down the side that shows, and clutter on the roof."""
    p = s.part("blocks")
    rng = s.rng
    for b in blocks:
        x0, y0, x1, y1, h = b["x0"], b["y0"], b["x1"], b["y1"], b["h"]
        cx, cy, w, d = (x0 + x1) / 2, (y0 + y1) / 2, x1 - x0, y1 - y0
        tone = b.get("tone", "concrete")
        p.box((w, d, h), s.at(cx, cy, h / 2), tone, bevel=0.8)
        p.box((w + 1.5, d + 1.5, 2.2), s.at(cx, cy, h + 0.4), "stone_dark", bevel=0.4)
        p.box((w - 4, d - 4, 1.4), s.at(cx, cy, h + 0.9), "roofing", bevel=0)
        for k in range(1, int(w // 26)):                      # the roofing felt's seams
            p.box((0.6, d - 4, 1.5), s.at(x0 + k * 26, cy, h + 0.95), "stone_dark", bevel=0)
        if b.get("ruined") and w > 60 and d > 50:             # a shell hole through the roof
            hx, hy = cx + rng.uniform(-0.25, 0.25) * w, cy + rng.uniform(-0.2, 0.2) * d
            p.cyl(rng.uniform(7, 12), 1.7, s.at(hx, hy, h + 1.0), "soot", segments=9, bevel=0)
            for _ in range(6):
                a_, r_ = rng.uniform(0, 6.28), rng.uniform(9, 15)
                p.box((rng.uniform(2, 5), rng.uniform(2, 4), 1.5), s.at(hx + r_ * math.cos(a_), hy + r_ * math.sin(a_), h + 2.2), "rubble", bevel=0, rot=rot("Z", rng.uniform(0, 90)))
        floors = max(1, int(h // 11))
        for f in range(floors):                               # windows on the south face, the one the camera sees
            z = 6 + f * 11
            n = max(1, int(w // 9))
            for k in range(n):
                wx = x0 + (k + 0.5) * w / n
                lit = "glass" if rng.random() < 0.8 else "soot"
                p.box((4.2, 0.8, 5), s.at(wx, y1 + 0.2, z), lit, bevel=0)
        for _ in range(b.get("clutter", 3)):                  # roof clutter
            p.box((rng.uniform(4, 9), rng.uniform(4, 8), rng.uniform(2, 5)),
                  s.at(cx + rng.uniform(-0.35, 0.35) * w, cy + rng.uniform(-0.35, 0.35) * d, h + 3), rng.choice(["metal", "concrete", "stone_dark"]), bevel=0.3)
        if b.get("helipad"):                                  # the headquarters' landing pad
            r = min(w, d) * 0.3
            p.cyl(r + 3, 1.9, s.at(cx, cy, h + 1.1), "hazard", segments=24, bevel=0)
            p.cyl(r, 2.0, s.at(cx, cy, h + 1.15), "roofing", segments=24, bevel=0)
            for (dx, dy, lx, ly) in ((-r * 0.3, 0, r * 0.12, r * 0.8), (r * 0.3, 0, r * 0.12, r * 0.8), (0, 0, r * 0.6, r * 0.12)):
                p.box((lx, ly, 2.1), s.at(cx + dx, cy + dy, h + 1.2), "hazard", bevel=0)
        if b.get("ruined"):                                   # a bite out of a corner, as rubble at its foot
            for _ in range(10):
                size = rng.uniform(2, 6)
                p.box((size, size, size * 0.6), s.at(x0 + rng.uniform(-10, 14), y1 + rng.uniform(0, 12), size * 0.3), "rubble", bevel=0, rot=rot("Z", rng.uniform(0, 90)))
    return s.done(p)


def flags(places):
    """A command post's flag on a tall pole, with a few sandbags at its foot."""
    p = s.part("flags")
    for f in places:
        c = s.at(f["x"], f["y"], 0)
        p.cyl(2.6, 2.0, c + Vector((0, 0, 1.0)), "concrete", segments=8, bevel=0.3)
        p.cyl(0.8, 44, c + Vector((0, 0, 22)), "metal", segments=6, bevel=0)
        p.box((17, 0.6, 10), c + Vector((9, 0, 38)), "flag", bevel=0)
        for k in range(5):
            a = math.radians(200 + k * 35)
            p.box((8.4, 4.6, 2.6), c + Vector((15 * math.cos(a), 15 * math.sin(a), 1.4)), "sandbag", bevel=1.1, rot=rot("Z", math.degrees(a) + 90))
    return s.done(p)


BUILDERS = {
    "sandbags": s.sandbags, "hedgehogs": s.hedgehogs, "rocks": s.boulders, "tents": s.tents, "crates": s.crates,
    "fences": s.fences, "wrecks": s.wrecks, "posts": s.posts, "gates": gates, "ruins": ruins, "blocks": blocks, "flags": flags,
}
for kind, build in BUILDERS.items():
    if L.get(kind):
        build(L[kind])
if L.get("trees") or L.get("bushes"):
    s.trees(L.get("trees", []), L.get("bushes", []))

if JOB == "glb":
    s.export(NAME)
else:
    s.render(NAME, SAMPLES, SCALE)
