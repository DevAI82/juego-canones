"""The RTS mode's base: its seven buildings, the wall block, the harvester,
the MCV and the ore crystals. Metres, facing +X like the units; a building
is seen from the south (-Y), so its doors face that way. One metre is 10 px
on the map for the buildings (their footprints in rts.js are px).

A building's builder returns kit.py's dict plus:
  stages   its objects in the order they go up: [foundation, structure,
           shell, fittings], for the four pictures of its construction
"""
import math
from mathutils import Vector, Matrix
from kit import Part, make_materials, new_root, wheel, roll_wheels, rot, SAND

TEAM_COLORS = {"blue": (0.03, 0.22, 0.62), "red": (0.62, 0.07, 0.05)}

BASE = {
    "concrete": ((0.36, 0.35, 0.33), 0.95, 0.0),
    "concrete_dark": ((0.2, 0.2, 0.2), 0.9, 0.0),
    "armor": ((0.3, 0.32, 0.34), 0.6, 0.3),
    "armor_dark": ((0.16, 0.17, 0.19), 0.6, 0.3),
    "olive": ((0.25, 0.28, 0.15), 0.75, 0.0),
    "hazard": ((0.75, 0.55, 0.06), 0.6, 0.0),
    "panel": ((0.02, 0.05, 0.14), 0.15, 0.6),
    "pipe": ((0.42, 0.24, 0.12), 0.5, 0.6),
    "team": ((0.03, 0.22, 0.62), 0.5, 0.1),
    "dark": ((0.02, 0.02, 0.025), 0.8, 0.0),
    "white": ((0.75, 0.75, 0.72), 0.6, 0.0),
}
WEATHER = ("concrete", "concrete_dark", "armor", "armor_dark", "olive", "paint", "paint_dark", "hub")


def base_materials(lights=None):
    colors = dict(SAND)
    colors.update(BASE)
    return make_materials(colors, lights=lights or {"light": ((1.0, 0.86, 0.55), 1.5), "glow": ((0.15, 0.6, 1.0), 2.5)})


def plinth(p, size, h=0.4, mat="concrete"):
    """A building's concrete pad, a little under its footprint, with hazard edges."""
    half = size / 2
    p.box((size, size, h), (0, 0, h / 2), mat, bevel=0.05)
    for sx, sy in ((1, 1), (-1, 1), (1, -1), (-1, -1)):
        p.box((0.9, 0.9, 0.03), (sx * (half - 0.6), sy * (half - 0.6), h + 0.015), "hazard", bevel=0)
        p.box((0.92, 0.2, 0.035), (sx * (half - 0.6), sy * (half - 0.6), h + 0.02), "concrete_dark", bevel=0, rot=rot("Z", 45))


def building(name, parts, mats, root, moving=None):
    """What a building's builder returns: its parts are its stages, in order."""
    return {"root": root, "body": list(parts), "top": [], "pose": lambda k, n: None, "stages": list(parts),
            "moving": moving or {}, "mats": mats}


# ---------------------------------------------------------------- buildings

def build_hq():
    mats = base_materials()
    root = new_root("bld_hq")
    p = Part("foundation", mats)
    plinth(p, 9.6, 0.5)
    p.box((2.2, 2.6, 0.12), (-0.2, -4.0, 0.3), "concrete_dark", bevel=0.03, rot=rot("X", 8))       # ramp to the door
    a = p.finish((0, 0, 0), root)
    p = Part("structure", mats)
    p.box((7.2, 5.4, 2.6), (-0.6, 0.6, 1.8), "armor", bevel=0.12)                                   # the bunker
    p.box((3.0, 3.2, 4.6), (2.4, 1.6, 2.8), "armor", bevel=0.12)                                    # the command tower
    p.box((2.0, 0.2, 1.7), (-0.2, -2.15, 1.35), "dark", bevel=0.03)                                 # door
    b = p.finish((0, 0, 0), root)
    p = Part("shell", mats)
    p.box((7.5, 5.7, 0.25), (-0.6, 0.6, 3.2), "armor_dark", bevel=0.04)                             # roof slabs
    p.box((3.3, 3.5, 0.25), (2.4, 1.6, 5.2), "armor_dark", bevel=0.04)
    p.box((3.06, 0.1, 0.7), (2.4, -0.02, 4.3), "glow", bevel=0)                                     # the tower's windows
    p.box((0.1, 3.26, 0.7), (0.88, 1.6, 4.3), "glow", bevel=0)
    p.box((7.24, 0.08, 0.5), (-0.6, -2.12, 2.6), "team", bevel=0)                                   # the side's band
    p.box((0.08, 5.44, 0.5), (-4.22, 0.6, 2.6), "team", bevel=0)
    p.cyl(1.9, 0.12, (-1.9, 0.8, 3.4), "concrete_dark", segments=20, bevel=0.02)                    # helipad
    p.cyl(1.6, 0.13, (-1.9, 0.8, 3.41), "armor", segments=20, bevel=0)
    for (sx, sy, lx, ly) in ((-0.5, 0, 0.18, 1.3), (0.5, 0, 0.18, 1.3), (0, 0, 1.0, 0.18)):
        p.box((lx, ly, 0.03), (-1.9 + sx, 0.8 + sy, 3.49), "hazard", bevel=0)
    c = p.finish((0, 0, 0), root)
    p = Part("fittings", mats)
    p.cyl(0.07, 1.6, (3.3, 2.6, 6.1), "steel", segments=6, bevel=0)                                 # antenna
    p.cyl(0.05, 2.4, (3.5, 0.6, 6.5), "steel", segments=6, bevel=0)
    p.box((0.6, 0.5, 0.4), (-3.4, 2.7, 3.5), "armor_dark", bevel=0.03)                              # air units
    p.box((0.6, 0.5, 0.4), (-2.6, 2.7, 3.5), "armor_dark", bevel=0.03)
    for x in (-3.6, 2.9):
        p.cyl(0.1, 0.5, (x, -2.25, 2.95), "light", axis="Y", segments=8, bevel=0)                   # floodlights
    p.cyl(0.06, 1.4, (1.6, 2.2, 6.0), "steel", segments=6, bevel=0)                                 # the radar's mast
    d = p.finish((0, 0, 0), root)
    p = Part("radar", mats)
    p.cyl(0.9, 0.3, (1.6, 2.2, 6.9), "team", segments=14, bevel=0, r2=0.25, rot=rot("Y", 65))
    p.box((0.9, 0.06, 0.06), (1.9, 2.2, 6.95), "steel", bevel=0)
    radar = p.finish((1.6, 2.2, 6.7), root)
    return building("bld_hq", [a, b, c, d, radar], mats, root, {"radar": radar})


def build_solar():
    mats = base_materials()
    root = new_root("bld_solar")
    p = Part("foundation", mats)
    plinth(p, 7.2, 0.3)
    a = p.finish((0, 0, 0), root)
    p = Part("structure", mats)
    for ix in (-1, 0, 1):
        for iy in (-1, 1):
            p.cyl(0.09, 1.1, (ix * 2.15, iy * 1.5 + 0.6, 0.85), "steel", segments=6, bevel=0)       # the panels' posts
    p.box((1.2, 0.9, 1.0), (2.6, -2.7, 0.8), "armor", bevel=0.05)                                   # transformer
    b = p.finish((0, 0, 0), root)
    p = Part("shell", mats)
    tilt = rot("X", 28)
    for ix in (-1, 0, 1):
        for iy in (-1, 1):
            c = Vector((ix * 2.15, iy * 1.5 + 0.6, 1.45))
            p.box((1.95, 2.6, 0.08), c, "steel", bevel=0.01, rot=tilt)
            p.box((1.8, 2.45, 0.05), c + tilt @ Vector((0, 0, 0.05)), "panel", bevel=0, rot=tilt)
            for k in (-0.6, 0, 0.6):
                p.box((1.82, 0.03, 0.06), c + tilt @ Vector((0, k * 1.2, 0.055)), "steel", bevel=0, rot=tilt)
    c_ = p.finish((0, 0, 0), root)
    p = Part("fittings", mats)
    p.box((1.24, 0.06, 0.3), (2.6, -3.16, 1.0), "team", bevel=0)
    p.box((0.3, 0.3, 0.5), (2.6, -2.7, 1.55), "glow", bevel=0.02)
    p.rod(0.05, (2.0, -2.7, 0.5), (0, -0.9, 0.5), "dark")
    d = p.finish((0, 0, 0), root)
    return building("bld_solar", [a, b, c_, d], mats, root)


def build_wind():
    mats = base_materials()
    root = new_root("bld_wind")
    p = Part("foundation", mats)
    plinth(p, 5.2, 0.3)
    a = p.finish((0, 0, 0), root)
    p = Part("structure", mats)
    p.cyl(0.42, 6.4, (0, 0.4, 3.5), "white", segments=12, bevel=0, r2=0.24)                         # the mast
    p.box((1.0, 0.8, 0.8), (1.4, -1.5, 0.7), "armor", bevel=0.05)
    b = p.finish((0, 0, 0), root)
    p = Part("shell", mats)
    p.box((1.5, 0.7, 0.7), (0.15, 0.4, 6.9), "white", bevel=0.12)                                   # nacelle
    p.box((0.8, 0.72, 0.2), (0.15, 0.4, 6.72), "team", bevel=0)
    c = p.finish((0, 0, 0), root)
    p = Part("rotor", mats)
    hub = Vector((-0.75, 0.4, 6.9))
    p.cyl(0.3, 0.4, hub, "white", axis="X", segments=10, bevel=0.04)
    for k in range(3):
        turn = rot("X", k * 120 + 20)
        p.box((0.08, 0.42, 2.9), hub + turn @ Vector((-0.05, 0, 1.6)), "white", bevel=0.03, rot=turn)
    rotor = p.finish(tuple(hub), root)
    p = Part("fittings", mats)
    p.box((1.04, 0.06, 0.25), (1.4, -1.92, 0.85), "team", bevel=0)
    p.cyl(0.12, 0.1, (0.15, 0.4, 7.3), "light", segments=6, bevel=0)
    d = p.finish((0, 0, 0), root)
    return building("bld_wind", [a, b, c, rotor, d], mats, root, {"rotor": rotor})


def build_refinery():
    mats = base_materials()
    root = new_root("bld_refinery")
    p = Part("foundation", mats)
    plinth(p, 8.2, 0.4)
    p.box((3.4, 2.6, 0.06), (1.9, -2.6, 0.43), "concrete_dark", bevel=0)                            # the unloading bay
    for k in (-1, 0, 1):
        p.box((0.25, 2.5, 0.07), (1.9 + k * 1.2, -2.6, 0.44), "hazard", bevel=0)
    a = p.finish((0, 0, 0), root)
    p = Part("structure", mats)
    for x in (-2.4, 0.5):
        p.cyl(1.35, 3.8, (x, 1.9, 2.3), "armor", segments=18, bevel=0.06)                           # silos
    p.box((3.0, 2.6, 2.4), (-2.3, -1.8, 1.6), "armor", bevel=0.1)                                   # the works
    p.cyl(0.38, 5.6, (3.2, 2.6, 3.2), "concrete_dark", segments=10, bevel=0.03)                     # chimney
    b = p.finish((0, 0, 0), root)
    p = Part("shell", mats)
    for x in (-2.4, 0.5):
        p.ball(1.35, (x, 1.9, 4.2), "armor_dark", squash=0.45, segments=16)
        p.cyl(1.39, 0.35, (x, 1.9, 2.7), "team", segments=18, bevel=0)
    p.box((3.2, 2.8, 0.2), (-2.3, -1.8, 2.9), "armor_dark", bevel=0.04)
    p.cyl(0.42, 0.4, (3.2, 2.6, 5.4), "team", segments=10, bevel=0)
    p.box((2.2, 0.15, 1.5), (-2.3, -3.12, 1.3), "dark", bevel=0.02)                                 # the works' door
    c = p.finish((0, 0, 0), root)
    p = Part("fittings", mats)
    p.rod(0.16, (-2.4, 1.9, 4.6), (0.5, 1.9, 4.6), "pipe")                                          # pipes
    p.rod(0.16, (0.5, 1.9, 3.4), (3.2, 2.6, 3.4), "pipe")
    p.rod(0.14, (-2.3, -0.5, 2.6), (-2.4, 0.9, 2.6), "pipe")
    p.rod(0.14, (0.5, 0.55, 1.2), (1.9, -1.4, 1.2), "pipe")
    p.box((1.6, 0.5, 1.2), (1.9, -1.2, 1.0), "armor_dark", bevel=0.05)                              # the hopper it unloads into
    p.box((0.5, 0.5, 0.4), (-3.2, -1.2, 3.2), "armor_dark", bevel=0.03)
    p.cyl(0.1, 0.1, (3.2, 2.6, 6.05), "light", segments=6, bevel=0)
    d = p.finish((0, 0, 0), root)
    return building("bld_refinery", [a, b, c, d], mats, root)


def build_barracks():
    mats = base_materials()
    root = new_root("bld_barracks")
    p = Part("foundation", mats)
    plinth(p, 7.2, 0.3)
    a = p.finish((0, 0, 0), root)
    p = Part("structure", mats)
    p.box((5.6, 3.6, 1.2), (-0.4, 0.9, 0.9), "olive", bevel=0.05)                                   # the hut's walls
    b = p.finish((0, 0, 0), root)
    p = Part("shell", mats)
    p.cyl(1.8, 5.6, (-0.4, 0.9, 1.5), "olive", axis="X", segments=18, bevel=0.03)                   # its round roof
    for k in range(-3, 4):
        p.cyl(1.84, 0.08, (-0.4 + k * 0.8, 0.9, 1.5), "armor_dark", axis="X", segments=18, bevel=0)
    p.box((1.3, 0.12, 1.5), (-0.4, -0.92, 1.05), "dark", bevel=0.02)                                # door
    p.box((5.64, 0.06, 0.3), (-0.4, -0.93, 2.05), "team", bevel=0)
    c = p.finish((0, 0, 0), root)
    p = Part("fittings", mats)
    for k in range(5):                                                                              # sandbags by the door
        p.ball(0.3, (-2.5 + k * 0.42, -2.3, 0.5), "cloth", squash=0.6, segments=8)
        p.ball(0.3, (1.3 + k * 0.42, -2.3, 0.5), "cloth", squash=0.6, segments=8)
    p.cyl(0.05, 4.2, (2.9, -2.6, 2.4), "steel", segments=6, bevel=0)                                # flagpole
    p.box((1.3, 0.04, 0.8), (3.6, -2.6, 4.0), "team", bevel=0)
    p.box((0.9, 0.9, 0.7), (2.7, 2.6, 0.65), "paint_dark", bevel=0.04)                              # crates
    p.box((0.7, 0.7, 0.6), (2.6, 2.5, 1.3), "paint_dark", bevel=0.04)
    d = p.finish((0, 0, 0), root)
    return building("bld_barracks", [a, b, c, d], mats, root)


def build_factory():
    mats = base_materials()
    root = new_root("bld_factory")
    p = Part("foundation", mats)
    plinth(p, 8.8, 0.4)
    p.box((4.4, 2.2, 0.08), (-0.8, -3.2, 0.42), "concrete_dark", bevel=0)                           # the apron
    a = p.finish((0, 0, 0), root)
    p = Part("structure", mats)
    p.box((6.6, 5.2, 3.0), (-0.8, 0.8, 1.9), "armor", bevel=0.1)                                    # the hall
    p.box((1.6, 2.4, 2.2), (3.4, 1.6, 1.5), "armor", bevel=0.08)                                    # the office
    b = p.finish((0, 0, 0), root)
    p = Part("shell", mats)
    for k in range(4):                                                                              # the saw-tooth roof
        x = -3.3 + k * 1.65
        p.solid([(x, 2.6, 3.4), (x + 1.65, 2.6, 3.4), (x, 2.6, 4.2)], "armor_dark", bevel=0.03)
        p.box((0.08, 5.0, 0.55), (x + 0.04, 0.8, 3.75), "glow", bevel=0)
    p.box((4.2, 0.14, 2.4), (-0.8, -1.82, 1.6), "dark", bevel=0.03)                                 # the great door
    for k in range(5):
        p.box((4.2, 0.16, 0.05), (-0.8, -1.83, 0.7 + k * 0.45), "armor_dark", bevel=0)
    p.box((6.64, 0.06, 0.4), (-0.8, -1.83, 3.1), "team", bevel=0)
    p.box((1.7, 2.5, 0.15), (3.4, 1.6, 2.65), "armor_dark", bevel=0.03)
    c = p.finish((0, 0, 0), root)
    p = Part("fittings", mats)
    p.cyl(0.3, 2.6, (3.5, 2.9, 3.6), "concrete_dark", segments=10, bevel=0.03)                      # stack
    p.cyl(0.33, 0.3, (3.5, 2.9, 4.6), "team", segments=10, bevel=0)
    p.box((0.25, 0.25, 2.2), (-3.7, -2.9, 1.5), "hazard", bevel=0.02)                               # the gantry crane
    p.box((0.25, 0.25, 2.2), (2.1, -2.9, 1.5), "hazard", bevel=0.02)
    p.box((6.2, 0.3, 0.3), (-0.8, -2.9, 2.7), "hazard", bevel=0.02)
    p.box((0.4, 0.4, 0.5), (0.4, -2.9, 2.35), "steel", bevel=0.03)
    p.rod(0.03, (0.4, -2.9, 2.1), (0.4, -2.9, 1.2), "steel")
    d = p.finish((0, 0, 0), root)
    return building("bld_factory", [a, b, c, d], mats, root)


def build_techlab():
    mats = base_materials()
    root = new_root("bld_techlab")
    p = Part("foundation", mats)
    plinth(p, 7.8, 0.4)
    a = p.finish((0, 0, 0), root)
    p = Part("structure", mats)
    p.cyl(3.0, 1.8, (0, 0.2, 1.3), "armor", segments=8, bevel=0.1, rot=rot("Z", 22.5))
    p.box((1.6, 1.2, 1.5), (0, -3.0, 1.1), "armor", bevel=0.06)                                     # entrance
    b = p.finish((0, 0, 0), root)
    p = Part("shell", mats)
    p.cyl(3.15, 0.2, (0, 0.2, 2.25), "armor_dark", segments=8, bevel=0.04, rot=rot("Z", 22.5))
    p.ball(2.1, (0, 0.2, 2.3), "glow", squash=0.7, segments=18)                                     # the dome
    for k in range(8):
        turn = rot("Z", k * 45)
        p.box((0.1, 0.1, 1.6), Vector((0, 0.2, 2.9)) + turn @ Vector((1.75, 0, 0)), "armor_dark", bevel=0, rot=turn @ rot("Y", -38))
    p.box((1.0, 0.1, 1.1), (0, -3.62, 0.95), "dark", bevel=0.02)
    p.cyl(3.04, 0.3, (0, 0.2, 1.75), "team", segments=8, bevel=0, rot=rot("Z", 22.5))
    c = p.finish((0, 0, 0), root)
    p = Part("fittings", mats)
    p.cyl(0.08, 2.6, (0, 0.2, 4.9), "steel", segments=6, bevel=0)                                   # the spire
    p.ball(0.22, (0, 0.2, 6.2), "glow", segments=8)
    p.cyl(0.6, 0.2, (2.9, 2.9, 1.2), "white", segments=12, bevel=0, r2=0.15, rot=rot("X", 40))      # dishes
    p.cyl(0.06, 0.8, (2.9, 2.9, 0.7), "steel", segments=6, bevel=0)
    p.cyl(0.5, 0.18, (-2.9, 2.9, 1.1), "white", segments=12, bevel=0, r2=0.12, rot=rot("X", 40))
    p.cyl(0.06, 0.7, (-2.9, 2.9, 0.65), "steel", segments=6, bevel=0)
    d = p.finish((0, 0, 0), root)
    rings = []
    for name, tilt, r in (("ring1", 62, 1.5), ("ring2", -58, 1.15)):
        p = Part(name, mats)
        turn = rot("X", tilt)
        for k in range(24):
            spin = turn @ rot("Z", k * 15)
            p.box((0.42, 0.08, 0.08), Vector((0, 0.2, 5.0)) + spin @ Vector((0, r, 0)), "glow", bevel=0, rot=spin)
        rings.append(p.finish((0, 0.2, 5.0), root))
    return building("bld_techlab", [a, b, c, d] + rings, mats, root, {"ring1": rings[0], "ring2": rings[1]})


def build_wall():
    """One block of wall: a square of armoured concrete that reads as a
    wall whichever way its neighbours stand."""
    mats = base_materials()
    root = new_root("bld_wall")
    p = Part("block", mats)
    p.box((3.2, 3.2, 0.3), (0, 0, 0.15), "concrete_dark", bevel=0.04)
    p.box((2.9, 2.9, 1.5), (0, 0, 1.05), "concrete", bevel=0.12)
    p.box((3.05, 3.05, 0.18), (0, 0, 1.85), "concrete_dark", bevel=0.04)
    for sx, sy in ((1, 1), (-1, 1), (1, -1), (-1, -1)):
        p.box((0.75, 0.75, 0.5), (sx * 1.0, sy * 1.0, 2.15), "concrete", bevel=0.06)
    p.box((2.92, 0.05, 0.3), (0, -1.46, 1.0), "hazard", bevel=0)
    for k in range(-3, 4):
        p.box((0.16, 0.06, 0.34), (k * 0.4, -1.47, 1.0), "concrete_dark", bevel=0, rot=rot("Y", 30))
    a = p.finish((0, 0, 0), root)
    return building("bld_wall", [a], mats, root)


# -------------------------------------------------------------------- units

def tracked(p, mats, root, name, length, y, height=0.9, width=0.75, plates=14):
    """A caterpillar track's fixed parts into `p`; returns the object of its
    tread plates, which the rolling pose slides along."""
    p.box((length, width * 0.8, height * 0.7), (0, y, height * 0.55), "armor_dark", bevel=0.1)
    for k in range(5):
        x = -length / 2 + 0.5 + k * (length - 1.0) / 4
        p.cyl(height * 0.42, width * 0.86, (x, y, height * 0.45), "steel", axis="Y", segments=10, bevel=0.02)
    t = Part(name, mats)
    pitch = length / plates
    for k in range(plates + 1):
        t.box((pitch * 0.62, width, 0.09), (-length / 2 + k * pitch, y, height + 0.02), "rubber", bevel=0)
        t.box((pitch * 0.62, width, 0.09), (-length / 2 + k * pitch, y, 0.05), "rubber", bevel=0)
    ob = t.finish((0, 0, 0), root)
    ob["pitch"] = pitch
    return ob


def roll_tracks(tracks):
    def pose(k, n):
        for t in tracks:
            t.location.x = (k or 0) * t["pitch"] / n
    return pose


def build_harvester():
    mats = base_materials()
    root = new_root("harvester")
    p = Part("hull", mats)
    tracks = [tracked(p, mats, root, "track_L", 8.6, 1.75), tracked(p, mats, root, "track_R", 8.6, -1.75)]
    p.box((8.0, 2.9, 0.9), (0, 0, 1.2), "paint", bevel=0.1)                                         # chassis
    p.solid([(1.6, 1.3, 1.6), (3.9, 1.3, 1.6), (1.9, 1.15, 2.9), (3.3, 1.15, 2.9)], "paint", bevel=0.08)   # cab
    p.box((0.08, 2.2, 0.6), (3.62, 0, 2.45), "glass", bevel=0, rot=rot("Y", 22))
    p.box((1.3, 2.34, 0.3), (2.6, 0, 2.6), "team", bevel=0.02)
    # The hopper at the back: an open box for the ore.
    p.box((4.3, 2.9, 0.15), (-1.7, 0, 1.7), "paint_dark", bevel=0.02)
    for y in (1.4, -1.4):
        p.box((4.3, 0.16, 1.2), (-1.7, y, 2.3), "paint_dark", bevel=0.03)
    for x in (-3.8, 0.4):
        p.box((0.16, 2.9, 1.2), (x, 0, 2.3), "paint_dark", bevel=0.03)
    for k in range(4):
        p.box((0.12, 3.0, 1.3), (-3.2 + k * 1.0, 0, 2.3), "paint", bevel=0.02)
    # The scoop out in front, on its arms, with a toothed drum.
    for y in (1.1, -1.1):
        p.rod(0.16, (3.6, y, 1.3), (4.9, y, 0.9), "steel")
    p.cyl(0.62, 3.3, (5.0, 0, 0.75), "steel", axis="Y", segments=12, bevel=0.03)
    for k in range(8):
        for j in range(5):
            turn = rot("Y", k * 45 + j * 11)
            p.box((0.2, 0.18, 0.32), Vector((5.0, -1.3 + j * 0.65, 0.75)) + turn @ Vector((0, 0, 0.68)), "hazard", bevel=0, rot=turn)
    p.box((1.0, 3.5, 0.12), (4.7, 0, 1.55), "paint", bevel=0.03, rot=rot("Y", 20))                  # scoop guard
    p.cyl(0.14, 0.9, (0.9, 1.2, 3.1), "steel", segments=6, bevel=0)                                 # exhaust
    for y in (0.9, -0.9):
        p.cyl(0.14, 0.1, (4.02, y, 1.9), "light", axis="X", segments=8, bevel=0)
    p.box((0.5, 0.5, 0.25), (2.6, 0, 3.02), "hazard", bevel=0.03)                                   # beacon
    hull = p.finish((0, 0, 0), root)
    return {"root": root, "body": [hull] + tracks, "top": [], "pose": roll_tracks(tracks), "mats": mats}


def build_mcv():
    mats = base_materials()
    root = new_root("mcv")
    p = Part("hull", mats)
    p.box((8.4, 2.6, 0.5), (0, 0, 1.0), "armor_dark", bevel=0.06)                                   # chassis
    p.solid([(2.4, 1.4, 1.2), (4.3, 1.4, 1.2), (4.4, 1.3, 1.7), (2.5, 1.3, 2.9), (3.9, 1.3, 2.9)], "armor", bevel=0.08)     # cab
    p.box((0.08, 2.3, 0.7), (4.16, 0, 2.4), "glow", bevel=0, rot=rot("Y", 25))
    # The folded base on its back.
    p.box((6.0, 3.0, 1.7), (-1.1, 0, 2.1), "armor", bevel=0.1)
    p.box((6.04, 3.04, 0.35), (-1.1, 0, 2.0), "team", bevel=0)
    p.box((5.2, 2.4, 0.3), (-1.1, 0, 3.05), "armor_dark", bevel=0.05)
    for x in (-3.4, -1.9, -0.4, 1.1):
        p.box((0.2, 3.1, 1.8), (x, 0, 2.1), "armor_dark", bevel=0.03)
    p.cyl(0.9, 0.25, (-2.6, 0, 3.3), "armor_dark", segments=14, bevel=0.03)                         # the folded dish
    p.cyl(0.75, 0.2, (-2.6, 0, 3.5), "team", segments=14, bevel=0, r2=0.2)
    p.box((2.4, 0.3, 0.3), (0.2, 0.6, 3.35), "hazard", bevel=0.03)                                  # the crane's arm, stowed
    p.cyl(0.06, 1.5, (1.6, -1.0, 3.9), "steel", segments=6, bevel=0)
    for y in (0.95, -0.95):
        p.cyl(0.15, 0.1, (4.42, y, 1.45), "light", axis="X", segments=8, bevel=0)
    p.box((0.3, 2.9, 0.4), (4.5, 0, 0.9), "steel", bevel=0.05)
    hull = p.finish((0, 0, 0), root)
    wheels = []
    for i, x in enumerate([3.2, 1.2, -1.4, -3.2]):
        wheels.append(wheel(f"wheel_L{i + 1}", (x, 1.5, 0.62), 0.62, 0.5, mats, root, 14))
        wheels.append(wheel(f"wheel_R{i + 1}", (x, -1.5, 0.62), 0.62, 0.5, mats, root, 14))
    return {"root": root, "body": [hull] + wheels, "top": [], "pose": roll_wheels(wheels, 14), "mats": mats}


# ----------------------------------------------------------------- crystals

def build_crystals(kind, seed):
    """A cluster of ore crystals: amber, or the rarer cyan."""
    import random
    r = random.Random(seed)
    glow = {"amber": ((1.0, 0.55, 0.05), 1.6), "cyan": ((0.1, 0.8, 1.0), 1.8)}[kind]
    colors = dict(SAND)
    colors.update(BASE)
    colors["crystal"] = ({"amber": (0.85, 0.42, 0.04), "cyan": (0.08, 0.6, 0.85)}[kind], 0.18, 0.1)
    colors["rock"] = ((0.22, 0.2, 0.18), 0.9, 0.0)
    mats = make_materials(colors, lights={"core": glow})
    root = new_root(f"crystal_{kind}_{seed}")
    p = Part("crystals", mats)
    for _ in range(5):
        a, d = r.uniform(0, 6.28), r.uniform(0.5, 1.5)
        p.ball(r.uniform(0.35, 0.6), (d * math.cos(a), d * math.sin(a), 0.1), "rock", squash=0.5, segments=7)
    for i in range(r.randrange(5, 9)):
        a, d = r.uniform(0, 6.28), r.uniform(0, 1.15) if i else 0.0
        h = r.uniform(1.2, 3.4) * (1.25 if i == 0 else 1.0)
        w = r.uniform(0.22, 0.42) * (1.2 if i == 0 else 1.0)
        lean = rot("Z", math.degrees(a)) @ rot("Y", r.uniform(4, 26) * (0 if i == 0 else 1))
        at = Vector((d * math.cos(a), d * math.sin(a), 0))
        p.cyl(w, h * 0.8, at + lean @ Vector((0, 0, h * 0.4)), "crystal", segments=6, bevel=0, rot=lean)
        p.cyl(w, h * 0.3, at + lean @ Vector((0, 0, h * 0.95)), "crystal", segments=6, bevel=0, r2=0.02, rot=lean)
        p.cyl(w * 0.55, h * 0.7, at + lean @ Vector((0, 0, h * 0.42)), "core", segments=6, bevel=0, rot=lean)
    ob = p.finish((0, 0, 0), root)
    return {"root": root, "body": [ob], "top": [], "pose": lambda k, n: None, "mats": mats}


BUILDING = dict(kind="building", frame_px=192, directions=1, roll_frames=1, weathered=WEATHER, weather=0.7)
SPECS = {
    "bld_hq": dict(BUILDING, build=build_hq, frame_m=19.0, look_z=2.0),
    "bld_solar": dict(BUILDING, build=build_solar, frame_m=14.25, look_z=1.0),
    "bld_wind": dict(BUILDING, build=build_wind, frame_m=13.0, look_z=3.0, frame_px=176),
    "bld_refinery": dict(BUILDING, build=build_refinery, frame_m=16.15, look_z=2.0),
    "bld_barracks": dict(BUILDING, build=build_barracks, frame_m=14.25, look_z=1.2),
    "bld_factory": dict(BUILDING, build=build_factory, frame_m=17.1, look_z=1.8),
    "bld_techlab": dict(BUILDING, build=build_techlab, frame_m=15.2, look_z=2.2),
    "bld_wall": dict(BUILDING, build=build_wall, frame_m=6.08, look_z=0.8, frame_px=96, stages=False),
    "harvester": dict(build=build_harvester, frame_px=176, frame_m=13.2, directions=32, roll_frames=4, look_z=1.2, weathered=WEATHER),
    "mcv": dict(build=build_mcv, frame_px=160, frame_m=11.0, directions=32, roll_frames=4, look_z=1.4, weathered=WEATHER),
    "crystal_amber_0": dict(kind="prop", build=lambda: build_crystals("amber", 0), frame_px=96, frame_m=6.0, directions=1, roll_frames=1, look_z=1.0),
    "crystal_amber_1": dict(kind="prop", build=lambda: build_crystals("amber", 1), frame_px=96, frame_m=6.0, directions=1, roll_frames=1, look_z=1.0),
    "crystal_amber_2": dict(kind="prop", build=lambda: build_crystals("amber", 2), frame_px=96, frame_m=6.0, directions=1, roll_frames=1, look_z=1.0),
    "crystal_cyan_0": dict(kind="prop", build=lambda: build_crystals("cyan", 3), frame_px=96, frame_m=6.0, directions=1, roll_frames=1, look_z=1.0),
    "crystal_cyan_1": dict(kind="prop", build=lambda: build_crystals("cyan", 4), frame_px=96, frame_m=6.0, directions=1, roll_frames=1, look_z=1.0),
}
