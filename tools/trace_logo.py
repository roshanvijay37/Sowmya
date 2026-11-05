"""Trace Logo/logo.png into vector paths so it can be extruded in WebGL (src/logo-paths.json)."""
import json
import numpy as np, potrace
from PIL import Image
from scipy.ndimage import gaussian_filter
im=Image.open('Logo/logo.png').convert('RGB')
S=6
a=np.asarray(im.resize((500*S,500*S),Image.BICUBIC)).astype(np.float32)
ink=(255-a.min(axis=2))
ink=gaussian_filter(ink,S*0.45)
mask=ink>ink.max()*0.33
ys,xs=np.where(mask);x0,x1,y0,y1=xs.min(),xs.max(),ys.min(),ys.max();print('bbox',x0/S,x1/S,y0/S,y1/S)
bm=potrace.Bitmap(~mask);pl=bm.trace(turdsize=int(10*S*S/4),alphamax=1.1,opttolerance=1.0)
W=x1-x0;cx=(x0+x1)/2;cy=(y0+y1)/2
def P(p):return [round((p.x-cx)/W,4),round((p.y-cy)/W,4)]   # potracer y runs with the array
out=[]
for c in pl:
    seg=[];s=P(c.start_point)
    for sg in c.segments:
        if sg.is_corner: seg.append(['L',*P(sg.c),*P(sg.end_point)])
        else: seg.append(['C',*P(sg.c1),*P(sg.c2),*P(sg.end_point)])
    out.append({'s':s,'d':seg})
json.dump({'aspect':float((y1-y0)/W),'curves':out},open('src/logo-paths.json','w'),separators=(',',':'))
print(len(out),'curves',sum(len(c['d']) for c in out),'segs')
# preview
d=''
for c in out:
    d+=f"M{c['s'][0]} {c['s'][1]} "
    for g in c['d']:
        d+= (f"L{g[1]} {g[2]} L{g[3]} {g[4]} " if g[0]=='L' else f"C{g[1]} {g[2]} {g[3]} {g[4]} {g[5]} {g[6]} ")
    d+='Z '
open('D:/sowmya-work/logo.svg','w').write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="-.55 -.5 1.1 1"><rect x="-1" y="-1" width="2" height="2" fill="#111"/><path fill="#e8c98a" fill-rule="evenodd" d="{d}"/></svg>')
