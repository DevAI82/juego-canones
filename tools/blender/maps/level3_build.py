"""Level 3's new map, step 2: builds the town in Blender on the ground that
level3_layout.py painted, and renders the game's two pictures of it.

  blender -b --factory-startup -P tools/blender/maps/level3_build.py -- <dir> render [samples] [scale]
  blender -b --factory-startup -P tools/blender/maps/level3_build.py -- <dir> glb

<dir> holds layout.json, ground_color.png, ground_height.png; into it go
  level3_bg.png   the whole map
  level3_fg.png   only what stands up from the ground (and the keep at the
                  base), on a transparent background: the game draws it over
                  the units, so they pass behind walls, trees and gates
  level3.glb      (the glb job) what stands on the map as a model, plainer
                  and without the keep, for the RTS mode's 3D view to stand
                  on the flat ground_color picture

One Blender unit is one world px; the game's y runs down the picture, so
Blender's Y is height - y. The camera looks down at 58 degrees from the
south, like the units' sprites, and the picture is stretched back so the
ground keeps the game's own coordinates: what is at (x, y) in the game is at
(x, y) in the picture, and only what stands up leans away to the north.
"""
import bpy
import bmesh
import json
import math
import os
import random
import sys
from mathutils import Vector, Matrix

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from kit import Part, rot, CAMERA_ELEVATION

args = sys.argv[sys.argv.index("--") + 1:]
DIR = os.path.abspath(args[0])
JOB = args[1] if len(args) > 1 else "render"
SAMPLES = int(args[2]) if len(args) > 2 else 48
SCALE = float(args[3]) if len(args) > 3 else 1.0     # the pictures' size, for quick trial renders
PLAIN = JOB == "glb"                                  # no bevels, coarse balls, flat colours: light enough for the browser

layout = json.load(open(os.path.join(DIR, "layout.json")))
W, H = layout["width"], layout["height"]
rng = random.Random(7)


class Part(Part):
    """kit.py's Part, plain for the browser's model when asked."""

    def _take(self, piece, mat, bevel):
        super()._take(piece, mat, 0 if PLAIN else bevel)

    def ball(self, r, at, mat, squash=1.0, segments=14):
        super().ball(r, at, mat, squash, 6 if PLAIN else segments)

    def cyl(self, r, length, at, mat, axis="Z", r2=None, segments=20, bevel=0.012, rot=None):
        super().cyl(r, length, at, mat, axis, r2, min(segments, 8) if PLAIN else segments, bevel, rot)


def at(x, y, z=0.0):
    """A place in the game's coordinates, in Blender's."""
    return Vector((x, H - y, z))


def heading(ax, ay, bx, by):
    """The turn about Z, in degrees, of the line from a to b (game coordinates)."""
    return math.degrees(math.atan2(-(by - ay), bx - ax))


# ---------------------------------------------------------------- materials

def paint(name, color, rough=0.85, grain=0.07, blotch=0.35, metal=0.0):
    """A matt, weathered surface: its colour mottled by large blotches and
    fine grain, in the world's own coordinates (px)."""
    mat = bpy.data.materials.new(name)
    try:
        mat.use_nodes = True
    except Exception:
        pass
    nt = mat.node_tree
    bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = (*color, 1)
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal
    if PLAIN:
        return mat      # a GLB can't carry the mottling below
    coord = nt.nodes.new("ShaderNodeTexCoord")
    big = nt.nodes.new("ShaderNodeTexNoise")
    big.inputs["Scale"].default_value = 0.045
    big.inputs["Detail"].default_value = 6
    fine = nt.nodes.new("ShaderNodeTexNoise")
    fine.inputs["Scale"].default_value = 0.9
    fine.inputs["Detail"].default_value = 3
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    lo, hi = 1 - blotch, 1 + blotch * 0.45
    ramp.color_ramp.elements[0].position = 0.35
    ramp.color_ramp.elements[0].color = (color[0] * lo, color[1] * lo, color[2] * lo, 1)
    ramp.color_ramp.elements[1].position = 0.7
    ramp.color_ramp.elements[1].color = (min(1, color[0] * hi), min(1, color[1] * hi), min(1, color[2] * hi), 1)
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = grain * 4
    bump.inputs["Distance"].default_value = 1.0
    nt.links.new(coord.outputs["Object"], big.inputs["Vector"])
    nt.links.new(coord.outputs["Object"], fine.inputs["Vector"])
    nt.links.new(big.outputs[0], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])
    nt.links.new(fine.outputs[0], bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


def ground_material():
    mat = bpy.data.materials.new("ground")
    try:
        mat.use_nodes = True
    except Exception:
        pass
    nt = mat.node_tree
    bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Roughness"].default_value = 0.92
    color = nt.nodes.new("ShaderNodeTexImage")
    color.image = bpy.data.images.load(os.path.join(DIR, "ground_color.png"))
    color.extension = "EXTEND"
    relief = nt.nodes.new("ShaderNodeTexImage")
    relief.image = bpy.data.images.load(os.path.join(DIR, "ground_height.png"))
    relief.image.colorspace_settings.name = "Non-Color"
    relief.extension = "EXTEND"
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 1.0
    bump.inputs["Distance"].default_value = 70.0
    nt.links.new(color.outputs["Color"], bsdf.inputs["Base Color"])
    nt.links.new(relief.outputs["Color"], bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


def water_material():
    mat = bpy.data.materials.new("water")
    try:
        mat.use_nodes = True
    except Exception:
        pass
    nt = mat.node_tree
    bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = (0.02, 0.07, 0.08, 1)
    bsdf.inputs["Roughness"].default_value = 0.07
    coord = nt.nodes.new("ShaderNodeTexCoord")
    waves = nt.nodes.new("ShaderNodeTexNoise")
    waves.inputs["Scale"].default_value = 0.35
    waves.inputs["Detail"].default_value = 2
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.25
    nt.links.new(coord.outputs["Object"], waves.inputs["Vector"])
    nt.links.new(waves.outputs[0], bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


def make_materials():
    m = {
        "stone": paint("stone", (0.47, 0.44, 0.38)),
        "stone_dark": paint("stone_dark", (0.3, 0.28, 0.25)),
        "plaster": paint("plaster", (0.62, 0.56, 0.46), blotch=0.45),
        "brick": paint("brick", (0.43, 0.23, 0.16), blotch=0.45),
        "concrete": paint("concrete", (0.48, 0.47, 0.45), blotch=0.4),
        "rubble": paint("rubble", (0.4, 0.37, 0.33), blotch=0.5),
        "trunk": paint("trunk", (0.2, 0.14, 0.09)),
        "leaf_dark": paint("leaf_dark", (0.08, 0.16, 0.05), blotch=0.5),
        "leaf": paint("leaf", (0.13, 0.22, 0.07), blotch=0.5),
        "leaf_light": paint("leaf_light", (0.2, 0.28, 0.09), blotch=0.5),
        "hedge": paint("hedge", (0.07, 0.17, 0.05), blotch=0.5),
        "metal": paint("metal", (0.16, 0.16, 0.17), rough=0.5, metal=0.7),
        "rust": paint("rust", (0.2, 0.11, 0.07), blotch=0.6),
        "soot": paint("soot", (0.05, 0.045, 0.04)),
        "wood": paint("wood", (0.33, 0.24, 0.15)),
        "roof": paint("roof", (0.33, 0.14, 0.1), blotch=0.4),
        "flag": paint("flag", (0.7, 0.5, 0.08), blotch=0.2),
        "ground": ground_material(),
        "water": water_material(),
    }
    return m


def finish(part, big_bevels=False):
    return part.finish((0, 0, 0), None)


# ------------------------------------------------------------------- pieces

def wall_box(p, ax, ay, bx, by, thick, z0, z1, mat, bevel=0.0, lengthen=0.0):
    """A straight length of wall from a to b (game coordinates)."""
    length = math.hypot(bx - ax, by - ay) + lengthen
    turn = rot("Z", heading(ax, ay, bx, by))
    p.box((length, thick, z1 - z0), at((ax + bx) / 2, (ay + by) / 2, (z0 + z1) / 2), mat, bevel=bevel, rot=turn)


def inset(corners, d):
    """A convex polygon's corners moved `d` inside it (game coordinates)."""
    n = len(corners)
    cx = sum(c["x"] for c in corners) / n
    cy = sum(c["y"] for c in corners) / n
    lines = []
    for a, b in zip(corners, corners[1:] + corners[:1]):
        dx, dy = b["x"] - a["x"], b["y"] - a["y"]
        length = math.hypot(dx, dy)
        nx, ny = -dy / length, dx / length
        if (cx - a["x"]) * nx + (cy - a["y"]) * ny < 0:
            nx, ny = -nx, -ny
        lines.append((a["x"] + nx * d, a["y"] + ny * d, dx, dy))
    out = []
    for (x1, y1, dx1, dy1), (x2, y2, dx2, dy2) in zip(lines[-1:] + lines[:-1], lines):
        det = dx1 * dy2 - dy1 * dx2
        t = ((x2 - x1) * dy2 - (y2 - y1) * dx2) / det
        out.append({"x": x1 + dx1 * t, "y": y1 + dy1 * t})
    return out


def build_ground(mats):
    mesh = bpy.data.meshes.new("ground")
    bm = bmesh.new()
    pad = 400
    quad = [(-pad, -pad), (W + pad, -pad), (W + pad, H + pad), (-pad, H + pad)]
    verts = [bm.verts.new((x, y, 0)) for x, y in quad]
    face = bm.faces.new(verts)
    uv = bm.loops.layers.uv.new("uv")
    for loop, (x, y) in zip(face.loops, quad):
        loop[uv].uv = (x / W, y / H)
    bm.to_mesh(mesh)
    bm.free()
    mesh.materials.append(mats["ground"])
    ob = bpy.data.objects.new("ground", mesh)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def build_water(mats):
    """The moat's water: a ring just inside the fortress wall."""
    corners = layout["wall"]["corners"]
    a, b = inset(corners, layout["moat"]["inner"]), inset(corners, layout["moat"]["outer"])
    mesh = bpy.data.meshes.new("water")
    bm = bmesh.new()
    n = len(a)
    for i in range(n):
        j = (i + 1) % n
        quad = [at(a[i]["x"], a[i]["y"], 0.15), at(a[j]["x"], a[j]["y"], 0.15), at(b[j]["x"], b[j]["y"], 0.15), at(b[i]["x"], b[i]["y"], 0.15)]
        face = bm.faces.new([bm.verts.new(v) for v in quad])
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.01)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    for f in bm.faces:
        if f.normal.z < 0:
            f.normal_flip()
    bm.to_mesh(mesh)
    bm.free()
    mesh.materials.append(mats["water"])
    ob = bpy.data.objects.new("water", mesh)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def build_fortress(mats):
    """The wall round the garden, with battlements, a tower at each corner
    and a gatehouse over each of the three bridges."""
    p = Part("fortress", mats)
    wall = layout["wall"]
    thick, top = 12, 24
    for a, b in wall["segments"]:
        ax, ay, bx, by = a["x"], a["y"], b["x"], b["y"]
        wall_box(p, ax, ay, bx, by, thick, 0, top, "stone", bevel=0.6)
        wall_box(p, ax, ay, bx, by, thick + 3, top - 2.5, top, "stone_dark", bevel=0.4)      # the walk's ledge
        length = math.hypot(bx - ax, by - ay)
        ux, uy = (bx - ax) / length, (by - ay) / length
        turn = rot("Z", heading(ax, ay, bx, by))
        for k in range(int(length // 11)):                                                    # battlements
            t = 5.5 + k * 11
            for side in (-1, 1):
                x, y = ax + ux * t - uy * side * (thick / 2 - 0.5), ay + uy * t + ux * side * (thick / 2 - 0.5)
                p.box((6, 3, 4.5), at(x, y, top + 2.25), "stone", bevel=0.3, rot=turn)
    for c in wall["corners"]:                                                                 # corner towers
        p.cyl(15, 34, at(c["x"], c["y"], 17), "stone", segments=8, bevel=0.8, rot=rot("Z", 22.5))
        p.cyl(17, 3, at(c["x"], c["y"], 33), "stone_dark", segments=8, bevel=0.4, rot=rot("Z", 22.5))
        for k in range(8):
            a = math.radians(k * 45)
            p.box((6, 4, 5), at(c["x"] + 14.5 * math.cos(a), c["y"] + 14.5 * math.sin(a), 37), "stone", bevel=0.3, rot=rot("Z", -k * 45 + 90))
        p.cyl(11.5, 1.5, at(c["x"], c["y"], 34), "wood", segments=8, bevel=0, rot=rot("Z", 22.5))
    # Gatehouses: where the wall's stretches stop either side of a gate.
    ends = [(seg[i]["x"], seg[i]["y"]) for seg in wall["segments"] for i in (0, 1)]
    for g in wall["gates"]:
        pair = sorted(ends, key=lambda e: math.hypot(e[0] - g["x"], e[1] - g["y"]))[:2]
        (ax, ay), (bx, by) = pair
        turn = rot("Z", heading(ax, ay, bx, by))
        for x, y in pair:
            p.box((17, 20, 42), at(x, y, 21), "stone", bevel=0.8, rot=turn)
            p.box((20, 23, 3), at(x, y, 41), "stone_dark", bevel=0.4, rot=turn)
            p.box((12, 15, 6), at(x, y, 45), "roof", bevel=1.2, rot=turn)
        wall_box(p, ax, ay, bx, by, 16, 29, 39, "stone", bevel=0.6)                           # the arch over the road
        wall_box(p, ax, ay, bx, by, 19, 38, 40.5, "stone_dark", bevel=0.4)
        length = math.hypot(bx - ax, by - ay)
        ux, uy = (bx - ax) / length, (by - ay) / length
        for k in range(1, int(length // 11)):
            x, y = ax + ux * k * 11, ay + uy * k * 11
            p.box((6, 16, 4), at(x, y, 42.5), "stone", bevel=0.3, rot=turn)
        # The bridge's parapets across the moat, on the garden's side of the gate.
        mx, my = (ax + bx) / 2, (ay + by) / 2
        inward = Vector((layout["base"]["x"] - mx, layout["base"]["y"] - my))
        nx, ny = -uy, ux
        if nx * inward.x + ny * inward.y < 0:
            nx, ny = -nx, -ny
        reach = layout["moat"]["outer"] + 6
        for side in (-1, 1):
            sx, sy = mx + ux * side * 25, my + uy * side * 25
            wall_box(p, sx, sy, sx + nx * reach, sy + ny * reach, 3.5, 0, 6, "stone", bevel=0.4)
            p.box((5, 5, 9), at(sx + nx * reach, sy + ny * reach, 4.5), "stone_dark", bevel=0.5, rot=turn)
    return p.finish()


def build_ruins(mats):
    p = Part("ruins", mats)
    for r in layout["ruins"]:
        tone = r["tone"]
        for w in r["walls"]:
            ax, ay, bx, by, h = w["ax"], w["ay"], w["bx"], w["by"], w["h"]
            wall_box(p, ax, ay, bx, by, 6, 0, h, tone, bevel=0.35, lengthen=6)
            # A ragged top: a few broken courses still standing on it.
            length = math.hypot(bx - ax, by - ay)
            ux, uy = (bx - ax) / length, (by - ay) / length
            turn = rot("Z", heading(ax, ay, bx, by))
            for _ in range(3):
                t, piece = rng.uniform(4, length - 4), rng.uniform(5, 13)
                p.box((piece, 6, rng.uniform(1.5, 5.5)), at(ax + ux * t, ay + uy * t, h + 1.2), tone, bevel=0.3, rot=turn)
            if h > 13 and rng.random() < 0.6:                                               # a window's gap
                t = rng.uniform(10, length - 10)
                p.box((8, 6.6, 6), at(ax + ux * t, ay + uy * t, h * 0.55), "soot", bevel=0, rot=turn)
        for b in r["rubble"]:
            for _ in range(7):
                a, d = rng.uniform(0, 6.28), rng.uniform(0, b["r"])
                s = rng.uniform(1.6, 4.6)
                turn = rot("Z", rng.uniform(0, 90)) @ rot("X", rng.uniform(-25, 25))
                p.box((s * rng.uniform(0.8, 1.6), s, s * rng.uniform(0.5, 1.0)), at(b["x"] + d * math.cos(a), b["y"] + d * math.sin(a), s * 0.3),
                      rng.choice(["rubble", "rubble", tone]), bevel=0, rot=turn)
            if rng.random() < 0.35:                                                         # a fallen beam
                turn = rot("Z", rng.uniform(0, 180)) @ rot("Y", rng.uniform(-12, 12))
                p.box((rng.uniform(14, 26), 1.6, 1.6), at(b["x"], b["y"], 2.2), "wood", bevel=0, rot=turn)
    return p.finish()


def build_trees(mats):
    p = Part("trees", mats)
    for t in layout["trees"]:
        x, y, r, h = t["x"], t["y"], t["r"], t["h"]
        leaf = "leaf_dark" if t["tint"] < 0.92 else "leaf_light" if t["tint"] > 1.05 else "leaf"
        if t["kind"] == "dead":
            p.cyl(1.6, h * 0.75, at(x, y, h * 0.375), "trunk", segments=6, bevel=0, r2=0.8)
            for _ in range(4):
                a, lift = rng.uniform(0, 6.28), rng.uniform(0.35, 0.7) * h
                reach = rng.uniform(5, 10)
                p.rod(0.5, at(x, y, lift), at(x + reach * math.cos(a), y + reach * math.sin(a), lift + rng.uniform(3, 8)), "trunk", segments=4)
        elif t["kind"] == "pine":
            p.cyl(1.5, h * 0.4, at(x, y, h * 0.2), "trunk", segments=6, bevel=0)
            for k in range(3):
                p.cyl(r * (1.0 - k * 0.24), h * 0.36, at(x, y, h * (0.42 + k * 0.22)), "leaf_dark" if k < 2 else leaf, segments=9, bevel=0, r2=r * 0.12)
        else:
            p.cyl(1.9, h * 0.55, at(x, y, h * 0.275), "trunk", segments=6, bevel=0, r2=1.3)
            p.ball(r * 0.78, at(x, y, h * 0.72), leaf, squash=0.8, segments=10)
            for _ in range(5):
                a, d = rng.uniform(0, 6.28), rng.uniform(0.35, 0.6) * r
                p.ball(r * rng.uniform(0.42, 0.6), at(x + d * math.cos(a), y + d * math.sin(a), h * rng.uniform(0.55, 0.85)),
                       rng.choice([leaf, leaf, "leaf_dark", "leaf_light"]), squash=0.85, segments=8)
    for b in layout["bushes"]:
        p.ball(b["r"], at(b["x"], b["y"], b["r"] * 0.55), rng.choice(["leaf", "leaf_dark", "hedge"]), squash=0.75, segments=7)
    return p.finish()


def build_roadside(mats):
    p = Part("roadside", mats)
    for post in layout["posts"]:
        lean = rot("Z", post["turn"]) @ rot("Y", post["lean"])
        base_at = at(post["x"], post["y"], 0)
        p.cyl(0.9, 26, base_at + lean @ Vector((0, 0, 13)), "metal", segments=6, bevel=0, rot=lean)
        p.box((8, 0.8, 0.8), base_at + lean @ Vector((3.5, 0, 26)), "metal", bevel=0, rot=lean)
        p.box((3.5, 1.8, 1.0), base_at + lean @ Vector((7, 0, 25.6)), "metal", bevel=0, rot=lean)
        p.cyl(1.6, 1.2, base_at + Vector((0, 0, 0.6)), "concrete", segments=6, bevel=0)
    for w in layout["wrecks"]:
        turn = rot("Z", w["turn"])
        c = at(w["x"], w["y"], 0)
        long = 30 if w["kind"] == "truck" else 20
        p.box((long, 9.5, 4), c + Vector((0, 0, 3.2)), "rust", bevel=0.6, rot=turn)
        cab = turn @ Vector((long * (0.26 if w["kind"] == "truck" else -0.05), 0, 7))
        p.box((long * 0.34, 8.6, 4), c + cab, "soot", bevel=0.8, rot=turn)
        for sx in (-0.32, 0.32):
            for sy in (-1, 1):
                p.cyl(2.1, 1.6, c + turn @ Vector((long * sx, sy * 4.6, 2.1)), "soot", axis="Y", segments=8, bevel=0, rot=turn)
    return p.finish()


def build_garden(mats):
    p = Part("garden", mats)
    for h in layout["garden"]["hedges"]:
        wall_box(p, h["ax"], h["ay"], h["bx"], h["by"], 7, 0, 6.5, "hedge", bevel=1.2)
    for b in layout["garden"]["beds"]:
        for (dx, dy, sx, sy) in ((0, -b["h"] / 2, b["w"], 2), (0, b["h"] / 2, b["w"], 2), (-b["w"] / 2, 0, 2, b["h"]), (b["w"] / 2, 0, 2, b["h"])):
            p.box((sx, sy, 1.6), at(b["x"] + dx, b["y"] + dy, 0.8), "stone", bevel=0)
        p.ball(5, at(b["x"], b["y"], 3), "hedge", squash=0.9, segments=8)
    return p.finish()


def build_keep(mats):
    """The base itself: a keep standing on the court where the roads end,
    with a door facing each of them. Only in the picture drawn over the
    units, so they drive in and are gone -- and so the RTS mode, which puts
    its own headquarters there, has an empty court."""
    p = Part("keep", mats)
    x, y = layout["base"]["x"], layout["base"]["y"]
    half, top = 30, 50
    p.box((half * 2 + 8, half * 2 + 8, 4), at(x, y, 2), "stone_dark", bevel=0.8)
    p.box((half * 2, half * 2, top), at(x, y, top / 2 + 2), "stone", bevel=1.0)
    p.box((half * 2 + 5, half * 2 + 5, 3), at(x, y, top + 1), "stone_dark", bevel=0.5)
    for k in range(-2, 3):                                                                    # battlements
        for side in (-1, 1):
            p.box((7, 4, 5.5), at(x + k * 12.5, y + side * (half + 0.5), top + 5), "stone", bevel=0.3)
            p.box((4, 7, 5.5), at(x + side * (half + 0.5), y + k * 12.5, top + 5), "stone", bevel=0.3)
    for sx in (-1, 1):                                                                        # corner turrets
        for sy in (-1, 1):
            cx, cy = x + sx * half, y + sy * half
            p.cyl(9, top + 12, at(cx, cy, (top + 12) / 2 + 2), "stone", segments=10, bevel=0.6)
            p.cyl(10.5, 14, at(cx, cy, top + 21), "roof", segments=10, bevel=0, r2=0.6)
    # Doors to the north-east, the west and the south, where the roads come in.
    p.box((22, 3, 26), at(x, y + half, 15), "soot", bevel=1.5)
    p.box((3, 22, 26), at(x - half, y, 15), "soot", bevel=1.5)
    p.box((3, 22, 26), at(x + half, y - 4, 15), "soot", bevel=1.5)
    p.box((22, 3, 26), at(x + 4, y - half, 15), "soot", bevel=1.5)
    for wx in (-14, 14):                                                                      # windows above them
        p.box((5, 1.5, 9), at(x + wx, y + half + 0.4, 38), "soot", bevel=0.6)
        p.box((1.5, 5, 9), at(x - half - 0.4, y + wx, 38), "soot", bevel=0.6)
    p.box((34, 34, 6), at(x, y, top + 5), "stone_dark", bevel=0.6)                            # the roof's upper deck
    p.cyl(0.8, 34, at(x, y, top + 25), "metal", segments=6, bevel=0)                          # flagpole
    p.box((15, 0.5, 9), at(x + 8, y, top + 36), "flag", bevel=0)
    return p.finish()


# ------------------------------------------------------------------- render

def setup(scene):
    scene.render.engine = "CYCLES"
    scene.cycles.samples = SAMPLES
    scene.cycles.use_denoising = True
    scene.cycles.max_bounces = 3
    try:
        prefs = bpy.context.preferences.addons["cycles"].preferences
        for kind in ("OPTIX", "CUDA", "HIP", "ONEAPI", "METAL"):
            try:
                prefs.compute_device_type = kind
            except Exception:
                continue
            prefs.get_devices()
            gpus = [d for d in prefs.devices if d.type == kind]
            if gpus:
                for d in prefs.devices:
                    d.use = d.type == kind
                scene.cycles.device = "GPU"
                print("rendering on", kind, [d.name for d in gpus])
                break
    except Exception as e:
        print("rendering on the CPU:", e)
    scene.render.resolution_x = int(W * SCALE)
    scene.render.resolution_y = int(H * SCALE)
    scene.render.resolution_percentage = 100
    # A pixel is wider than tall by one over the sine of the camera's angle
    # (Blender takes no aspect under 1): the picture, shown with square
    # pixels, is stretched back to top-down.
    scene.render.pixel_aspect_x = 1.0 / math.sin(math.radians(CAMERA_ELEVATION))
    scene.render.pixel_aspect_y = 1.0
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.view_settings.view_transform = "Standard"
    world = bpy.data.worlds.new("sky")
    try:
        world.use_nodes = True
    except Exception:
        pass
    bg = next(n for n in world.node_tree.nodes if n.type == "BACKGROUND")
    bg.inputs["Color"].default_value = (0.62, 0.72, 0.9, 1)
    bg.inputs["Strength"].default_value = 0.55
    scene.world = world
    sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
    sun.data.energy = 3.3
    sun.data.angle = math.radians(4)
    # As the units' sprites: shadows fall down the picture and to the left.
    sun.rotation_euler = Vector((-0.55, -0.5, -0.8)).to_track_quat("-Z", "Y").to_euler()
    scene.collection.objects.link(sun)
    cam = bpy.data.objects.new("camera", bpy.data.cameras.new("camera"))
    scene.collection.objects.link(cam)
    el = math.radians(CAMERA_ELEVATION)
    offset = Vector((0, -math.cos(el), math.sin(el))) * 6000
    cam.location = Vector((W / 2, H / 2, 0)) + offset
    cam.rotation_euler = (-offset).to_track_quat("-Z", "Y").to_euler()
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = W
    cam.data.clip_start = 100
    cam.data.clip_end = 14000
    scene.camera = cam


def main():
    for ob in list(bpy.data.objects):
        bpy.data.objects.remove(ob)
    scene = bpy.context.scene
    mats = make_materials()
    ground = build_ground(mats)
    water = build_water(mats)
    standing = [build_fortress(mats), build_ruins(mats), build_trees(mats), build_roadside(mats), build_garden(mats)]
    if PLAIN:
        for ob in (ground, water):
            bpy.data.objects.remove(ob)
        bpy.ops.export_scene.gltf(filepath=os.path.join(DIR, "level3.glb"), export_format="GLB", export_apply=True, export_yup=True)
        return
    keep = build_keep(mats)
    setup(scene)

    keep.hide_render = True
    scene.render.filepath = os.path.join(DIR, "level3_bg.png")
    bpy.ops.render.render(write_still=True)

    keep.hide_render = False
    for ob in (ground, water):
        ob.is_holdout = True
    scene.render.filepath = os.path.join(DIR, "level3_fg.png")
    bpy.ops.render.render(write_still=True)


main()
