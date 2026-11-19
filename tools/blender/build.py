"""Builds one of the game's models in Blender and renders what the game uses.

Run (from the repo root):
  blender -b --factory-startup -P tools/blender/build.py -- <out_dir> <name> [preview] [icon] [glb] [sprites]

  preview  a large picture to look at                -> <out_dir>/<name>_preview.png
  icon     its picture for the shop and the sidebar  -> <out_dir>/<name>_icon.png
  glb      the model for the 3D view                 -> <out_dir>/<name>.glb
  sprites  the frames of the 2D game's sheets        -> <out_dir>/<name>_hull_*.png, <name>_turret_*.png
           (tools/blender/pack_sprites.py puts them together)

Each job is a run of its own: a render changes the scene the next would start from.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy
import kit
import units
import towers

SPECS = {**units.SPECS, **towers.SPECS}


def main():
    args = sys.argv[sys.argv.index("--") + 1:]
    out, name, job = os.path.abspath(args[0]), args[1], args[2]
    os.makedirs(out, exist_ok=True)
    for ob in list(bpy.data.objects):
        bpy.data.objects.remove(ob)
    spec = SPECS[name]
    model = spec["build"]()
    if job == "glb":
        kit.do_glb(model, out, name)
    elif job == "preview":
        kit.do_preview(model, spec, out, name)
    elif job == "icon":
        kit.do_icon(model, spec, out, name)
    elif job == "sprites":
        kit.do_sprites(model, spec, out, name)
    else:
        raise SystemExit(f"unknown job {job}")


main()
