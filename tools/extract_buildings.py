"""The six support buildings and their four construction phases, cut out of
the user's drawings for the game. Run from the project root:
    python tools/extract_buildings.py
It needs rembg, which isn't part of the game (pip install "rembg[cpu]"
pillow numpy); its first run downloads the cut-out model (~180 MB).

Sources (Imágenes/): each finished building drawn on a plain background,
and its construction sheet -- a 2 x 2 grid of the four phases before it's
finished (foundations, steel frame, walls, final fittings), on the same
kind of background, with labels ("Fase 1:", "Stage 1: Foundation", a
header) and grid lines drawn on some of them.

For each building:
  1. The finished building and each phase (one quarter of the sheet) are cut
     out of their background (rembg's isnet-general-use model).
  2. Labels, headers and grid lines are dropped: of what's left, only the
     building itself survives -- the biggest piece, and any piece reaching
     into its bounding box (an antenna, a crane's hook).
  3. Every phase is scaled to the finished building's width and stood on
     the same ground (bottom-centred), so phase after phase and the
     crossfade into the finished building stay in place in the game.
  4. Written to game/assets/: building_<key>.webp (finished) and
     building_<key>_build.webp, the four phases in a 2 x 2 grid of cells
     the size of the finished picture -- what main.js's drawBuilding
     expects (and the same layout as the sheets the user drew). WebP keeps
     the transparency at a fraction of PNG's size (4.3 MB for the twelve).

The drawings themselves aren't exactly consistent from phase to phase (the
wind turbine's cranes make its phases 2-4 a little smaller than the
finished turbine once they're all the same width); the crossfade into the
finished building hides most of it.
"""
import os
import sys

import numpy as np
from PIL import Image, ImageFilter

SRC = "Imágenes"
OUT = os.path.join("game", "assets")
WIDTH = 320  # px, a finished building's width in the game's assets (drawn at about half that)
QUALITY = 86  # WebP

# key -> (finished building, construction sheet)
BUILDINGS = {
    "solar": ("planta solar.jpg", "spritesheet_construccion_solar.jpg"),
    "wind": ("eólico.jpg", "spritesheet_construccion_eolico.jpg"),
    "refinery": ("refinería.jpg", "spritesheet_construccion_refineria.jpg"),
    "barracks": ("barracón_rts.jpg", "spritesheet_construccion_barracon.jpg"),
    "factory": ("fabrica vehículos.jpg", "spritesheet_construccion_fabrica.jpg"),
    "lab": ("laboratorio tecnología.jpg", "spritesheet_construccion_laboratorio.jpg"),
}


def label_components(mask):
    """Connected components (4-neighbour) of a boolean mask: an int array of
    labels (0 = background) and the number of components. Plain Python flood
    fill over numpy -- slow-ish but dependency-free, and the masks are small."""
    h, w = mask.shape
    labels = np.zeros((h, w), dtype=np.int32)
    n = 0
    ys, xs = np.nonzero(mask)
    for y0, x0 in zip(ys, xs):
        if labels[y0, x0]:
            continue
        n += 1
        stack = [(y0, x0)]
        labels[y0, x0] = n
        while stack:
            y, x = stack.pop()
            for ny, nx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
                if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not labels[ny, nx]:
                    labels[ny, nx] = n
                    stack.append((ny, nx))
    return labels, n


def keep_building(rgba):
    """The building alone: the biggest opaque piece, plus every piece that
    reaches into its bounding box; everything else (labels, grid lines,
    stray marks) made transparent. Worked out on a quarter-size mask."""
    alpha = np.array(rgba.getchannel("A"))
    small = Image.fromarray(alpha).resize((alpha.shape[1] // 4, alpha.shape[0] // 4), Image.BILINEAR)
    mask = np.array(small) > 40
    labels, n = label_components(mask)
    if n == 0:
        return rgba
    sizes = np.bincount(labels.ravel())
    sizes[0] = 0
    main = int(sizes.argmax())
    ys, xs = np.nonzero(labels == main)
    y0, y1, x0, x1 = ys.min(), ys.max(), xs.min(), xs.max()
    keep = np.zeros(n + 1, dtype=bool)
    for k in range(1, n + 1):
        kys, kxs = np.nonzero(labels == k)
        inside = (kys >= y0) & (kys <= y1) & (kxs >= x0) & (kxs <= x1)
        keep[k] = k == main or (sizes[k] >= 6 and inside.mean() > 0.5)
    keep_small = keep[labels]
    keep_full = np.array(Image.fromarray((keep_small * 255).astype(np.uint8)).resize((alpha.shape[1], alpha.shape[0]), Image.NEAREST)) > 0
    # Grow the kept area a little so soft edges at the downscale's
    # resolution aren't clipped.
    grown = np.array(Image.fromarray((keep_full * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(9))) > 0
    out = np.array(rgba)
    out[..., 3] = np.where(grown, out[..., 3], 0)
    return Image.fromarray(out)


def trimmed(rgba):
    return rgba.crop(rgba.getbbox())


def cut(session, image):
    from rembg import remove

    return keep_building(remove(image.convert("RGB"), session=session))


def main():
    from rembg import new_session

    session = new_session("isnet-general-use")
    for key, (final_name, sheet_name) in BUILDINGS.items():
        final = trimmed(cut(session, Image.open(os.path.join(SRC, final_name))))
        final = final.resize((WIDTH, round(final.height * WIDTH / final.width)), Image.LANCZOS)
        sheet = Image.open(os.path.join(SRC, sheet_name))
        half_w, half_h = sheet.width // 2, sheet.height // 2
        phases = []
        for row in range(2):
            for col in range(2):
                quarter = sheet.crop((col * half_w, row * half_h, (col + 1) * half_w, (row + 1) * half_h))
                phase = trimmed(cut(session, quarter))
                phases.append(phase.resize((WIDTH, round(phase.height * WIDTH / phase.width)), Image.LANCZOS))
        # One cell size for the finished picture and every phase: as wide as
        # the building, as tall as the tallest, each stood on the cell's floor.
        cell_h = max(final.height, *(p.height for p in phases))
        cell = lambda img: paste_bottom(img, WIDTH, cell_h)
        cell(final).save(os.path.join(OUT, f"building_{key}.webp"), quality=QUALITY, method=6)
        grid = Image.new("RGBA", (WIDTH * 2, cell_h * 2), (0, 0, 0, 0))
        for i, phase in enumerate(phases):
            grid.paste(cell(phase), ((i % 2) * WIDTH, (i // 2) * cell_h))
        grid.save(os.path.join(OUT, f"building_{key}_build.webp"), quality=QUALITY, method=6)
        print(f"{key}: {WIDTH} x {cell_h} per picture")


def paste_bottom(img, w, h):
    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    out.paste(img, ((w - img.width) // 2, h - img.height), img)
    return out


if __name__ == "__main__":
    sys.exit(main())
