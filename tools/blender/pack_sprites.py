"""Puts what build.py rendered into the game's files.

  python tools/blender/pack_sprites.py <frames_dir> <game/assets> <name> [<name> ...]

<name>_hull.webp    16 columns; frame = row * directions + direction, with a
                    row for standing still (if the unit has one) and one per
                    rolling or walking step.
<name>_turret.webp  8 columns; frame = direction.
<name>_icon.webp    the picture for the shop and the sidebar.
models/<name>.glb   the model for the 3D view.
"""
import shutil
import sys
from pathlib import Path
from PIL import Image


def sheet(paths, columns):
    frames = [Image.open(p).convert("RGBA") for p in paths]
    w, h = frames[0].size
    out = Image.new("RGBA", (columns * w, -(-len(frames) // columns) * h))
    for i, frame in enumerate(frames):
        out.paste(frame, ((i % columns) * w, (i // columns) * h))
    return out


src, dst = Path(sys.argv[1]), Path(sys.argv[2])
(dst / "units3d").mkdir(parents=True, exist_ok=True)
(dst / "models").mkdir(parents=True, exist_ok=True)
for name in sys.argv[3:]:
    hull = sorted(src.glob(f"{name}_hull_*.png"))
    turret = sorted(src.glob(f"{name}_turret_*.png"))
    done = []
    if hull:
        sheet(hull, 16).save(dst / "units3d" / f"{name}_hull.webp", quality=90, method=6)
        done.append(f"{len(hull)} hull frames")
    if turret:
        sheet(turret, 8).save(dst / "units3d" / f"{name}_turret.webp", quality=90, method=6)
        done.append(f"{len(turret)} turret frames")
    icon = src / f"{name}_icon.png"
    if icon.exists():
        Image.open(icon).save(dst / "units3d" / f"{name}_icon.webp", quality=90, method=6)
        done.append("icon")
    glb = src / f"{name}.glb"
    if glb.exists():
        shutil.copy(glb, dst / "models" / f"{name}.glb")
        done.append("model")
    print(name + ":", ", ".join(done) or "nothing found")
