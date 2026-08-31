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


def color_key_textured(im, bg, tol=32, open_iters=1, var_thresh=20):
    """Like color_key(), but a pixel only counts as background if it's ALSO
    locally smooth (low variance in a small window around it), not just
    close in color to `bg`.

    Needed for the shell/projectile source photo specifically: it sits on
    a smooth grey studio-lighting gradient, and the metal's own specular
    highlight streak happens to hit almost the exact same brightness as
    that gradient at the same image position -- plain color distance
    genuinely can't tell them apart there (verified: tightening `tol`
    alone just shrinks/grows the same hole in the highlight, it doesn't
    move it). But the true background is a smooth gradient (near-zero
    local variance), while the highlight sits within the metal's surface
    texture (real local variance, even where it's momentarily just as
    bright) -- so requiring low variance in addition to color closeness
    keys out the gradient without eating the highlight.
    """
    im = im.convert("RGB")
    arr = np.array(im).astype(float)
    gray = arr.mean(axis=2)

    bg_arr = np.array(bg, dtype=int)
    if bg_arr.ndim == 1:
        bg_arr = bg_arr[None, :]
    dists = np.abs(arr.astype(int)[:, :, None, :] - bg_arr[None, None, :, :]).sum(axis=3)
    close = dists.min(axis=2) < tol * 3

    win = 5
    mean = ndimage.uniform_filter(gray, size=win)
    mean_sq = ndimage.uniform_filter(gray**2, size=win)
    local_var = np.clip(mean_sq - mean**2, 0, None)
    close = close & (local_var < var_thresh)

    structure = np.ones((3, 3), dtype=bool)
    opened = ndimage.binary_opening(close, structure=structure, iterations=open_iters)
    labeled, _ = ndimage.label(opened)
    border_labels = set(labeled[0, :]) | set(labeled[-1, :]) | set(labeled[:, 0]) | set(labeled[:, -1])
    border_labels.discard(0)
    bg_mask = np.isin(labeled, list(border_labels))
    bg_mask = ndimage.binary_dilation(bg_mask, structure=structure, iterations=open_iters) & close

    alpha = np.where(bg_mask, 0, 255).astype(np.uint8)
    rgb = np.array(im)
    rgb[bg_mask] = 0
    return Image.fromarray(np.dstack([rgb, alpha]), mode="RGBA")


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
    """Player tower turrets, from the second-generation reference renders
    in diseño torres/ (torre simple/doble/laser.jpg) -- clean, isolated,
    photorealistic top-down turrets on a uniform dark background each,
    replacing the original tanques.jpg composite sheet's cruder, more
    cartoonish crops. Much simpler to extract: no labels to erase, no
    neighboring-turret bleed, one flat background color per image.
    """
    sources = {
        # (filename stem, barrel direction in the source image)
        "tower_basic": ("torre simple", "down"),
        "tower_double": ("torre doble", "up"),
        "tower_laser": ("torre laser", "up"),
    }
    for out_name, (stem, direction) in sources.items():
        im = Image.open(ROOT / "diseño torres" / f"{stem}.jpg").convert("RGB")
        bg = im.getpixel((5, 5))
        keyed = color_key(im, bg)
        # The game's rotation convention is angle=0 -> barrel points +x
        # (right). Rotate whichever way the source's barrel actually
        # points into that orientation: PIL's rotate() is counter-clockwise,
        # under which "points down" ends up "points right" (+90) and
        # "points up" ends up "points right" via a clockwise turn (-90).
        keyed = keyed.rotate(90 if direction == "down" else -90, expand=True)
        keyed = downscale(keyed)
        keyed.save(OUT / f"{out_name}.png")


def tint_toward(im, target_rgb, strength=0.55):
    """Blend an RGBA image's per-pixel gray value toward target_rgb, keeping
    alpha untouched. Preserves shading/detail (each pixel keeps its own
    brightness) while shifting the overall hue -- used both for the enemy
    tank's rust-red recolor and for nudging the player towers' palettes
    away from the map's own green/olive tones so they stay visible against
    the terrain instead of blending into it."""
    im = im.convert("RGBA")
    arr = np.array(im).astype(float)
    r, g, b, a = arr[..., 0], arr[..., 1], arr[..., 2], arr[..., 3]
    gray = (r + g + b) / 3
    tr, tg, tb = target_rgb
    nr = gray + (tr - gray) * strength
    ng = gray + (tg - gray) * strength
    nb = gray + (tb - gray) * strength
    out = np.stack([nr, ng, nb, a], axis=-1)
    out = np.clip(out, 0, 255).astype(np.uint8)
    return Image.fromarray(out, mode="RGBA")


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
    # Like the player towers, the source art's natural olive/khaki tone
    # (mean RGB ~71,70,60) is dark and low-saturation -- almost identical
    # to the trench's own dirt color, so at the tiny on-screen draw size
    # it effectively disappears against the terrain. Warm the tint up so
    # it reads as a distinct enemy unit against both grass and dirt.
    buggy_rgba = tint_toward(buggy_rgba, (195, 140, 70), strength=0.35)
    downscale(buggy_rgba).save(OUT / "enemy_buggy.png")

    soldier_box = (895, 450, 990, 550)
    soldier = im.crop(soldier_box)
    soldier_rgba = color_key(soldier, bg)
    soldier_rgba = clear_regions(soldier_rgba, [
        (lx0 - soldier_box[0], ly0 - soldier_box[1], lx1 - soldier_box[0], ly1 - soldier_box[1])
        for (lx0, ly0, lx1, ly1) in label_boxes_orig
    ])
    # Same problem as the buggy, worse: at only ~95x100px before downscale
    # (drawn smaller still in-game than any other sprite), a dark
    # camo-green soldier on dark trench dirt was reported as effectively
    # invisible. A stronger, warmer tint than the buggy's gives the small
    # sprite some color to read even at a few pixels tall.
    soldier_rgba = tint_toward(soldier_rgba, (215, 165, 80), strength=0.5)
    downscale(soldier_rgba).save(OUT / "enemy_soldier.png")


def extract_new_enemies():
    """Motorcycle and rocket-launcher-truck enemies, added per user request
    (both are vehicles -- they use PATH, not SOLDIER_PATH, wired in
    main.js). Sources are clean top-down crops from their own reference
    sheets (enemigos/motocicletas.jpg, enemigos/lanzacohetes.jpg), each on
    a uniform grey background -- no labels or neighboring-art bleed to
    work around, same easy case as the tower turret renders.
    """
    moto_im = Image.open(ROOT / "enemigos" / "motocicletas.jpg").convert("RGB")
    moto_bg = moto_im.getpixel((2, 2))
    moto_box = (5, 50, 140, 275)
    moto = color_key(moto_im.crop(moto_box), moto_bg)
    # Source bike faces up (front wheel at the top); rotate it to the
    # game's +x-facing convention the same way tower_double/tower_laser
    # were (clockwise, i.e. PIL's -90, turns "up" into "right").
    moto = moto.rotate(-90, expand=True)
    downscale(moto).save(OUT / "enemy_motorcycle.png")

    rocket_im = Image.open(ROOT / "enemigos" / "lanzacohetes.jpg").convert("RGB")
    rocket_bg = rocket_im.getpixel((2, 2))
    rocket_box = (15, 50, 505, 270)
    rocket = color_key(rocket_im.crop(rocket_box), rocket_bg)
    # Source truck faces left (cab on the left); mirror it rather than
    # rotating 180, so "near/far side" stays up/down and only left-right
    # flips, same treatment as tower_double's mirrored barrels.
    rocket = rocket.transpose(Image.FLIP_LEFT_RIGHT)
    downscale(rocket).save(OUT / "enemy_rocket.png")


def extract_projectile():
    """A tank-shell/APFSDS-round sprite, from the user's reference image
    (enemigos/proyectil.jpg) -- used in-game for the two cannon towers
    (basic/double) and the tank/rocket enemies (game/js/simulate.js tags
    each shot's `style`; main.js draws "shell"-styled shots with this
    sprite and everything else as a lightweight tracer streak).

    The source photo shows the round tilted diagonally with its sabot
    petals mid-separation. Crop to just the intact rod+nose (the petals
    fall away at the muzzle in real life, so a shell mid-flight showing
    just the dart is the more accurate frame anyway), then rotate it
    level so it matches the game's angle=0 -> +x convention the same way
    every other directional sprite does.
    """
    im = Image.open(ROOT / "enemigos" / "proyectil.jpg").convert("RGB")
    crop = im.crop((1480, 480, 2888, 1080))
    # Source tilts down-to-the-right; rotating the crop +23 deg (PIL's
    # rotate() is counter-clockwise) levels the rod horizontally instead
    # of leaving the game's own angle=0 rotation doubling up on a tilt
    # that's already baked into the pixels.
    rotated = crop.rotate(23, expand=True, fillcolor=(200, 200, 200))
    leveled = rotated.crop((0, 440, 1090, 970))

    w, h = leveled.size
    bg_colors = [leveled.getpixel((w - 5, 5)), leveled.getpixel((w - 5, h - 5)),
                 leveled.getpixel((w // 2, 5)), leveled.getpixel((5, 5))]
    keyed = color_key_textured(leveled, bg_colors, tol=40, open_iters=1, var_thresh=20)
    downscale(keyed, max_edge=160).save(OUT / "projectile.png")


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


def remove_red_path_line(arr):
    """mapa.jpg has the intended route drawn on it as a solid red line
    (plus its "ENEMY PATH" legend swatch and minimap inset, handled
    separately below) -- useful as a guide while designing the route, but
    the player was still seeing it on screen since it's part of the
    source photo, not something game/js draws. Detect the line's
    strongly-red pixels and nearest-neighbor inpaint them from the
    surrounding terrain: the line is only a few pixels wide, so "copy the
    closest non-red pixel's color" reconstructs plausible ground texture
    without needing a real inpainting model.
    """
    r = arr[..., 0].astype(int)
    g = arr[..., 1].astype(int)
    b = arr[..., 2].astype(int)
    mask = (r - g > 50) & (r - b > 50) & (r > 100)
    # Grow the mask a couple px to also catch the line's anti-aliased edge
    # pixels, which are pink/orange rather than pure red and would
    # otherwise leave a faint halo behind.
    mask = ndimage.binary_dilation(mask, iterations=3)
    if not mask.any():
        return arr
    _, nearest_idx = ndimage.distance_transform_edt(mask, return_distances=True, return_indices=True)
    out = arr.copy()
    out[mask] = arr[tuple(idx[mask] for idx in nearest_idx)]
    return out


def extract_map():
    im = Image.open(ROOT / "mapa.jpg").convert("RGB")
    arr = np.array(im)
    arr = remove_red_path_line(arr)
    # Paint over the baked-in "ENEMY PATH" legend and the corner minimap so
    # our own HUD/path drawing isn't fighting the source art. This stays
    # opaque (map_bg.png has no alpha channel).
    #
    # A flat median-color fill (the original approach) reads as an obvious
    # solid block once the map is on screen -- real grass has visible blade
    # texture and tonal variation a single flat color can't fake. Instead,
    # clone real texture: copy a same-size patch of genuine grass from
    # directly adjacent to each box (so lighting/terrain matches) straight
    # over it. Not a seamless blend, but a real photo patch reads as real
    # terrain in a way a flat fill never does.
    def clone_patch(dest_box, src_origin):
        dx0, dy0, dx1, dy1 = dest_box
        w, h = dx1 - dx0, dy1 - dy0
        sx0, sy0 = src_origin
        arr[dy0:dy1, dx0:dx1] = arr[sy0:sy0 + h, sx0:sx0 + w]

    legend_box = (2000, 60, 2400, 140)
    # source: the same width/height strip directly below the legend box,
    # which is open terrain in the source image
    clone_patch(legend_box, (legend_box[0], legend_box[3]))

    minimap_box = (0, 1370, 430, 1792)
    # source: the same width/height strip directly above the minimap box
    lh = minimap_box[3] - minimap_box[1]
    clone_patch(minimap_box, (minimap_box[0], minimap_box[1] - lh))

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


def extract_map_level2():
    """Level 2's map ("mapas/mapa level 2.jpg", 1024x765) has two inset
    boxes baked in -- a blank reference square (bottom-left) and a
    minimap showing the road's Y-fork (bottom-right) -- that read as
    stray UI floating over the terrain once the map is actually on
    screen, the same problem extract_map() solves for the original map's
    legend/minimap. Same fix: clone real texture from directly above
    each box over it, no color-keying needed since there's no line to
    remove here (this map's route was traced by hand from the image
    directly, not drawn on it -- see levels.js).
    """
    im = Image.open(ROOT / "mapas" / "mapa level 2.jpg").convert("RGB")
    arr = np.array(im)

    def clone_patch(dest_box, src_origin):
        dx0, dy0, dx1, dy1 = dest_box
        w, h = dx1 - dx0, dy1 - dy0
        sx0, sy0 = src_origin
        arr[dy0:dy1, dx0:dx1] = arr[sy0:sy0 + h, sx0:sx0 + w]

    # Both boxes run to the bottom edge (they include a caption strip
    # above the inset itself), so the source patch has to come from
    # directly above rather than the more usual "adjacent strip" -- there
    # is no "below."
    clone_patch((0, 540, 200, 765), (0, 315))
    clone_patch((895, 540, 1024, 750), (895, 330))

    out_img = Image.fromarray(arr).resize((MAP_WIDTH, MAP_HEIGHT), Image.Resampling.LANCZOS)
    out_img.save(OUT / "map_bg_level2.png")


def extract_map_level3():
    """Level 3's map ("mapas/mapa_nivel3_raw.png", 2048x2048, AI-generated
    per user request for a large scrollable base-defense map) ships at its
    full native size instead of being squashed to MAP_WIDTH x MAP_HEIGHT
    like levels 1/2 -- the whole point of this level is a world bigger
    than the fixed 1200x750 viewport, scrolled via game/js/main.js's
    camera. No clone-patching needed: the generation prompt explicitly
    excluded any baked-in text/UI/labels, so there's nothing to erase.
    """
    # JPEG, not PNG like levels 1/2: at this map's native 2048x2048 (4x the
    # pixel count of the other levels' 1200x750, since it isn't downscaled
    # to the viewport) a PNG came to ~9MB -- this photographic content
    # compresses far better as JPEG (~1.7MB at q88, in line with the other
    # two levels' file sizes) with no visible quality loss.
    im = Image.open(ROOT / "mapas" / "mapa_nivel3_raw.png").convert("RGB")
    im.save(OUT / "map_bg_level3.jpg", quality=88, optimize=True)


def extract_armor_icon():
    """The original 3-skill upgrade panel (diseño mejoras.jpg -> ui_icon_
    damage/range/firerate.png) was cropped by hand in an earlier session
    and those crop boxes were never recorded here -- so this only adds
    the new 4th skill ("Blindaje") added on top, from the user's
    follow-up mockup (Mejoras/diseño mejoras ampliado.jpg), without
    touching the other three. Like those, this is a plain crop (no
    color-keying): the card's own blurred background art is meant to
    show through, matching game/js/ui.js's .upgrade-card treatment
    (icon image on top, dark card fill blending in below).
    """
    im = Image.open(ROOT / "Mejoras" / "diseño mejoras ampliado.jpg").convert("RGB")
    im.crop((757, 63, 967, 157)).save(OUT / "ui_icon_armor.png")


if __name__ == "__main__":
    extract_towers()
    extract_enemies()
    extract_new_enemies()
    extract_projectile()
    extract_explosion()
    extract_map()
    extract_map_level2()
    extract_map_level3()
    extract_armor_icon()
    print("Assets written to", OUT)
