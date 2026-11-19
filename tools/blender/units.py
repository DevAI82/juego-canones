"""The army's models: the tank, the buggy, the motorcycle, the rocket truck
and the soldier. Each builder returns what kit.py describes; SPECS says how
each one's sprites are rendered (game/js/unitSprites.js has the same numbers).
"""
import math
from mathutils import Vector, Matrix
from kit import Part, make_materials, new_root, wheel, roll_wheels, rot

LUGS = 14


# --------------------------------------------------------------------- tank

def build_tank():
    mats = make_materials()
    root = new_root("tank")
    turret_z = 1.62

    p = Part("hull", mats)
    # The armoured body: a boat-shaped lower hull, a belt and a sloped deck.
    p.solid([
        (-3.15, 0.84, 0.48), (2.95, 0.84, 0.48), (3.3, 0.78, 0.66),
        (-3.45, 1.18, 0.98), (3.05, 1.18, 0.98), (3.55, 0.84, 1.0),
        (-3.45, 1.18, 1.24), (2.9, 1.18, 1.24),
        (-3.2, 0.94, 1.6), (2.0, 0.94, 1.6),
    ], "paint", bevel=0.035)
    for y in (1.3, -1.3):                                    # mudguards
        p.box((6.5, 0.3, 0.05), (-0.1, y, 1.2), "paint_dark")
    p.box((1.7, 1.6, 0.07), (-2.25, 0, 1.63), "paint_dark", bevel=0.02)   # engine deck
    for y in (0.42, -0.42):
        p.box((1.3, 0.6, 0.05), (-2.25, y, 1.68), "steel", bevel=0.008)
        for i in range(6):
            p.box((0.06, 0.56, 0.03), (-2.8 + i * 0.22, y, 1.715), "paint_dark", bevel=0)
    for y in (0.48, -0.48):                                  # hatches and periscopes
        p.cyl(0.3, 0.06, (1.45, y, 1.63), "paint_dark", segments=16)
        p.box((0.1, 0.26, 0.07), (1.85, y, 1.65), "glass", bevel=0.008)
    for y in (1.12, -1.12):                                  # stowage boxes
        p.box((1.0, 0.2, 0.26), (-1.55, y, 1.4), "paint_dark", bevel=0.02)
        p.box((0.75, 0.18, 0.22), (0.35, y, 1.4), "paint_dark", bevel=0.02)
    for y in (0.62, -0.62):                                  # headlights and tow hooks
        p.cyl(0.09, 0.08, (3.28, y, 1.12), "light", axis="X", segments=12, bevel=0)
        p.box((0.14, 0.08, 0.12), (3.38, y * 0.55, 0.78), "steel", bevel=0.01)
    p.box((0.05, 1.5, 0.3), (2.72, 0, 1.47), "paint_dark", bevel=0.01, rot=rot("Y", -25))   # trim vane
    p.cyl(0.085, 1.3, (-2.3, -1.2, 1.33), "steel", axis="X", segments=12)                   # exhaust
    for y in (0.9, -0.9):
        p.box((0.05, 0.16, 0.1), (-3.47, y, 1.12), "light", bevel=0)
    p.cyl(0.92, 0.07, (0, 0, 1.62), "steel", segments=28, bevel=0.01)                       # turret ring
    hull = p.finish((0, 0, 0), root)

    wheels = []
    for i, x in enumerate([2.3, 0.8, -0.9, -2.4]):
        wheels.append(wheel(f"wheel_L{i + 1}", (x, 1.22, 0.56), 0.56, 0.42, mats, root, LUGS))
        wheels.append(wheel(f"wheel_R{i + 1}", (x, -1.22, 0.56), 0.56, 0.42, mats, root, LUGS))

    p = Part("turret", mats)
    z = turret_z + 0.06
    p.solid([
        (-1.0, 0.72, z), (0.55, 0.8, z), (1.12, 0.42, z),
        (-1.05, 0.66, z + 0.22), (0.62, 0.76, z + 0.22), (1.2, 0.36, z + 0.24),
        (-0.82, 0.5, z + 0.56), (0.42, 0.56, z + 0.56), (0.82, 0.3, z + 0.52),
    ], "paint", bevel=0.03)
    p.solid([(-1.09, 0.69, z + 0.1), (-0.6, 0.76, z + 0.1), (-1.09, 0.67, z + 0.3), (-0.6, 0.74, z + 0.3)], "team", bevel=0.01)
    p.cyl(0.27, 0.14, (-0.3, 0.26, z + 0.6), "paint_dark", segments=16)         # cupola
    p.cyl(0.2, 0.04, (-0.3, 0.26, z + 0.69), "steel", segments=12, bevel=0.008)
    p.cyl(0.22, 0.05, (-0.25, -0.28, z + 0.58), "paint_dark", segments=14)
    p.box((0.28, 0.22, 0.18), (0.4, -0.3, z + 0.62), "paint_dark", bevel=0.015)  # sight
    p.box((0.03, 0.16, 0.1), (0.545, -0.3, z + 0.63), "glass", bevel=0)
    for side in (1, -1):                                                         # smoke launchers
        for i in range(3):
            p.cyl(0.05, 0.22, (0.5 - i * 0.13, side * 0.83, z + 0.3), "steel", axis="X", segments=8, bevel=0.006)
    p.box((0.32, 1.1, 0.26), (-1.25, 0, z + 0.2), "paint_dark", bevel=0.02)      # basket
    p.cyl(0.014, 1.5, (-0.85, -0.4, z + 1.3), "steel", segments=6, bevel=0)      # antenna
    p.box((0.5, 0.06, 0.08), (0.02, 0.26, z + 0.8), "steel", bevel=0.008)        # machine gun
    p.cyl(0.02, 0.5, (0.5, 0.26, z + 0.81), "steel", axis="X", segments=6, bevel=0)
    turret = p.finish((0, 0, turret_z), root)

    p = Part("barrel", mats)
    z = turret_z + 0.33
    p.box((0.34, 0.5, 0.36), (1.12, 0, z), "paint_dark", bevel=0.03)             # mantlet
    p.cyl(0.13, 0.75, (1.6, 0, z), "paint", axis="X", segments=14)
    p.cyl(0.085, 2.3, (2.75, 0, z), "steel", axis="X", segments=14, bevel=0.006)
    p.cyl(0.115, 0.3, (2.55, 0, z), "paint", axis="X", segments=14)
    p.cyl(0.125, 0.36, (3.86, 0, z), "steel", axis="X", segments=14)             # muzzle brake
    p.box((0.2, 0.3, 0.07), (3.86, 0, z), "rubber", bevel=0)
    barrel = p.finish((1.0, 0, z), turret)

    return {"root": root, "body": [hull] + wheels, "top": [turret, barrel], "pose": roll_wheels(wheels, LUGS), "mats": mats}


# -------------------------------------------------------------------- buggy

def build_buggy():
    mats = make_materials()
    root = new_root("buggy")
    p = Part("hull", mats)
    # A low tub with a sloped bonnet, open on top.
    p.solid([
        (-1.95, 0.72, 0.42), (1.75, 0.6, 0.42), (2.1, 0.5, 0.55),
        (-2.05, 0.78, 0.8), (1.2, 0.78, 0.85), (2.12, 0.52, 0.72),
        (0.45, 0.74, 1.02), (-2.0, 0.76, 1.02),
    ], "paint", bevel=0.03)
    p.box((1.9, 1.2, 0.08), (-0.75, 0, 0.98), "paint_dark", bevel=0.01)          # floor of the cabin
    p.box((0.75, 1.2, 0.05), (1.3, 0, 0.93), "paint_dark", bevel=0.01, rot=rot("Y", 8))   # bonnet panel
    for y in (0.34, -0.34):                                                       # seats
        p.box((0.5, 0.46, 0.14), (-0.2, y, 1.08), "leather", bevel=0.03)
        p.box((0.14, 0.46, 0.5), (-0.5, y, 1.3), "leather", bevel=0.03, rot=rot("Y", -12))
    p.box((0.9, 1.3, 0.34), (-1.55, 0, 1.17), "paint_dark", bevel=0.03)          # engine cover
    for i in range(5):
        p.box((0.05, 1.1, 0.03), (-1.9 + i * 0.17, 0, 1.355), "steel", bevel=0)
    # Roll cage.
    for y in (0.68, -0.68):
        p.rod(0.045, (0.55, y, 1.0), (0.25, y, 1.72), "steel")
        p.rod(0.045, (-1.05, y, 1.0), (-0.95, y, 1.72), "steel")
        p.rod(0.045, (0.25, y, 1.72), (-0.95, y, 1.72), "steel")
        p.rod(0.04, (-0.95, y, 1.72), (-1.95, y, 1.05), "steel")
    p.rod(0.045, (0.25, 0.68, 1.72), (0.25, -0.68, 1.72), "steel")
    p.rod(0.045, (-0.95, 0.68, 1.72), (-0.95, -0.68, 1.72), "steel")
    p.box((0.5, 0.5, 0.05), (-0.35, 0, 1.74), "paint_dark", bevel=0.01)          # gun mount plate
    # Bull bar, headlights, spare wheel and jerry cans.
    p.rod(0.05, (2.2, 0.6, 0.62), (2.2, -0.6, 0.62), "steel")
    for y in (0.4, -0.4):
        p.rod(0.04, (2.2, y, 0.62), (2.0, y, 0.95), "steel")
        p.cyl(0.11, 0.1, (2.08, y * 1.15, 0.86), "light", axis="X", segments=12, bevel=0)
    p.cyl(0.36, 0.26, (-2.2, 0, 1.0), "rubber", axis="X", segments=18, bevel=0.03)
    p.cyl(0.16, 0.28, (-2.2, 0, 1.0), "hub", axis="X", segments=10)
    for y in (0.86, -0.86):
        p.box((0.36, 0.14, 0.4), (-0.6, y, 0.92), "paint_dark", bevel=0.02)
    # The driver.
    p.box((0.26, 0.4, 0.5), (-0.32, 0.34, 1.38), "cloth", bevel=0.05)
    p.ball(0.15, (-0.26, 0.34, 1.78), "paint_dark", squash=0.9)
    p.rod(0.02, (0.25, 0.34, 1.22), (0.05, 0.34, 1.42), "steel")                  # steering column
    p.cyl(0.16, 0.03, (0.04, 0.34, 1.43), "leather", axis="X", segments=12, bevel=0, rot=rot("Y", -35))
    hull = p.finish((0, 0, 0), root)

    wheels = []
    for i, x in enumerate([1.4, -1.35]):
        wheels.append(wheel(f"wheel_L{i + 1}", (x, 0.98, 0.46), 0.46, 0.34, mats, root, LUGS))
        wheels.append(wheel(f"wheel_R{i + 1}", (x, -0.98, 0.46), 0.46, 0.34, mats, root, LUGS))

    # The gun on the cage and its gunner, who turn together.
    gz = 1.77
    p = Part("turret", mats)
    p.cyl(0.2, 0.06, (-0.35, 0, gz), "steel", segments=14)
    p.rod(0.035, (-0.35, 0, gz), (-0.25, 0, gz + 0.3), "steel")
    p.box((0.26, 0.5, 0.46), (-0.72, 0, gz + 0.02), "cloth", bevel=0.06)          # gunner
    p.ball(0.16, (-0.68, 0, gz + 0.42), "paint_dark", squash=0.9)
    for y in (0.24, -0.24):
        p.rod(0.055, (-0.68, y, gz + 0.18), (-0.38, y * 0.5, gz + 0.3), "cloth")
    p.box((0.2, 0.2, 0.16), (-0.2, 0.17, gz + 0.3), "paint_dark", bevel=0.015)    # ammunition box
    gun = p.finish((-0.35, 0, gz), root)
    p = Part("barrel", mats)
    p.box((0.5, 0.1, 0.13), (-0.15, 0, gz + 0.34), "steel", bevel=0.015)
    p.cyl(0.032, 0.85, (0.5, 0, gz + 0.35), "steel", axis="X", segments=8, bevel=0)
    p.cyl(0.045, 0.14, (0.92, 0, gz + 0.35), "steel", axis="X", segments=8, bevel=0)
    barrel = p.finish((-0.15, 0, gz + 0.34), gun)

    return {"root": root, "body": [hull] + wheels, "top": [gun, barrel], "pose": roll_wheels(wheels, LUGS), "mats": mats}


# --------------------------------------------------------------- motorcycle

def build_motorcycle():
    mats = make_materials()
    root = new_root("motorcycle")
    r = 0.34
    p = Part("hull", mats)
    # Frame, tank, seat, engine and exhaust.
    p.box((0.95, 0.2, 0.2), (0.0, 0, 0.58), "steel", bevel=0.03)
    p.box((0.42, 0.34, 0.3), (0.0, 0, 0.42), "steel", bevel=0.05)                 # engine
    p.solid([(0.5, 0.15, 0.72), (0.05, 0.17, 0.7), (0.45, 0.13, 0.95), (0.05, 0.15, 0.9)], "paint", bevel=0.04)   # tank
    p.box((0.62, 0.26, 0.1), (-0.35, 0, 0.8), "leather", bevel=0.03)              # seat
    p.box((0.4, 0.2, 0.06), (-0.78, 0, 0.78), "paint_dark", bevel=0.02, rot=rot("Y", -14))   # rear mudguard
    p.cyl(0.045, 0.75, (-0.45, -0.17, 0.4), "steel", axis="X", segments=8, rot=rot("Y", -8))
    for y in (0.07, -0.07):                                                       # fork
        p.rod(0.028, (0.78, y, r), (0.5, y, 1.02), "steel")
    p.rod(0.025, (0.5, 0.36, 1.06), (0.5, -0.36, 1.06), "steel")                  # handlebar
    p.cyl(0.085, 0.07, (0.62, 0, 0.95), "light", axis="X", segments=10, bevel=0)
    p.box((0.34, 0.16, 0.05), (0.78, 0, 0.74), "paint_dark", bevel=0.02, rot=rot("Y", 12))   # front mudguard
    for y in (0.2, -0.2):                                                         # saddlebags
        p.box((0.34, 0.12, 0.26), (-0.7, y, 0.58), "leather", bevel=0.03)
    # The rider, leaning into the handlebars.
    lean = rot("Y", 24)
    p.box((0.24, 0.4, 0.56), (-0.2, 0, 1.18), "cloth", bevel=0.07, rot=lean)
    p.ball(0.16, (0.0, 0, 1.6), "paint_dark", squash=0.92)
    p.box((0.06, 0.2, 0.07), (0.13, 0, 1.6), "glass", bevel=0.01)                 # goggles
    for y in (0.22, -0.22):
        p.rod(0.055, (-0.08, y, 1.38), (0.46, y * 1.5, 1.08), "cloth")            # arms
        p.rod(0.07, (-0.32, y * 0.8, 0.88), (0.1, y * 1.05, 0.66), "cloth_dark")  # thighs
        p.rod(0.06, (0.1, y * 1.05, 0.66), (-0.05, y * 1.05, 0.3), "cloth_dark")  # shins
        p.box((0.2, 0.09, 0.08), (0.0, y * 1.05, 0.27), "leather", bevel=0.02)    # boots
    p.box((0.14, 0.3, 0.36), (-0.42, 0, 1.2), "cloth_dark", bevel=0.04, rot=lean)   # pack
    p.rod(0.025, (-0.5, 0.12, 0.95), (-0.25, -0.16, 1.65), "steel")               # rifle on the back
    p.box((0.3, 0.05, 0.04), (-0.62, 0, 0.9), "team", bevel=0.01)
    hull = p.finish((0, 0, 0), root)
    wheels = [
        wheel("wheel_F", (0.78, 0, r), r, 0.15, mats, root, 12),
        wheel("wheel_B", (-0.72, 0, r), r, 0.17, mats, root, 12),
    ]
    return {"root": root, "body": [hull] + wheels, "top": [], "pose": roll_wheels(wheels, 12), "mats": mats}


# ------------------------------------------------------------- rocket truck

def build_rocket():
    mats = make_materials()
    root = new_root("rocket")
    p = Part("hull", mats)
    # Chassis rails and the armoured cab over the front axle.
    p.box((7.0, 1.5, 0.3), (-0.1, 0, 0.82), "paint_dark", bevel=0.03)
    p.solid([
        (1.7, 1.12, 0.75), (3.5, 1.12, 0.75), (3.6, 1.05, 1.1),
        (1.7, 1.15, 1.75), (3.45, 1.1, 1.75),
        (1.85, 0.98, 2.3), (2.95, 0.98, 2.3),
    ], "paint", bevel=0.04)
    p.box((0.05, 1.7, 0.42), (3.33, 0, 2.0), "glass", bevel=0.01, rot=rot("Y", 30))   # windscreen
    for y in (1.13, -1.13):
        p.box((0.6, 0.04, 0.34), (2.75, y, 1.98), "glass", bevel=0.008)
        p.box((0.75, 0.05, 0.75), (2.7, y * 1.005, 1.35), "paint_dark", bevel=0.01)    # doors
    p.box((0.18, 2.3, 0.3), (3.62, 0, 0.82), "steel", bevel=0.03)                # bumper
    for y in (0.8, -0.8):
        p.cyl(0.11, 0.08, (3.6, y, 1.25), "light", axis="X", segments=12, bevel=0)
    p.box((0.7, 1.6, 0.05), (2.4, 0, 2.33), "paint_dark", bevel=0.01)            # roof hatch plate
    p.cyl(0.014, 1.3, (1.95, 0.8, 2.9), "steel", segments=6, bevel=0)
    # The bed, its side lockers, the mudguards and the stabiliser legs.
    p.box((4.9, 2.3, 0.14), (-1.2, 0, 1.04), "paint", bevel=0.02)
    for y in (1.05, -1.05):
        p.box((1.2, 0.2, 0.42), (0.75, y, 0.86), "paint_dark", bevel=0.02)
        p.box((2.6, 0.5, 0.06), (-1.9, y * 1.02, 1.13), "paint_dark", bevel=0.01)
        p.box((0.16, 0.16, 0.6), (-3.5, y * 0.9, 0.72), "steel", bevel=0.02)
    p.cyl(0.4, 0.3, (0.75, 0, 1.25), "paint_dark", axis="Y", segments=14)        # fuel tank
    p.cyl(0.95, 0.1, (-1.7, 0, 1.16), "steel", segments=26, bevel=0.01)          # turntable
    hull = p.finish((0, 0, 0), root)

    wheels = []
    for i, x in enumerate([2.55, -1.2, -2.6]):
        wheels.append(wheel(f"wheel_L{i + 1}", (x, 1.1, 0.54), 0.54, 0.4, mats, root, LUGS))
        wheels.append(wheel(f"wheel_R{i + 1}", (x, -1.1, 0.54), 0.54, 0.4, mats, root, LUGS))

    # The launcher: a cradle on the turntable and a box of twelve tubes,
    # raised to fire over the cab.
    pivot = Vector((-1.7, 0, 1.2))
    p = Part("turret", mats)
    p.cyl(0.8, 0.14, pivot + Vector((0, 0, 0.08)), "paint_dark", segments=22)
    for y in (0.78, -0.78):
        p.solid([(-2.3, y - 0.07, 1.3), (-0.9, y - 0.07, 1.3), (-2.0, y - 0.07, 2.1), (-1.5, y - 0.07, 2.1),
                 (-2.3, y + 0.07, 1.3), (-0.9, y + 0.07, 1.3), (-2.0, y + 0.07, 2.1), (-1.5, y + 0.07, 2.1)], "paint", bevel=0.02, mirror=False)
    p.box((0.5, 0.5, 0.45), (-2.55, 0, 1.55), "paint_dark", bevel=0.03)          # hydraulics
    turret = p.finish(tuple(pivot), root)

    raise_ = rot("Y", -17)
    centre = Vector((-1.45, 0, 2.2))
    at = lambda x, y, z: centre + (raise_ @ Vector((x, y, z)))
    p = Part("barrel", mats)
    p.box((3.3, 1.42, 1.05), at(0, 0, 0), "paint", bevel=0.04, rot=raise_)
    p.box((3.34, 1.46, 0.08), at(0, 0, 0), "team", bevel=0.01, rot=raise_)
    for iy in range(4):
        for iz in range(3):
            y, z = (iy - 1.5) * 0.33, (iz - 1) * 0.32
            p.cyl(0.135, 0.1, at(1.66, y, z), "steel", axis="X", segments=12, bevel=0.008, rot=raise_)
            p.cyl(0.1, 0.11, at(1.67, y, z), "rubber", axis="X", segments=10, bevel=0, rot=raise_)
            p.cyl(0.12, 0.06, at(-1.66, y, z), "steel", axis="X", segments=10, bevel=0, rot=raise_)
    barrel = p.finish(tuple(centre), turret)

    return {"root": root, "body": [hull] + wheels, "top": [turret, barrel], "pose": roll_wheels(wheels, LUGS), "mats": mats}


# ------------------------------------------------------------------ soldier

def build_soldier():
    """A rifleman, a little stockier than life so he reads at the size he is
    drawn. His legs are separate objects (leg_L > shin_L, leg_R > shin_R)
    that the walk swings."""
    mats = make_materials()
    root = new_root("soldier")
    hip, knee = 0.92, 0.48

    p = Part("torso", mats)
    p.box((0.3, 0.46, 0.2), (0, 0, hip + 0.06), "cloth_dark", bevel=0.05)        # hips and belt
    p.box((0.32, 0.5, 0.52), (0.02, 0, hip + 0.42), "cloth", bevel=0.08)         # chest
    p.box((0.2, 0.44, 0.34), (0.12, 0, hip + 0.42), "cloth_dark", bevel=0.05)    # vest
    p.box((0.2, 0.38, 0.42), (-0.22, 0, hip + 0.44), "cloth_dark", bevel=0.06)   # pack
    for y in (0.3, -0.3):
        p.ball(0.13, (0.02, y, hip + 0.64), "team")                               # shoulder pads
    p.ball(0.15, (0.04, 0, hip + 0.86), "skin", squash=1.05)                      # head
    p.ball(0.19, (0.02, 0, hip + 0.93), "paint_dark", squash=0.78)                # helmet
    p.cyl(0.2, 0.03, (0.03, 0, hip + 0.89), "paint_dark", segments=14, bevel=0.008)    # its rim
    # The rifle, held across the body pointing ahead, and the arms on it.
    p.box((0.62, 0.07, 0.13), (0.34, -0.14, hip + 0.42), "steel", bevel=0.02)
    p.cyl(0.022, 0.42, (0.84, -0.14, hip + 0.45), "steel", axis="X", segments=6, bevel=0)
    p.box((0.2, 0.06, 0.2), (0.3, -0.14, hip + 0.3), "steel", bevel=0.015, rot=rot("Y", 12))   # magazine
    p.box((0.24, 0.07, 0.16), (-0.02, -0.16, hip + 0.4), "leather", bevel=0.02)                # stock
    p.rod(0.07, (0.02, -0.3, hip + 0.6), (0.14, -0.24, hip + 0.36), "cloth")
    p.rod(0.06, (0.14, -0.24, hip + 0.36), (0.28, -0.16, hip + 0.36), "cloth")
    p.rod(0.07, (0.02, 0.3, hip + 0.6), (0.3, 0.2, hip + 0.42), "cloth")
    p.rod(0.06, (0.3, 0.2, hip + 0.42), (0.56, -0.08, hip + 0.4), "cloth")
    torso = p.finish((0, 0, hip), root)

    legs, shins = [], []
    for name, y in (("L", 0.13), ("R", -0.13)):
        p = Part(f"leg_{name}", mats)
        p.rod(0.1, (0, y, hip), (0, y, knee), "cloth", segments=10)
        p.ball(0.1, (0.02, y, knee), "cloth_dark")
        leg = p.finish((0, y, hip), root)
        p = Part(f"shin_{name}", mats)
        p.rod(0.085, (0, y, knee), (0, y, 0.12), "cloth", segments=10)
        p.box((0.3, 0.14, 0.14), (0.05, y, 0.07), "leather", bevel=0.04)          # boot
        shin = p.finish((0, y, knee), leg)
        legs.append(leg)
        shins.append(shin)

    def pose(k, n):
        if k is None:
            swing = [0, 0]
            bend = [0, 0]
            bob = 0
        else:
            phase = 2 * math.pi * k / n
            swing = [math.sin(phase), -math.sin(phase)]
            bend = [max(0, math.cos(phase)), max(0, -math.cos(phase))]       # the knee bends as the leg comes forward
            bob = abs(math.cos(phase)) * 0.035
        for i in range(2):
            legs[i].rotation_euler.y = -math.radians(34) * swing[i]
            shins[i].rotation_euler.y = math.radians(58) * bend[i]
        torso.location.z = hip - 0.035 + bob
        torso.rotation_euler.y = math.radians(4 if k is not None else 0)
        torso.rotation_euler.z = math.radians(5) * (swing[0] if k is not None else 0)

    pose(None, 8)
    return {"root": root, "body": [torso] + legs + shins, "top": [], "pose": pose, "mats": mats}


# How each unit's sprites are rendered: the side of a frame in pixels and in
# metres, the headings, the rolling or walking steps, and whether there is a
# row for standing still.
SPECS = {
    "tank": dict(build=build_tank, frame_px=160, frame_m=9.6, directions=32, roll_frames=4),
    "buggy": dict(build=build_buggy, frame_px=112, frame_m=6.0, directions=32, roll_frames=4, look_z=0.7),
    "motorcycle": dict(build=build_motorcycle, frame_px=96, frame_m=3.6, directions=32, roll_frames=4, look_z=0.7, icon_m=3.2),
    "rocket": dict(build=build_rocket, frame_px=160, frame_m=9.6, directions=32, roll_frames=4, look_z=1.2),
    "soldier": dict(build=build_soldier, frame_px=80, frame_m=3.2, directions=32, roll_frames=8, stand=True, look_z=0.9, icon_m=2.6),
}
