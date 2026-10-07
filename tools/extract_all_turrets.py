"""Build-animation sprite sheets for all three player towers, plus cleanup
of their resting sprites. Run from the project root:
    python tools/extract_all_turrets.py
(also run by tools/extract_assets.py's __main__).

Sources are the user's 720p/24fps/4s build videos in animaciones/ -- each a
3D render of the turret assembling on a holographic build grid, with a
progress bar (and a percentage label) composited over the bottom of the
frame. The basic and double videos' labels show nonsense values (e.g.
"396%" halfway through, "100%" while the bar is half full), so all of that
baked-in UI is removed here and main.js draws its own progress bar instead,
the same for every tower type.

Per frame:
  1. Cut the baked-in UI (bar, label, side tick marks) away with a fixed,
     soft-edged per-video mask -- it's a static overlay, so the same
     rectangles cover it in every frame.
  2. Key the holographic effects (grid, wireframe, beams) by colour: they're
     the only strongly blue-dominant pixels in these renders.
  3. Key solid objects (parts, the turret) by difference from a clean plate:
     frame 0 with its hologram pixels filled in from their surroundings --
     the camera is locked, so that's the bare floor. Cast shadows (floor
     darkened by a locally constant factor) are excluded, and the
     silhouette is closed and hole-filled, since dark metal on a dark/gray
     floor otherwise only registers at its edges. Unlike the previous radial
     "porthole" mask, this keeps only what's actually being built, not a
     disc of the source's own road/studio floor.
  4. Drop small speckle by keeping only alpha components above a minimum
     area (not "connected to the center": floating parts mid-assembly are
     separate blobs and must survive).
  5. Crop a fixed square around the finished turret (same for every frame
     so the animation doesn't jitter) and fade its edge out softly, so the
     build grid -- wider than the turret -- dissolves instead of ending in
     a hard square edge.
"""
from pathlib import Path

import cv2
import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "game" / "assets"
OUT.mkdir(parents=True, exist_ok=True)

# x0, y0, x1, y1 rectangles (full 1280x720 frame coords) covering each
# video's baked-in UI, read off the frames themselves. The bar boxes run
# all the way to the frame's bottom edge: cutting just the bar left a notch
# in the front of the build grid; a straight cut reads cleaner.
TURRETS = {
    "basic": {
        "video": ROOT / "animaciones" / "Torreta Simple" / "torreta simple 720.mp4",
        "ui_boxes": [(365, 580, 915, 720)],
    },
    "double": {
        "video": ROOT / "animaciones" / "Torreta doble" / "torreta doble 720.mp4",
        "ui_boxes": [(330, 612, 950, 720), (80, 560, 215, 655), (1055, 540, 1190, 620), (0, 632, 1280, 648)],
    },
    "laser": {
        "video": ROOT / "animaciones" / "Torreta láser" / "video laser.mp4",
        "ui_boxes": [(305, 560, 970, 720)],
    },
}

# Must match main.js's BUILD_ANIM_COLS/ROWS.
COLS, ROWS = 8, 6
N_FRAMES = COLS * ROWS
FRAME_OUT_SIZE = 200
# Square crop side, as a multiple of the finished turret's larger bbox side
# -- leaves room for the build grid around it (faded out at the edge).
CROP_MARGIN = 1.45
MIN_COMPONENT_AREA = 350  # full-res px; smaller alpha blobs are speckle
DIFF_LOW, DIFF_HIGH = 45, 120


def ui_keep(shape, boxes, feather=10):
    """Alpha multiplier: 0 inside the baked-in UI boxes, ramping back up to 1
    over `feather` px around them -- the UI is simply cut away (with a soft
    edge) rather than inpainted, since inpainting a bar-sized strip leaves
    a smear that keys in as junk."""
    inside = np.zeros(shape[:2], dtype=bool)
    for x0, y0, x1, y1 in boxes:
        inside[y0:y1, x0:x1] = True
    dist = ndimage.distance_transform_edt(~inside)
    return np.clip(dist / feather, 0, 1)


def effect_alpha(rgb):
    """Soft alpha for the holographic effects (grid, wireframe, beams,
    glow): pixels where blue clearly dominates red/green."""
    r, g, b = (rgb[:, :, i].astype(float) for i in range(3))
    excess = b - np.maximum(r, g) * 0.92
    return np.clip((excess - 18) / 40, 0, 1) * (b > 70)


def make_plate(first):
    """Frame 0 with its own effect pixels filled in from their surroundings
    (normalized convolution with a wide Gaussian) -- the bare floor."""
    eff = ndimage.binary_dilation(effect_alpha(first) > 0.05, iterations=8)
    valid = (~eff).astype(float)
    out = first.astype(float).copy()
    todo = eff.copy()
    # Multi-scale: small kernels fill thin gaps faithfully; the wide ones
    # only reach the middle of big holes the small ones couldn't (a single
    # kernel left near-zero-weight black patches there).
    for sigma in (15, 50, 150):
        w = ndimage.gaussian_filter(valid, sigma)
        ok = todo & (w > 0.02)
        for c in range(3):
            filled = ndimage.gaussian_filter(first[:, :, c] * valid, sigma) / np.maximum(w, 1e-6)
            out[:, :, c] = np.where(ok, filled, out[:, :, c])
        todo &= ~ok
    return out


def solid_alpha(rgb, plate):
    """Alpha for solid (non-hologram) objects: turret parts, debris, dust.
    Pixels that differ from the plate count, EXCEPT ones that are just the
    plate darkened (same chromaticity, lower luma) -- the turret's cast
    shadow, which shouldn't come along onto the game map."""
    f = rgb.astype(float)
    diff = np.abs(f - plate).sum(axis=2)
    lf = f.sum(axis=2) + 1
    lp = plate.sum(axis=2) + 1
    chroma_d = np.abs(f / lf[:, :, None] - plate / lp[:, :, None]).sum(axis=2)
    # A cast shadow darkens the floor by a locally *constant* factor, so the
    # frame/plate luma ratio is smooth across it; an actual object (even a
    # dark-gray one on a gray floor) makes that ratio jump around.
    ratio = lf / lp
    ratio_std = np.sqrt(np.maximum(ndimage.uniform_filter(ratio**2, 7) - ndimage.uniform_filter(ratio, 7) ** 2, 0))
    # (Measured on the laser video's final frame: shadow pixels ratio_std
    # 0.004-0.011, turret pixels ~0.05. Chroma is only loosely bounded --
    # these studio shadows pick up a blue ambient tint.)
    shadow = (ratio < 0.96) & (chroma_d < 0.25) & (ratio_std < 0.02)
    a = np.clip((diff - DIFF_LOW) / (DIFF_HIGH - DIFF_LOW), 0, 1)
    return np.where(shadow, 0.0, a)


def read_frames(path):
    cap = cv2.VideoCapture(str(path))
    frames = []
    while True:
        ok, f = cap.read()
        if not ok:
            break
        frames.append(cv2.cvtColor(f, cv2.COLOR_BGR2RGB))
    cap.release()
    if not frames:
        raise RuntimeError(f"couldn't read any frames from {path}")
    return frames


def key_frame(rgb, plate, ui):
    solid = solid_alpha(rgb, plate)
    effect = effect_alpha(rgb)
    # Dark metal on a dark/gray floor only differs from the plate at its
    # edges and highlights, leaving holes through the middle of the turret.
    # Close the silhouette and fill it: any region fully enclosed by solid
    # pixels is part of the object. Hologram pixels are left out of this
    # (they're kept via `effect` instead) -- otherwise every cell of the
    # build grid counts as "enclosed" and gets filled with the floor.
    solid_core = (solid > 0.3) & (effect < 0.2)
    closed = ndimage.binary_closing(solid_core, structure=np.ones((3, 3), bool), iterations=6)
    filled = ndimage.binary_fill_holes(closed)
    solid = np.where(effect < 0.2, np.where(filled, 1.0, solid), 0.0)
    alpha = np.maximum(solid, effect) * ui
    hard = alpha > 0.15
    # Two passes also strips the thin penumbra outlines a removed shadow
    # leaves behind.
    hard = ndimage.binary_opening(hard, structure=np.ones((3, 3), bool), iterations=2)
    labeled, n = ndimage.label(hard)
    if not n:
        return np.zeros_like(alpha)
    sizes = ndimage.sum(hard, labeled, range(1, n + 1))
    keep = np.isin(labeled, [i + 1 for i, s in enumerate(sizes) if s >= MIN_COMPONENT_AREA])
    # grow back the edge the opening ate, keeping the soft alpha there
    keep = ndimage.binary_dilation(keep, iterations=3)
    return np.where(keep, alpha, 0.0)


def main_blob_bbox(alpha):
    """Bounding box of the largest solid region -- the finished turret --
    ignoring any stray bits elsewhere in frame."""
    hard = alpha > 0.5
    labeled, n = ndimage.label(hard)
    sizes = ndimage.sum(hard, labeled, range(1, n + 1))
    ys, xs = np.nonzero(labeled == 1 + int(np.argmax(sizes)))
    return xs.min(), ys.min(), xs.max(), ys.max()


def edge_fade(size):
    """Soft circular fade toward the crop's edge (1 inside, 0 at the edge)."""
    yy, xx = np.mgrid[:size, :size]
    c = (size - 1) / 2
    d = np.hypot(xx - c, yy - c) / c
    return np.clip((1.0 - d) / 0.22, 0, 1)


def extract_build_sheet(key, config):
    frames = read_frames(config["video"])
    total = len(frames)
    shape = frames[0].shape
    ui = ui_keep(shape, config["ui_boxes"])
    plate = make_plate(frames[0])

    # Fixed crop: around the finished turret in the last frame -- its solid
    # pixels only, since the build grid around it is connected and far
    # wider (the grid just gets faded out at the crop's edge).
    last = frames[-1]
    last_solid = key_frame(last, plate, ui) * (effect_alpha(last) < 0.2)
    bx0, by0, bx1, by1 = main_blob_bbox(last_solid)
    cx, cy = (bx0 + bx1) / 2, (by0 + by1) / 2
    side = int(max(bx1 - bx0, by1 - by0) * CROP_MARGIN)
    x0, y0 = int(cx - side / 2), int(cy - side / 2)
    fade = edge_fade(side)

    def crop(arr):
        # pad so a crop reaching past the frame edge stays aligned
        pad = side
        padded = np.pad(arr, ((pad, pad), (pad, pad)) + ((0, 0),) * (arr.ndim - 2))
        return padded[y0 + pad:y0 + pad + side, x0 + pad:x0 + pad + side]

    indices = [round(i * (total - 1) / (N_FRAMES - 1)) for i in range(N_FRAMES)]
    sheet = Image.new("RGBA", (FRAME_OUT_SIZE * COLS, FRAME_OUT_SIZE * ROWS), (0, 0, 0, 0))
    for i, idx in enumerate(indices):
        rgb = frames[idx]
        alpha = crop(key_frame(rgb, plate, ui)) * fade
        rgb_c = crop(rgb).copy()
        a8 = (alpha * 255).astype(np.uint8)
        rgb_c[a8 == 0] = 0
        im = Image.fromarray(np.dstack([rgb_c, a8]), "RGBA").resize((FRAME_OUT_SIZE, FRAME_OUT_SIZE), Image.Resampling.LANCZOS)
        sheet.paste(im, ((i % COLS) * FRAME_OUT_SIZE, (i // COLS) * FRAME_OUT_SIZE))
    sheet.save(OUT / f"tower_{key}_build.png", optimize=True)
    print(f"[{key}] tower_{key}_build.png: {N_FRAMES} frames, crop {side}px at ({x0},{y0})")


def clean_resting_sprites():
    """Remove stray specks/blobs from the resting tower sprites, keeping only
    their largest connected alpha region (tower_basic.png had an 845px
    leftover background blob beside the hull). Idempotent -- these PNGs
    have no source image in the repo, so they're cleaned in place."""
    for key in TURRETS:
        path = OUT / f"tower_{key}.png"
        arr = np.array(Image.open(path).convert("RGBA"))
        solid = arr[:, :, 3] > 24
        labeled, n = ndimage.label(solid)
        if n <= 1:
            continue
        sizes = ndimage.sum(solid, labeled, range(1, n + 1))
        main = ndimage.binary_dilation(labeled == (1 + int(np.argmax(sizes))), iterations=2)
        arr[~main] = 0
        Image.fromarray(arr, "RGBA").save(path, optimize=True)
        print(f"[{key}] tower_{key}.png: removed {n - 1} stray region(s)")


def main():
    for key, config in TURRETS.items():
        extract_build_sheet(key, config)
    clean_resting_sprites()


if __name__ == "__main__":
    main()
