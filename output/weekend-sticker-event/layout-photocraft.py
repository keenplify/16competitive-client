"""Compose the poster using PhotoCraft's JSON command API; no pixel editing here."""
from pathlib import Path
import json
import shutil
import subprocess
import math

OUT = Path(__file__).resolve().parent
CACHE = Path('/home/keenplify-fedora/.config/16competitive-client/game-assets/sticker-images')
ASSETS = OUT / 'assets'
FINAL_NAME = 'weekly-sticker-event-1024'
ASSETS.mkdir(exist_ok=True)
STICKERS = [(item['name'], item['hash']) for item in json.loads((OUT/'sticker-overlap-manifest.json').read_text())]
TOP_STICKERS = [(item['name'], item['hash']) for item in json.loads((OUT/'sticker-top-rail-manifest.json').read_text())]
for name, hash_value in STICKERS + TOP_STICKERS:
    shutil.copyfile(CACHE / f'{hash_value}.png', ASSETS / f'{name}.png')

process = subprocess.Popen([
    'photocraft-cli', 'serve', '--no-gpu',
    '--automation-read-root', str(OUT),
    '--automation-write-root', str(OUT),
], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
transcript = []

def call(method, params=None):
    request = {'id': len(transcript) + 1, 'method': method, 'params': params or {}}
    process.stdin.write(json.dumps(request) + '\n')
    process.stdin.flush()
    response = json.loads(process.stdout.readline())
    transcript.append({'request': request, 'response': response})
    if not response.get('ok'):
        raise RuntimeError(response)
    return response.get('result')

def command(command_id, **params):
    return call('engine.execute', {'command': command_id, 'params': params})

def rect(name, x, y, width, height, color, stroke=None):
    return command('shape.create', name=name, kind='rect', rect=[x,y,width,height], fill=color, stroke=stroke)

def line(name, start, end, color, weight=1):
    return command('shape.create', name=name, kind='line', **{'from': start, 'to': end}, weight=weight, fill=color)

def text(name, value, x, baseline, size, color='#f5f0e6', font='DejaVu Sans', weight=400, tracking=0, fit=None):
    result = command('type.create', name=name, text=value, x=x, y=baseline, size=size,
                     font=font, weight=weight, color=color, tracking=tracking, antialias='sharp')
    if fit:
        bounds=result['bounds']
        width=bounds[2]-bounds[0]
        if width>fit:
            command('type.setStyle', layer=result['layer'], horizontalScale=100*fit/width)
    return result

def place(path, name, center, width, rotate=0, max_height=None):
    # Source dimensions are read from PhotoCraft's document information.
    info = json.loads(subprocess.check_output(['photocraft-cli','info',str(path)],text=True))
    if max_height:
        width = min(width, max_height*info['width']/info['height'])
    result = call('doc.place', {'path':str(path), 'scale':width/info['width']*100, 'fit':False, 'center':center})
    command('layer.renameLayer', layer=result['layer'], name=name)
    if rotate:
        command('edit.transform', layer=result['layer'], rotate=rotate)
    return result

def rail_sticker(path, name, x, baseline, height, angle, max_width=110):
    info = json.loads(subprocess.check_output(['photocraft-cli','info',str(path)],text=True))
    width = height*info['width']/info['height']
    radians = math.radians(angle)
    rotated_height = height*abs(math.cos(radians))+width*abs(math.sin(radians))
    scale = min(1, max_width/width, 96/rotated_height)
    width *= scale
    rotated_height *= scale
    return place(path, name, [x,baseline-rotated_height/2], width, angle)

try:
    for name, _ in STICKERS + TOP_STICKERS:
        call('doc.open', {'path':str(ASSETS/f'{name}.png')})
        command('image.trim', basedOn='transparent')
        call('doc.save', {'path':str(ASSETS/f'{name}-trimmed.png')})
        call('doc.close', {})
    for weapon in ['awp-skin-1', 'ak47-skin-2', 'm4a1-skin-2']:
        call('doc.open', {'path':str(OUT/f'{weapon}-stickers.png')})
        command('image.trim', basedOn='transparent')
        call('doc.save', {'path':str(ASSETS/f'{weapon}-preview.png')})
        call('doc.close', {})

    call('doc.new', {'width':1024,'height':1024,'resolution':72,'background':'#0c121a',
                     'name':'1.6 Competitive — Weekend Sticker Drop'})
    rect('Slate studio background',0,0,1024,1024,{'gradient':{'stops':[[0,'#0b1017'],[.52,'#1b2734'],[1,'#0d141e']], 'angle':-34,'style':'linear'}})
    for x in range(64,1024,64):
        line(f'Grid vertical {x}',[x,406],[x,840],'#22303d')
    for y in range(438,840,64):
        line(f'Grid horizontal {y}',[40,y],[984,y],'#22303d')
    command('shape.create',name='Diagonal display stage',kind='path',path={'subpaths':[{'closed':True,'knots':[[0,657],[1024,401],[1024,577],[0,833]]}]},fill='#263342')
    line('Orange stage accent',[0,657],[1024,401],'#ff7739',3)
    line('Muted lower stage accent',[0,833],[1024,577],'#3d505f',1)

    place(ASSETS/'16competitive-logo.png','1.6 Competitive — official logo',[825,244],238)
    text('Exclusive platform','ONLY AT 1.6 COMPETITIVE',708,378,13,'#acbccb',weight=700,tracking=25,fit=238)
    for index,(name,_) in enumerate(TOP_STICKERS):
        rail_sticker(ASSETS/f'{name}-trimmed.png',f'Top sticker rail — {name}',241+index*65,
                     112-[0,4,1,3][index%4],[50,78,60,92,56,82,66,72][index],
                     [-7,8,-5,6,-9,5,-6,8][index],max_width=78)
    text('Weekly recurrence','WEEKLY',56,128,20,'#acbccb',weight=700,tracking=170)
    text('Win requirement','WIN 3 GAMES.',53,238,132,font='Bebas Neue',fit=918)
    text('Sticker reward','GET A STICKER',53,349,132,'#ff7739','Bebas Neue',fit=918)

    # Real GoldSrc assets captured from the launcher's StickerViewport.
    place(ASSETS/'awp-skin-1-preview.png','AWP — gold finish with applied stickers',[512,467],895,-5)
    place(ASSETS/'ak47-skin-2-preview.png','AK-47 — neon finish with applied stickers',[560,653],780,4)
    place(ASSETS/'m4a1-skin-2-preview.png','M4A1 — white finish with applied stickers',[540,815],657,-5)
    text('AWP label','AWP',63,560,12,'#8193a5',tracking=100)
    text('AK label','AK-47',875,749,12,'#8193a5',tracking=100)
    text('M4 label','M4A1',835,878,12,'#8193a5',tracking=100)

    rect('Sticker rail background',0,915,1024,109,'#0a1018')
    line('Footer rule',[56,916],[968,916],'#435362',1)
    for index,(name,_) in enumerate(STICKERS):
        rail_sticker(ASSETS/f'{name}-trimmed.png',f'Sticker rail — {name}',55+index*(914/15),
                     1017-[2,0,4,1][index%4],[72,92,56,83,96,65,99,71,88,58,94,74,63,100,81,66][index],
                     [-10,8,-6,11,-8,6,-11,9][index%8])

    info=call('doc.inspect')
    (OUT/'photocraft-document-info.json').write_text(json.dumps(info,indent=2))
    for extension in ['png','pcraft','psd']:
        call('doc.save', {'path':str(OUT/f'{FINAL_NAME}.{extension}')})
    print(json.dumps({'width':info['width'],'height':info['height'],'layers':len(info['layers']),
                      'outputs':[str(OUT/f'{FINAL_NAME}.{ext}') for ext in ['png','pcraft','psd']]}))
finally:
    (OUT/'photocraft-api-transcript.json').write_text(json.dumps(transcript,indent=2))
    process.terminate()
