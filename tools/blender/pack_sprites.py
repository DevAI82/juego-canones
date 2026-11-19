"""Puts the frames build_tank.py rendered into the game's sprite sheets.

  python tools/blender/pack_sprites.py <frames_dir> <game/assets/units3d>

tank_hull.webp: 16 columns; frame = wheel_frame * 32 + direction.
tank_turret.webp: 8 columns; frame = direction.
"""
import sys
from pathlib import Path
from PIL import Image

DIRECTIONS, WHEEL_FRAMES = 32, 4


def sheet(paths, columns):
    frames = [Image.open(p).convert("RGBA") for p in paths]
    w, h = frames[0].size
    out = Image.new("RGBA", (columns * w, -(-len(frames) // columns) * h))
    for i, frame in enumerate(frames):
        out.paste(frame, ((i % columns) * w, (i // columns) * h))
    return out


src, dst = Path(sys.argv[1]), Path(sys.argv[2])
dst.mkdir(parents=True, exist_ok=True)
hull = [src / f"hull_{w}_{d:02d}.png" for w in range(WHEEL_FRAMES) for d in range(DIRECTIONS)]
turret = [src / f"turret_{d:02d}.png" for d in range(DIRECTIONS)]
sheet(hull, 16).save(dst / "tank_hull.webp", quality=92, method=6)
sheet(turret, 8).save(dst / "tank_turret.webp", quality=92, method=6)
print("packed", len(hull), "hull and", len(turret), "turret frames into", dst)
