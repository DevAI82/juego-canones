"""Builds the game's tank in Blender, exports it as GLB and renders its sprites.

Run (from the repo root):
  blender -b --factory-startup -P tools/blender/build_tank.py -- <out_dir> [preview|glb|sprites ...]

  preview  one large picture of the model, to look at        -> <out_dir>/preview.png
  glb      the model for the 3D view                         -> <out_dir>/tank.glb
  sprites  the frames of the 2D game's sprite sheets         -> <out_dir>/hull_*.png, turret_*.png
           (tools/blender/pack_sprites.py puts them together)

The model faces +X, stands on z = 0 and is in metres. Its parts keep their
names in the GLB so the game can move them: tank > hull, wheel_L1..R4,
turret > barrel.
"""
import bpy
import bmesh
import math
import os
import sys
from mathutils import Vector, Matrix

# What the game's sprites are rendered with (pack_sprites.py and the game's
# unitSprites.js use the same numbers).
DIRECTIONS = 32          # headings, clockwise on screen from "facing right"
WHEEL_FRAMES = 4         # steps of the tyres' tread from one lug to the next
FRAME_PX = 160
FRAME_METRES = 9.6       # what a frame's side covers
CAMERA_ELEVATION = 58    # degrees above the ground, as the RTS mode's 3D view
LUGS = 14                # tread blocks round a tyre

WHEEL_X = [2.3, 0.8, -0.9, -2.4]
WHEEL_Y = 1.22
WHEEL_R = 0.56
TURRET_Z = 1.62


# ---------------------------------------------------------------- materials

def material(name, color, rough=0.6, metal=0.0, emit=0.0):
    mat = bpy.data.materials.new(name)
    try:
        mat.use_nodes = True
    except Exception:
        pass
    bsdf = next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = (*color, 1)
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal
    if emit:
        bsdf.inputs["Emission Color"].default_value = (*color, 1)
        bsdf.inputs["Emission Strength"].default_value = emit
    return mat


def make_materials():
    return {
        "paint": material("paint", (0.50, 0.40, 0.24), 0.62, 0.05),
        "paint_dark": material("paint_dark", (0.33, 0.27, 0.17), 0.7, 0.05),
        "team": material("team", (0.42, 0.34, 0.21), 0.55, 0.05),
        "rubber": material("rubber", (0.025, 0.025, 0.028), 0.92),
        "steel": material("steel", (0.10, 0.10, 0.11), 0.42, 0.85),
        "hub": material("hub", (0.30, 0.25, 0.16), 0.6, 0.3),
        "light": material("light", (1.0, 0.86, 0.55), 0.3, 0.0, emit=1.5),
        "glass": material("glass", (0.05, 0.09, 0.11), 0.12, 0.6),
    }


def weather(mats):
    """Dirt and wear on the paint, for the renders only (a GLB cannot carry
    procedural textures, so it is exported before this)."""
    for name in ("paint", "paint_dark", "team", "hub"):
        mat = mats[name]
        nt = mat.node_tree
        bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
        base = tuple(bsdf.inputs["Base Color"].default_value)
        coord = nt.nodes.new("ShaderNodeTexCoord")
        big = nt.nodes.new("ShaderNodeTexNoise")
        big.inputs["Scale"].default_value = 1.6
        big.inputs["Detail"].default_value = 8
        big.inputs["Roughness"].default_value = 0.65
        ramp = nt.nodes.new("ShaderNodeValToRGB")
        ramp.color_ramp.elements[0].position = 0.38
        ramp.color_ramp.elements[0].color = (base[0] * 0.42, base[1] * 0.4, base[2] * 0.38, 1)
        ramp.color_ramp.elements[1].position = 0.68
        ramp.color_ramp.elements[1].color = (base[0] * 1.12, base[1] * 1.1, base[2] * 1.05, 1)
        fine = nt.nodes.new("ShaderNodeTexNoise")
        fine.inputs["Scale"].default_value = 22
        fine.inputs["Detail"].default_value = 4
        bump = nt.nodes.new("ShaderNodeBump")
        bump.inputs["Strength"].default_value = 0.12
        nt.links.new(coord.outputs["Object"], big.inputs["Vector"])
        nt.links.new(coord.outputs["Object"], fine.inputs["Vector"])
        nt.links.new(big.outputs[0], ramp.inputs["Fac"])
        nt.links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])
        nt.links.new(fine.outputs[0], bump.inputs["Height"])
        nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])


# ------------------------------------------------------------------ meshes

class Part:
    """One object's mesh, put together from simple solids."""

    def __init__(self, name, mats):
        self.name = name
        self.mats = mats
        self.slots = []
        self.bm = bmesh.new()

    def _slot(self, mat):
        if mat not in self.slots:
            self.slots.append(mat)
        return self.slots.index(mat)

    def _take(self, piece, mat, bevel):
        if bevel:
            sharp = [e for e in piece.edges if len(e.link_faces) == 2 and e.calc_face_angle(0) > math.radians(25)]
            bmesh.ops.bevel(piece, geom=sharp, offset=bevel, segments=2, profile=0.5, affect="EDGES")
        slot = self._slot(mat)
        for f in piece.faces:
            f.material_index = slot
        mesh = bpy.data.meshes.new("piece")
        piece.to_mesh(mesh)
        piece.free()
        self.bm.from_mesh(mesh)
        bpy.data.meshes.remove(mesh)

    def solid(self, half_points, mat, bevel=0.03):
        """The convex solid round these points and their mirror images in y."""
        piece = bmesh.new()
        for x, y, z in half_points:
            piece.verts.new((x, y, z))
            if abs(y) > 1e-6:
                piece.verts.new((x, -y, z))
        hull = bmesh.ops.convex_hull(piece, input=piece.verts)
        junk = [g for g in hull.get("geom_interior", []) + hull.get("geom_unused", []) if isinstance(g, bmesh.types.BMVert)]
        if junk:
            bmesh.ops.delete(piece, geom=junk, context="VERTS")
        bmesh.ops.recalc_face_normals(piece, faces=piece.faces)
        self._take(piece, mat, bevel)

    def box(self, size, at, mat, bevel=0.015, rot=None):
        piece = bmesh.new()
        m = Matrix.Translation(at) @ (rot or Matrix.Identity(4)) @ Matrix.Diagonal((*size, 1))
        bmesh.ops.create_cube(piece, size=1, matrix=m)
        self._take(piece, mat, bevel)

    def cyl(self, r, length, at, mat, axis="Z", r2=None, segments=20, bevel=0.012):
        piece = bmesh.new()
        turn = {"Z": Matrix.Identity(4), "X": Matrix.Rotation(math.pi / 2, 4, "Y"), "Y": Matrix.Rotation(-math.pi / 2, 4, "X")}[axis]
        bmesh.ops.create_cone(piece, cap_ends=True, segments=segments, radius1=r, radius2=r if r2 is None else r2,
                              depth=length, matrix=Matrix.Translation(at) @ turn)
        self._take(piece, mat, bevel)

    def finish(self, origin=(0, 0, 0), parent=None):
        bm = self.bm
        for f in bm.faces:
            f.smooth = True
        for e in bm.edges:
            e.smooth = not (len(e.link_faces) == 2 and e.calc_face_angle(0) > math.radians(42))
        bmesh.ops.translate(bm, verts=bm.verts, vec=-Vector(origin))
        mesh = bpy.data.meshes.new(self.name)
        bm.to_mesh(mesh)
        bm.free()
        for name in self.slots:
            mesh.materials.append(self.mats[name])
        ob = bpy.data.objects.new(self.name, mesh)
        bpy.context.scene.collection.objects.link(ob)
        ob.location = Vector(origin) - (parent.matrix_world.translation if parent else Vector())
        if parent:
            ob.parent = parent
        bpy.context.view_layer.update()
        return ob


def build_hull(mats, root):
    p = Part("hull", mats)
    # The armoured body: a boat-shaped lower hull, a belt and a sloped deck.
    p.solid([
        (-3.15, 0.84, 0.48), (2.95, 0.84, 0.48), (3.3, 0.78, 0.66),
        (-3.45, 1.18, 0.98), (3.05, 1.18, 0.98), (3.55, 0.84, 1.0),
        (-3.45, 1.18, 1.24), (2.9, 1.18, 1.24),
        (-3.2, 0.94, 1.6), (2.0, 0.94, 1.6),
    ], "paint", bevel=0.035)
    # Mudguards over the wheels.
    for y in (1.3, -1.3):
        p.box((6.5, 0.3, 0.05), (-0.1, y, 1.2), "paint_dark")
    # Engine deck at the back: a raised cover with two grilles.
    p.box((1.7, 1.6, 0.07), (-2.25, 0, 1.63), "paint_dark", bevel=0.02)
    for y in (0.42, -0.42):
        p.box((1.3, 0.6, 0.05), (-2.25, y, 1.68), "steel", bevel=0.008)
        for i in range(6):
            p.box((0.06, 0.56, 0.03), (-2.8 + i * 0.22, y, 1.715), "paint_dark", bevel=0)
    # Driver's and commander's hatches at the front, with their periscopes.
    for y in (0.48, -0.48):
        p.cyl(0.3, 0.06, (1.45, y, 1.63), "paint_dark", segments=16)
        p.box((0.1, 0.26, 0.07), (1.85, y, 1.65), "glass", bevel=0.008)
    # Stowage boxes along the sides.
    for y in (1.12, -1.12):
        p.box((1.0, 0.2, 0.26), (-1.55, y, 1.4), "paint_dark", bevel=0.02)
        p.box((0.75, 0.18, 0.22), (0.35, y, 1.4), "paint_dark", bevel=0.02)
    # Headlights, tow hooks and the bow plate's trim vane.
    for y in (0.62, -0.62):
        p.cyl(0.09, 0.08, (3.28, y, 1.12), "light", axis="X", segments=12, bevel=0)
        p.box((0.14, 0.08, 0.12), (3.38, y * 0.55, 0.78), "steel", bevel=0.01)
    p.box((0.05, 1.5, 0.3), (2.72, 0, 1.47), "paint_dark", bevel=0.01, rot=Matrix.Rotation(math.radians(-25), 4, "Y"))
    # Exhaust along the right side, and tail lights.
    p.cyl(0.085, 1.3, (-2.3, -1.2, 1.33), "steel", axis="X", segments=12)
    for y in (0.9, -0.9):
        p.box((0.05, 0.16, 0.1), (-3.47, y, 1.12), "light", bevel=0)
    # The ring the turret turns on.
    p.cyl(0.92, 0.07, (0, 0, 1.62), "steel", segments=28, bevel=0.01)
    return p.finish((0, 0, 0), root)


def build_wheel(name, x, y, mats, root):
    p = Part(name, mats)
    side = 1 if y > 0 else -1
    p.cyl(WHEEL_R - 0.035, 0.4, (0, 0, 0), "rubber", axis="Y", segments=28, bevel=0.035)
    for i in range(LUGS):
        a = i * 2 * math.pi / LUGS
        rot = Matrix.Rotation(a, 4, "Y")
        at = rot @ Vector((WHEEL_R - 0.03, 0, 0))
        p.box((0.075, 0.42, 0.13), at, "rubber", bevel=0.012, rot=rot)
    p.cyl(0.3, 0.06, (0, side * 0.19, 0), "hub", axis="Y", segments=16)
    p.cyl(0.12, 0.08, (0, side * 0.23, 0), "steel", axis="Y", segments=10)
    for i in range(6):
        a = i * math.pi / 3
        p.cyl(0.028, 0.03, (0.21 * math.cos(a), side * 0.225, 0.21 * math.sin(a)), "steel", axis="Y", segments=6, bevel=0)
    ob = p.finish((0, 0, 0), None)
    ob.location = (x, y, WHEEL_R)
    ob.parent = root
    return ob


def build_turret(mats, root):
    p = Part("turret", mats)
    z = TURRET_Z + 0.06
    p.solid([
        (-1.0, 0.72, z), (0.55, 0.8, z), (1.12, 0.42, z),
        (-1.05, 0.66, z + 0.22), (0.62, 0.76, z + 0.22), (1.2, 0.36, z + 0.24),
        (-0.82, 0.5, z + 0.56), (0.42, 0.56, z + 0.56), (0.82, 0.3, z + 0.52),
    ], "paint", bevel=0.03)
    # A band in the side's colour round the back of the turret.
    p.solid([(-1.09, 0.69, z + 0.1), (-0.6, 0.76, z + 0.1), (-1.09, 0.67, z + 0.3), (-0.6, 0.74, z + 0.3)], "team", bevel=0.01)
    # Commander's cupola and the gunner's hatch.
    p.cyl(0.27, 0.14, (-0.3, 0.26, z + 0.6), "paint_dark", segments=16)
    p.cyl(0.2, 0.04, (-0.3, 0.26, z + 0.69), "steel", segments=12, bevel=0.008)
    p.cyl(0.22, 0.05, (-0.25, -0.28, z + 0.58), "paint_dark", segments=14)
    # Sight box, smoke launchers, stowage basket and antenna.
    p.box((0.28, 0.22, 0.18), (0.4, -0.3, z + 0.62), "paint_dark", bevel=0.015)
    p.box((0.03, 0.16, 0.1), (0.545, -0.3, z + 0.63), "glass", bevel=0)
    for side in (1, -1):
        for i in range(3):
            p.cyl(0.05, 0.22, (0.5 - i * 0.13, side * 0.83, z + 0.3), "steel", axis="X", segments=8, bevel=0.006)
    p.box((0.32, 1.1, 0.26), (-1.25, 0, z + 0.2), "paint_dark", bevel=0.02)
    p.cyl(0.014, 1.5, (-0.85, -0.4, z + 1.3), "steel", segments=6, bevel=0)
    # Machine gun on the cupola.
    p.box((0.5, 0.06, 0.08), (0.02, 0.26, z + 0.8), "steel", bevel=0.008)
    p.cyl(0.02, 0.5, (0.5, 0.26, z + 0.81), "steel", axis="X", segments=6, bevel=0)
    return p.finish((0, 0, TURRET_Z), root)


def build_barrel(mats, turret):
    p = Part("barrel", mats)
    z = TURRET_Z + 0.33
    p.box((0.34, 0.5, 0.36), (1.12, 0, z), "paint_dark", bevel=0.03)          # mantlet
    p.cyl(0.13, 0.75, (1.6, 0, z), "paint", axis="X", segments=14)             # sleeve
    p.cyl(0.085, 2.3, (2.75, 0, z), "steel", axis="X", segments=14, bevel=0.006)
    p.cyl(0.115, 0.3, (2.55, 0, z), "paint", axis="X", segments=14)            # fume extractor
    p.cyl(0.125, 0.36, (3.86, 0, z), "steel", axis="X", segments=14)           # muzzle brake
    p.box((0.2, 0.3, 0.07), (3.86, 0, z), "rubber", bevel=0)
    return p.finish((1.0, 0, z), turret)


def build_tank():
    mats = make_materials()
    root = bpy.data.objects.new("tank", None)
    bpy.context.scene.collection.objects.link(root)
    hull = build_hull(mats, root)
    wheels = []
    for i, x in enumerate(WHEEL_X):
        wheels.append(build_wheel(f"wheel_L{i + 1}", x, WHEEL_Y, mats, root))
        wheels.append(build_wheel(f"wheel_R{i + 1}", x, -WHEEL_Y, mats, root))
    turret = build_turret(mats, root)
    barrel = build_barrel(mats, turret)
    bpy.context.view_layer.update()
    return {"root": root, "hull": hull, "wheels": wheels, "turret": turret, "barrel": barrel, "mats": mats}


# ----------------------------------------------------------------- renders

def setup_scene(size_x, size_y, samples):
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.samples = samples
    scene.cycles.use_denoising = False
    scene.cycles.max_bounces = 4
    scene.render.film_transparent = True
    scene.render.resolution_x = size_x
    scene.render.resolution_y = size_y
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.use_persistent_data = True
    scene.view_settings.view_transform = "Standard"
    world = bpy.data.worlds.new("sky")
    try:
        world.use_nodes = True
    except Exception:
        pass
    bg = next(n for n in world.node_tree.nodes if n.type == "BACKGROUND")
    bg.inputs["Color"].default_value = (0.62, 0.72, 0.9, 1)
    bg.inputs["Strength"].default_value = 0.5
    scene.world = world
    # The maps' shadows fall down and to the left: the sun is up and to the right.
    sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
    sun.data.energy = 3.4
    sun.data.angle = math.radians(6)
    sun.rotation_euler = Vector((-0.55, -0.5, -0.8)).to_track_quat("-Z", "Y").to_euler()
    scene.collection.objects.link(sun)
    return scene


def add_ground():
    mesh = bpy.data.meshes.new("ground")
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=30)
    bm.to_mesh(mesh)
    bm.free()
    ground = bpy.data.objects.new("ground", mesh)
    bpy.context.scene.collection.objects.link(ground)
    ground.is_shadow_catcher = True
    return ground


def add_camera(ortho_metres=None, elevation=CAMERA_ELEVATION, azimuth=-90, distance=40, target=(0, 0, 0), lens=70):
    cam = bpy.data.objects.new("camera", bpy.data.cameras.new("camera"))
    bpy.context.scene.collection.objects.link(cam)
    el, az = math.radians(elevation), math.radians(azimuth)
    offset = Vector((math.cos(az) * math.cos(el), math.sin(az) * math.cos(el), math.sin(el))) * distance
    cam.location = Vector(target) + offset
    cam.rotation_euler = (-offset).to_track_quat("-Z", "Y").to_euler()
    if ortho_metres:
        cam.data.type = "ORTHO"
        cam.data.ortho_scale = ortho_metres
    else:
        cam.data.lens = lens
    cam.data.clip_end = 200
    bpy.context.scene.camera = cam
    return cam


def render(path):
    bpy.context.scene.render.filepath = path
    bpy.ops.render.render(write_still=True)


def do_preview(tank, out):
    setup_scene(1400, 900, 160)
    add_ground()
    weather(tank["mats"])
    tank["turret"].rotation_euler.z = math.radians(22)
    add_camera(elevation=27, azimuth=-52, distance=17, target=(0, 0, 0.9), lens=62)
    render(os.path.join(out, "preview.png"))
    tank["turret"].rotation_euler.z = 0


def do_glb(tank, out):
    bpy.ops.export_scene.gltf(filepath=os.path.join(out, "tank.glb"), export_format="GLB", export_apply=True, export_yup=True)


def do_sprites(tank, out):
    setup_scene(FRAME_PX, FRAME_PX, 144)
    ground = add_ground()
    weather(tank["mats"])
    add_camera(ortho_metres=FRAME_METRES)
    root, turret, barrel = tank["root"], tank["turret"], tank["barrel"]
    # The hull: the turret leaves its shadow on it but is not in the picture.
    for ob in (turret, barrel):
        ob.visible_camera = False
    for w in range(WHEEL_FRAMES):
        for wheel in tank["wheels"]:
            wheel.rotation_euler.y = w * (2 * math.pi / LUGS) / WHEEL_FRAMES
        for d in range(DIRECTIONS):
            root.rotation_euler.z = -d * 2 * math.pi / DIRECTIONS
            render(os.path.join(out, f"hull_{w}_{d:02d}.png"))
    # The turret, on its own.
    for ob in (turret, barrel):
        ob.visible_camera = True
    for ob in [tank["hull"], ground] + tank["wheels"]:
        ob.hide_render = True
    for d in range(DIRECTIONS):
        root.rotation_euler.z = -d * 2 * math.pi / DIRECTIONS
        render(os.path.join(out, f"turret_{d:02d}.png"))


def main():
    args = sys.argv[sys.argv.index("--") + 1:]
    out, jobs = os.path.abspath(args[0]), args[1:] or ["preview"]
    os.makedirs(out, exist_ok=True)
    for ob in list(bpy.data.objects):
        bpy.data.objects.remove(ob)
    tank = build_tank()
    if "glb" in jobs:
        do_glb(tank, out)
    if "preview" in jobs:
        do_preview(tank, out)
    elif "sprites" in jobs:
        do_sprites(tank, out)


main()
