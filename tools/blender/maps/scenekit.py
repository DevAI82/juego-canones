"""What the maps' Blender builders share: a Scene that turns a layout.json
into models standing on the painted ground and renders the game's pictures.

One Blender unit is one world px; the game's y runs down the picture, so
Blender's Y is height - y. The camera looks down at 58 degrees from the
south, like the units' sprites, and the picture is stretched back so the
ground keeps the game's own coordinates.
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
import kit
from kit import rot, CAMERA_ELEVATION

COLORS = {
    "stone": (0.47, 0.44, 0.38), "stone_dark": (0.3, 0.28, 0.25),
    "plaster": (0.62, 0.56, 0.46), "brick": (0.43, 0.23, 0.16), "concrete": (0.48, 0.47, 0.45),
    "rubble": (0.4, 0.37, 0.33), "trunk": (0.2, 0.14, 0.09),
    "leaf_dark": (0.08, 0.16, 0.05), "leaf": (0.13, 0.22, 0.07), "leaf_light": (0.2, 0.28, 0.09),
    "hedge": (0.07, 0.17, 0.05), "rust": (0.2, 0.11, 0.07), "soot": (0.05, 0.045, 0.04),
    "wood": (0.33, 0.24, 0.15), "wood_dark": (0.2, 0.14, 0.09), "roof": (0.33, 0.14, 0.1),
    "flag": (0.7, 0.5, 0.08), "sandbag": (0.5, 0.43, 0.3), "canvas": (0.27, 0.3, 0.17),
    "rock": (0.38, 0.37, 0.35), "olive": (0.22, 0.25, 0.13), "hazard": (0.7, 0.5, 0.06),
    "glass": (0.1, 0.16, 0.2), "white": (0.72, 0.72, 0.68), "red": (0.5, 0.08, 0.06),
    "roofing": (0.17, 0.17, 0.18), "glass_tower": (0.2, 0.29, 0.37),
}


class Scene:
    def __init__(self, directory, plain=False, seed=7):
        self.dir = os.path.abspath(directory)
        self.layout = json.load(open(os.path.join(self.dir, "layout.json")))
        self.W, self.H = self.layout["width"], self.layout["height"]
        self.plain = plain          # for the browser's model: no bevels, coarse balls, flat colours
        self.rng = random.Random(seed)
        for ob in list(bpy.data.objects):
            bpy.data.objects.remove(ob)
        self.mats = {name: self.paint(name, c) for name, c in COLORS.items()}
        self.mats["metal"] = self.paint("metal", (0.16, 0.16, 0.17), rough=0.5, metal=0.7)
        self.objects = []           # what stands on the ground
        self.only_front = []        # what is only in the picture drawn over the units
        scene_self = self

        class Part(kit.Part):
            def _take(self, piece, mat, bevel):
                super()._take(piece, mat, 0 if scene_self.plain else bevel)

            def ball(self, r, at, mat, squash=1.0, segments=14):
                super().ball(r, at, mat, squash, 6 if scene_self.plain else segments)

            def cyl(self, r, length, at, mat, axis="Z", r2=None, segments=20, bevel=0.012, rot=None):
                super().cyl(r, length, at, mat, axis, r2, min(segments, 8) if scene_self.plain else segments, bevel, rot)

        self.Part = Part

    # ---------------------------------------------------------- basics

    def at(self, x, y, z=0.0):
        """A place in the game's coordinates, in Blender's."""
        return Vector((x, self.H - y, z))

    @staticmethod
    def heading(ax, ay, bx, by):
        """The turn about Z, in degrees, of the line from a to b (game coordinates)."""
        return math.degrees(math.atan2(-(by - ay), bx - ax))

    def part(self, name):
        return self.Part(name, self.mats)

    def done(self, part, front_only=False):
        ob = part.finish((0, 0, 0), None)
        (self.only_front if front_only else self.objects).append(ob)
        return ob

    def paint(self, name, color, rough=0.85, grain=0.07, blotch=0.38, metal=0.0):
        """A matt, weathered surface: its colour mottled by large blotches
        and fine grain, in the world's own coordinates (px)."""
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
        if self.plain:
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

    def wall(self, p, ax, ay, bx, by, thick, z0, z1, mat, bevel=0.0, lengthen=0.0):
        """A straight length of wall from a to b (game coordinates)."""
        length = math.hypot(bx - ax, by - ay) + lengthen
        turn = rot("Z", self.heading(ax, ay, bx, by))
        p.box((length, thick, z1 - z0), self.at((ax + bx) / 2, (ay + by) / 2, (z0 + z1) / 2), mat, bevel=bevel, rot=turn)

    # ---------------------------------------------------------- ground

    def ground(self):
        mat = bpy.data.materials.new("ground")
        try:
            mat.use_nodes = True
        except Exception:
            pass
        nt = mat.node_tree
        bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
        bsdf.inputs["Roughness"].default_value = 0.92
        color = nt.nodes.new("ShaderNodeTexImage")
        color.image = bpy.data.images.load(os.path.join(self.dir, "ground_color.png"))
        color.extension = "EXTEND"
        relief = nt.nodes.new("ShaderNodeTexImage")
        relief.image = bpy.data.images.load(os.path.join(self.dir, "ground_height.png"))
        relief.image.colorspace_settings.name = "Non-Color"
        relief.extension = "EXTEND"
        bump = nt.nodes.new("ShaderNodeBump")
        bump.inputs["Strength"].default_value = 1.0
        bump.inputs["Distance"].default_value = 70.0
        nt.links.new(color.outputs["Color"], bsdf.inputs["Base Color"])
        nt.links.new(relief.outputs["Color"], bump.inputs["Height"])
        nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
        mesh = bpy.data.meshes.new("ground")
        bm = bmesh.new()
        pad = 400
        quad = [(-pad, -pad), (self.W + pad, -pad), (self.W + pad, self.H + pad), (-pad, self.H + pad)]
        face = bm.faces.new([bm.verts.new((x, y, 0)) for x, y in quad])
        uv = bm.loops.layers.uv.new("uv")
        for loop, (x, y) in zip(face.loops, quad):
            loop[uv].uv = (x / self.W, y / self.H)
        bm.to_mesh(mesh)
        bm.free()
        mesh.materials.append(mat)
        self.ground_object = bpy.data.objects.new("ground", mesh)
        bpy.context.scene.collection.objects.link(self.ground_object)
        self.flat = [self.ground_object]      # what the foreground picture leaves out

    def water(self, polygons, level=0.15):
        """Sheets of water over these polygons (game coordinates)."""
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
        mesh = bpy.data.meshes.new("water")
        bm = bmesh.new()
        for poly in polygons:
            face = bm.faces.new([bm.verts.new(self.at(q["x"], q["y"], level)) for q in poly])
            if face.normal.z < 0:
                face.normal_flip()
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        for f in bm.faces:
            if f.normal.z < 0:
                f.normal_flip()
        bm.to_mesh(mesh)
        bm.free()
        mesh.materials.append(mat)
        ob = bpy.data.objects.new("water", mesh)
        bpy.context.scene.collection.objects.link(ob)
        self.flat.append(ob)
        return ob

    # ----------------------------------------------------- things to stand

    def trees(self, trees, bushes=()):
        p, rng = self.part("trees"), self.rng
        for t in trees:
            x, y, r, h = t["x"], t["y"], t["r"], t["h"]
            tint = t.get("tint", 1.0)
            leaf = "leaf_dark" if tint < 0.92 else "leaf_light" if tint > 1.05 else "leaf"
            if t["kind"] == "dead":
                p.cyl(1.6, h * 0.75, self.at(x, y, h * 0.375), "trunk", segments=6, bevel=0, r2=0.8)
                for _ in range(4):
                    a, lift = rng.uniform(0, 6.28), rng.uniform(0.35, 0.7) * h
                    reach = rng.uniform(5, 10)
                    p.rod(0.5, self.at(x, y, lift), self.at(x + reach * math.cos(a), y + reach * math.sin(a), lift + rng.uniform(3, 8)), "trunk", segments=4)
            elif t["kind"] == "pine":
                p.cyl(1.5, h * 0.4, self.at(x, y, h * 0.2), "trunk", segments=6, bevel=0)
                for k in range(3):
                    p.cyl(r * (1.0 - k * 0.24), h * 0.36, self.at(x, y, h * (0.42 + k * 0.22)), "leaf_dark" if k < 2 else leaf, segments=9, bevel=0, r2=r * 0.12)
            else:
                p.cyl(1.9, h * 0.55, self.at(x, y, h * 0.275), "trunk", segments=6, bevel=0, r2=1.3)
                p.ball(r * 0.78, self.at(x, y, h * 0.72), leaf, squash=0.8, segments=10)
                for _ in range(5):
                    a, d = rng.uniform(0, 6.28), rng.uniform(0.35, 0.6) * r
                    p.ball(r * rng.uniform(0.42, 0.6), self.at(x + d * math.cos(a), y + d * math.sin(a), h * rng.uniform(0.55, 0.85)),
                           rng.choice([leaf, leaf, "leaf_dark", "leaf_light"]), squash=0.85, segments=8)
        for b in bushes:
            p.ball(b["r"], self.at(b["x"], b["y"], b["r"] * 0.55), rng.choice(["leaf", "leaf_dark", "hedge"]), squash=0.75, segments=7)
        return self.done(p)

    def boulders(self, rocks):
        """Rocks, each a rough convex lump."""
        p, rng = self.part("rocks"), self.rng
        for k in rocks:
            c = self.at(k["x"], k["y"], 0)
            s = k["r"]
            pts = [(c.x + rng.uniform(-1, 1) * s, c.y + rng.uniform(-1, 1) * s * 0.8, rng.uniform(0, 1.0) * s) for _ in range(10)]
            pts += [(c.x - s * 0.7, c.y, 0), (c.x + s * 0.7, c.y, 0), (c.x, c.y - s * 0.6, 0), (c.x, c.y + s * 0.6, 0)]
            p.solid(pts, "rock", bevel=s * 0.06, mirror=False)
        return self.done(p)

    def sandbags(self, bags):
        """Rows of sandbags: each {x, y, turn (degrees), layers}."""
        p = self.part("sandbags")
        for b in bags:
            turn = rot("Z", -b["turn"])
            for layer in range(b.get("layers", 1)):
                shift = turn @ Vector((2.2 if layer % 2 else 0, 0, 0))
                p.box((8.4, 4.6, 2.6), self.at(b["x"], b["y"], 1.4 + layer * 2.4) + shift, "sandbag", bevel=1.1, rot=turn)
        return self.done(p)

    def hedgehogs(self, places):
        """Steel tank traps: three crossed girders each."""
        p = self.part("hedgehogs")
        for h in places:
            c = self.at(h["x"], h["y"], 3.4)
            for turn in (rot("Z", h.get("turn", 0)) @ rot("Y", 45), rot("Z", h.get("turn", 0) + 90) @ rot("Y", 45), rot("Z", h.get("turn", 0) + 45) @ rot("X", 90) @ rot("Y", 8)):
                p.box((10.5, 1.3, 1.3), c, "rust", bevel=0, rot=turn)
        return self.done(p)

    def tents(self, tents):
        p = self.part("tents")
        for t in tents:
            turn = rot("Z", -t["turn"])
            c = self.at(t["x"], t["y"], 0)
            w, l, h = t.get("w", 15), t.get("l", 23), t.get("h", 10)
            pts = [(-l / 2, -w / 2, 0), (l / 2, -w / 2, 0), (-l / 2, w / 2, 0), (l / 2, w / 2, 0), (-l / 2, 0, h), (l / 2, 0, h)]
            p.solid([tuple(c + turn @ Vector(q)) for q in pts], "canvas", bevel=0.4, mirror=False)
            p.box((1.0, 0.8, h * 0.7), c + turn @ Vector((l / 2 + 0.2, 0, h * 0.35)), "soot", bevel=0, rot=turn)
        return self.done(p)

    def crates(self, stacks):
        p, rng = self.part("crates"), self.rng
        for s in stacks:
            c = self.at(s["x"], s["y"], 0)
            for k in range(s.get("n", 3)):
                turn = rot("Z", s.get("turn", 0) + rng.uniform(-12, 12))
                off = Vector((rng.uniform(-5, 5), rng.uniform(-4, 4), 0)) if k else Vector()
                size = rng.uniform(4.5, 6.5)
                lift = size * 0.5 + (size * 0.9 if k == s.get("n", 3) - 1 and k > 1 else 0)
                p.box((size * 1.2, size, size * 0.85), c + off + Vector((0, 0, lift)), rng.choice(["wood", "olive", "wood_dark"]), bevel=0.3, rot=turn)
        return self.done(p)

    def fences(self, runs):
        """Post-and-rail fences along these lines: each {ax, ay, bx, by}."""
        p = self.part("fences")
        for f in runs:
            ax, ay, bx, by = f["ax"], f["ay"], f["bx"], f["by"]
            n = max(1, round(math.hypot(bx - ax, by - ay) / 12))
            for k in range(n + 1):
                p.box((1.3, 1.3, 6.5), self.at(ax + (bx - ax) * k / n, ay + (by - ay) * k / n, 3.25), "wood_dark", bevel=0)
            for z in (2.6, 5.2):
                p.rod(0.5, self.at(ax, ay, z), self.at(bx, by, z), "wood", segments=4)
        return self.done(p)

    def wrecks(self, wrecks):
        p = self.part("wrecks")
        for w in wrecks:
            turn = rot("Z", w["turn"])
            c = self.at(w["x"], w["y"], 0)
            long = 30 if w["kind"] == "truck" else 20
            p.box((long, 9.5, 4), c + Vector((0, 0, 3.2)), "rust", bevel=0.6, rot=turn)
            cab = turn @ Vector((long * (0.26 if w["kind"] == "truck" else -0.05), 0, 7))
            p.box((long * 0.34, 8.6, 4), c + cab, "soot", bevel=0.8, rot=turn)
            for sx in (-0.32, 0.32):
                for sy in (-1, 1):
                    p.cyl(2.1, 1.6, c + turn @ Vector((long * sx, sy * 4.6, 2.1)), "soot", axis="Y", segments=8, bevel=0, rot=turn)
        return self.done(p)

    def posts(self, posts):
        p = self.part("posts")
        for post in posts:
            lean = rot("Z", post["turn"]) @ rot("Y", post.get("lean", 0))
            base_at = self.at(post["x"], post["y"], 0)
            p.cyl(0.9, 26, base_at + lean @ Vector((0, 0, 13)), "metal", segments=6, bevel=0, rot=lean)
            p.box((8, 0.8, 0.8), base_at + lean @ Vector((3.5, 0, 26)), "metal", bevel=0, rot=lean)
            p.box((3.5, 1.8, 1.0), base_at + lean @ Vector((7, 0, 25.6)), "metal", bevel=0, rot=lean)
            p.cyl(1.6, 1.2, base_at + Vector((0, 0, 0.6)), "concrete", segments=6, bevel=0)
        return self.done(p)

    def ruin_walls(self, p, walls, tone, thick=6):
        """Broken walls: each {ax, ay, bx, by, h}, with ragged tops and the odd window."""
        rng = self.rng
        for w in walls:
            ax, ay, bx, by, h = w["ax"], w["ay"], w["bx"], w["by"], w["h"]
            self.wall(p, ax, ay, bx, by, thick, 0, h, tone, bevel=0.35, lengthen=thick)
            length = math.hypot(bx - ax, by - ay)
            if length < 9:
                continue
            ux, uy = (bx - ax) / length, (by - ay) / length
            turn = rot("Z", self.heading(ax, ay, bx, by))
            for _ in range(3):
                t, piece = rng.uniform(4, length - 4), rng.uniform(5, 13)
                p.box((piece, thick, rng.uniform(1.5, 5.5)), self.at(ax + ux * t, ay + uy * t, h + 1.2), tone, bevel=0.3, rot=turn)
            if h > 13 and length > 22 and rng.random() < 0.6:
                t = rng.uniform(10, length - 10)
                p.box((8, thick + 0.6, 6), self.at(ax + ux * t, ay + uy * t, h * 0.55), "soot", bevel=0, rot=turn)

    def rubble(self, p, piles, tone="rubble"):
        rng = self.rng
        for b in piles:
            for _ in range(7):
                a, d = rng.uniform(0, 6.28), rng.uniform(0, b["r"])
                s = rng.uniform(1.6, 4.6)
                turn = rot("Z", rng.uniform(0, 90)) @ rot("X", rng.uniform(-25, 25))
                p.box((s * rng.uniform(0.8, 1.6), s, s * rng.uniform(0.5, 1.0)), self.at(b["x"] + d * math.cos(a), b["y"] + d * math.sin(a), s * 0.3),
                      rng.choice(["rubble", "rubble", tone]), bevel=0, rot=turn)
            if rng.random() < 0.35:
                turn = rot("Z", rng.uniform(0, 180)) @ rot("Y", rng.uniform(-12, 12))
                p.box((rng.uniform(14, 26), 1.6, 1.6), self.at(b["x"], b["y"], 2.2), "wood", bevel=0, rot=turn)

    # ---------------------------------------------------------- output

    def export(self, name):
        """What stands on the map as a plain model, for the RTS mode's 3D view."""
        for ob in self.flat + self.only_front:
            bpy.data.objects.remove(ob)
        bpy.ops.export_scene.gltf(filepath=os.path.join(self.dir, f"{name}.glb"), export_format="GLB", export_apply=True, export_yup=True)

    def render(self, name, samples=96, scale=1.0, sun=3.3):
        """<name>_bg.png, the whole map, and <name>_fg.png, only what stands
        up from the ground, on a transparent background."""
        scene = bpy.context.scene
        scene.render.engine = "CYCLES"
        scene.cycles.samples = samples
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
                if any(d.type == kind for d in prefs.devices):
                    for d in prefs.devices:
                        d.use = d.type == kind
                    scene.cycles.device = "GPU"
                    break
        except Exception as e:
            print("rendering on the CPU:", e)
        scene.render.resolution_x = int(self.W * scale)
        scene.render.resolution_y = int(self.H * scale)
        scene.render.resolution_percentage = 100
        # A pixel is wider than tall by one over the sine of the camera's
        # angle (Blender takes no aspect under 1): the picture, shown with
        # square pixels, is stretched back to top-down.
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
        light = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
        light.data.energy = sun
        light.data.angle = math.radians(4)
        # As the units' sprites: shadows fall down the picture and to the left.
        light.rotation_euler = Vector((-0.55, -0.5, -0.8)).to_track_quat("-Z", "Y").to_euler()
        scene.collection.objects.link(light)
        cam = bpy.data.objects.new("camera", bpy.data.cameras.new("camera"))
        scene.collection.objects.link(cam)
        el = math.radians(CAMERA_ELEVATION)
        offset = Vector((0, -math.cos(el), math.sin(el))) * 6000
        cam.location = Vector((self.W / 2, self.H / 2, 0)) + offset
        cam.rotation_euler = (-offset).to_track_quat("-Z", "Y").to_euler()
        cam.data.type = "ORTHO"
        # The width if the picture is wider than (stretched) tall, else the height.
        wide = self.W * scene.render.pixel_aspect_x >= self.H
        cam.data.ortho_scale = self.W if wide else self.H * math.sin(el)
        cam.data.clip_start = 100
        cam.data.clip_end = 14000
        scene.camera = cam

        for ob in self.only_front:
            ob.hide_render = True
        scene.render.filepath = os.path.join(self.dir, f"{name}_bg.png")
        bpy.ops.render.render(write_still=True)
        for ob in self.only_front:
            ob.hide_render = False
        for ob in self.flat:
            ob.is_holdout = True
        scene.render.filepath = os.path.join(self.dir, f"{name}_fg.png")
        bpy.ops.render.render(write_still=True)
