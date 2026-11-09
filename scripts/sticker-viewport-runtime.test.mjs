import { test } from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir, homedir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import electron from 'electron'

test(
  'sticker viewport survives StrictMode, places a sticker and reopens',
  { timeout: 60000 },
  async () => {
    const dir = await mkdtemp(join(tmpdir(), '16c-sticker-viewport-'))
    try {
      await build({
        stdin: {
          resolveDir: process.cwd(),
          loader: 'tsx',
          contents: `
import React, {StrictMode} from 'react'
import {createRoot} from 'react-dom/client'
import THREE from './src/renderer/src/libs/web-hlmv/lib/three'
import {StickerViewport} from './src/renderer/src/features/sticker-editor/StickerViewport'
import {useStickerEditor} from './src/renderer/src/features/sticker-editor/sticker-editor.store'
import {modelTextures} from './src/shared/sticker-model'
import {prepareStickerAtlas} from './src/renderer/src/libs/web-hlmv/lib/sticker-atlas'
let root
let disposals=0, picks=0
let textureNames=[],visibleTextures=[]
const originalRender=THREE.Scene.prototype.onBeforeRender
THREE.Scene.prototype.onBeforeRender=function(renderer,scene,...args){
 visibleTextures=[]
 scene.traverseVisible(object=>{if(object.isMesh&&Number.isInteger(object.userData.texture))visibleTextures.push(textureNames[object.userData.texture])})
 return originalRender.call(this,renderer,scene,...args)
}
const originalDispose=THREE.Texture.prototype.dispose
THREE.Texture.prototype.dispose=function(){disposals++;return originalDispose.call(this)}
useStickerEditor.subscribe((state,previous)=>{if(state.projection!==previous.projection)picks++})
window.dragProbe=async()=>{
 const canvas=document.querySelector('canvas'),rect=canvas.getBoundingClientRect()
 const startPicks=picks,startDisposals=disposals
 const normal=useStickerEditor.getState().projection.normal
 canvas.dispatchEvent(new PointerEvent('pointerdown',{button:0,pointerId:1,clientX:rect.width/2,clientY:rect.height/2}))
 for(let i=0;i<100;i++)canvas.dispatchEvent(new PointerEvent('pointermove',{pointerId:1,clientX:rect.width/2+i/10,clientY:rect.height/2}))
 await new Promise(requestAnimationFrame)
 canvas.dispatchEvent(new PointerEvent('pointerup',{button:0,pointerId:1}))
 await new Promise(requestAnimationFrame)
 return {picks:picks-startPicks,disposals:disposals-startDisposals,width:canvas.width,height:canvas.height,cssWidth:rect.width,cssHeight:rect.height,normal,finalNormal:useStickerEditor.getState().projection.normal}
}
window.mount = (bytes, weaponKey = 'ak47', rotation) => {
  const atlas=prepareStickerAtlas(new Uint8Array(bytes))
  textureNames=modelTextures(atlas.model).map(texture=>texture.name)
  useStickerEditor.setState({model:atlas.model,atlas,sticker:{width:8,height:8,rgba:new Uint8Array(256).fill(255)},applied:[],placed:false,projection:undefined})
  root=createRoot(document.getElementById('root'))
  root.render(<StrictMode><StickerViewport label={weaponKey} weaponKey={weaponKey} /></StrictMode>)
}
window.previewResult = {}
window.mountPreview = (bytes, shared = false, weaponKey = 'ak47', rotation) => {
  const buffer = new Uint8Array(bytes).buffer
  if (shared) {
    const view = new DataView(buffer)
    const table = view.getInt32(184, true)
    if(view.getInt32(180,true)<2) throw new Error('fixture requires two textures')
    for(const offset of [68,72,76]) view.setInt32(table+80+offset,view.getInt32(table+offset,true),true)
    let rejected=false
    try {modelTextures(new Uint8Array(buffer))} catch {rejected=true}
    if(!rejected) throw new Error('fixture must fail authoring validation')
  }
  window.previewResult = {frames:0, failures:0}
  if (!root) root=createRoot(document.getElementById('root'))
  root.render(<StrictMode><StickerViewport label="preview" previewModel={buffer} presentationRotation={rotation} weaponKey={weaponKey} onFirstFrame={()=>window.previewResult.frames++} onError={()=>window.previewResult.failures++}/></StrictMode>)
}
window.unmount = () => {root.unmount();root=undefined}
window.state = () => ({visibleTextures,placed:useStickerEditor.getState().placed,projection:useStickerEditor.getState().projection,alerts:[...document.querySelectorAll('[role=alert]')].map(x=>x.textContent),canvases:document.querySelectorAll('canvas').length})
`
        },
        outfile: join(dir, 'renderer.js'),
        bundle: true,
        platform: 'browser',
        jsx: 'automatic',
        resolveExtensions: ['.ts', '.tsx', '.js', '.json'],
        define: { 'process.env.NODE_ENV': '"development"' },
        plugins: [
          {
            name: 'test-labels',
            setup(b) {
              b.onResolve({ filter: /inventory-i18n$/ }, () => ({
                path: 'labels',
                namespace: 'fixture'
              }))
              b.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({
                contents: 'export const useInventoryText=()=>key=>key',
                loader: 'js'
              }))
            }
          }
        ]
      })
      await writeFile(
        join(dir, 'index.html'),
        '<style>html,body,#root{margin:0;width:100%;height:100%;background:#121b27}#root>div{position:absolute;inset:0}canvas{width:100%;height:100%}</style><div id="root"></div><script src="renderer.js"></script>'
      )
      const model =
        process.env.STICKER_TEST_MODEL ||
        join(homedir(), '.steam/steam/steamapps/common/Half-Life/cstrike/models/v_ak47.mdl')
      await writeFile(
        join(dir, 'main.cjs'),
        `
const {app,BrowserWindow}=require('electron')
const {readFileSync,writeFileSync}=require('fs')
const assert=require('assert/strict')
app.commandLine.appendSwitch('enable-unsafe-swiftshader')
app.whenReady().then(async()=>{
const w=new BrowserWindow({show:true,width:1000,height:700,webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}})
const errors=[]
w.webContents.on('console-message',(_e,level,message)=>{if(level>=3)errors.push(message)})
try{
await w.loadFile(${JSON.stringify(join(dir, 'index.html'))})
const bytes=[...readFileSync(${JSON.stringify(model)})]
for(let pass=0;pass<2;pass++){
await w.webContents.executeJavaScript('mount('+JSON.stringify(bytes)+')')
await new Promise(r=>setTimeout(r,700))
assert.deepEqual(await w.webContents.executeJavaScript('state().alerts'),[])
assert.equal(await w.webContents.executeJavaScript('state().canvases'),1)
assert.equal(await w.webContents.executeJavaScript('state().placed'),true,'new sticker starts on central weapon surface')
const probe=await w.webContents.executeJavaScript('dragProbe()')
assert.equal(probe.width,probe.cssWidth*4,'placement canvas has 4x horizontal resolution')
assert.equal(probe.height,probe.cssHeight*4,'placement canvas has 4x vertical resolution')
assert.ok(probe.picks>=1 && probe.picks<=3,'pointer bursts are coalesced to frame updates')
assert.equal(probe.disposals,0,'dragging reuses GPU textures')
assert.deepEqual(probe.finalNormal,probe.normal,'dragging across small faces keeps the same view-aligned projection')
let placed=false, hitX=0, hitY=0
for(let y=200;y<500&&!placed;y+=30)for(let x=200;x<800&&!placed;x+=30){
w.webContents.sendInputEvent({type:'mouseDown',button:'left',x,y,clickCount:1})
w.webContents.sendInputEvent({type:'mouseUp',button:'left',x,y,clickCount:1})
await new Promise(r=>setTimeout(r,10))
placed=await w.webContents.executeJavaScript('state().placed');if(placed){hitX=x;hitY=y}
}
assert.equal(placed,true,'mouse click must project sticker onto weapon')
w.webContents.sendInputEvent({type:'mouseDown',button:'right',x:450,y:300,clickCount:1})
w.webContents.sendInputEvent({type:'mouseMove',button:'right',x:650,y:400})
w.webContents.sendInputEvent({type:'mouseUp',button:'right',x:650,y:400,clickCount:1})
w.webContents.sendInputEvent({type:'mouseDown',button:'left',x:hitX,y:hitY,clickCount:1})
w.webContents.sendInputEvent({type:'mouseUp',button:'left',x:hitX,y:hitY,clickCount:1})
await new Promise(r=>setTimeout(r,100))
assert.deepEqual(await w.webContents.executeJavaScript('state().alerts'),[], 'limited orbit stays usable')

await new Promise(r=>setTimeout(r,100))
if(pass===0)writeFileSync('/tmp/16c-sticker-viewport-verified.png',(await w.webContents.capturePage()).toPNG())
await w.webContents.executeJavaScript('unmount()')
}
const knife=[...readFileSync(${JSON.stringify(join(homedir(), '.steam/steam/steamapps/common/Half-Life/cstrike/models/v_knife.mdl'))})]
await w.webContents.executeJavaScript('mount('+JSON.stringify(knife)+',"knife")')
await new Promise(r=>setTimeout(r,700))
const projection=await w.webContents.executeJavaScript('state().projection')
assert.ok(projection,'knife starts with a valid placement')
w.show()
await new Promise(r=>setTimeout(r,200))
writeFileSync('/tmp/16c-knife-sticker-verified.png',(await w.webContents.capturePage()).toPNG())
assert.ok(projection.normal[1]<-0.5,'knife starts on the opposite authored blade face from the old firearm camera: '+JSON.stringify(projection))
await w.webContents.executeJavaScript('unmount()')
const cs13KnifePath=${JSON.stringify(process.env.CS13_TEST_KNIFE || null)}
if(cs13KnifePath){
 const cs13Knife=[...readFileSync(cs13KnifePath)]
 await w.webContents.executeJavaScript('mount('+JSON.stringify(cs13Knife)+',"knife")')
 await new Promise(r=>setTimeout(r,700))
 const state=await w.webContents.executeJavaScript('state()')
 assert.equal(state.placed,true,'CS13 knife starts with a weapon placement')
 assert.ok(state.visibleTextures.length>0,'CS13 knife geometry is visible')
 assert.ok(!state.visibleTextures.some(name=>/newhand|thumb/i.test(name)),'CS13 hands are hidden')
 writeFileSync('/tmp/16c-cs13-knife-sticker-verified.png',(await w.webContents.capturePage()).toPNG())
 await w.webContents.executeJavaScript('unmount()')
}
await w.webContents.executeJavaScript('mountPreview('+JSON.stringify(bytes)+',true)')
await new Promise(r=>setTimeout(r,700))
assert.deepEqual(await w.webContents.executeJavaScript('state().alerts'),[])
assert.ok(await w.webContents.executeJavaScript('previewResult.frames > 0'),'shared texture preview renders')
await w.webContents.executeJavaScript('mountPreview([0,0,0,0])')
await new Promise(r=>setTimeout(r,300))
assert.deepEqual(await w.webContents.executeJavaScript('state().alerts'),['previewError'])
assert.ok(await w.webContents.executeJavaScript('previewResult.failures > 0'))
assert.equal(await w.webContents.executeJavaScript('state().canvases'),0)
await w.webContents.executeJavaScript('mountPreview('+JSON.stringify(bytes)+')')
await new Promise(r=>setTimeout(r,700))
assert.deepEqual(await w.webContents.executeJavaScript('state().alerts'),[])
assert.ok(await w.webContents.executeJavaScript('previewResult.frames > 0'),'preview recovers after malformed input')
await w.webContents.executeJavaScript('unmount()')
assert.deepEqual(errors.filter(e=>/precision|TypeError|Error creating WebGL/.test(e)),[])
const fixtures = ${JSON.stringify(process.env.INSPECTION_FIXTURES ? JSON.parse(process.env.INSPECTION_FIXTURES) : [])}
for (const fixture of fixtures) {
 const modelBytes=[...readFileSync(fixture.path)]
 await w.webContents.executeJavaScript('mountPreview('+JSON.stringify(modelBytes)+',false,'+JSON.stringify(fixture.weapon)+','+JSON.stringify(fixture.rotation || [0,0,0])+')')
 await new Promise(r=>setTimeout(r,700))
 assert.deepEqual(await w.webContents.executeJavaScript('state().alerts'),[])
 assert.ok(await w.webContents.executeJavaScript('previewResult.frames > 0'))
 writeFileSync(fixture.screenshot,(await w.webContents.capturePage()).toPNG())
 await w.webContents.executeJavaScript('unmount()')
}
console.log('StrictMode mount, mouse placement, and reopen passed')
w.destroy();app.exit(0)
}catch(e){console.error(e);w.destroy();app.exit(1)}
})
`
      )
      const output = await new Promise((resolve, reject) => {
        const child = spawn(electron, [join(dir, 'main.cjs')], {
          env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined },
          stdio: ['ignore', 'pipe', 'pipe']
        })
        let text = ''
        child.stdout.on('data', (d) => (text += d))
        child.stderr.on('data', (d) => (text += d))
        child.on('error', reject)
        child.on('exit', (code) => resolve({ code, text }))
      })
      assert.equal(output.code, 0, output.text)
      console.log(output.text)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  }
)
