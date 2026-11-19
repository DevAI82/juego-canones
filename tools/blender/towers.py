"""The defence's three turrets, each on the same concrete emplacement: the
cannon (olive), the twin anti-aircraft guns (slate grey) and the railgun
(bronze, glowing blue). The base stays put and the turret turns on it; a
builder's "build" poses the model part-way through its construction.
"""
import math
from mathutils import Vector, Matrix
from kit import Part, make_materials, new_root, rot, SAND

PIVOT_Z = 0.86

CONCRETE = {
    "concrete": ((0.36, 0.35, 0.33), 0.95, 0.0),
    "concrete_dark": ((0.2, 0.2, 0.2), 0.9, 0.0),
    "hazard": ((0.75, 0.55, 0.06), 0.6, 0.0),
}
WEATHER = ("paint", "paint_dark", "team", "concrete", "concrete_dark")


def palette(paint, dark, metal=0.05, rough=0.6):
    colors = dict(SAND)
    colors.update(CONCRETE)
    colors["paint"] = (paint, rough, metal)
    colors["paint_dark"] = (dark, rough + 0.08, metal)
    colors["team"] = (tuple(c * 0.8 for c in paint), rough, metal)
    return colors


def build_base(mats, root):
    """An eight-sided concrete plinth with a raised ring for the turret."""
    p = Part("base", mats)
    eighth = rot("Z", 22.5)
    p.cyl(3.15, 0.46, (0, 0, 0.23), "concrete", segments=8, bevel=0.07, rot=eighth)
    p.cyl(2.45, 0.24, (0, 0, 0.56), "concrete_dark", segments=8, bevel=0.05, rot=eighth)
    p.cyl(1.85, 0.14, (0, 0, 0.74), "steel", segments=28, bevel=0.02)
    for i in range(8):                                        # bolts round the ring
        a = math.radians(22.5 + i * 45)
        p.cyl(0.11, 0.1, (2.15 * math.cos(a), 2.15 * math.sin(a), 0.7), "steel", segments=6, bevel=0.01)
    for i in range(4):                                        # hazard plates on four sides
        turn = rot("Z", i * 90)
        p.box((0.5, 1.5, 0.04), turn @ Vector((2.72, 0, 0.47)), "hazard", bevel=0.008, rot=turn)
        for k in (-0.5, 0, 0.5):
            p.box((0.52, 0.16, 0.045), turn @ Vector((2.72, k, 0.47)), "concrete_dark", bevel=0, rot=turn @ rot("Z", 35))
    p.box((0.8, 0.6, 0.5), (-2.2, -2.2, 0.5), "paint_dark", bevel=0.04, rot=rot("Z", 45))     # power box
    p.rod(0.06, (-2.0, -2.0, 0.6), (-1.3, -1.3, 0.75), "rubber")
    for sx, sy in ((1, 1), (-1, 1), (1, -1)):                 # ammunition crates on three corners
        turn = rot("Z", 45 if sx * sy > 0 else -45)
        p.box((0.7, 0.42, 0.3), (sx * 2.12, sy * 2.12, 0.61), "paint_dark", bevel=0.025, rot=turn)
        p.box((0.72, 0.06, 0.31), (sx * 2.12, sy * 2.12, 0.61), "steel", bevel=0, rot=turn)
    return p.finish((0, 0, 0), root)


def build_pose(base, turret, barrel):
    """Construction: the base rises, the turret grows on it, the gun runs out."""
    def pose(f):
        step = lambda a, b: max(0.001, min(1.0, (f - a) / (b - a)))
        ease = lambda t: t * t * (3 - 2 * t)
        base.scale = (1, 1, ease(step(0.0, 0.35)))
        s = ease(step(0.3, 0.75))
        turret.scale = (s, s, s)
        barrel.scale = (ease(step(0.7, 1.0)), 1, 1)
    return pose


def finish(name, root, mats, base, turret, barrel):
    return {"root": root, "body": [base], "top": [turret, barrel], "pose": lambda k, n: None,
            "build": build_pose(base, turret, barrel), "mats": mats}


# ----------------------------------------------------------- the cannon

def build_basic():
    mats = make_materials(palette((0.25, 0.29, 0.14), (0.15, 0.18, 0.09)))
    root = new_root("tower_basic")
    base = build_base(mats, root)
    z = PIVOT_Z
    p = Part("turret", mats)
    p.cyl(1.55, 0.16, (0, 0, z + 0.06), "paint_dark", segments=24)
    p.solid([
        (-1.75, 1.25, z + 0.14), (0.7, 1.35, z + 0.14), (1.55, 0.7, z + 0.14),
        (-1.85, 1.15, z + 0.5), (0.85, 1.3, z + 0.5), (1.7, 0.6, z + 0.52),
        (-1.45, 0.9, z + 1.05), (0.55, 0.95, z + 1.05), (1.15, 0.5, z + 0.98),
    ], "paint", bevel=0.045)
    p.solid([(-1.9, 1.18, z + 0.3), (-1.2, 1.3, z + 0.3), (-1.9, 1.14, z + 0.55), (-1.2, 1.26, z + 0.55)], "team", bevel=0.01)
    for y in (0.62, -0.62):                                   # armour plates on the roof
        p.box((1.3, 0.75, 0.05), (-0.55, y, z + 1.07), "paint_dark", bevel=0.012)
    p.cyl(0.42, 0.2, (-0.5, 0.45, z + 1.15), "paint_dark", segments=8)          # cupola
    p.cyl(0.3, 0.05, (-0.5, 0.45, z + 1.27), "steel", segments=14, bevel=0.008)
    p.cyl(0.33, 0.07, (-0.35, -0.5, z + 1.1), "paint_dark", segments=14)
    p.box((0.4, 0.34, 0.26), (0.55, -0.55, z + 1.13), "paint_dark", bevel=0.02)  # sight
    p.box((0.04, 0.24, 0.14), (0.76, -0.55, z + 1.14), "glass", bevel=0)
    p.box((0.75, 0.08, 0.1), (-0.05, 0.45, z + 1.42), "steel", bevel=0.01)       # machine gun
    p.cyl(0.028, 0.7, (0.65, 0.45, z + 1.43), "steel", axis="X", segments=6, bevel=0)
    for side in (1, -1):                                      # smoke launchers
        for i in range(4):
            p.cyl(0.07, 0.3, (0.75 - i * 0.18, side * 1.38, z + 0.55), "steel", axis="X", segments=8, bevel=0.006)
    p.box((0.5, 1.9, 0.45), (-2.1, 0, z + 0.42), "paint_dark", bevel=0.03)       # basket
    for i in range(4):
        p.box((0.52, 0.05, 0.47), (-2.1, -0.7 + i * 0.47, z + 0.42), "steel", bevel=0)
    p.cyl(0.018, 2.0, (-1.4, -0.8, z + 2.0), "steel", segments=6, bevel=0)       # antenna
    turret = p.finish((0, 0, PIVOT_Z), root)

    p = Part("barrel", mats)
    h = z + 0.6
    p.box((0.5, 0.8, 0.55), (1.55, 0, h), "paint_dark", bevel=0.045)             # mantlet
    p.cyl(0.2, 0.7, (2.05, 0, h), "paint", axis="X", segments=14)
    p.cyl(0.15, 1.6, (2.9, 0, h), "paint", axis="X", segments=14, bevel=0.006)
    p.cyl(0.2, 0.35, (2.7, 0, h), "paint_dark", axis="X", segments=14)          # fume extractor
    p.cyl(0.2, 0.42, (3.5, 0, h), "steel", axis="X", segments=14)                # muzzle brake
    p.box((0.24, 0.4, 0.09), (3.5, 0, h), "rubber", bevel=0)
    barrel = p.finish((1.4, 0, h), turret)
    return finish("tower_basic", root, mats, base, turret, barrel)


# ------------------------------------------------------- the twin guns

def build_double():
    mats = make_materials(palette((0.34, 0.37, 0.41), (0.17, 0.19, 0.22)))
    root = new_root("tower_double")
    base = build_base(mats, root)
    z = PIVOT_Z
    p = Part("turret", mats)
    p.cyl(1.5, 0.16, (0, 0, z + 0.06), "paint_dark", segments=24)
    p.solid([
        (-1.5, 1.05, z + 0.14), (1.0, 1.05, z + 0.14), (1.35, 0.7, z + 0.14),
        (-1.6, 1.0, z + 0.7), (1.05, 1.0, z + 0.7), (1.4, 0.65, z + 0.7),
        (-1.3, 0.8, z + 1.15), (0.6, 0.8, z + 1.15), (0.95, 0.5, z + 1.1),
    ], "paint", bevel=0.045)
    # Camouflage blocks, a shade darker.
    for x, y, sx, sy in ((-0.9, 0.5, 0.6, 0.45), (0.2, -0.45, 0.7, 0.5), (-0.4, -0.55, 0.4, 0.3), (0.45, 0.4, 0.35, 0.4)):
        p.box((sx, sy, 0.03), (x, y, z + 1.16), "paint_dark", bevel=0)
    p.box((0.9, 0.7, 0.03), (-1.58, 0, z + 0.45), "team", bevel=0, rot=rot("Y", 90))
    for y in (0.5, -0.5):
        p.cyl(0.3, 0.06, (-0.1, y, z + 1.18), "paint_dark", segments=14)          # hatches
    p.ball(0.5, (-1.0, 0, z + 1.3), "paint_dark", squash=0.8)                     # radar dome
    p.cyl(0.52, 0.1, (-1.0, 0, z + 1.2), "steel", segments=16, bevel=0.01)
    p.box((0.5, 1.6, 0.6), (-1.85, 0, z + 0.5), "paint_dark", bevel=0.03)         # cooling pack
    for i in range(5):
        p.box((0.06, 1.5, 0.5), (-2.12, 0, z + 0.3 + i * 0.1), "steel", bevel=0, rot=rot("Y", 20))
    for y in (1.25, -1.25):                                   # the guns' cradles and ammunition drums
        p.box((1.5, 0.4, 0.5), (0.2, y, z + 0.6), "paint_dark", bevel=0.04)
        p.cyl(0.36, 0.34, (-0.75, y, z + 0.62), "steel", axis="Y", segments=14)
    turret = p.finish((0, 0, PIVOT_Z), root)

    p = Part("barrel", mats)
    h = z + 0.62
    for y in (1.25, -1.25):
        p.cyl(0.16, 0.5, (1.15, y, h), "paint", axis="X", segments=12)
        p.cyl(0.105, 2.1, (2.35, y, h), "paint", axis="X", segments=10, bevel=0.005)
        p.cyl(0.145, 0.5, (1.9, y, h), "steel", axis="X", segments=10, bevel=0.006)  # recoil sleeve
        p.cyl(0.15, 0.5, (3.3, y, h), "steel", axis="X", segments=10, bevel=0.006)   # flash hider
        for i in range(3):
            p.box((0.06, 0.26, 0.05), (3.15 + i * 0.14, y, h), "rubber", bevel=0)
    barrel = p.finish((1.0, 0, h), turret)
    return finish("tower_double", root, mats, base, turret, barrel)


# --------------------------------------------------------- the railgun

def build_laser():
    mats = make_materials(palette((0.5, 0.29, 0.17), (0.26, 0.15, 0.1), metal=0.55, rough=0.42),
                          lights={"light": ((1.0, 0.86, 0.55), 1.5), "glow": ((0.12, 0.5, 1.0), 3.5)})
    root = new_root("tower_laser")
    base = build_base(mats, root)
    z = PIVOT_Z
    p = Part("turret", mats)
    p.cyl(1.5, 0.16, (0, 0, z + 0.06), "paint_dark", segments=24)
    # A long, low wedge of faceted armour.
    p.solid([
        (-1.9, 0.75, z + 0.14), (0.3, 1.3, z + 0.14), (1.5, 0.7, z + 0.14),
        (-2.0, 0.7, z + 0.55), (0.3, 1.38, z + 0.5), (1.6, 0.62, z + 0.5),
        (-1.6, 0.55, z + 0.95), (0.1, 0.85, z + 1.0), (1.0, 0.42, z + 0.9),
    ], "paint", bevel=0.045)
    p.solid([(-1.2, 0.36, z + 0.98), (-0.2, 0.42, z + 1.02), (-1.1, 0.3, z + 1.22), (-0.3, 0.34, z + 1.24)], "paint_dark", bevel=0.03)   # cabin
    p.box((0.05, 0.5, 0.14), (-0.22, 0, z + 1.14), "glow", bevel=0)               # its window
    for y in (0.95, -0.95):                                   # glowing panels on the flanks
        p.box((0.6, 0.05, 0.14), (-0.3, y * 1.12, z + 0.5), "glow", bevel=0, rot=rot("Z", 13 if y > 0 else -13))
        p.box((0.5, 0.36, 0.05), (-1.3, y * 0.5, z + 0.97), "paint_dark", bevel=0.012)
    p.box((0.4, 1.3, 0.5), (-2.05, 0, z + 0.4), "paint_dark", bevel=0.03)         # capacitor bank
    for i in range(3):
        p.box((0.06, 0.2, 0.3), (-2.27, -0.4 + i * 0.4, z + 0.42), "glow", bevel=0)
    p.box((0.04, 0.6, 0.3), (-1.98, 0, z + 0.8), "team", bevel=0)
    turret = p.finish((0, 0, PIVOT_Z), root)

    p = Part("barrel", mats)
    h = z + 0.58
    p.box((0.7, 0.9, 0.5), (1.55, 0, h), "paint_dark", bevel=0.045)               # breech
    for y in (0.3, -0.3):                                     # the two rails
        p.box((2.3, 0.14, 0.26), (2.7, y, h), "paint", bevel=0.02)
        p.box((2.3, 0.05, 0.1), (2.7, y * 0.7, h), "steel", bevel=0)
    p.box((2.2, 0.26, 0.06), (2.7, 0, h), "glow", bevel=0)                        # the charge between them
    for i in range(4):                                        # coils round the breech end
        p.cyl(0.44, 0.13, (1.95 + i * 0.27, 0, h), "glow", axis="X", segments=16, bevel=0.01)
        p.cyl(0.47, 0.06, (2.08 + i * 0.27, 0, h), "paint_dark", axis="X", segments=16, bevel=0.01)
    p.box((0.25, 0.8, 0.34), (3.75, 0, h), "paint_dark", bevel=0.03)              # muzzle shroud
    p.box((0.08, 0.3, 0.14), (3.88, 0, h), "glow", bevel=0)
    barrel = p.finish((1.3, 0, h), turret)
    return finish("tower_laser", root, mats, base, turret, barrel)


# The turret turns, not the whole model ("turn": "top"); the base layer is
# rendered once per heading all the same, for the turret's shadow on it.
TOWER = dict(frame_px=160, frame_m=9.6, directions=32, roll_frames=1, turn="top", build_frames=16, look_z=1.0, weathered=WEATHER)
SPECS = {
    "tower_basic": dict(TOWER, build=build_basic),
    "tower_double": dict(TOWER, build=build_double),
    "tower_laser": dict(TOWER, build=build_laser, weather=0.6),
}
