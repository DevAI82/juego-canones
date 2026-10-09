"""The defensive wall's new look (per user request), cut out of the user's
drawing Imágenes/muralla defensiva.jpg. Run from the project root:
    python tools/extract_walls.py
Needs rembg, like tools/extract_buildings.py (whose cut-out steps it uses).

The drawing has three concrete pieces side by side, in the isometric style
of the buildings: a single block, a long straight stretch and a corner with
razor wire. main.js draws every wall block of the grid with the single
block, and the corner where the wall turns; the straight stretch runs on
the drawing's diagonal, which a row of grid cells doesn't follow, so it
isn't used (yet). Written to game/assets/wall_block.webp and
wall_corner.webp, the same scale for both.
"""
import os
import sys

from PIL import Image

sys.path.insert(0, os.path.dirname(__file__))
from extract_buildings import cut, trimmed  # noqa: E402

SRC = os.path.join("Imágenes", "muralla defensiva.jpg")
OUT = os.path.join("game", "assets")
BLOCK_WIDTH = 200  # px; drawn about 37 px wide on the map, more when zoomed in


def main():
    from rembg import new_session

    session = new_session("isnet-general-use")
    drawing = Image.open(SRC)
    third = drawing.width // 3
    block = trimmed(cut(session, drawing.crop((0, 0, third, drawing.height))))
    corner = trimmed(cut(session, drawing.crop((2 * third, 0, drawing.width, drawing.height))))
    scale = BLOCK_WIDTH / block.width
    for name, piece in [("wall_block", block), ("wall_corner", corner)]:
        size = (round(piece.width * scale), round(piece.height * scale))
        piece.resize(size, Image.LANCZOS).save(os.path.join(OUT, f"{name}.webp"), quality=88, method=6)
        print(name, size)


if __name__ == "__main__":
    main()
