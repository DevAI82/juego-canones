"""Puts a map that level<N>_build.py rendered into the game's files.

  python tools/blender/maps/pack_map.py <dir> <game/assets> <N> [3d]

maps/level<N>.jpg         the whole map
maps/level<N>_fg.webp     what stands up on it, drawn over the units
and, with "3d" (the RTS mode's map):
maps/level<N>_ground.jpg  its flat ground, for the RTS mode's 3D view
models/map_level<N>.glb   what stands on it, as a model for that view
"""
import shutil
import sys
from pathlib import Path
from PIL import Image

src, dst, n = Path(sys.argv[1]), Path(sys.argv[2]), sys.argv[3]
in_3d = "3d" in sys.argv[4:]
(dst / "maps").mkdir(parents=True, exist_ok=True)
done = []
bg = src / f"level{n}_bg.png"
if bg.exists():
    Image.open(bg).convert("RGB").save(dst / "maps" / f"level{n}.jpg", quality=88, optimize=True)
    done.append("map")
fg = src / f"level{n}_fg.png"
if fg.exists():
    Image.open(fg).save(dst / "maps" / f"level{n}_fg.webp", quality=88, method=4)
    done.append("foreground")
ground = src / "ground_color.png"
if in_3d and ground.exists():
    Image.open(ground).convert("RGB").save(dst / "maps" / f"level{n}_ground.jpg", quality=86, optimize=True)
    done.append("ground")
glb = src / f"level{n}.glb"
if in_3d and glb.exists():
    (dst / "models").mkdir(parents=True, exist_ok=True)
    shutil.copy(glb, dst / "models" / f"map_level{n}.glb")
    done.append("model")
print(f"level {n}:", ", ".join(done) or "nothing found")
