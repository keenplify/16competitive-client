"""Orthographic software preview of the exported geometry and decoded animation.

This preview uses additive texture sampling; it is not an in-game screenshot.
"""
from pathlib import Path
import json
import math
import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent
report = json.loads((ROOT / 'model-structure.json').read_text())
model = report['models'][0]
seq = report['sequences'][0]
SIZE = 512

def rotate(pose):
    x, y, z = pose[3:]
    sx, cx, sy, cy, sz, cz = math.sin(x), math.cos(x), math.sin(y), math.cos(y), math.sin(z), math.cos(z)
    return np.array([[cz*cy, cz*sy*sx-sz*cx, cz*sy*cx+sz*sx],
                     [sz*cy, sz*sy*sx+cz*cx, sz*sy*cx-cz*sx], [-sy, cy*sx, cy*cx]])

def render(folder, frame):
    textures = [np.array(Image.open(ROOT / folder / t['file']).convert('RGB'), dtype=float) for t in report['textures']]
    canvas = np.zeros((SIZE, SIZE, 3), dtype=float)
    transforms = [(rotate(p), np.array(p[:3])) for p in seq['poses'][frame]]
    verts = []
    # Look straight down: the beam appears as a tiny central glow.
    for v, bone in zip(model['vertices'], model['vertexBones']):
        r, t = transforms[bone]
        world = r @ np.array(v) + t
        verts.append(np.array([SIZE/2+world[0]*13, SIZE/2-world[1]*13]))
    for mesh in model['meshes']:
        texture = textures[mesh['textureIndex']]
        h, w, _ = texture.shape
        for tri in mesh['triangles']:
            p = np.array([verts[v[0]] for v in tri])
            lo = np.maximum(np.floor(p.min(axis=0)).astype(int), 0)
            hi = np.minimum(np.ceil(p.max(axis=0)).astype(int), SIZE-1)
            if np.any(hi < lo): continue
            yy, xx = np.mgrid[lo[1]:hi[1]+1, lo[0]:hi[0]+1]
            a, b, c = p
            determinant = (b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1])
            if abs(determinant) < 1e-8: continue
            wa = ((b[1]-c[1])*(xx+0.5-c[0])+(c[0]-b[0])*(yy+0.5-c[1]))/determinant
            wb = ((c[1]-a[1])*(xx+0.5-c[0])+(a[0]-c[0])*(yy+0.5-c[1]))/determinant
            wc = 1-wa-wb
            mask = (wa >= 0) & (wb >= 0) & (wc >= 0)
            st = np.array([[v[2], v[3]] for v in tri])
            s = wa*st[0,0]+wb*st[1,0]+wc*st[2,0]
            t = wa*st[0,1]+wb*st[1,1]+wc*st[2,1]
            colors = texture[np.clip(t.astype(int),0,h-1), np.clip(s.astype(int),0,w-1)]
            canvas[yy[mask], xx[mask]] += colors[mask]
    return Image.fromarray(np.clip(canvas,0,255).astype(np.uint8))

frames = [render('textures', frame) for frame in range(0,150,5)]
frames[0].save(ROOT / 'model-preview.png')
frames[0].save(ROOT / 'animation-preview.gif', save_all=True, append_images=frames[1:],
               duration=167, loop=0, disposal=2)
before, after = render('original-textures',0), frames[0]
comparison = Image.new('RGB',(1024,552),(20,20,20))
comparison.paste(before,(0,40)); comparison.paste(after,(512,40))
d = ImageDraw.Draw(comparison)
d.text((16,14),'ORIGINAL',fill=(210,210,210))
d.text((528,14),'CS 1.6 STYLE — SOFTWARE MODEL PREVIEW',fill=(210,210,210))
comparison.save(ROOT / 'comparison.png')
print('Saved model-preview.png, comparison.png, animation-preview.gif')
