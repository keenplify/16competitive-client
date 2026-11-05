import { test } from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir, homedir } from 'node:os'
import { spawn } from 'node:child_process'
import electron from 'electron'

test(
  'muzzle follows translated animated attachment bones in first-person previews',
  { timeout: 60000 },
  async () => {
    const dir = await mkdtemp(join(tmpdir(), '16c-muzzle-'))
    try {
      await build({
        stdin: {
          resolveDir: process.cwd(),
          loader: 'tsx',
          contents: `
import React from 'react';import {createRoot} from 'react-dom/client'
import {ModelViewer} from './src/renderer/src/libs/web-hlmv/ui/ModelViewer'
import {parseModelCached} from './src/renderer/src/libs/web-hlmv/lib/modelDataParser'
import {calcRotations} from './src/renderer/src/libs/web-hlmv/lib/geometryTransformer'
import THREE from './src/renderer/src/libs/web-hlmv/lib/three'
window.React=React
let root=createRoot(document.getElementById('root'))
const cameraProps={position:[0,0,0],target:[0,0,100],fov:65,near:.1,far:1000}
const onMuzzlePosition=(x,y,visible)=>{window.actual={x,y,visible};const marker=document.getElementById('muzzle');marker.style.left=x*100+'%';marker.style.top=y*100+'%';marker.style.display=visible?'block':'none'}
window.mount=(raw,key)=>{
 const bytes=new Uint8Array(raw).buffer,model=parseModelCached(bytes)
 const idle=Math.max(0,model.sequences.findIndex(s=>/idle/i.test(s.label)))
 const attachment=model.attachments[0],camera=new THREE.PerspectiveCamera(65,window.innerWidth/window.innerHeight,.1,1000)
 camera.lookAt(new THREE.Vector3(0,0,100));camera.updateMatrixWorld(true)
 const container=new THREE.Object3D();container.rotation.x=-Math.PI/2;container.rotation.z=-Math.PI/2;container.updateMatrixWorld(true)
 const project=translated=>new THREE.Vector3(...attachment.org).applyMatrix4(new THREE.Matrix4().fromArray(Array.from(calcRotations(model,idle,0,0,translated)[attachment.bone]))).applyMatrix4(container.matrixWorld).project(camera)
 const expected=project(true),old=project(false)
 window.viewport={width:window.innerWidth,height:window.innerHeight}
 window.expected={x:(expected.x+1)/2,y:(1-expected.y)/2};window.old={x:(old.x+1)/2,y:(1-old.y)/2};window.actual=null
 root.render(<ModelViewer key={key} modelBuffer={bytes} modelKey={key} firstPerson camera={cameraProps} cameraLocked animation={idle} animationSequences={[idle]} freezeAnimation disableZoom onMuzzlePosition={onMuzzlePosition}/>)
}
`
        },
        outfile: join(dir, 'renderer.js'),
        bundle: true,
        platform: 'browser',
        jsx: 'automatic',
        logLevel: 'silent'
      })
      await writeFile(
        join(dir, 'index.html'),
        '<style>html,body,#root{margin:0;width:100%;height:100%;background:#121b27}.relative{position:relative}.block{display:block}.h-full{height:100%}.w-full{width:100%}.absolute{position:absolute}.inset-0{inset:0}#root>div{position:absolute;inset:0}canvas{width:100%;height:100%}#muzzle{position:absolute;pointer-events:none;background:#ffcc00;width:10px;height:10px;transform:translate(-50%,-50%);z-index:10}</style><div id="root"></div><span id="muzzle"></span><script src="renderer.js"></script>'
      )
      await writeFile(
        join(dir, 'main.cjs'),
        `
const {app,BrowserWindow}=require('electron'),{readFileSync}=require('fs'),assert=require('assert/strict')
app.commandLine.appendSwitch('enable-unsafe-swiftshader')
app.whenReady().then(async()=>{
const errors=[]
const w=new BrowserWindow({show:true,width:1000,height:700,useContentSize:true,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}})
w.webContents.on('console-message',(_e,level,msg)=>{if(level>=3)errors.push(msg)})
try{
await w.loadFile(${JSON.stringify(join(dir, 'index.html'))})
for(const weapon of ['xm1014','aug','awp']){
const raw=[...readFileSync(${JSON.stringify(join(homedir(), '.steam/steam/steamapps/common/Half-Life/cstrike/models'))}+'/v_'+weapon+'.mdl')]
await w.webContents.executeJavaScript('mount('+JSON.stringify(raw)+','+JSON.stringify(weapon)+')')
let result
for(let i=0;i<50;i++){await new Promise(r=>setTimeout(r,100));result=await w.webContents.executeJavaScript('({actual,expected,old,viewport})');if(result.actual)break}
await new Promise(r=>setTimeout(r,300));result=await w.webContents.executeJavaScript('({actual,expected,old,viewport})')
assert.ok(result.actual?.visible,weapon+' has a visible muzzle attachment: '+JSON.stringify({result,errors,body:await w.webContents.executeJavaScript('document.body.innerText')}))
require('fs').writeFileSync('/tmp/16c-muzzle-'+weapon+'.png',(await w.webContents.capturePage()).toPNG())
const distance=Math.hypot((result.actual.x-result.expected.x)*result.viewport.width,(result.actual.y-result.expected.y)*result.viewport.height)
assert.ok(distance<1,weapon+' muzzle must follow gun geometry: '+distance+'px '+JSON.stringify(result))
console.log(weapon+': attachment error '+distance.toFixed(3)+'px; old offset '+Math.hypot((result.old.x-result.expected.x)*result.viewport.width,(result.old.y-result.expected.y)*result.viewport.height).toFixed(1)+'px')
require('fs').writeFileSync('/tmp/16c-muzzle-'+weapon+'.png',(await w.webContents.capturePage()).toPNG())
}
w.destroy();app.exit(0)
}catch(e){console.error(e);w.destroy();app.exit(1)}
})
`
      )
      const output = await new Promise((resolve, reject) => {
        const p = spawn(electron, [join(dir, 'main.cjs')], {
          env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined },
          stdio: ['ignore', 'pipe', 'pipe']
        })
        let text = ''
        p.stdout.on('data', (d) => (text += d))
        p.stderr.on('data', (d) => (text += d))
        p.on('error', reject)
        p.on('exit', (code) => resolve({ code, text }))
      })
      assert.equal(output.code, 0, output.text)
      console.log(output.text)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  }
)
