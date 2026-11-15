import { build } from 'esbuild'
import { mkdir, writeFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import electron from 'electron'

const out = dirname(fileURLToPath(import.meta.url))
const root = resolve(out, '../..')
const runtime = join(out, '.preview-runtime')
const models = process.env.PREVIEW_MODELS_JSON ? JSON.parse(process.env.PREVIEW_MODELS_JSON) : ['awp','ak47'].map(weapon=>({weapon,name:weapon,path:'/home/keenplify-fedora/.steam/steam/steamapps/common/Half-Life/cstrike/models/v_'+weapon+'.mdl',stock:true}))
await mkdir(runtime, { recursive: true })
const renderer = `
import React from 'react'
import {createRoot} from 'react-dom/client'
import THREE from './src/renderer/src/libs/web-hlmv/lib/three'
import {StickerViewport} from './src/renderer/src/features/sticker-editor/StickerViewport'
import {prepareStickerAtlas,fullColorStickerTextures,fullColorPreviewTextures} from './src/renderer/src/libs/web-hlmv/lib/sticker-atlas'
window.React=React
const root=createRoot(document.getElementById('root'))
THREE.Scene.prototype.onBeforeRender=function(renderer,scene,camera){window.live={scene,camera,renderer}}
let serial=0
window.mount=async(bytes,weapon,stock=true)=>{
 window.atlas=prepareStickerAtlas(new Uint8Array(bytes),true)
 window.preview=atlas.model.slice().buffer
 window.layers=[]
 await new Promise((resolve,reject)=>root.render(<StickerViewport key={++serial} label={weapon} previewModel={preview} stockModel={stock} weaponKey={weapon} onFirstFrame={resolve} onError={()=>reject(new Error('Preview failed'))}/>))
 const {scene,camera,renderer}=window.live
 const canvas=renderer.domElement,copy=document.createElement('canvas');copy.width=canvas.width;copy.height=canvas.height
 const ctx=copy.getContext('2d');ctx.drawImage(canvas,0,0);const pixels=ctx.getImageData(0,0,copy.width,copy.height).data
 let x0=copy.width,y0=copy.height,x1=0,y1=0
 for(let y=0;y<copy.height;y++)for(let x=0;x<copy.width;x++)if(pixels[(y*copy.width+x)*4+3]>100){x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y)}
 const meshes=[];scene.traverse(o=>{if(o.isMesh&&o.visible)meshes.push(o)})
 const ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2((x0+x1)/copy.width-1,1-(y0+y1)/copy.height),camera)
 const hit=ray.intersectObjects(meshes)[0]
 if(hit){const scale=Math.max((x1-x0)/(copy.width*.87),(y1-y0)/(copy.height*.82));camera.position.copy(hit.point.clone().add(camera.position.clone().sub(hit.point).multiplyScalar(scale)));camera.lookAt(hit.point);camera.updateMatrixWorld(true);renderer.render(scene,camera)}
 return {width:canvas.width,height:canvas.height,extent:atlas.extent,bounds:[x0,y0,x1,y1]}
}
window.decorate=async(images,sizes=[.11,.12,.11])=>{
 const {scene,camera,renderer}=window.live
 const meshes=[];scene.traverse(o=>{if(o.isMesh&&o.visible)meshes.push(o)})
 const ray=new THREE.Raycaster()
 const at=(x,y)=>{ray.setFromCamera(new THREE.Vector2(x*2-1,1-y*2),camera);return ray.intersectObjects(meshes)[0]}
 const candidates=[]
 for(let xi=12;xi<=86;xi++){
  const hits=[]
  for(let yi=8;yi<92;yi++){const h=at(xi/100,yi/100);if(h?.face)hits.push({y:yi/100,h})}
  if(hits.length)candidates.push({x:xi/100,hits})
 }
 const left=candidates[0].x,rightEdge=candidates.at(-1).x
 const used=[]
 for(let i=0;i<images.length;i++){
  const desired=left+(rightEdge-left)*[.10,.39,.56][i]
  const columns=candidates.filter(c=>Math.abs(c.x-desired)<.04&&!used.some(u=>Math.abs(u.x-c.x)<(rightEdge-left)*.1)).sort((a,b)=>(b.hits.length*.02-Math.abs(b.x-desired)*50)-(a.hits.length*.02-Math.abs(a.x-desired)*50))
  const col=columns[0];if(!col)continue
  const index=Math.floor(col.hits.length*.48)
  const hit=col.hits[index].h
  const normal=camera.getWorldDirection(new THREE.Vector3()).negate()
  const faceNormal=hit.face.normal.clone().transformDirection(hit.object.matrixWorld)
  if(normal.dot(faceNormal)<0)normal.negate()
  const right=new THREE.Vector3(1,0,0).applyQuaternion(camera.quaternion)
  right.addScaledVector(normal,-right.dot(normal)).normalize()
  const up=new THREE.Vector3(0,1,0).applyQuaternion(camera.quaternion)
  up.addScaledVector(normal,-up.dot(normal)).addScaledVector(right,-up.dot(right)).normalize()
  const inverse=new THREE.Matrix4().getInverse(hit.object.matrixWorld)
  const projection={center:hit.point.clone().applyMatrix4(inverse).toArray(),right:right.transformDirection(inverse).toArray(),up:up.transformDirection(inverse).toArray(),normal:normal.transformDirection(inverse).toArray(),size:sizes[i],angle:[-10,0,12][i]}
  const image=await createImageBitmap(new Blob([new Uint8Array(images[i])],{type:'image/png'}))
  const c=document.createElement('canvas');c.width=image.width;c.height=image.height
  const ctx=c.getContext('2d');ctx.drawImage(image,0,0)
  const sticker={width:c.width,height:c.height,rgba:new Uint8Array(ctx.getImageData(0,0,c.width,c.height).data)}
  image.close();layers.push({sticker,projection});used.push({x:col.x,y:col.hits[index].y,projection})
 }
 const textures=fullColorStickerTextures(atlas,layers)
 fullColorPreviewTextures.set(preview,textures)
 for(const mesh of meshes){
  const t=textures.find(t=>t.texture===mesh.userData.texture)
  if(!t)continue
  const map=mesh.material.map
  const pixels=new Uint8Array(t.rgba.length),stride=t.width*4
  for(let row=0;row<t.height;row++)pixels.set(t.rgba.subarray(row*stride,(row+1)*stride),(t.height-row-1)*stride)
  const texture=new THREE.DataTexture(pixels,t.width,t.height,THREE.RGBAFormat,THREE.UnsignedByteType,THREE.UVMapping,THREE.ClampToEdgeWrapping,THREE.ClampToEdgeWrapping,THREE.LinearFilter,THREE.LinearFilter)
  texture.flipY=false;texture.generateMipmaps=false;texture.unpackAlignment=1;texture.needsUpdate=true
  mesh.material.map=texture
 }
 renderer.render(scene,camera)
 return {used,textureCount:textures.length}
}
window.png=()=>document.querySelector('canvas').toDataURL('image/png').split(',')[1]
`
await build({stdin:{contents:renderer,loader:'tsx',resolveDir:root},outfile:join(runtime,'renderer.js'),bundle:true,platform:'browser',jsx:'automatic',loader:{'.png':'dataurl','.svg':'dataurl'},define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'isolated-labels',setup(b){b.onResolve({filter:/inventory-i18n$/},()=>({path:'labels',namespace:'isolated'}));b.onLoad({filter:/.*/,namespace:'isolated'},()=>({contents:'export const useInventoryText=()=>key=>key',loader:'js'}))}}]})
await writeFile(join(runtime,'index.html'),'<style>html,body,#root{margin:0;width:100%;height:100%;background:transparent}.absolute{position:absolute}.inset-0{inset:0}.relative{position:relative}.h-full{height:100%}.w-full{width:100%}.overflow-hidden{overflow:hidden}canvas{display:block}</style><div id="root"></div><script src="renderer.js"></script>')
await writeFile(join(runtime,'main.cjs'),`
const {app,BrowserWindow}=require('electron'),{readFileSync,writeFileSync}=require('fs'),{join}=require('path')
app.commandLine.appendSwitch('enable-unsafe-swiftshader')
app.commandLine.appendSwitch('use-gl','angle')
app.commandLine.appendSwitch('use-angle','swiftshader')
app.whenReady().then(async()=>{
 const w=new BrowserWindow({show:false,width:1600,height:650,useContentSize:true,transparent:true,webPreferences:{offscreen:true,backgroundThrottling:false,sandbox:true,contextIsolation:true,nodeIntegration:false}})
 const timer=setTimeout(()=>app.exit(1),90000)
 w.webContents.on('console-message',(_e,level,message)=>{if(level>=3)console.error(message)})
 try{
 await w.loadFile(${JSON.stringify(join(runtime,'index.html'))})
 const dir='/home/keenplify-fedora/.steam/steam/steamapps/common/Half-Life/cstrike/models'
 const stickers=${JSON.stringify(['4c43c1529b846f12d7f6756a7ae04f3c0722de2e646d13a367aa63c4e214ed3c','9716ecf8ec7fb3a3259efdc05bd08ed7a9d6093cad81312939c4e123a6ddc225','76d51b6970cdd62cc81d6a8bde8a21bcc86f1eae6ba3efb711a314782513c233'])}.map(hash=>[...readFileSync('/home/keenplify-fedora/.config/16competitive-client/game-assets/sticker-images/'+hash+'.png')])
 for(const model of ${JSON.stringify(models)}){
  const {weapon,name,path,stock=false}=model
  await w.webContents.executeJavaScript('mount('+JSON.stringify([...readFileSync(path)])+','+JSON.stringify(weapon)+','+stock+')')
  writeFileSync(${JSON.stringify(out)}+'/'+name+'-plain.png',Buffer.from(await w.webContents.executeJavaScript('png()'),'base64'))
  if(${JSON.stringify(process.env.PREVIEW_GALLERY==='1')}){console.log('captured',name);continue}
  const selectedStickers=model.stickers?model.stickers.map(hash=>[...readFileSync('/home/keenplify-fedora/.config/16competitive-client/game-assets/sticker-images/'+hash+'.png')]):stickers
  const placements=await w.webContents.executeJavaScript('decorate('+JSON.stringify(selectedStickers)+','+JSON.stringify(model.sizes||[.11,.12,.11])+')')
  writeFileSync(${JSON.stringify(out)}+'/'+name+'-stickers.png',Buffer.from(await w.webContents.executeJavaScript('png()'),'base64'))
  writeFileSync(${JSON.stringify(out)}+'/'+name+'-placements.json',JSON.stringify(placements,null,2))
  console.log(name,JSON.stringify(placements))
 }
 clearTimeout(timer);app.exit(0)
 }catch(e){console.error(e);app.exit(1)}
})`)
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE
const child=spawn(electron,[join(runtime,'main.cjs'),'--no-sandbox'],{env,stdio:'inherit'})
child.on('exit',code=>process.exit(code??1))
