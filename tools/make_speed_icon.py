# Makes game/assets/ui_icon_speed.png -- the unit upgrade panel's
# «Velocidad» card -- in the style of the other ui_icon_*.png hologram
# cards: ui_icon_ammo.png's dark panel with its art painted out, and cyan
# chevrons, motion streaks and a small speedometer drawn in with a glow.
# Usage: python tools/make_speed_icon.py game/assets/ui_icon_ammo.png game/assets/ui_icon_speed.png
import sys
from PIL import Image, ImageDraw, ImageFilter

src, out = sys.argv[1], sys.argv[2]
base = Image.open(src).convert("RGB")
W, H = base.size
# The panel's own background, from an empty strip (darkened: the strip is
# lit a little by the old art's glow), painted over the old art...
bg = tuple(int(c * 0.55) for c in base.crop((8, H - 30, 60, H - 8)).resize((1, 1), Image.BOX).getpixel((0, 0)))
panel = base.copy()
ImageDraw.Draw(panel).rectangle([10, 10, W - 12, H - 12], fill=bg)
# ...keeping a little of the panel's vignette from a blurred copy.
soft = base.filter(ImageFilter.GaussianBlur(40))
mask = Image.new("L", (W, H), 0)
ImageDraw.Draw(mask).rectangle([10, 10, W - 12, H - 12], fill=255)
panel = Image.composite(Image.blend(panel, soft, 0.2), base, mask)

art = Image.new("RGBA", (W, H), (0, 0, 0, 0))
d = ImageDraw.Draw(art)
cyan = (150, 235, 245, 255)
for i, x in enumerate((70, 115, 160)):  # three chevrons, brighter to the right
    d.line([(x, 50), (x + 38, 90), (x, 130)], fill=(150, 235, 245, 120 + 60 * i), width=9, joint="curve")
for y, x0 in ((70, 22), (90, 10), (110, 22)):  # motion streaks behind them
    d.line([(x0, y), (x0 + 38, y)], fill=(150, 235, 245, 110), width=4)
cx, cy, r = W - 55, 52, 26  # a speedometer badge, like the other cards' corner badges
d.arc([cx - r, cy - r, cx + r, cy + r], 150, 390, fill=cyan, width=4)
d.line([(cx, cy), (cx + 16, cy - 14)], fill=cyan, width=4)

glow = art.filter(ImageFilter.GaussianBlur(6))
img = panel.convert("RGBA")
img.alpha_composite(glow)
img.alpha_composite(glow)
img.alpha_composite(art)
img.convert("RGB").save(out)
print("wrote", out, img.size)
