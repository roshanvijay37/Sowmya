"""Turn the raw photos, cut-outs and depth maps into the web assets.

assets/img/{p,c,d}/<name>.webp          desktop
assets/img/{p,c}/m/<name>.webp          phones
Writes src/manifest.json with each image's aspect ratio.
"""
import json
from pathlib import Path
import numpy as np
from PIL import Image, ImageFilter, ImageOps
from scipy import ndimage as ndi

Image.MAX_IMAGE_PIXELS = None
ROOT = Path(r"C:\Users\USER\Desktop\Workk\Sowmya")
SRC = Path(r"D:\sowmya-work\originals")
HQ = Path(r"D:\sowmya-work\hq")
DEPTH = Path(r"D:\sowmya-work\depth")
OUT = ROOT / "assets" / "img"

SILK = "solo10 solo6 solo4 solo2 solo8 solo11 solo9".split()
NIGHTS = """group10 normal3 group4 normal15 group9 normal13 group14 group2 normal5 group13
group3 normal7 group7 group11 normal8 group6 group12 normal17 group8 normal11 normal6""".split()
LED = "normal11 group2 normal3 group4".split()
# Freestanding only when the photo shows her head to toe and no one touches her.
FREE = "solo10 solo6".split()
CUTS = "solo10 solo6 normal18 normal3 solo7 normal4".split()


def fit(im, size):
    im = im.copy()
    im.thumbnail((size, size), Image.LANCZOS)
    return im


def save(im, path, q):
    path.parent.mkdir(parents=True, exist_ok=True)
    im.save(path, "WEBP", quality=q, method=6, exact=False)


man = {"p": {}, "c": {}}

for n in SILK:
    b = ImageOps.exif_transpose(Image.open(SRC / f"{n}.jpg")).convert("RGB")
    b = fit(b, 300).filter(ImageFilter.GaussianBlur(11))
    save(b, OUT / "b" / f"{n}.webp", 60)

for n in dict.fromkeys(NIGHTS + LED + [s for s in SILK if s not in FREE]):
    im = ImageOps.exif_transpose(Image.open(SRC / f"{n}.jpg")).convert("RGB")
    man["p"][n] = round(im.width / im.height, 4)
    save(fit(im, 1500), OUT / "p" / f"{n}.webp", 80)
    save(fit(im, 900), OUT / "p" / "m" / f"{n}.webp", 72)
    d = Image.open(DEPTH / f"{n}.png").convert("L")
    d = d.filter(ImageFilter.GaussianBlur(1.2))   # softens the torn edge at the silhouette
    save(fit(d, 448), OUT / "d" / f"{n}.webp", 70)

for n in CUTS:
    im = Image.open(HQ / f"{n}.png").convert("RGBA")   # already trimmed, RGB is clean foreground
    man["c"][n] = round(im.width / im.height, 4)
    for size, q, sub in ((1700, 90, ""), (1000, 82, "m/")):
        path = OUT / "c" / f"{sub}{n}.webp"
        path.parent.mkdir(parents=True, exist_ok=True)
        # exact=True keeps colour under transparent pixels, or scaling draws a dark line round her.
        fit(im, size).save(path, "WEBP", quality=q, alpha_quality=100, method=6, exact=True)

(ROOT / "src" / "manifest.json").write_text(json.dumps(
    {**man, "silk": SILK, "free": FREE, "nights": NIGHTS, "led": LED, "cuts": CUTS}, indent=0))

tot = sum(f.stat().st_size for f in OUT.rglob("*.webp"))
desk = sum(f.stat().st_size for f in OUT.rglob("*.webp") if "\\m\\" not in str(f))
print("total MB", round(tot / 1e6, 1), "desktop MB", round(desk / 1e6, 1))
