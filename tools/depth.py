"""Depth Anything V2 (small) on the photos; writes 16-bit-ish 8-bit PNGs to D:/sowmya-work/depth.

Near = white. Used to push each portrait's pixels forward in a vertex shader.
"""
import sys, time
from pathlib import Path
import numpy as np
import onnxruntime as ort
from PIL import Image, ImageOps

Image.MAX_IMAGE_PIXELS = None
SRC = Path(r"D:\sowmya-work\originals")
OUT = Path(r"D:\sowmya-work\depth")
MODEL = r"D:\sowmya-work\models\da2s.onnx"

opts = ort.SessionOptions()
opts.intra_op_num_threads = 12
s = ort.InferenceSession(MODEL, opts, providers=["CPUExecutionProvider"])
inp = s.get_inputs()[0].name
MEAN = np.array([0.485, 0.456, 0.406]); STD = np.array([0.229, 0.224, 0.225])

names = sys.argv[1:] or sorted(p.stem for p in SRC.glob("*.jpg"))
for n in names:
    dst = OUT / f"{n}.png"
    if dst.exists():
        continue
    t = time.time()
    im = ImageOps.exif_transpose(Image.open(SRC / f"{n}.jpg")).convert("RGB")
    w, h = im.size
    k = 518 / min(w, h)
    nw, nh = [max(14, int(round(v * k / 14)) * 14) for v in (w, h)]
    nw, nh = min(nw, 924), min(nh, 924)
    x = np.asarray(im.resize((nw, nh), Image.BICUBIC), np.float32) / 255
    x = ((x - MEAN) / STD).transpose(2, 0, 1)[None].astype(np.float32)
    d = s.run(None, {inp: x})[0].squeeze()
    lo, hi = np.percentile(d, [1, 99])
    d = np.clip((d - lo) / (hi - lo), 0, 1)
    Image.fromarray((d * 255).astype(np.uint8)).save(dst)
    print(n, (nw, nh), f"{time.time() - t:.1f}s", flush=True)
print("DONE", flush=True)
