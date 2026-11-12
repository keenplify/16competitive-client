import { test } from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { mkdtemp, writeFile, rm, readdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { spawn } from 'node:child_process'
import electron from 'electron'
test(
  'report screenshots survive retries, retain layout, and clear after submission; purchase action navigates',
  { timeout: 45000 },
  async () => {
    const dir = await mkdtemp(join(tmpdir(), '16c-report-ui-'))
    try {
      await build({
        stdin: {
          resolveDir: process.cwd(),
          loader: 'tsx',
          contents: `
import React from 'react';import {createRoot} from 'react-dom/client';import {ToastContainer} from 'react-toastify';
import {IssueReportForm} from './src/renderer/src/features/issue-report/IssueReportForm';
import {useIssueReport} from './src/renderer/src/features/issue-report/issue-report.store';
import {PurchaseSuccess} from './src/renderer/src/features/inventory/PurchaseSuccess';
import {useNavigationStore} from './src/renderer/src/features/navigation/navigation.store';
window.sent=[];window.rejectReport=true;
window.api={gameSettings:{getAssetSyncStatus:async()=>({status:'idle'})},diagnosticLogs:{report:async(...args)=>{window.sent.push(args);if(window.rejectReport)throw Error('offline');return {id:'report'}}}};
window.report=useIssueReport;window.navigation=useNavigationStore;
createRoot(document.getElementById('root')).render(<><IssueReportForm/><PurchaseSuccess item={{kind:'sticker',id:'00000000-0000-4000-8000-000000000001'}}/><ToastContainer/></>);
window.attach=async(type='image/png')=>{const canvas=document.createElement('canvas');canvas.width=800;canvas.height=600;const ctx=canvas.getContext('2d');ctx.fillStyle='#123456';ctx.fillRect(0,0,800,600);ctx.fillStyle='white';ctx.font='40px sans-serif';ctx.fillText('800 × 600 screenshot',60,100);const blob=await new Promise(r=>canvas.toBlob(r));await useIssueReport.getState().add([new File([blob],'screenshot.png',{type})]);};
`
        },
        bundle: true,
        platform: 'browser',
        format: 'iife',
        jsx: 'automatic',
        outfile: join(dir, 'renderer.js'),
        plugins: [
          {
            name: 'fixture',
            setup(b) {
              b.onResolve(
                {
                  filter:
                    /i18n\/i18n$|auth\/auth.store$|matchmaking\/matchmaking.store$|matchmaking\/custom-games.store$|\/diagnostic-logs$/
                },
                (args) => {
                  if (args.path.includes('shared')) return
                  return { path: args.path, namespace: 'stub' }
                }
              )
              b.onLoad({ filter: /.*/, namespace: 'stub' }, (args) => ({
                loader: 'js',
                resolveDir: process.cwd(),
                contents: args.path.endsWith('/diagnostic-logs')
                  ? 'export const getRendererDiagnosticLogs=()=>["test logs"]'
                  : `import {create} from 'zustand';export const useTranslation=()=>({t:k=>k});export const ${args.path.includes('auth.store') ? 'useAuthStore' : args.path.includes('custom-games') ? 'useCustomGamesStore' : args.path.includes('matchmaking.store') ? 'useMatchmakingStore' : 'useLanguageStore'}=create(()=>(${args.path.includes('i18n') ? '{language:"en"}' : args.path.includes('auth.store') ? '{session:{player:{id:"test"}}}' : '{}'}));`
              }))
            }
          }
        ]
      })
      const css = (await readdir('dist-web/assets')).find((n) => /^index-.*\.css$/.test(n))
      assert.ok(css, 'run npm run build:web first')
      await writeFile(
        join(dir, 'index.html'),
        `<link rel="stylesheet" href="file://${resolve('dist-web/assets', css)}"><style>body{background:#0b1220;padding:20px}#root{width:320px}</style><div id="root"></div><script src="renderer.js"></script>`
      )
      await writeFile(
        join(dir, 'main.cjs'),
        `
const {app,BrowserWindow}=require('electron');const assert=require('assert/strict');const fs=require('fs');
app.whenReady().then(async()=>{const w=new BrowserWindow({show:false,width:900,height:800,webPreferences:{contextIsolation:true,sandbox:true}});w.webContents.on("console-message",(_e,l,m)=>{if(l>=3)console.error(m)});const run=async s=>{try{return await w.webContents.executeJavaScript(s)}catch(e){console.error("FAILED",s);throw e}};const pause=()=>new Promise(r=>setTimeout(r,100));try{
await w.loadFile(${JSON.stringify(join(dir, 'index.html'))});await pause();
const initial=await run('document.querySelector("section").getBoundingClientRect().height');
await run('attach()');await pause();assert.equal(await run('document.querySelectorAll("section img").length'),1);
assert.equal(await run('document.querySelector("section").getBoundingClientRect().height'),initial);
await run('attach("image/svg+xml")');assert.equal(await run('report.getState().images.length'),1);
await run('report.setState({description:"Scoreboard clipped at 800x600"});report.getState().submit()');
assert.equal(await run('report.getState().images.length'),1,'failure keeps selected images');assert.equal(await run('report.getState().busy'),false);
await run('[...document.querySelectorAll("button")].find(b=>b.getAttribute("aria-label")==="Remove screenshot 1").click()');await pause();assert.equal(await run('report.getState().images.length'),0);
await run('attach()');await pause();w.show();await pause();fs.writeFileSync('/tmp/16c-issue-report-preview.png',(await w.webContents.capturePage()).toPNG());
await run('window.rejectReport=false;report.getState().submit()');assert.equal(await run('report.getState().images.length'),0);assert.equal(await run('sent.at(-1)[3][0].mime'),'image/png');
await run('[...document.querySelectorAll("button")].find(b=>b.textContent==="Open loadout").click()');assert.deepEqual(await run('({page:navigation.getState().page,tab:navigation.getState().profileTab,item:navigation.getState().purchasedItem.id})'),{page:'profile',tab:'inventory',item:'00000000-0000-4000-8000-000000000001'});
w.destroy();app.exit(0);
}catch(e){console.error(e);w.destroy();app.exit(1)}});
`
      )
      const result = await new Promise((res, rej) => {
        const p = spawn(electron, [join(dir, 'main.cjs')], {
          env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined },
          stdio: ['ignore', 'pipe', 'pipe']
        })
        let output = ''
        p.stdout.on('data', (d) => (output += d))
        p.stderr.on('data', (d) => (output += d))
        p.on('error', rej)
        p.on('exit', (code) => res({ code, output }))
      })
      assert.equal(result.code, 0, result.output)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  }
)
