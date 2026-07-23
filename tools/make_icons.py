from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
ICON_DIR = ROOT / "icons"
ICON_DIR.mkdir(exist_ok=True)

SIZES = [192, 512]
BG = (44, 110, 73)  # var(--primary)
FG = (255, 255, 255)


def find_font(size):
    candidates = [
        r"C:\Windows\Fonts\YuGothB.ttc",
        r"C:\Windows\Fonts\meiryob.ttc",
        r"C:\Windows\Fonts\msgothic.ttc",
    ]
    for c in candidates:
        if Path(c).exists():
            return ImageFont.truetype(c, size)
    return ImageFont.load_default()


def make_icon(size):
    img = Image.new("RGB", (size, size), BG)
    draw = ImageDraw.Draw(img)
    font = find_font(int(size * 0.62))
    text = "漢"
    bbox = draw.textbbox((0, 0), text, font=font)
    w, h = bbox[2] - bbox[0], bbox[3] - bbox[1]
    draw.text(((size - w) / 2 - bbox[0], (size - h) / 2 - bbox[1]), text, font=font, fill=FG)
    img.save(ICON_DIR / f"icon-{size}.png")


for s in SIZES:
    make_icon(s)

print("icons generated:", [p.name for p in ICON_DIR.glob("*.png")])
