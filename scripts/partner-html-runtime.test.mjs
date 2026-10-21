import { build } from 'esbuild'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawn } from 'node:child_process'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import electron from 'electron'

// Explicit desktop integration check: npm run test:partner-ui:runtime.
// Uses the production sandbox/offscreen renderer, without native injection.
test(
  'sandboxed HTML receives game viewport, data and resize; hides on stale viewport',
  { timeout: 45000 },
  async () => {
    const temp = await mkdtemp(join(tmpdir(), '16c-ui-runtime-'))
    try {
      const entry = join(temp, 'main.cjs')
      await build({
        stdin: {
          contents: `
import { app } from 'electron';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';
import { cachePartnerUi, createPartnerUiWindow, PartnerHtmlRenderer } from './src/main/game/partner-html-renderer';
const delay = ms => new Promise(r=>setTimeout(r,ms));
async function until(fn) { for(let i=0;i<100;i++){if(await fn())return;await delay(100)}throw Error('condition timeout') }
async function main() {
await app.whenReady();

const directory = await mkdtemp(join(tmpdir(),'16c-ui-frames-'));
let state=null, leaked=0, window, renderer;
const id='11111111-1111-4111-8111-111111111111';
let html='<style>html,body{margin:0;background:transparent}#panel{width:50vw;height:30vh;background:red}@media(min-width:1500px){#panel{background:blue}}</style><div id="panel"></div><script>window.addEventListener("16c-ui-data",e=>{window.received=e.detail});fetch("__API__/collect").catch(()=>{});</script>';
const page={key:'test',html,sha256:createHash('sha256').update(html).digest('hex'),width:640,height:360};
const server=createServer((req,res)=>{if(req.url.includes('collect'))leaked++;res.setHeader('Content-Type','application/json');res.end(JSON.stringify(req.url.includes('catalog')?{pages:[page]}:{state}));});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const api=new URL('http://127.0.0.1:'+server.address().port);
html=html.replace('__API__',api.origin);page.html=html;page.sha256=createHash('sha256').update(html).digest('hex');
let viewport={width:640,height:480};
const writeViewport=()=>writeFile(join(directory,'partner-ui.viewport'),'v1\\n'+Date.now()+'\\n'+viewport.width+'\\n'+viewport.height+'\\n');
await writeViewport();
let viewportTimer=setInterval(()=>void writeViewport(),300);
try {
 const pages=await cachePartnerUi(api,'test',join(directory,'cache'));
 assert.equal(pages.length,1);
 window=createPartnerUiWindow();
 renderer=new PartnerHtmlRenderer(window,directory,api,'test',id,pages);
 state={connectionId:id,sequence:1,key:'test',sha256:page.sha256,data:JSON.stringify({message:'</script> literal',value:7}),expiresAt:new Date(Date.now()+30000).toISOString()};
 renderer.start();
 const inspect=()=>window.webContents.executeJavaScript('({width:innerWidth,height:innerHeight,data:window.received,media:matchMedia("(min-width:1500px)").matches,node:typeof process,require:typeof require,api:typeof window.api,panel:document.querySelector("#panel")?.getBoundingClientRect().width})');
 await until(async()=>{try{return (await inspect()).data?.value===7}catch{return false}});
 let result=await inspect();
 assert.equal(result.width,640); assert.equal(result.height,480); assert.equal(result.panel,320);
 assert.equal(result.node,'undefined');assert.equal(result.require,'undefined');assert.equal(result.api,'undefined');
 await until(async()=>{try{return (await readFile(join(directory,'overlay.png'))).length>0}catch{return false}});
 for(const size of [{width:1920,height:1080},{width:3440,height:1440}]) {
  viewport=size;await writeViewport();
  await until(async()=>{const v=await inspect();return v.width===size.width&&v.height===size.height});
  result=await inspect();assert.equal(result.panel,size.width/2);assert.equal(result.media,true);
  await until(async()=>{try{const png=await readFile(join(directory,'overlay.png'));return png.readUInt32BE(16)===size.width&&png.readUInt32BE(20)===size.height}catch{return false}});
 }
 state={...state,sequence:2,data:JSON.stringify(['arbitrary',42])};
 await until(async()=>Array.isArray((await inspect()).data));
 assert.equal(leaked,0);
 clearInterval(viewportTimer);viewportTimer=null;
 await rm(join(directory,'partner-ui.viewport'));
 await until(async()=>{try{await readFile(join(directory,'partner-ui.state'));return false}catch{return true}});
 await until(async()=>window.webContents.getURL()==='about:blank');
 console.log('PARTNER_UI_RUNTIME_PASS');
} finally {if(viewportTimer)clearInterval(viewportTimer);if(renderer)await renderer.stop();if(window&&!window.isDestroyed())window.destroy();await new Promise(r=>server.close(r));await rm(directory,{recursive:true,force:true});}
app.quit();
}
void main().catch(error=>{console.error(error);app.exit(1)});
`,
          resolveDir: resolve('.'),
          sourcefile: 'partner-ui-runtime.ts'
        },
        bundle: true,
        platform: 'node',
        format: 'esm',
        external: ['electron'],
        outfile: entry.replace('.cjs', '.mjs'),
        plugins: [
          {
            name: 'test-session',
            setup(b) {
              b.onResolve({ filter: /^\.\.\/auth$/ }, () => ({
                path: 'test-auth',
                namespace: 'test-auth'
              }))
              b.onLoad({ filter: /.*/, namespace: 'test-auth' }, () => ({
                contents: 'export const getSessionToken = () => "test-token"'
              }))
            }
          }
        ]
      })
      const result = await new Promise((done, reject) => {
        const child = spawn(electron, [entry.replace('.cjs', '.mjs')], {
          env: { ...process.env, ELECTRON_RUN_AS_NODE: '' },
          stdio: ['ignore', 'pipe', 'pipe']
        })
        let output = ''
        const timeout = setTimeout(() => {
          child.kill('SIGKILL')
          reject(new Error(output + '\nElectron test timed out'))
        }, 40000)
        for (const stream of [child.stdout, child.stderr])
          stream.on('data', (chunk) => {
            output += chunk.toString()
            if (output.length > 20000) output = output.slice(-20000)
          })
        child.on('error', reject)
        child.on('exit', (code) => {
          clearTimeout(timeout)
          done({ code, output })
        })
      })
      assert.equal(result.code, 0, result.output)
      assert.match(result.output, /PARTNER_UI_RUNTIME_PASS/)
    } finally {
      await rm(temp, { recursive: true, force: true })
    }
  }
)
