import { test } from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir, homedir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import electron from 'electron'

test(
  'stock first-person preview bakes saved stickers without changing the source',
  { timeout: 60000 },
  async () => {
    const dir = await mkdtemp(join(tmpdir(), '16c-loadout-preview-'))
    try {
      await build({
        stdin: {
          resolveDir: process.cwd(),
          loader: 'tsx',
          contents: `
import React,{StrictMode} from 'react'
import {createRoot} from 'react-dom/client'
import {ModelViewer} from './src/renderer/src/libs/web-hlmv/ui/ModelViewer'
import {StickerPurchaseDialog} from './src/renderer/src/features/inventory/StickerPurchaseDialog'
import {AttachedStickerLinks} from './src/renderer/src/features/skins/AttachedStickerLinks'
import {useNavigationStore} from './src/renderer/src/features/navigation/navigation.store'
import {SkinModelThumbnail} from './src/renderer/src/features/skins/SkinModelThumbnail'
import {SkinFirstPersonPreview} from './src/renderer/src/features/skins/SkinFirstPersonPreview'
import {stockWeaponPreview} from './src/renderer/src/features/skins/stock-weapon-preview'
import {useInventoryStore,previewAppliedStickers} from './src/renderer/src/features/inventory/inventory.store'
import {prepareStickerAtlas} from './src/renderer/src/libs/web-hlmv/lib/sticker-atlas'
window.React=React
let root
window.mountExperimental=()=>root.render(<StrictMode><SkinFirstPersonPreview skin={stockWeaponPreview('ak47','Stock AK-47')} stock stickerTargetKey="stock:ak47" inspection /></StrictMode>)
window.mountWeapon=async(bytes,key)=>{
 window.api.models.read=async()=>new Uint8Array(bytes).buffer
 useInventoryStore.setState({pending:false,target:{key:'stock:'+key,name:key},selectedSticker:{imagePath:'fixture.png'},snapshot:{catalog:[],items:[]}})
 await useInventoryStore.getState().openEditor()
 if(!useInventoryStore.getState().editing) throw new Error('Editor failed for '+key)
 useInventoryStore.setState({editing:false,target:null,selectedSticker:null})
 root.render(<StrictMode><SkinFirstPersonPreview key={key} skin={stockWeaponPreview(key,key)} stock inspection /></StrictMode>)
}
window.thumbnailCache=new Map([["fixture-old-p-cache",new Uint8Array([1,2,3]).buffer]])
window.thumbnailReads=[]
window.removeFixtureSticker=()=>useInventoryStore.setState({snapshot:{catalog:[],items:[]}})
window.mountThumbnail=()=>{
 window.api.models.readThumbnail=async key=>{window.thumbnailReads.push(key);return window.thumbnailCache.get(key)??null}
 window.api.models.writeThumbnail=async(key,png)=>{window.thumbnailCache.set(key,png)}
 root.render(<StrictMode><SkinModelThumbnail cacheKey="fixture-old-p-cache" weaponKey="ak47" showAppliedStickers fallback={<span>Failed</span>} /></StrictMode>)
}
window.mountStickerLinks=()=>root.render(<StrictMode><AttachedStickerLinks targetKey="stock:ak47" onClose={()=>{window.closedPreview=true}} /></StrictMode>)
window.getNavigation=()=>useNavigationStore.getState()
window.mountPurchase=(points,cash,attempted=false)=>{
 useInventoryStore.setState({pending:false,purchase:{item:{id:'purchase-fixture',name:'Test sticker',imagePath:'fixture.png',pricePoints:points,pricePCash:cash},input:{currency:'POINTS',expectedPrice:points,requestId:'original'},attempted},buy:async()=>{window.bought=useInventoryStore.getState().purchase.input}})
 root.render(<StrictMode><StickerPurchaseDialog /></StrictMode>)
}
window.mountHeld=bytes=>root.render(<StrictMode><ModelViewer modelBuffer={new Uint8Array(bytes).buffer} modelKey="stock:ak47:p" camera={{distanceMultiplier:1}} /></StrictMode>)
window.mount=async(bytes)=>{
 const original=new Uint8Array(bytes)
 const canvas=document.createElement('canvas');canvas.width=canvas.height=8
 const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,8,8)
 const png=await (await fetch(canvas.toDataURL())).arrayBuffer()
 window.api={models:{read:async()=>original.slice().buffer},skins:{stickerImage:async()=>png}}
 const atlas=prepareStickerAtlas(original)
 const face=atlas.faces.find(f=>{
  const a=f.points[0],b=f.points[1],c=f.points[2]
  const ux=b[0]-a[0],uy=b[1]-a[1],uz=b[2]-a[2],vx=c[0]-a[0],vy=c[1]-a[1],vz=c[2]-a[2]
  return uy*vz-uz*vy>0.01
 })
 const a=face.points[0],b=face.points[1],c=face.points[2]
 const norm=v=>{const l=Math.hypot(...v);return v.map(n=>n/l)}
 const right=norm(b.map((v,i)=>v-a[i])),edge=c.map((v,i)=>v-a[i])
 const cross=(u,v)=>[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]]
 const normal=norm(cross(right,edge)),up=norm(cross(normal,right))
 const projection={center:a.map((v,i)=>(v+b[i]+c[i])/3),right,normal,up,size:.35,angle:0}
 useInventoryStore.setState({snapshot:{catalog:[],items:[{id:'fixture',name:'Test',weaponKey:'stock:ak47',imagePath:'fixture.png',appliedAt:'2026-11-04T00:00:00Z',projection}]}})
 const baked=await previewAppliedStickers(original.slice().buffer,'stock:ak47')
 const other=await previewAppliedStickers(original.slice().buffer,'skin:other')
 window.result={bakedSize:baked.byteLength,originalSize:original.length,otherUnchanged:new Uint8Array(other).every((b,i)=>b===original[i]),sourceUnchanged:original.every((b,i)=>b===bytes[i])}
 root=createRoot(document.getElementById('root'))
 root.render(<StrictMode><SkinFirstPersonPreview skin={stockWeaponPreview('ak47','Stock AK-47')} stock stickerTargetKey="stock:ak47"/></StrictMode>)
}
`
        },
        outfile: join(dir, 'renderer.js'),
        bundle: true,
        platform: 'browser',
        jsx: 'automatic',
        resolveExtensions: ['.ts', '.tsx', '.js', '.json'],
        loader: { '.png': 'dataurl', '.svg': 'dataurl' },
        define: { 'process.env.NODE_ENV': '"development"' },
        plugins: [
          {
            name: 'labels',
            setup(b) {
              b.onResolve({ filter: /bundled-weapon-previews$/ }, () => ({
                path: 'bundled',
                namespace: 'fixture'
              }))
              b.onResolve({ filter: /inventory-i18n$/ }, () => ({
                path: 'inventory',
                namespace: 'fixture'
              }))
              b.onResolve({ filter: /\/i18n\/i18n$/ }, () => ({
                path: 'i18n',
                namespace: 'fixture'
              }))
              b.onLoad({ filter: /.*/, namespace: 'fixture' }, (args) => ({
                loader: 'js',
                contents:
                  args.path === 'bundled'
                    ? 'export const bundledWeaponPreview=()=>undefined'
                    : args.path === 'inventory'
                      ? 'export const inventoryText=key=>key; export const useInventoryText=()=>inventoryText'
                      : 'import {create} from "zustand"; export const useLanguageStore=create(()=>({language:"en"}));export const translate=key=>key;export const useTranslation=()=>({language:"en",t:key=>key});',
                resolveDir: process.cwd()
              }))
            }
          }
        ]
      })
      await writeFile(
        join(dir, 'index.html'),
        '<style>html,body,#root{margin:0;width:100%;height:100%;background:#18212c}.absolute{position:absolute}.inset-0{inset:0}.relative{position:relative}.block{display:block}.h-full{height:100%}.w-full{width:100%}.overflow-hidden{overflow:hidden}.pointer-events-none{pointer-events:none}canvas{width:100%;height:100%}</style><div id="root"></div><script src="renderer.js"></script>'
      )
      const model =
        process.env.STICKER_TEST_MODEL ||
        join(homedir(), '.steam/steam/steamapps/common/Half-Life/cstrike/models/v_ak47.mdl')
      await writeFile(
        join(dir, 'main.cjs'),
        `
const {app,BrowserWindow}=require('electron'),{readFileSync,writeFileSync}=require('fs'),assert=require('assert/strict')
app.commandLine.appendSwitch('enable-unsafe-swiftshader')
app.whenReady().then(async()=>{
 const w=new BrowserWindow({show:true,width:1000,height:700,webPreferences:{backgroundThrottling:false,sandbox:true,contextIsolation:true,nodeIntegration:false}})
 const errors=[]
 setTimeout(()=>{console.error('Preview runtime timed out');app.exit(1)},45000)
 w.webContents.on('console-message',(_e,level,message)=>{if(level>=3)errors.push(message)})
 try{
 await w.loadFile(${JSON.stringify(join(dir, 'index.html'))})
 await w.webContents.executeJavaScript('mount('+JSON.stringify([...readFileSync(${JSON.stringify(model)})])+')')
 await new Promise(r=>setTimeout(r,4500))
 const result=await w.webContents.executeJavaScript('result')
 assert.ok(result.bakedSize>result.originalSize);assert.ok(result.sourceUnchanged);assert.ok(result.otherUnchanged)
 assert.equal(await w.webContents.executeJavaScript('document.querySelectorAll("canvas").length'),1)
 assert.deepEqual(errors,[])
 assert.equal(await w.webContents.executeJavaScript('document.querySelector("[data-preview-action]").dataset.previewAction'), 'idle')
 const capture=await w.webContents.capturePage()
 const pixels=capture.toBitmap();let whitePixels=0
 for(let i=0;i<pixels.length;i+=4)if(pixels[i]>240&&pixels[i+1]>240&&pixels[i+2]>240)whitePixels++
 assert.ok(whitePixels>100, 'Saved white sticker must be visible in the rendered viewmodel')
 writeFileSync('/tmp/16c-loadout-sticker-preview.png',capture.toPNG())
 await w.webContents.executeJavaScript('mountExperimental()')
 await new Promise(r=>setTimeout(r,1500))
 assert.equal(await w.webContents.executeJavaScript('document.querySelectorAll("canvas").length'),1)
 assert.deepEqual(errors,[])
 const inspection=await w.webContents.capturePage()
 writeFileSync('/tmp/16c-experimental-preview.png',inspection.toPNG())
 const inspectionPixels=inspection.toBitmap();let stickerPixels=0
 for(let i=0;i<inspectionPixels.length;i+=4)if(inspectionPixels[i]>240&&inspectionPixels[i+1]>240&&inspectionPixels[i+2]>240)stickerPixels++
 assert.ok(stickerPixels>100,'Experimental preview must show the saved sticker')
 await w.webContents.executeJavaScript('mountHeld('+JSON.stringify([...readFileSync(${JSON.stringify(model.replace('v_ak47.mdl', 'p_ak47.mdl'))})])+')')
 await new Promise(r=>setTimeout(r,1500))
 assert.equal(await w.webContents.executeJavaScript('document.querySelectorAll("canvas").length'),1)
 assert.deepEqual(errors,[])
 const heldCapture=await w.webContents.capturePage();writeFileSync("/tmp/16c-held.png",heldCapture.toPNG());const held=heldCapture.toBitmap();let modelPixels=0
 for(let i=0;i<held.length;i+=4)if(held[i]!==44||held[i+1]!==33||held[i+2]!==24)modelPixels++
 assert.ok(modelPixels>1000,'Held weapon must render')
 await w.webContents.executeJavaScript('mountThumbnail()')
 await new Promise(r=>setTimeout(r,1500))
 assert.equal(await w.webContents.executeJavaScript('document.querySelectorAll("img").length'),1)
 assert.ok(await w.webContents.executeJavaScript('thumbnailReads.every(key=>key.startsWith("viewmodel-inspection-v5:"))'))
 assert.equal(await w.webContents.executeJavaScript('thumbnailCache.size'),2)
 const thumbnailSize=await w.webContents.executeJavaScript('(async()=>{const entry=[...thumbnailCache.entries()].find(([key])=>key.startsWith("viewmodel-inspection-v5:"));const image=await createImageBitmap(new Blob([entry[1]],{type:"image/png"}));return [image.width,image.height]})()')
 assert.deepEqual(thumbnailSize,[512,256],'Cached thumbnails must use a fixed aspect ratio regardless of card dimensions')
 await w.webContents.executeJavaScript('mountHeld('+JSON.stringify([...readFileSync(${JSON.stringify(model.replace('v_ak47.mdl', 'p_ak47.mdl'))})])+')')
 await new Promise(r=>setTimeout(r,200))
 await w.webContents.executeJavaScript('mountThumbnail()')
 await new Promise(r=>setTimeout(r,300))
 assert.equal(await w.webContents.executeJavaScript('document.querySelectorAll("canvas").length'),0)
 assert.equal(await w.webContents.executeJavaScript('document.querySelectorAll("img").length'),1)
 await w.webContents.executeJavaScript('mountStickerLinks()')
 await new Promise(r=>setTimeout(r,100))
 assert.equal(await w.webContents.executeJavaScript('document.querySelectorAll("footer button").length'),1)
 await w.webContents.executeJavaScript('document.querySelector("footer button").click()')
 assert.equal(await w.webContents.executeJavaScript('closedPreview'),true)
 assert.equal(await w.webContents.executeJavaScript('getNavigation().page'),'store')
 assert.equal(await w.webContents.executeJavaScript('getNavigation().storeStickerSearch'),'Test')
 await w.webContents.executeJavaScript('mountThumbnail()')
 await new Promise(r=>setTimeout(r,100))
 await w.webContents.executeJavaScript('removeFixtureSticker()')
 await new Promise(r=>setTimeout(r,1200))
 assert.equal(await w.webContents.executeJavaScript('thumbnailCache.size'),3,'Sticker changes must regenerate the thumbnail')
 w.setContentSize(768,384)
 for(const weapon of ['glock18','deagle','m4a1','mp5','hegrenade','knife','elite','usp','m3']){
 const bytes=[...readFileSync(${JSON.stringify(model)}.replace('v_ak47.mdl','v_'+weapon+'.mdl'))]
 await w.webContents.executeJavaScript('mountWeapon('+JSON.stringify(bytes)+','+JSON.stringify(weapon==='mp5'?'mp5navy':weapon)+')')
 await new Promise(r=>setTimeout(r,900))
 assert.equal(await w.webContents.executeJavaScript('document.querySelectorAll("canvas").length'),1)
 assert.deepEqual(errors,[])
 writeFileSync('/tmp/16c-experimental-'+weapon+'.png',(await w.webContents.capturePage()).toPNG())
 }
 await w.webContents.executeJavaScript('mountPurchase(0,0)')
 await new Promise(r=>setTimeout(r,100))
 assert.equal(await w.webContents.executeJavaScript('document.querySelectorAll("dialog button").length'),2,'Free flow has only close and claim')
 await w.webContents.executeJavaScript('[...document.querySelectorAll("dialog button")].find(b=>b.textContent.includes("claim")).click()')
 assert.equal(await w.webContents.executeJavaScript('bought.expectedPrice'),0)
 await w.webContents.executeJavaScript('mountPurchase(10,20)')
 await new Promise(r=>setTimeout(r,100))
 assert.equal(await w.webContents.executeJavaScript('document.querySelectorAll("dialog button").length'),3)
 await w.webContents.executeJavaScript('[...document.querySelectorAll("dialog button")].find(b=>b.getAttribute("aria-label")?.includes("pCash")).click()')
 assert.equal(await w.webContents.executeJavaScript('bought.currency'),'P_CASH')
 assert.equal(await w.webContents.executeJavaScript('bought.expectedPrice'),20)
 await w.webContents.executeJavaScript('mountPurchase(10,20,true)')
 await new Promise(r=>setTimeout(r,100))
 assert.equal(await w.webContents.executeJavaScript('document.querySelectorAll("dialog button").length'),2)
 await w.webContents.executeJavaScript('[...document.querySelectorAll("dialog button")].find(b=>b.getAttribute("aria-label")?.includes("points")).click()')
 assert.equal(await w.webContents.executeJavaScript('bought.requestId'),'original')
 console.log('Saved-sticker bake and stock v_/p_ rendering passed')
 w.destroy();app.exit(0)
 }catch(e){console.error(e);w.destroy();app.exit(1)}
})
`
      )
      const out = await new Promise((resolve, reject) => {
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
      assert.equal(out.code, 0, out.text)
      console.log(out.text)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  }
)
