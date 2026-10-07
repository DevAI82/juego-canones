"""Extracts 3D turret build animations from the 720p videos in upright orientation
with clean alpha masks and transparent backgrounds.
"""
import cv2
import numpy as np
from PIL import Image
from scipy import ndimage
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "game" / "assets"
OUT.mkdir(parents=True, exist_ok=True)

TURRETS = {
    "basic": {
        "video": ROOT / "animaciones" / "Torreta Simple" / "torreta simple 720.mp4",
        "sheet_name": "tower_basic_build.png",
        "is_laser": False,
    },
    "double": {
        "video": ROOT / "animaciones" / "Torreta doble" / "torreta doble 720.mp4",
        "sheet_name": "tower_double_build.png",
        "is_laser": False,
    },
    "laser": {
        "video": ROOT / "animaciones" / "Torreta láser" / "video laser.mp4",
        "sheet_name": "tower_laser_build.png",
        "is_laser": True,
    },
}

COLS, ROWS = 6, 5
N_FRAMES = COLS * ROWS
FRAME_OUT_SIZE = 240


def clean_laser_frame(crop):
    bg_corners = np.vstack([
        crop[:40, :40].reshape(-1, 3),
        crop[:40, -40:].reshape(-1, 3),
        crop[-40:, :40].reshape(-1, 3),
        crop[-40:, -40:].reshape(-1, 3),
    ])
    bg_mean = bg_corners.mean(axis=0)

    diff = np.linalg.norm(crop.astype(float) - bg_mean, axis=2)
    hsv = cv2.cvtColor(crop, cv2.COLOR_BGR2HSV)
    sat = hsv[:, :, 1]

    is_bg = (diff < 24) & (sat < 25)

    labeled, num = ndimage.label(is_bg)
    border_labels = set(labeled[0, :]) | set(labeled[-1, :]) | set(labeled[:, 0]) | set(labeled[:, -1])
    border_labels.discard(0)

    bg_mask = np.isin(labeled, list(border_labels))
    bg_mask_dilated = ndimage.binary_dilation(bg_mask, iterations=3)

    fg_mask = ~bg_mask_dilated
    labeled_fg, num_fg = ndimage.label(fg_mask)
    if num_fg > 0:
        sizes = ndimage.sum(fg_mask, labeled_fg, range(1, num_fg + 1))
        large_labels = [i + 1 for i, s in enumerate(sizes) if s > 200]
        fg_mask = np.isin(labeled_fg, large_labels)

    alpha_smooth = cv2.GaussianBlur(fg_mask.astype(np.float32), (5, 5), 0)
    alpha_u8 = (np.clip(alpha_smooth, 0, 1) * 255).astype(np.uint8)

    rgb = cv2.cvtColor(crop, cv2.COLOR_BGR2RGB)
    rgb[alpha_u8 == 0] = 0
    return Image.fromarray(np.dstack([rgb, alpha_u8]), mode="RGBA")


def extract_build_sheets():
    for key, config in TURRETS.items():
        vpath = str(config["video"])
        cap = cv2.VideoCapture(vpath)
        total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

        x0, y0, x1, y1 = 140, 0, 1140, 720
        h, w = 720, 1000

        yy, xx = np.ogrid[:h, :w]
        cy, cx = h // 2, w // 2
        dist = np.sqrt(((xx - cx) / (w / 2)) ** 2 + ((yy - cy) / (h / 2)) ** 2)
        radial_mask = np.clip(1.0 - (dist - 0.65) / 0.30, 0.0, 1.0)
        radial_mask = cv2.GaussianBlur(radial_mask.astype(np.float32), (15, 15), 0)

        indices = [round(i * (total - 1) / (N_FRAMES - 1)) for i in range(N_FRAMES)]
        sheet = Image.new("RGBA", (FRAME_OUT_SIZE * COLS, FRAME_OUT_SIZE * ROWS), (0, 0, 0, 0))

        # Get bounding box from last frame
        cap.set(cv2.CAP_PROP_POS_FRAMES, total - 1)
        _, flast = cap.read()
        crop_last = flast[y0:y1, x0:x1]
        last_rgba = clean_laser_frame(crop_last) if config["is_laser"] else None
        bbox = last_rgba.getbbox() if last_rgba else None

        for i, idx in enumerate(indices):
            cap.set(cv2.CAP_PROP_POS_FRAMES, idx)
            _, frame = cap.read()
            crop = frame[y0:y1, x0:x1]

            if config["is_laser"] and i > 20:
                rgba = clean_laser_frame(crop)
            else:
                rgb = cv2.cvtColor(crop, cv2.COLOR_BGR2RGB)
                alpha_u8 = (radial_mask * 255).astype(np.uint8)
                rgb[alpha_u8 == 0] = 0
                rgba = Image.fromarray(np.dstack([rgb, alpha_u8]), mode="RGBA")

            if bbox:
                frame_crop = rgba.crop(bbox)
                fcw, fch = frame_crop.size
                max_fd = int(max(fcw, fch) * 1.15)
                square_frame = Image.new("RGBA", (max_fd, max_fd), (0, 0, 0, 0))
                square_frame.paste(frame_crop, ((max_fd - fcw) // 2, ((max_fd - fch) // 2)))
                rgba_resized = square_frame.resize((FRAME_OUT_SIZE, FRAME_OUT_SIZE), Image.Resampling.LANCZOS)
            else:
                rgba_resized = rgba.resize((FRAME_OUT_SIZE, FRAME_OUT_SIZE), Image.Resampling.LANCZOS)

            col = i % COLS
            row = i // COLS
            sheet.paste(rgba_resized, (col * FRAME_OUT_SIZE, row * FRAME_OUT_SIZE), rgba_resized)

        cap.release()
        sheet.save(OUT / config["sheet_name"])
        print(f"[{key}] Saved upright build sheet: {config['sheet_name']}")


if __name__ == "__main__":
    extract_build_sheets()
