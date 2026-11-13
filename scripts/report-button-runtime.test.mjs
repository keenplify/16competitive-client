/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { mkdtemp, writeFile, readdir, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { spawn } from 'node:child_process'
import electron from 'electron'

test(
  'report button receives real pointer clicks above the VGUI match page',
  { timeout: 45000 },
  async () => {
    const dir = await mkdtemp(join(tmpdir(), '16c-report-button-'))
    try {
      await build({
        stdin: {
          resolveDir: process.cwd(),
          loader: 'tsx',
          contents: `
import React from 'react';import {createRoot} from 'react-dom/client';
import {SkinAssetSyncIndicator} from './src/renderer/src/features/skins/SkinAssetSyncIndicator';
window.theme='vgui2';window.api={gameSettings:{onAssetSyncProgress:()=>()=>{},getAssetSyncStatus:async()=>({status:'idle',completedFiles:0,totalFiles:0})},matchmaking:{onEvent:()=>()=>{}}};
createRoot(document.getElementById('root')).render(<><div className="vgui-page-host" style={{position:'fixed',inset:0,zIndex:26}}><div className="vgui-window-host"><div className="vgui-window">FFA match window</div></div></div><SkinAssetSyncIndicator/></>);
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
                    /issue-report\.store$|IssueReportForm$|i18n\/i18n$|use-effective-launcher-theme$|navigation\.store$|custom-games\.store$/
                },
                (args) => ({ path: args.path, namespace: 'stub' })
              )
              b.onLoad({ filter: /.*/, namespace: 'stub' }, (args) => ({
                loader: 'tsx',
                resolveDir: process.cwd(),
                contents: args.path.endsWith('IssueReportForm')
                  ? 'export const IssueReportForm=()=> <section id="report-open">Report form</section>'
                  : args.path.endsWith('issue-report.store')
                    ? `import {create} from 'zustand';export const useIssueReport=create(()=>({open:false}));window.report=useIssueReport;`
                    : args.path.endsWith('use-effective-launcher-theme')
                      ? 'export const useEffectiveLauncherTheme=()=>window.theme'
                      : args.path.endsWith('i18n/i18n')
                        ? `export const useTranslation=()=>({t:k=>k});export const useLanguageStore=selector=>selector({language:'en'});export const isLegacyRuntimeLanguage=()=>false;`
                        : args.path.endsWith('navigation.store')
                          ? `export const useNavigationStore=selector=>selector({page:'play'})`
                          : `export const useCustomGamesStore=selector=>selector({playView:'matchmaking'})`
              }))
            }
          }
        ]
      })
      const css = (await readdir('dist-web/assets')).find((name) => /^index-.*\.css$/.test(name))
      assert.ok(css, 'build:web must run first')
      await writeFile(
        join(dir, 'index.html'),
        `<link rel="stylesheet" href="${pathToFileURL(resolve('dist-web/assets', css))}"><div id="root"></div><script src="renderer.js"></script>`
      )
      await writeFile(
        join(dir, 'main.cjs'),
        `
const {app,BrowserWindow}=require('electron');const assert=require('node:assert/strict');const fs=require('node:fs');
app.whenReady().then(async()=>{const w=new BrowserWindow({show:false,width:1280,height:900,webPreferences:{contextIsolation:true,sandbox:true}});const run=s=>w.webContents.executeJavaScript(s);try{
await w.loadFile(${JSON.stringify(join(dir, 'index.html'))});w.showInactive();
for(const theme of ['vgui2','modern']) {
 await run('window.theme='+JSON.stringify(theme)+';document.documentElement.dataset.launcherTheme='+JSON.stringify(theme)+';report.setState({open:false})');
 await new Promise(r=>setTimeout(r,300));
 const point=await run('(()=>{const b=document.querySelector(".launcher-desktop-notices button"),r=b.getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2),hit:document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest("button")===b}})()');
 assert.equal(point.hit,true,theme+' report is covered by match page');
 w.webContents.sendInputEvent({type:'mouseDown',button:'left',x:point.x,y:point.y,clickCount:1});w.webContents.sendInputEvent({type:'mouseUp',button:'left',x:point.x,y:point.y,clickCount:1});
 await new Promise(r=>setTimeout(r,200));assert.equal(await run('report.getState().open'),true,theme+' click');
 assert.equal(await run('document.querySelector("#report-open")!==null'),true);
 fs.writeFileSync('/tmp/report-button-'+theme+'.png',(await w.webContents.capturePage()).toPNG());
}
w.destroy();app.exit(0);
}catch(e){console.error(e);w.destroy();app.exit(1)}});
`
      )
      const result = await new Promise((resolveResult, reject) => {
        const child = spawn(electron, [join(dir, 'main.cjs')], {
          env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined }
        })
        let output = ''
        child.stdout.on('data', (bytes) => {
          output += bytes
        })
        child.stderr.on('data', (bytes) => {
          output += bytes
        })
        child.on('error', reject)
        child.on('exit', (code) => resolveResult({ code, output }))
      })
      assert.equal(result.code, 0, result.output)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  }
)
