"""One-time asset extraction: crops game sprites from the reference images.
Run from the project root: python tools/extract_assets.py
"""
from pathlib import Path
import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "game" / "assets"
OUT.mkdir(parents=True, exist_ok=True)

# Sprites are drawn on-canvas at tiny sizes (tens of px), but the source
# JPEGs are huge (e.g. tower_laser's crop is ~2600x680px). Downscale every
# sprite so its longer edge is ~SPRITE_MAX_EDGE px before saving -- still far
# more detail than any on-screen draw size needs, but a fraction of the
# load-time/per-frame resampling cost of the full-resolution crop.
SPRITE_MAX_EDGE = 256

# game/js/map.js's CANVAS_WIDTH/CANVAS_HEIGHT -- the exact size the map
# background is drawn at every frame. Keeping this in sync avoids shipping
# an 8MB+ image that's resampled down on every single draw call.
MAP_WIDTH = 1200
MAP_HEIGHT = 750


def downscale(im, max_edge=SPRITE_MAX_EDGE):
    """Shrink im so its longer edge is max_edge px, preserving aspect ratio.
    No-op if the image is already smaller than that."""
    if max(im.size) <= max_edge:
        return im
    out = im.copy()
    out.thumbnail((max_edge, max_edge), Image.Resampling.LANCZOS)
    return out


def color_key(im, bg, tol=32, open_iters=2):
    """Make background-connected pixels near `bg` (or near any color in
    `bg`, if given a list of colors) transparent.

    Unlike a plain per-pixel threshold, only pixels reachable from the
    image border through similarly-colored neighbors are keyed out. This
    avoids punching transparent holes through dark shading/shadow pixels
    deep inside the sprite that merely happen to resemble the background
    color but aren't topologically part of the actual background (e.g.
    olive-drab shadow tones on the tower turrets, digital-camo dark
    patches on the tank, which land within color-distance `tol` of the
    dark background but are surrounded by opaque sprite art, not by the
    actual background region).

    A plain border flood fill isn't enough on its own, though: these
    turret sheets are illustrated with dense dark panel-line/scratch/
    weathering strokes drawn on top of the fill, and those thin strokes
    also happen to land within `tol` of the background color. Because
    they touch each other pixel-to-pixel, a plain flood fill treats the
    entire mesh - hatching AND the real background - as one giant
    border-connected blob, which just recreates the punched-through-body
    bug through a different mechanism. Binary opening (erode then
    dilate) prunes thin (<~2px) connections while leaving the solid
    background region intact, so the hatching mesh gets disconnected
    from the border before we label connected components.

    `bg` may be a single (r, g, b) color, or a list of colors - useful
    when the true background isn't one flat color (e.g. a photographed
    background with several different lighting/texture tones), where a
    pixel counts as background-colored if it's close to ANY of them.
    """
    im = im.convert("RGB")
    arr = np.array(im).astype(int)
    bg_arr = np.array(bg, dtype=int)
    if bg_arr.ndim == 1:
        bg_arr = bg_arr[None, :]
    dists = np.abs(arr[:, :, None, :] - bg_arr[None, None, :, :]).sum(axis=3)
    close = dists.min(axis=2) < tol * 3

    structure = np.ones((3, 3), dtype=bool)
    opened = ndimage.binary_opening(close, structure=structure, iterations=open_iters)

    labeled, _ = ndimage.label(opened)
    border_labels = set(labeled[0, :]) | set(labeled[-1, :]) | set(labeled[:, 0]) | set(labeled[:, -1])
    border_labels.discard(0)
    bg_mask = np.isin(labeled, list(border_labels))

    # Opening also erodes a few pixels off the *true* background's edge
    # where it meets the sprite silhouette. Grow the confirmed background
    # region back out, but only into pixels that were already
    # background-colored (`close`) - this restores the true boundary
    # without re-tunneling back through the pruned hatching strokes.
    bg_mask = ndimage.binary_dilation(bg_mask, structure=structure, iterations=open_iters) & close

    alpha = np.where(bg_mask, 0, 255).astype(np.uint8)
    rgb = np.array(im)
    # Zero the RGB channels wherever alpha is 0, not just the alpha
    # channel itself. Canvas 2D's drawImage respects alpha exactly at
    # runtime, so leaving the original RGB behind a transparent pixel is
    # invisible in-game - but it leaves ghost pixel data (e.g. baked-in
    # label text, a neighboring sprite's art) sitting in the file, visible
    # to any tool that composites RGB without premultiplying alpha (a
    # plain Read-tool preview, or any future step that scales/filters
    # these sprites without being alpha-aware).
    rgb[bg_mask] = 0
    rgba = np.dstack([rgb, alpha])
    return Image.fromarray(rgba, mode="RGBA")


def clear_regions(rgba_im, boxes):
    """Force alpha=0 in the given (x0,y0,x1,y1) boxes, in image-local
    coordinates. Used to erase known baked-in label text regardless of
    color or border-connectivity - flood fill alone can't reach a label
    box that doesn't touch the crop's edge.

    Boxes are clamped to the image bounds on both ends before slicing;
    a box that falls entirely outside the image (e.g. a label box from
    another crop's region, passed in unfiltered) becomes a no-op rather
    than wrapping around via negative-index slicing.
    """
    arr = np.array(rgba_im)
    h, w = arr.shape[:2]
    for (x0, y0, x1, y1) in boxes:
        cx0, cx1 = max(x0, 0), min(x1, w)
        cy0, cy1 = max(y0, 0), min(y1, h)
        if cx1 > cx0 and cy1 > cy0:
            # Zero RGB too, not just alpha - see color_key()'s comment on
            # why leftover RGB under alpha=0 pixels is a problem even
            # though it's invisible at runtime.
            arr[cy0:cy1, cx0:cx1, :] = 0
    return Image.fromarray(arr, mode="RGBA")


def extract_towers():
    im = Image.open(ROOT / "tanques.jpg").convert("RGB")
    bg = im.getpixel((5, 5))
    # label boxes, in ORIGINAL image coordinates
    label_boxes_orig = [
        (1090, 130, 2752, 230),    # "1. MBT-1 Vanquisher..."
        (240, 690, 1200, 860),     # "2. AA-2 Cyclone..."
        (1370, 1280, 2752, 1460),  # "3. RG-3 Tempest..." (two lines)
    ]
    crops = {
        # height trimmed from 680->650: 680 clipped the tip of the AA-2
        # turret's muzzle brake (bleed starts ~y671 at x1310-1650)
        "tower_basic": (0, 0, 1650, 650),
        # y0 350->400 drops the MBT-1 barrel tail (bleeds in up to y386);
        # y1 1080->1050 drops a sliver of the RG-3 railgun glow (bleeds in
        # from y1076)
        "tower_double": (1250, 400, 2752, 1050),
        "tower_laser": (60, 850, 2752, 1536),
    }
    for name, box in crops.items():
        cropped = im.crop(box)
        keyed = color_key(cropped, bg)
        # translate each label box into this crop's local coordinates;
        # boxes that fall outside this particular crop are no-ops
        local_boxes = [
            (lx0 - box[0], ly0 - box[1], lx1 - box[0], ly1 - box[1])
            for (lx0, ly0, lx1, ly1) in label_boxes_orig
        ]
        keyed = clear_regions(keyed, local_boxes)
        if name == "tower_laser":
            # the AA-2 turret's own art bleeds into this crop's top-right
            # corner since it shares x-range with the AA-2 turret above;
            # clear it with an explicit crop-local box.
            keyed = clear_regions(keyed, [(1630, 0, keyed.width, 195)])
        if name == "tower_double":
            # Every other directional sprite (tower_basic, tower_laser,
            # enemy_tank, enemy_buggy) has its "front" pointing toward +x in
            # the source art, matching the game's rotation convention
            # (angle=0 -> +x). The AA-2 Cyclone's twin barrels alone point
            # toward -x in the source sheet, so flip it here to match.
            keyed = keyed.transpose(Image.FLIP_LEFT_RIGHT)
        keyed = downscale(keyed)
        keyed.save(OUT / f"{name}.png")


def tint_red(im, strength=0.55):
    """Shift an RGBA image's hue toward rust-red, keep alpha untouched."""
    im = im.convert("RGBA")
    arr = np.array(im).astype(float)
    r, g, b, a = arr[..., 0], arr[..., 1], arr[..., 2], arr[..., 3]
    gray = (r + g + b) / 3
    nr = gray + (200 - gray) * strength
    ng = gray * (1 - strength * 0.6)
    nb = gray * (1 - strength * 0.6)
    out = np.stack([nr, ng, nb, a], axis=-1)
    out = np.clip(out, 0, 255).astype(np.uint8)
    return Image.fromarray(out, mode="RGBA")


def extract_enemies():
    im = Image.open(ROOT / "ENEMIGOS CENITAL.jpg").convert("RGB")
    bg = (254, 254, 254)
    # label boxes, in ORIGINAL image coordinates
    label_boxes_orig = [
        (0, 205, 1024, 225),   # "VISTAS CENITALES DE ENEMIGOS..." (top instance)
        (560, 378, 1024, 398), # same label, lower instance
    ]

    # width trimmed from 445->420: the source APC vehicle art starts at
    # x434, and 445 was pulling in a sliver of it
    tank_box = (10, 5, 420, 215)
    tank = im.crop(tank_box)
    tank_rgba = color_key(tank, bg)
    tank_rgba = clear_regions(tank_rgba, [
        (lx0 - tank_box[0], ly0 - tank_box[1], lx1 - tank_box[0], ly1 - tank_box[1])
        for (lx0, ly0, lx1, ly1) in label_boxes_orig
    ])
    downscale(tint_red(tank_rgba)).save(OUT / "enemy_tank.png")

    buggy_box = (700, 210, 1005, 365)
    buggy = im.crop(buggy_box)
    buggy_rgba = color_key(buggy, bg)
    buggy_rgba = clear_regions(buggy_rgba, [
        (lx0 - buggy_box[0], ly0 - buggy_box[1], lx1 - buggy_box[0], ly1 - buggy_box[1])
        for (lx0, ly0, lx1, ly1) in label_boxes_orig
    ])
    downscale(buggy_rgba).save(OUT / "enemy_buggy.png")

    soldier_box = (895, 450, 990, 550)
    soldier = im.crop(soldier_box)
    soldier_rgba = color_key(soldier, bg)
    soldier_rgba = clear_regions(soldier_rgba, [
        (lx0 - soldier_box[0], ly0 - soldier_box[1], lx1 - soldier_box[0], ly1 - soldier_box[1])
        for (lx0, ly0, lx1, ly1) in label_boxes_orig
    ])
    downscale(soldier_rgba).save(OUT / "enemy_soldier.png")


def extract_explosion():
    im = Image.open(ROOT / "explosiones.jpg").convert("RGB")
    # bottom trimmed from 600->575->572: the reference sheet has a baked-in
    # UI icon (rounded box, dark border) whose top edge starts bleeding in
    # at y~573; 575 still caught its top 2 rows as a solid dark bar.
    crop = im.crop((15, 385, 265, 572))

    # explosiones.jpg is a real photo, not flat-color art: the ground
    # around the blast is a non-uniform mix of grey smoke-dusted dirt and
    # green grass, so a single corner sample (e.g. (2,2), which lands on
    # grey dirt) is nowhere near the color of the grass patches in other
    # corners and they'd never even enter the "close to bg" set, let
    # alone get flood-filled. Sample a small median patch at each of the
    # four corners instead (median to shrug off single-pixel JPEG noise)
    # so color_key treats a pixel as background-colored if it's close to
    # ANY of the tones actually present in the crop's corners. Deliberately
    # corners only, not edge midpoints: the blast/flame extends close to
    # the crop edges at several midpoints, so a midpoint sample there
    # risks picking up a flame/ember tone instead of true background,
    # which then wrongly keys out chunks of the real fire (verified while
    # tuning this - an 8-point corners+midpoints version ate visible
    # bites out of the fireball because one bottom-edge midpoint sample
    # landed on a bright ember).
    def corner_median(x, y, s=5):
        x0, y0 = max(x - s // 2, 0), max(y - s // 2, 0)
        patch = np.array(crop.crop((x0, y0, x0 + s, y0 + s)))
        return tuple(int(v) for v in np.median(patch.reshape(-1, 3), axis=0))

    w, h = crop.size
    bg_colors = [
        corner_median(3, 3), corner_median(w - 4, 3),
        corner_median(3, h - 4), corner_median(w - 4, h - 4),
    ]
    # tol=34 (vs. 32 elsewhere): needed a bit looser than the illustrated
    # sprites to cover this photo's per-corner color variance without
    # reopening a gap for the grass blob defect this is meant to fix.
    downscale(color_key(crop, bg_colors, tol=34)).save(OUT / "explosion.png")


def extract_map():
    im = Image.open(ROOT / "mapa.jpg").convert("RGB")
    arr = np.array(im)
    # paint over the baked-in "ENEMY PATH" legend and the corner minimap
    # with nearby grass texture (median of an adjacent patch) so our own
    # HUD/path drawing isn't fighting the source art. This stays opaque
    # (map_bg.png has no alpha channel), so a flat fill is fine here.
    def median_patch(x, y, w=15, h=15):
        patch = arr[y:y + h, x:x + w].reshape(-1, 3)
        return np.median(patch, axis=0).astype(np.uint8)

    legend_box = (2000, 60, 2400, 140)
    col = median_patch(max(legend_box[0] - 60, 0), legend_box[1])
    arr[legend_box[1]:legend_box[3], legend_box[0]:legend_box[2]] = col

    minimap_box = (0, 1370, 430, 1792)
    col = median_patch(50, max(minimap_box[1] - 80, 0))
    arr[minimap_box[1]:minimap_box[3], minimap_box[0]:minimap_box[2]] = col

    out_img = Image.fromarray(arr)
    # drawMap() in game/js/map.js always draws this at exactly
    # CANVAS_WIDTH x CANVAS_HEIGHT (ctx.drawImage(mapImage, 0, 0, 1200, 750)),
    # stretching it to that box regardless of its own aspect ratio. Doing
    # that same resize once here -- instead of shipping the full ~2400x1792
    # source and letting the browser resample it down on every frame --
    # produces an identical on-screen result at a fraction of the file size
    # and per-frame cost.
    out_img = out_img.resize((MAP_WIDTH, MAP_HEIGHT), Image.Resampling.LANCZOS)
    out_img.save(OUT / "map_bg.png")


if __name__ == "__main__":
    extract_towers()
    extract_enemies()
    extract_explosion()
    extract_map()
    print("Assets written to", OUT)
