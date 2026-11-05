"""Cut Sowmya out of the stage photos (birefnet). Raw results land in D:/sowmya-work/cut.

Some photos have other people next to her; those are handled later by crop boxes
in assets.py, because a matting model keeps everyone it finds.
"""
import os, sys, time
from pathlib import Path
from PIL import Image, ImageOps
from rembg import new_session, remove

Image.MAX_IMAGE_PIXELS = None
SRC = Path(r"D:\sowmya-work\originals")
OUT = Path(r"D:\sowmya-work\cut")
NAMES = sys.argv[1:] or """normal2 normal4 normal10 normal11 normal12 normal14 normal16
normal18 normal19 normal9 normal6 profile solo7 solo3 solo8""".split()

session = new_session("birefnet-portrait")
for n in NAMES:
    dst = OUT / f"{n}.png"
    if dst.exists():
        continue
    t = time.time()
    im = ImageOps.exif_transpose(Image.open(SRC / f"{n}.jpg")).convert("RGB")
    im.thumbnail((2400, 2400), Image.LANCZOS)
    cut = remove(im, session=session, post_process_mask=False)
    cut.save(dst)
    print(n, im.size, f"{time.time() - t:.0f}s", flush=True)
print("DONE", flush=True)
