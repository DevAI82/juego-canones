"""The harvester (per user request: a vehicle to build in the RTS mode, still
to be designed), cut out of the user's drawings in enemigos/. Run from the
project root:
    python tools/extract_harvester.py
Needs rembg, like tools/extract_buildings.py (whose cut-out steps it uses).

  - enemigos/cosechadora cenital lateral.jpg is a reference sheet: the
    harvester seen from straight above (top left) and three side views,
    with titles and notes. The view from above is what the game draws on
    the map -- turned to where the vehicle heads, like every other unit --
    so it's cut out, freed of its notes and flipped to face right (the way
    the game's unit sprites face: enemy_tank.png and the rest), into
    game/assets/unit_harvester.png, 512 px long like them.
  - enemigos/cosechadora.jpg, the harvester in the isometric style of the
    buildings, becomes its portrait for a build button:
    game/assets/harvester_portrait.webp.
"""
import os
import sys

from PIL import Image, ImageFilter

sys.path.insert(0, os.path.dirname(__file__))
from extract_buildings import cut, trimmed  # noqa: E402

SHEET = os.path.join("enemigos", "cosechadora cenital lateral.jpg")
ISOMETRIC = os.path.join("enemigos", "cosechadora.jpg")
OUT = os.path.join("game", "assets")
# The view from above on the reference sheet (its top-left quarter, with
# room around it; the notes there are dropped with the cut-out).
TOP_VIEW = (90, 160, 1380, 780)


def without_thin_lines(rgba):
    """The notes' pointer lines touch the vehicle, so they survive the
    cut-out: anything a few px thin goes (an opening of the alpha), the
    vehicle's own edges kept by growing what's left back a little."""
    alpha = rgba.getchannel("A")
    solid = alpha.point(lambda v: 255 if v > 40 else 0).filter(ImageFilter.MinFilter(7)).filter(ImageFilter.MaxFilter(11))
    out = rgba.copy()
    out.putalpha(Image.composite(alpha, Image.new("L", alpha.size, 0), solid))
    return out


def main():
    from rembg import new_session

    session = new_session("isnet-general-use")
    top = trimmed(without_thin_lines(cut(session, Image.open(SHEET).crop(TOP_VIEW))))
    top = top.transpose(Image.FLIP_LEFT_RIGHT)
    top = top.resize((512, round(top.height * 512 / top.width)), Image.LANCZOS)
    top.save(os.path.join(OUT, "unit_harvester.png"), optimize=True)
    portrait = trimmed(cut(session, Image.open(ISOMETRIC)))
    portrait = portrait.resize((360, round(portrait.height * 360 / portrait.width)), Image.LANCZOS)
    portrait.save(os.path.join(OUT, "harvester_portrait.webp"), quality=86, method=6)
    print(f"unit_harvester.png {top.size}, harvester_portrait.webp {portrait.size}")


if __name__ == "__main__":
    main()
