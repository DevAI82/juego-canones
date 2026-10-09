"""The game's icons for installing it on a phone (a PWA), from the user's
drawing Imágenes/pantalla inicio tower.png. Run from the project root:
    python tools/make_pwa_icons.py

The drawing is a 1362 px square at the left of a white canvas: it's cut out
of the white and scaled to each icon:
  - icon-192.png, icon-512.png: the drawing itself, square;
  - icon-maskable-512.png: the drawing at 80 %, on its own dark edge colour,
    since Android may crop a "maskable" icon to a circle or a rounded
    square and keeps only the middle 80 % safe;
  - apple-touch-icon.png (180 px): what an iPhone puts on its home screen.
"""
import os

from PIL import Image, ImageChops, ImageStat

SRC = os.path.join("Imágenes", "pantalla inicio tower.png")
OUT = os.path.join("game", "assets", "icons")


def drawing():
    im = Image.open(SRC).convert("RGB")
    white = Image.new("RGB", im.size, (255, 255, 255))
    ink = ImageChops.difference(im, white).convert("L").point(lambda v: 255 if v > 18 else 0)
    return im.crop(ink.getbbox())


def main():
    os.makedirs(OUT, exist_ok=True)
    art = drawing()
    for size, name in [(192, "icon-192.png"), (512, "icon-512.png"), (180, "apple-touch-icon.png")]:
        art.resize((size, size), Image.LANCZOS).save(os.path.join(OUT, name), optimize=True)
    # The maskable one: the drawing's own edge colour around it.
    edge = art.crop((0, 0, art.width, 8))
    fill = tuple(int(c) for c in ImageStat.Stat(edge).mean)
    canvas = Image.new("RGB", (512, 512), fill)
    inner = round(512 * 0.8)
    canvas.paste(art.resize((inner, inner), Image.LANCZOS), ((512 - inner) // 2, (512 - inner) // 2))
    canvas.save(os.path.join(OUT, "icon-maskable-512.png"), optimize=True)
    print(f"icons in {OUT}, maskable edge colour {fill}")


if __name__ == "__main__":
    main()
