"""What the maps' ground painters share (plain Python: numpy + PIL).

A Canvas is a map's ground at `scale` pixels to the world px: its arrays are
(height * scale, width * scale), but xx and yy -- every pixel's place -- are
in world px, so what's painted is written in the game's own coordinates.
"""
import math
import random

import numpy as np
from PIL import Image, ImageDraw, ImageFilter


def smooth(lo, hi, v):
    t = np.clip((v - lo) / (hi - lo), 0, 1)
    return t * t * (3 - 2 * t)


def mix(base, color, mask):
    return base + (np.asarray(color, np.float32) - base) * mask[..., None]


class Canvas:
    def __init__(self, width, height, seed, scale=1):
        self.W, self.H, self.S, self.seed = width, height, scale, seed
        self.w, self.h = int(width * scale), int(height * scale)
        self.rng = random.Random(seed)
        self.nrng = np.random.default_rng(seed)
        yy, xx = np.mgrid[0:self.h, 0:self.w].astype(np.float32)
        self.xx, self.yy = (xx + 0.5) / scale, (yy + 0.5) / scale
        self.grain = self.nrng.random((self.h, self.w)).astype(np.float32)
        self.speck = self.nrng.random((self.h, self.w)).astype(np.float32)

    def flat(self, c):
        return np.broadcast_to(np.float32(c), (self.h, self.w, 3)).copy()

    def fbm(self, size, octaves=4, seed=0):
        """Smooth noise in 0..1, its largest blobs about `size` world px across."""
        r = np.random.default_rng(self.seed * 1000 + seed)
        total = np.zeros((self.h, self.w), np.float32)
        amp, norm = 1.0, 0.0
        for o in range(octaves):
            n = max(2, int(self.W / size * 2 ** o) + 2)
            m = max(2, int(self.H / size * 2 ** o) + 2)
            small = Image.fromarray((r.random((m, n)) * 255).astype(np.uint8))
            total += amp * np.asarray(small.resize((self.w, self.h), Image.BICUBIC), np.float32) / 255
            norm += amp
            amp *= 0.5
        return total / norm

    def polyline_field(self, lines):
        """For every pixel: how far (world px) the nearest of these polylines
        is, and how far along it that nearest point is."""
        best = np.full((self.h, self.w), 1e9, np.float32)
        along = np.zeros((self.h, self.w), np.float32)
        for pts in lines:
            run = 0.0
            for a, b in zip(pts, pts[1:]):
                ax, ay, bx, by = a["x"], a["y"], b["x"], b["y"]
                dx, dy = bx - ax, by - ay
                length = math.hypot(dx, dy)
                if length < 1e-6:
                    continue
                t = np.clip(((self.xx - ax) * dx + (self.yy - ay) * dy) / (length * length), 0, 1)
                d = np.hypot(self.xx - ax - t * dx, self.yy - ay - t * dy)
                closer = d < best
                best = np.where(closer, d, best)
                along = np.where(closer, run + t * length, along)
                run += length
        return best, along

    def mask(self, draw):
        """A 0..1 mask painted with PIL in world px: draw(d, k) gets the
        ImageDraw and k, a function scaling world coordinates to its pixels."""
        im = Image.new("L", (self.w, self.h), 0)
        s = self.S
        draw(ImageDraw.Draw(im), lambda *v: tuple(c * s for c in v))
        return np.asarray(im, np.float32) / 255

    def rect(self, x0, y0, x1, y1):
        return self.mask(lambda d, k: d.rectangle(k(x0, y0, x1, y1), fill=255))

    def polygon(self, pts):
        return self.mask(lambda d, k: d.polygon([k(x, y) for x, y in pts], fill=255))

    def lines(self, polylines, width):
        s = self.S
        return self.mask(lambda d, k: [d.line([k(x, y) for x, y in pts], fill=255, width=max(1, round(width * s)), joint="curve") for pts in polylines])

    def blur(self, m, radius):
        im = Image.fromarray((np.clip(m, 0, 1) * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(radius * self.S))
        return np.asarray(im, np.float32) / 255

    def window(self, x, y, r):
        """The slice of the arrays within r world px of (x, y), and its xx, yy."""
        s = self.S
        x0, x1 = int(max(0, (x - r) * s)), int(min(self.w, (x + r) * s))
        y0, y1 = int(max(0, (y - r) * s)), int(min(self.h, (y + r) * s))
        sl = (slice(y0, y1), slice(x0, x1))
        return sl, self.xx[sl], self.yy[sl]

    def crater(self, color, height, x, y, r):
        """A scorched bowl with a pale rim of thrown earth and rays of soot."""
        sl, sx, sy = self.window(x, y, r * 3.2)
        d = np.hypot(sx - x, sy - y) / r
        ang = np.arctan2(sy - y, sx - x)
        bowl = np.clip(1 - d, 0, 1) ** 1.3
        rim = np.exp(-((d - 1.15) / 0.3) ** 2)
        rays = np.clip(np.sin(ang * 7 + x) * 0.5 + np.sin(ang * 13 + y) * 0.5, 0, 1) * np.clip(2.8 - d, 0, 1) * (d > 1.2)
        patch = color[sl]
        patch = mix(patch, (0.07, 0.06, 0.05), bowl * 0.92)
        patch = mix(patch, (0.5, 0.43, 0.32), rim * 0.6)
        patch = mix(patch, (0.1, 0.09, 0.08), rays * 0.5)
        color[sl] = patch
        height[sl] += rim * 2.6 - bowl * r * 0.6

    def save(self, color, height, out):
        """The colours are as displayed (sRGB); the height as 16 bits about a mid grey."""
        Image.fromarray((np.clip(color, 0, 1) * 255).astype(np.uint8)).save(out / "ground_color.png")
        Image.fromarray(np.clip(32768 + height * 900, 0, 65535).astype(np.uint16)).save(out / "ground_height.png")


# ------------------------------------------------------- placing things

def seg_dist(px, py, a, b):
    ax, ay, bx, by = a["x"], a["y"], b["x"], b["y"]
    dx, dy = bx - ax, by - ay
    L = dx * dx + dy * dy
    t = max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / L)) if L else 0
    return math.hypot(px - ax - t * dx, py - ay - t * dy)


def dist_to(lines, px, py):
    return min((seg_dist(px, py, a, b) for pts in lines for a, b in zip(pts, pts[1:])), default=1e9)


def inside(poly, px, py):
    hit = False
    for a, b in zip(poly, poly[1:] + poly[:1]):
        if (a["y"] > py) != (b["y"] > py) and px < a["x"] + (py - a["y"]) / (b["y"] - a["y"]) * (b["x"] - a["x"]):
            hit = not hit
    return hit


def nearest(points, px, py):
    return min((math.hypot(px - x, py - y) for x, y in points), default=1e9)


def scatter(rng, count, ok, width, height, margin=10, tries=40):
    """Up to `count` random places for which ok(x, y, found) holds."""
    found = []
    for _ in range(count * tries):
        if len(found) >= count:
            break
        x, y = rng.uniform(margin, width - margin), rng.uniform(margin, height - margin)
        if ok(x, y, found):
            found.append((x, y))
    return found


def along(path, step, offset=0.0, start=0.0):
    """Points every `step` px along a polyline, `offset` px to its left, with
    the heading there (degrees, game coordinates)."""
    out = []
    run = start
    carried = 0.0
    for a, b in zip(path, path[1:]):
        dx, dy = b["x"] - a["x"], b["y"] - a["y"]
        length = math.hypot(dx, dy)
        if length < 1e-6:
            continue
        ux, uy = dx / length, dy / length
        t = run - carried
        while t < length:
            if t >= 0:
                out.append((a["x"] + ux * t + uy * offset, a["y"] + uy * t - ux * offset, math.degrees(math.atan2(uy, ux))))
            t += step
        run = t + carried
        carried += length
    return out
