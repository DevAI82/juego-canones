"""What every model of the game is built and rendered with in Blender.

Models face +X, stand on z = 0 and are in metres. A builder returns a dict:
  root      the empty everything hangs from
  body      the objects of the hull layer (wheels and legs included)
  top       the objects of the turret layer, or [] (the first one turns)
  pose      pose(k, n): put the model in step k of n of its rolling or
            walking; pose(None, n): standing still
  mats      its materials, by name
"""
import bpy
import bmesh
import math
import os
from mathutils import Vector, Matrix

CAMERA_ELEVATION = 58    # degrees above the ground, as the RTS mode's 3D view


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


# The desert army's colours. "team" is what the 3D view repaints in each
# side's colour; in the sprites it stays a shade of the paint.
SAND = {
    "paint": ((0.50, 0.40, 0.24), 0.62, 0.05),
    "paint_dark": ((0.33, 0.27, 0.17), 0.7, 0.05),
    "team": ((0.42, 0.34, 0.21), 0.55, 0.05),
    "rubber": ((0.025, 0.025, 0.028), 0.92, 0.0),
    "steel": ((0.10, 0.10, 0.11), 0.42, 0.85),
    "hub": ((0.30, 0.25, 0.16), 0.6, 0.3),
    "glass": ((0.05, 0.09, 0.11), 0.12, 0.6),
    "cloth": ((0.46, 0.39, 0.26), 0.9, 0.0),
    "cloth_dark": ((0.27, 0.24, 0.17), 0.9, 0.0),
    "skin": ((0.55, 0.36, 0.26), 0.7, 0.0),
    "leather": ((0.09, 0.07, 0.05), 0.75, 0.0),
}
WEATHERED = ("paint", "paint_dark", "team", "hub", "cloth", "cloth_dark")


def make_materials(palette=SAND, extra=None, lights=None):
    colors = dict(palette)
    colors.update(extra or {})
    mats = {name: material(name, c, r, m) for name, (c, r, m) in colors.items()}
    for name, (color, strength) in (lights or {"light": ((1.0, 0.86, 0.55), 1.5)}).items():
        mats[name] = material(name, color, 0.3, 0.0, emit=strength)
    return mats


def weather(mats, names=WEATHERED, strength=1.0):
    """Dirt and wear on the paint, for the renders only (a GLB cannot carry
    procedural textures, so it is exported before this)."""
    for name in names:
        mat = mats.get(name)
        if not mat:
            continue
        nt = mat.node_tree
        bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
        base = tuple(bsdf.inputs["Base Color"].default_value)
        dark = 1 - 0.58 * strength
        coord = nt.nodes.new("ShaderNodeTexCoord")
        big = nt.nodes.new("ShaderNodeTexNoise")
        big.inputs["Scale"].default_value = 1.6
        big.inputs["Detail"].default_value = 8
        big.inputs["Roughness"].default_value = 0.65
        ramp = nt.nodes.new("ShaderNodeValToRGB")
        ramp.color_ramp.elements[0].position = 0.38
        ramp.color_ramp.elements[0].color = (base[0] * dark, base[1] * dark * 0.96, base[2] * dark * 0.92, 1)
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

def rot(axis, degrees):
    return Matrix.Rotation(math.radians(degrees), 4, axis)


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

    def solid(self, half_points, mat, bevel=0.03, mirror=True):
        """The convex solid round these points (and, unless mirror is off,
        their mirror images in y)."""
        piece = bmesh.new()
        for x, y, z in half_points:
            piece.verts.new((x, y, z))
            if mirror and abs(y) > 1e-6:
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

    def cyl(self, r, length, at, mat, axis="Z", r2=None, segments=20, bevel=0.012, rot=None):
        piece = bmesh.new()
        turn = {"Z": Matrix.Identity(4), "X": Matrix.Rotation(math.pi / 2, 4, "Y"), "Y": Matrix.Rotation(-math.pi / 2, 4, "X")}[axis]
        m = Matrix.Translation(at) @ (rot or Matrix.Identity(4)) @ turn
        bmesh.ops.create_cone(piece, cap_ends=True, segments=segments, radius1=r, radius2=r if r2 is None else r2, depth=length, matrix=m)
        self._take(piece, mat, bevel)

    def rod(self, r, a, b, mat, segments=8):
        """A thin bar from point a to point b."""
        a, b = Vector(a), Vector(b)
        d = b - a
        piece = bmesh.new()
        m = Matrix.Translation((a + b) / 2) @ d.to_track_quat("Z", "Y").to_matrix().to_4x4()
        bmesh.ops.create_cone(piece, cap_ends=True, segments=segments, radius1=r, radius2=r, depth=d.length, matrix=m)
        self._take(piece, mat, 0)

    def ball(self, r, at, mat, squash=1.0, segments=14):
        piece = bmesh.new()
        m = Matrix.Translation(at) @ Matrix.Diagonal((1, 1, squash, 1))
        bmesh.ops.create_uvsphere(piece, u_segments=segments, v_segments=segments // 2, radius=r, matrix=m)
        self._take(piece, mat, 0)

    def finish(self, origin=(0, 0, 0), parent=None):
        """The object, with its origin (what it turns about) at `origin`."""
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
        bpy.context.view_layer.update()
        ob.location = Vector(origin) - (parent.matrix_world.translation if parent else Vector())
        if parent:
            ob.parent = parent
        bpy.context.view_layer.update()
        return ob


def new_root(name):
    root = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(root)
    return root


def wheel(name, at, radius, width, mats, root, lugs=14, hub="hub"):
    """A tyre with tread blocks and a hub on its outer side, turning about y."""
    x, y, z = at
    p = Part(name, mats)
    side = 1 if y >= 0 else -1
    k = radius / 0.56
    p.cyl(radius - 0.035 * k, width * 0.95, (0, 0, 0), "rubber", axis="Y", segments=24, bevel=0.03 * k)
    for i in range(lugs):
        turn = Matrix.Rotation(i * 2 * math.pi / lugs, 4, "Y")
        p.box((0.075 * k, width, 0.13 * k), turn @ Vector((radius - 0.03 * k, 0, 0)), "rubber", bevel=0.01 * k, rot=turn)
    sides = (side,) if abs(y) > 1e-6 else (1, -1)
    for s in sides:
        p.cyl(radius * 0.54, 0.06 * k, (0, s * width * 0.46, 0), hub, axis="Y", segments=14, bevel=0.008)
        p.cyl(radius * 0.2, 0.08 * k, (0, s * width * 0.5, 0), "steel", axis="Y", segments=8, bevel=0.006)
        for i in range(5):
            a = i * 2 * math.pi / 5
            p.cyl(0.03 * k, 0.03, (radius * 0.37 * math.cos(a), s * width * 0.5, radius * 0.37 * math.sin(a)), "steel", axis="Y", segments=6, bevel=0)
    ob = p.finish((0, 0, 0), None)
    ob.location = (x, y, z)
    ob.parent = root
    return ob


def roll_wheels(wheels, lugs=14):
    """A pose function: the wheels a step further round, from one tread
    block to the next over the n steps."""
    def pose(k, n):
        for w in wheels:
            w.rotation_euler.y = (k or 0) * (2 * math.pi / lugs) / n
    return pose


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
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=40)
    bm.to_mesh(mesh)
    bm.free()
    ground = bpy.data.objects.new("ground", mesh)
    bpy.context.scene.collection.objects.link(ground)
    ground.is_shadow_catcher = True
    return ground


def add_camera(ortho_metres=None, elevation=CAMERA_ELEVATION, azimuth=-90, distance=60, target=(0, 0, 0), lens=70):
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
    cam.data.clip_end = 400
    bpy.context.scene.camera = cam
    return cam


def render(path):
    bpy.context.scene.render.filepath = path
    bpy.ops.render.render(write_still=True)


def do_preview(model, spec, out, name):
    """One large picture of the model, to look at."""
    setup_scene(1200, 800, 128)
    add_ground()
    weather(model["mats"], strength=spec.get("weather", 1.0))
    if model["top"]:
        model["top"][0].rotation_euler.z = math.radians(22)
    model["pose"](1, 8) if spec.get("stand") else None
    size = spec["frame_m"]
    add_camera(elevation=27, azimuth=-52, distance=size * 1.75, target=(0, 0, spec.get("look_z", size * 0.1)), lens=62)
    render(os.path.join(out, f"{name}_preview.png"))


def do_icon(model, spec, out, name):
    """The unit's picture for the shop and the sidebar."""
    setup_scene(256, 256, 160)
    add_ground()
    weather(model["mats"], strength=spec.get("weather", 1.0))
    if model["top"]:
        model["top"][0].rotation_euler.z = math.radians(18)
    size = spec["frame_m"]
    add_camera(ortho_metres=spec.get("icon_m", size * 0.86), elevation=30, azimuth=-58, target=(0, 0, spec.get("look_z", size * 0.1)))
    render(os.path.join(out, f"{name}_icon.png"))


def do_glb(model, out, name):
    bpy.ops.export_scene.gltf(filepath=os.path.join(out, f"{name}.glb"), export_format="GLB", export_apply=True, export_yup=True)


def do_sprites(model, spec, out, name):
    """The frames of the sprite sheets: <name>_hull_<row>_<dir>.png, with a
    row for standing still (if the unit has one) and one per rolling or
    walking step, and <name>_turret_<dir>.png."""
    setup_scene(spec["frame_px"], spec["frame_px"], 144)
    ground = add_ground()
    weather(model["mats"], strength=spec.get("weather", 1.0))
    add_camera(ortho_metres=spec["frame_m"])
    root, top, directions, steps = model["root"], model["top"], spec["directions"], spec["roll_frames"]
    # The hull: the turret leaves its shadow on it but is not in the picture.
    for ob in top:
        ob.visible_camera = False
    rows = ([None] if spec.get("stand") else []) + list(range(steps))
    for row, k in enumerate(rows):
        model["pose"](k, steps)
        for d in range(directions):
            root.rotation_euler.z = -d * 2 * math.pi / directions
            render(os.path.join(out, f"{name}_hull_{row:02d}_{d:02d}.png"))
    if not top:
        return
    # The turret, on its own.
    for ob in top:
        ob.visible_camera = True
    for ob in [ground] + model["body"]:
        ob.hide_render = True
    for d in range(directions):
        root.rotation_euler.z = -d * 2 * math.pi / directions
        render(os.path.join(out, f"{name}_turret_{d:02d}.png"))
