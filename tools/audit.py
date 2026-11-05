"""Audit sheet: source vs cut-out on loud backgrounds. python tools/audit.py <outdir> [webdir]
Uses the shipped web files so we inspect what viewers really get."""
import sys, json
from pathlib import Path
from PIL import Image, ImageOps
Image.MAX_IMAGE_PIXELS=None
out=Path(sys.argv[1]);out.mkdir(parents=True,exist_ok=True)
SRC=Path(r"D:\sowmya-work\originals")
SILK="solo10 solo6 solo4 solo2 solo8 solo11 solo9".split()
STAGE="normal18 normal14 normal16 normal2 normal12 normal4".split()
H=620
def card(n,path):
    c=Image.open(path).convert('RGBA');o=ImageOps.exif_transpose(Image.open(SRC/f'{n}.jpg')).convert('RGB')
    k=H/c.height;w=int(c.width*k);c=c.resize((w,H),Image.LANCZOS)
    o2=o.copy();o2.thumbnail((w+200,H))
    W=Image.new('RGB',(o2.width+w*2+20,H),(0,0,0));W.paste(o2,(0,0))
    for i,col in enumerate([(255,0,200),(0,230,90)]):
        b=Image.new('RGBA',(w,H),col+(255,));b.alpha_composite(c);W.paste(b.convert('RGB'),(o2.width+10+i*(w+10),0))
    return W
def sheet(names,ref,fn):
    cs=[card(n,ref(n)) for n in names]
    rows=[cs[i:i+2] for i in range(0,len(cs),2)]
    W=max(sum(c.width+12 for c in r) for r in rows);S=Image.new('RGB',(W,len(rows)*(H+12)),(25,25,25))
    for y,r in enumerate(rows):
        x=0
        for c in r:S.paste(c,(x,y*(H+12)));x+=c.width+12
    S.save(out/fn,quality=88);print(fn,S.size)
web=Path('assets/img')
sheet(SILK[:4],lambda n:web/'s'/f'{n}.webp','a_silk1.jpg')
sheet(SILK[4:],lambda n:web/'s'/f'{n}.webp','a_silk2.jpg')
sheet(STAGE[:4],lambda n:web/'c'/f'{n}.webp','a_stage1.jpg')
sheet(STAGE[4:],lambda n:web/'c'/f'{n}.webp','a_stage2.jpg')
