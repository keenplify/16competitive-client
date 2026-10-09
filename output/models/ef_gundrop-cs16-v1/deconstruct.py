"""Export this embedded GoldSrc v10 model to inspectable JSON, QC, and SMD.

The delivered MDL is rebuilt by lossless texture import, not by recompiling SMD.
Requires Python 3 and numpy. External sequence groups are deliberately rejected.
"""
from pathlib import Path
import json
import math
import struct
import numpy as np

ROOT = Path(__file__).resolve().parent
SOURCE = ROOT / 'original.mdl'
DATA = SOURCE.read_bytes()

def unpack(fmt, offset):
    size = struct.calcsize('<' + fmt)
    assert 0 <= offset <= len(DATA) - size, (fmt, offset)
    return struct.unpack_from('<' + fmt, DATA, offset)

def integer(offset):
    return unpack('i', offset)[0]

def name(offset, length):
    return DATA[offset:offset+length].split(b'\0')[0].decode('latin1')

assert DATA[:4] == b'IDST' and integer(4) == 10
assert integer(72) == len(DATA)
bones = []
for j in range(integer(140)):
    o = integer(144) + j * 112
    bones.append(dict(index=j, name=name(o, 32), parent=integer(o+32),
                      values=list(unpack('6f', o+64)), scales=list(unpack('6f', o+88))))

def rotation(angles):
    x, y, z = angles
    sx, cx, sy, cy, sz, cz = math.sin(x), math.cos(x), math.sin(y), math.cos(y), math.sin(z), math.cos(z)
    return np.array([[cz*cy, cz*sy*sx-sz*cx, cz*sy*cx+sz*sx],
                     [sz*cy, sz*sy*sx+cz*cx, sz*sy*cx-cz*sx],
                     [-sy, cy*sx, cy*cx]])

def transforms(values):
    result = []
    for bone, pose in zip(bones, values):
        r, t = rotation(pose[3:]), np.array(pose[:3])
        if bone['parent'] >= 0:
            pr, pt = result[bone['parent']]
            r, t = pr @ r, pr @ t + pt
        result.append((r, t))
    return result

def smd_header():
    return ['version 1', 'nodes'] + [f'{b["index"]} "{b["name"]}" {b["parent"]}' for b in bones] + ['end', 'skeleton']

def pose_lines(frame, values):
    return [f'time {frame}'] + [str(j) + ' ' + ' '.join(f'{v:.9f}' for v in pose) for j, pose in enumerate(values)]

sequences = []
for j in range(integer(164)):
    o = integer(168) + j * 176
    assert integer(o+156) == 0, 'External animation group unsupported'
    assert integer(o+120) == 1, 'Blended animation unsupported for this export'
    frames = integer(o+56)
    seq = dict(name=name(o, 32), fps=unpack('f', o+32)[0], flags=integer(o+36),
               frames=frames, animOffset=integer(o+124), group=integer(o+156), poses=[])
    axes = []
    for bone in bones:
        a = seq['animOffset'] + bone['index'] * 12
        offsets = unpack('6H', a)
        channels = []
        for axis, offset in enumerate(offsets):
            raw = [0] * frames
            if offset:
                raw = []
                p = a + offset
                while len(raw) < frames:
                    valid, total = unpack('BB', p)
                    assert 0 < valid <= total
                    values = list(unpack('h'*valid, p+2))
                    raw.extend(values + [values[-1]] * (total-valid))
                    p += 2 + valid * 2
            channels.append([bone['values'][axis] + n*bone['scales'][axis] for n in raw[:frames]])
        axes.append(channels)
    seq['poses'] = [[[axes[b][axis][frame] for axis in range(6)] for b in range(len(bones))] for frame in range(frames)]
    sequences.append(seq)

manifest = json.loads((ROOT / 'original-textures/textures.json').read_text())
textures = manifest['textures']
skinrefs = unpack('h' * (integer(192)*integer(196)), integer(200))
models = []
bind = [b['values'] for b in bones]
world = transforms(bind)
for j in range(integer(204)):
    body = integer(208) + j * 76
    for k in range(integer(body+64)):
        m = integer(body+72) + k * 112
        vertices = [list(unpack('3f', integer(m+88)+v*12)) for v in range(integer(m+80))]
        vbone = list(DATA[integer(m+84):integer(m+84)+len(vertices)])
        normals = [list(unpack('3f', integer(m+100)+n*12)) for n in range(integer(m+92))]
        nbone = list(DATA[integer(m+96):integer(m+96)+len(normals)])
        meshes = []
        for mesh_index in range(integer(m+72)):
            mesh = integer(m+76) + mesh_index * 20
            p, triangles = integer(mesh+4), []
            while True:
                count = unpack('h', p)[0]
                p += 2
                if count == 0:
                    break
                entries = [list(unpack('4h', p+n*8)) for n in range(abs(count))]
                p += abs(count)*8
                for n in range(2, abs(count)):
                    ids = [0, n-1, n] if count < 0 else ([n-2, n-1, n] if n % 2 == 0 else [n-1, n-2, n])
                    triangles.append([entries[v] for v in ids])
            assert len(triangles) == integer(mesh)
            meshes.append(dict(index=mesh_index, textureIndex=skinrefs[integer(mesh+8)], triangles=triangles))
        models.append(dict(name=name(m, 64), bodypart=name(body, 64), vertices=vertices,
                           vertexBones=vbone, normals=normals, normalBones=nbone, meshes=meshes))

for folder in ['decompiled-original', 'decompiled-cs16']:
    out = ROOT / folder
    out.mkdir(exist_ok=True)
    for model in models:
        lines = smd_header() + pose_lines(0, bind) + ['end', 'triangles']
        for mesh in model['meshes']:
            tex = textures[mesh['textureIndex']]
            for tri in mesh['triangles']:
                lines.append(tex['name'])
                for vi, ni, s, t in tri:
                    bone = model['vertexBones'][vi]
                    r, translation = world[bone]
                    position = r @ np.array(model['vertices'][vi]) + translation
                    nr, _ = world[model['normalBones'][ni]]
                    normal = nr @ np.array(model['normals'][ni])
                    uv = [s/tex['width'], 1-t/tex['height']]
                    lines.append(str(bone) + ' ' + ' '.join(f'{v:.9f}' for v in [*position, *normal, *uv]))
        (out / (model['name'] + '.smd')).write_text('\n'.join(lines + ['end']) + '\n')
    for seq in sequences:
        lines = smd_header()
        for frame, pose in enumerate(seq['poses']):
            lines += pose_lines(frame, pose)
        (out / (seq['name'] + '.smd')).write_text('\n'.join(lines + ['end']) + '\n')
    qc = ['// Inspectable decompilation; final MDL uses byte-preserving texture import.',
          '$modelname "ef_gundrop.mdl"', '$scale 1.0', '$eyeposition ' + ' '.join(map(str, unpack('3f', 76)))]
    for model in models:
        qc.append(f'$body "{model["bodypart"]}" "{model["name"]}.smd"')
    for tex in textures:
        if tex['flags'] & 4: qc.append(f'$texrendermode "{tex["name"]}" "fullbright"')
        if tex['flags'] & 32: qc.append(f'$texrendermode "{tex["name"]}" "additive"')
    for seq in sequences:
        qc.append(f'$sequence "{seq["name"]}" "{seq["name"]}.smd" fps {seq["fps"]:g}' + (' loop' if seq['flags'] & 1 else ''))
    (out / 'ef_gundrop.qc').write_text('\n'.join(qc) + '\n')
    import shutil
    tfolder = ROOT / ('original-textures' if folder.endswith('original') else 'textures')
    for tex in textures:
        shutil.copy2(tfolder / tex['file'], out / tex['name'])

report = dict(format='GoldSrc IDST v10', sourceBytes=len(DATA), bones=bones, textures=textures,
              sequences=sequences, models=models)
(ROOT / 'model-structure.json').write_text(json.dumps(report, indent=2) + '\n')
print(f'Exported {len(bones)} bones, {sum(len(mesh["triangles"]) for m in models for mesh in m["meshes"])} triangles, and {sequences[0]["frames"]} animation frames.')
