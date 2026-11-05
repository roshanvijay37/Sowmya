"""Production cut-outs. python tools/cut_hq.py [names]

1. Crop tight on her, so the 1024px matting model spends its pixels on her.
2. Re-run the model on the head and feet alone, for hair strands and sandals.
3. Closed-form matting on the uncertain edge band, at working resolution.
4. Estimate true foreground colour, so no background tint survives in soft edges.
5. Keep only her (largest component, minus any EXCLUDE polygons).
Output: D:/sowmya-work/hq/<name>.png, RGB = clean foreground everywhere, A = matte.
"""
import sys, time
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageOps
from scipy import ndimage as ndi
from rembg import new_session, remove
from pymatting import estimate_alpha_cf, estimate_foreground_ml

Image.MAX_IMAGE_PIXELS = None
SRC = Path(r"D:\sowmya-work\originals")
OUT = Path(r"D:\sowmya-work\hq"); OUT.mkdir(exist_ok=True)
WORK = 2000   # long side of the working crop
DEFRINGE_IN = 2

# name: crop box as fractions of the frame (l, t, r, b). She must be alone inside it wherever possible.
BOX = {
    "solo10": (.2, .25, .85, .95), "solo6": (.2, .15, .95, .98),
    "solo7": (.1, .2, .9, .98), "normal18": (.1, .05, .75, 1),
    "normal4": (.1, .25, .9, .95), "normal3": (.1, .2, .425, .92),
}
# Polygons (fractions of the crop) to force to background: neighbours touching her.
EXCLUDE = {}

session = new_session("birefnet-portrait")
session2 = new_session("birefnet-general")


def mask_of(rgb, s=None):
    return np.asarray(remove(rgb, session=s or session, only_mask=True, post_process_mask=False), np.float32) / 255


def sized(a, w, h):
    return np.asarray(Image.fromarray((a * 255).astype(np.uint8)).resize((w, h), Image.BICUBIC), np.float32) / 255


def tiled(im, M0, x0, x1, y0, y1):
    """Matte the figure in overlapping close-ups, so the model's 1024px land on her alone."""
    w, h = im.size
    fw, fh = x1 - x0, y1 - y0
    side = int(max(fw * 1.2, fh * .46))
    n = max(2, int(np.ceil(fh / (side * .68))))
    acc = np.zeros((h, w), np.float32); wt = np.zeros((h, w), np.float32) + 1e-5
    cx = (x0 + x1) // 2
    for i in range(n):
        top = y0 - side // 12 + int(i * (fh + side // 6 - side) / max(1, n - 1))
        l, t_ = max(0, cx - side // 2), max(0, top)
        r, b = min(w, l + side), min(h, t_ + side)
        tile = sized(mask_of(im.crop((l, t_, r, b))), r - l, b - t_)
        win = np.outer(np.hanning(b - t_ + 2)[1:-1], np.hanning(r - l + 2)[1:-1]).astype(np.float32) + .02
        acc[t_:b, l:r] += tile * win; wt[t_:b, l:r] += win
    return acc / wt * ndi.binary_dilation(M0 > .3, iterations=10)


def paste_tile(M, rgb, box, feather):
    """Re-matte a tile at higher effective resolution and feather it into M."""
    l, t, r, b = box
    tile = mask_of(rgb.crop(box))
    tile = np.asarray(Image.fromarray((tile * 255).astype(np.uint8)).resize((r - l, b - t), Image.BICUBIC), np.float32) / 255
    w = np.ones_like(tile)
    ed = np.minimum.outer(np.minimum(np.arange(b - t), np.arange(b - t)[::-1]), np.minimum(np.arange(r - l), np.arange(r - l)[::-1]))
    w = np.clip(ed / feather, 0, 1).astype(np.float32)
    # Frame edges of the photo itself need no feather.
    if t == 0: w = np.maximum(w, np.clip(np.minimum.outer(np.arange(b - t)[::-1], np.minimum(np.arange(r - l), np.arange(r - l)[::-1])) / feather, 0, 1))
    if b == M.shape[0]: w = np.maximum(w, np.clip(np.minimum.outer(np.arange(b - t), np.minimum(np.arange(r - l), np.arange(r - l)[::-1])) / feather, 0, 1))
    M[t:b, l:r] = M[t:b, l:r] * (1 - w) + tile * w


def run(n):
    t0 = time.time()
    im = ImageOps.exif_transpose(Image.open(SRC / f"{n}.jpg")).convert("RGB")
    W, H = im.size
    bx = BOX[n]
    im = im.crop((int(bx[0] * W), int(bx[1] * H), int(bx[2] * W), int(bx[3] * H)))
    k = min(1, (2500 if n in ("normal4", "solo7") else WORK) / max(im.size))
    if k < 1:
        im = im.resize((round(im.width * k), round(im.height * k)), Image.LANCZOS)
    h, w = im.height, im.width

    M0 = sized(mask_of(im), w, h)
    ys, xs = np.where(M0 > .5)
    x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
    fh = y1 - y0
    M = tiled(im, M0, x0, x1, y0, y1)
    # Below the hair, a pixel is hers only if both models agree.
    M2 = sized(mask_of(im, session2), w, h)
    M2 = ndi.binary_dilation(M2 > .5, iterations=3).astype(np.float32)
    split = y0 + int(fh * .17)
    M[split:] = np.minimum(M[split:], M2[split:])

    if n in EXCLUDE:
        d = Image.new("L", (w, h), 0)
        for poly in EXCLUDE[n]:
            ImageDraw.Draw(d).polygon([(x * w, y * h) for x, y in poly], fill=255)
        M[np.asarray(d) > 0] = 0

    # Trimap: sure inside, sure outside, and a band for the matting to solve. Hair gets a wider band.
    er = max(9, int(fh * .014))
    fg = ndi.binary_erosion(M > .92, iterations=5)
    # Torso and arms get the strict zone, where background hides; hair and feet are fine detail and stay gentle.
    mid0, mid1 = y0 + int(fh * .2), y0 + int(fh * .87)
    fg[mid0:mid1] = ndi.binary_erosion(M > .92, iterations=er)[mid0:mid1]
    near = ndi.binary_dilation(M > .08, iterations=7)
    wide = np.zeros_like(near)
    wide[: y0 + int(fh * .3)] = ndi.binary_dilation(M > .08, iterations=20)[: y0 + int(fh * .3)]
    bg = ~(near | wide)
    tri = np.full(M.shape, .5, np.float64)
    tri[fg] = 1; tri[bg] = 0

    rgb = np.asarray(im, np.float64) / 255
    # Solve only in a window round her; the rest is background anyway.
    m = 30
    Y0, Y1 = max(0, y0 - m), min(h, y1 + m); X0, X1 = max(0, x0 - m), min(w, x1 + m)
    a = np.zeros(M.shape)
    a[Y0:Y1, X0:X1] = estimate_alpha_cf(rgb[Y0:Y1, X0:X1], tri[Y0:Y1, X0:X1])
    a = np.clip((a - .03) / .94, 0, 1)

    # Smooth the edge below the hair: one calm line rather than fuzz, keeping sandals and tassels.
    s = ndi.gaussian_filter(a, max(.9, fh * .0009))
    s = np.clip((s - .32) / .36, 0, 1); s = s * s * (3 - 2 * s)
    hair = ndi.gaussian_filter(a, .8)
    hz = 1 - np.clip((np.arange(h) - (y0 + fh * .2)) / 30, 0, 1)[:, None]
    a = a * (1 - hz) + hair * hz
    z = np.clip((np.arange(h) - (y0 + fh * .2)) / 30, 0, 1)[:, None] * (1 - np.clip((np.arange(h) - (y0 + fh * .9)) / 20, 0, 1))[:, None]
    a = a * (1 - z) + s * z

    # Only her: drop islands, keep the piece containing the most solid area.
    lab, c = ndi.label(a > .25)
    if c > 1:
        big = 1 + int(np.argmax(ndi.sum(a > .25, lab, range(1, c + 1))))
        keep = ndi.binary_dilation(lab == big, iterations=4)
        a = a * keep

    if n == "solo6":
        # The frayed pallu edge cannot be separated from the grass: give it one clean woven edge.
        l, r, tp, bt = x0 + int((x1 - x0) * .42), x0 + int((x1 - x0) * .86), y0 + int(fh * .6), y0 + int(fh * .9)
        win = a[tp:bt, l:r]
        op = ndi.grey_opening(win, size=(19, 19))
        op = ndi.gaussian_filter(op, 2.2)
        op = np.clip((op - .35) / .3, 0, 1)
        fy, fx = np.mgrid[0:bt - tp, 0:r - l]
        fw_ = np.minimum.reduce([fy / 25., (bt - tp - 1 - fy) / 25., fx / 25., (r - l - 1 - fx) / 25.]).clip(0, 1)
        a[tp:bt, l:r] = win * (1 - fw_) + op * fw_
    if n == "normal3":
        # Trace the bottom of the embroidered hem and drop the dark floor below it.
        lum = rgb.dot([.3, .6, .1])
        ybot = np.full(w, -1)
        for x in range(w):
            ys_ = np.where((a[:, x] > .5) & (lum[:, x] > .42))[0]
            if len(ys_): ybot[x] = ys_.max()
        good = ybot >= 0
        lo, hi = np.where(good)[0][[0, -1]]
        trace = ndi.median_filter(ybot[lo:hi + 1].astype(float), size=61)
        trace = ndi.gaussian_filter1d(trace, 14)
        floor_edge = np.arange(h)[:, None]
        cut = np.ones_like(a)
        cut[:, lo:hi + 1] = np.clip((trace[None, :] + 1 - floor_edge) / 2.5, 0, 1)
        start = y0 + int(fh * .9)
        a[start:] = (a * cut)[start:]

    # Tighten the matte slightly: faint veils of background are what read as a bad cut.
    tight = np.clip((a - .1) / .82, 0, 1); tight = tight * tight * (3 - 2 * tight)
    soft = np.clip((a - .05) / .9, 0, 1)
    if n == "normal4":
        soft = np.clip((a - .3) / .55, 0, 1)   # backlit head: a tight edge, or the stage glow rings her hair
    zz = np.clip((np.arange(h) - (y0 + fh * .2)) / 30, 0, 1)[:, None]
    a = soft * (1 - zz) + tight * zz
    F = estimate_foreground_ml(rgb, a)
    # Edge colour: a smooth average of her own solid pixels nearby. Copying single nearest pixels leaves spikes.
    solid = ndi.binary_erosion(a > .985, iterations=2).astype(np.float64)
    sig = max(3., fh * .004)
    norm = ndi.gaussian_filter(solid, sig) + 1e-4
    field = np.dstack([ndi.gaussian_filter(F[..., c] * solid, sig) / norm for c in range(3)])
    k = np.clip((.97 - a) / .35, 0, 1)
    k = k * np.clip(norm / .03, 0, 1)      # only where she really has solid pixels close by
    F = F * (1 - k[..., None]) + field * k[..., None]
    out = np.dstack([np.clip(F, 0, 1), a])
    res = Image.fromarray((out * 255 + .5).astype(np.uint8), "RGBA")
    # Trim to her, keeping a hair of margin at the sides and top; feet sit exactly on the bottom edge.
    ys, xs = np.where(a > .04)
    res = res.crop((max(0, xs.min() - 3), max(0, ys.min() - 3), min(w, xs.max() + 4), ys.max() + 1))
    res.save(OUT / f"{n}.png")
    print(n, res.size, f"{time.time() - t0:.0f}s", flush=True)


for n in sys.argv[1:] or list(BOX):
    run(n)
print("DONE", flush=True)
