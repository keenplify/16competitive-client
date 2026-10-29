import { build } from 'esbuild'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawn } from 'node:child_process'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import electron from 'electron'

test(
  'helper captures audio into a browser with microphone permission denied and releases capture on disconnect',
  { timeout: 50_000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), '16c-microphone-test-'))
    const entry = join(directory, 'main.mjs')
    try {
      await build({
        stdin: {
          contents: `
      import { app, BrowserWindow, session } from 'electron';
      import { createServer } from 'node:http';
      import assert from 'node:assert/strict';
      import { runHelperMicrophone } from './src/main/helper-microphone';
      app.commandLine.appendSwitch('use-fake-device-for-media-stream');
      app.commandLine.appendSwitch('autoplay-policy','no-user-gesture-required');
      app.on('window-all-closed',()=>{});
      async function main(){
      await app.whenReady();
      const site=createServer((req,res)=>res.end('<!doctype html><title>Web voice test</title>'));
      await new Promise(r=>site.listen(0,'127.0.0.1',r));
      const origin='http://127.0.0.1:'+site.address().port;
      const page=new BrowserWindow({show:false,webPreferences:{partition:'voice-browser',sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});
      let browserMicRequests=0;
      page.webContents.session.setPermissionRequestHandler((wc,perm,cb)=>{if(perm==='media')browserMicRequests++;cb(false)});
      let ready;
      const readyPromise=new Promise(r=>ready=r);
      const capture=runHelperMicrophone(origin,v=>{if(v.event==='microphoneReady')ready(v)});
      await page.loadURL(origin);
      const descriptor=await readyPromise;
      const result=await page.webContents.executeJavaScript(
        '(async()=>{const d='+JSON.stringify(descriptor)+';'+
        'const pc=new RTCPeerConnection({iceServers:[]});window.pc=pc;pc.addTransceiver("audio",{direction:"recvonly"});'+
        'await pc.setLocalDescription(await pc.createOffer());if(pc.iceGatheringState!=="complete")await new Promise(r=>pc.onicegatheringstatechange=()=>{if(pc.iceGatheringState==="complete")r()});'+
        'const init={method:"POST",headers:{authorization:"Bearer "+d.capability,"content-type":"application/json"},body:JSON.stringify(pc.localDescription)};'+
        'const denied=await fetch("http://127.0.0.1:"+d.port+"/offer",{...init,headers:{...init.headers,authorization:"Bearer bad"}});'+
        'const response=await fetch("http://127.0.0.1:"+d.port+"/offer",init);if(!response.ok)throw Error("capture response "+response.status);'+
        'await pc.setRemoteDescription(await response.json());'+
        'for(let i=0;i<150;i++){const stats=await pc.getStats();for(const s of stats.values())if(s.type==="inbound-rtp"&&s.kind==="audio"&&s.bytesReceived>0)return {bytes:s.bytesReceived,denied:denied.status};await new Promise(r=>setTimeout(r,100))}throw Error("no audio received")})()'
      );
      assert.ok(result.bytes>0);assert.equal(result.denied,403);assert.equal(browserMicRequests,0);
      const closed=await page.webContents.executeJavaScript('fetch("http://127.0.0.1:'+descriptor.port+'/close",{method:"POST",headers:{authorization:"Bearer '+descriptor.capability+'"}}).then(r=>r.status)');
      assert.equal(closed,204);
      await page.webContents.executeJavaScript('window.pc.close()');
      await capture;
      assert.equal(BrowserWindow.getAllWindows().length,1);
      page.destroy();await new Promise(r=>site.close(r));
      console.log('HELPER_MICROPHONE_PASS');app.exit(0);
      }
      main().catch(error=>{console.error(error);app.exit(1)});
    `,
          resolveDir: resolve('.'),
          sourcefile: 'helper-microphone-test.ts'
        },
        bundle: true,
        platform: 'node',
        format: 'esm',
        external: ['electron'],
        outfile: entry
      })
      const child = spawn(electron, [entry], {
        env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined, NODE_OPTIONS: undefined },
        stdio: ['ignore', 'pipe', 'pipe']
      })
      let output = ''
      child.stdout.on('data', (chunk) => {
        output += chunk
      })
      child.stderr.on('data', (chunk) => {
        output += chunk
      })
      const timer = setTimeout(() => child.kill('SIGKILL'), 45_000)
      const code = await new Promise((resolve) => child.on('exit', resolve))
      clearTimeout(timer)
      assert.equal(code, 0, output)
      assert.match(output, /HELPER_MICROPHONE_PASS/)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  }
)
