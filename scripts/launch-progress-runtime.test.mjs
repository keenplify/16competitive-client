import { test } from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { spawn } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import electron from 'electron'

test(
  'launch feedback updates in place above dialogs and resolves on success and error without moving content',
  { timeout: 30000 },
  async () => {
    const dir = await mkdtemp(join(tmpdir(), '16c-launch-ui-'))
    await mkdir('out', { recursive: true })
    try {
      await build({
        stdin: {
          loader: 'tsx',
          resolveDir: process.cwd(),
          contents: `
        import React from 'react'; import {createRoot} from 'react-dom/client';
        import {MatchAssetPreparation} from './src/renderer/src/features/matchmaking/MatchAssetPreparation';
        import 'react-toastify/dist/ReactToastify.css'; import './src/renderer/src/assets/toast.css';
        createRoot(document.getElementById('root')).render(<MatchAssetPreparation/>);
      `
        },
        bundle: true,
        alias: {
          react: resolve('node_modules/react'),
          'react-dom': resolve('node_modules/react-dom')
        },
        platform: 'browser',
        jsx: 'automatic',
        outfile: join(dir, 'renderer.js'),
        plugins: [
          {
            name: 'fixture',
            setup(b) {
              b.onResolve({ filter: /^\.\/matchmaking.store$|^\.\.\/i18n\/i18n$/ }, (args) => ({
                path: args.path,
                namespace: 'fixture'
              }))
              b.onLoad({ filter: /.*/, namespace: 'fixture' }, (args) => ({
                resolveDir: process.cwd(),
                loader: 'js',
                contents: args.path.includes('matchmaking.store')
                  ? `
            import {create} from 'zustand';
            export const useMatchmakingStore=create(()=>({assetPreparation:{status:'idle',completedFiles:0,totalFiles:0},launchPreparation:null}));
            window.progressStore=useMatchmakingStore;
          `
                  : `
            import {launchProgressTranslations} from './src/renderer/src/features/i18n/launch-progress-translations';
            const t=(key,values={})=>Object.entries(values).reduce((text,[k,v])=>text.replaceAll('{{'+k+'}}',v),launchProgressTranslations.en[key]??key);
            export const useTranslation=()=>({t});
          `
              }))
            }
          }
        ]
      })
      await writeFile(
        join(dir, 'index.html'),
        `<link rel="stylesheet" href="renderer.css"><style>
      body{margin:0;background:#10151e;color:white;font:16px sans-serif}#content{margin:40px}dialog{background:#1b2636;color:white;border:1px solid #556;padding:32px}
      [popover]{position:fixed;inset:0;margin:0;height:0;width:100%;overflow:visible;border:0;background:transparent;padding:0}
    </style><section id="content"><h1>Match found</h1><button>Connect</button></section><dialog id="ready">Match ready check</dialog><div id="root"></div><script src="renderer.js"></script>`
      )
      await writeFile(
        join(dir, 'main.cjs'),
        `
      const {app,BrowserWindow}=require('electron'); const assert=require('node:assert/strict');const fs=require('node:fs');
      app.whenReady().then(async()=>{
        const w=new BrowserWindow({show:false,width:1000,height:700,webPreferences:{contextIsolation:true,backgroundThrottling:false,offscreen:true}});
        w.webContents.on('console-message',event=>console.log(event.message));
        try {
          await w.loadURL(${JSON.stringify(pathToFileURL(join(dir, 'index.html')).href)});
          const run=code=>w.webContents.executeJavaScript(code); const pause=()=>new Promise(r=>setTimeout(r,400));await pause();
          await run('document.querySelector("dialog").showModal()');
          const initial=await run('document.querySelector("#content").getBoundingClientRect().y');
          for(const phase of ['checking','downloading','sticker_bake','starting','ready']){
            await run('progressStore.setState({launchPreparation:{phase:'+JSON.stringify(phase)+',completed:1,total:3}})'); await pause();
            assert.equal(await run('document.querySelector("#content").getBoundingClientRect().y'),initial);
            assert.equal(await run('document.querySelectorAll(".Toastify__toast").length'),1,phase+': '+await run('document.body.innerHTML'));
            assert.equal(await run('document.querySelector("[popover]").matches(":popover-open")'),true);
            assert.equal(await run('getComputedStyle(document.querySelector(".Toastify__toast")).borderRadius'),'0px');
            if(phase==='sticker_bake') fs.writeFileSync(${JSON.stringify(resolve('out/launch-progress-bake.png'))},(await w.webContents.capturePage()).toPNG());
          }
          assert.equal(await run('document.querySelectorAll(".Toastify__spinner").length'),0);
          assert.match(await run('document.body.innerText'),/Counter-Strike started/);
          await run('progressStore.setState({launchPreparation:{phase:"checking",completed:0,total:0}})');await pause();
          await run('progressStore.setState({launchPreparation:{phase:"error",completed:0,total:0}})');await pause();
          assert.equal(await run('document.querySelectorAll(".Toastify__spinner").length'),0);
          assert.match(await run('document.body.innerText'),/Report an Issue/);
          assert.equal(await run('document.querySelector("#content").getBoundingClientRect().y'),initial);
          w.destroy();app.exit(0);
        }catch(error){console.error(error);w.destroy();app.exit(1)}
      });
    `
      )
      const result = await new Promise((resolveExit, reject) => {
        const child = spawn(electron, [join(dir, 'main.cjs')], {
          env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined },
          windowsHide: true,
          stdio: ['ignore', 'pipe', 'pipe']
        })
        let output = ''
        child.stdout.on('data', (bytes) => (output += bytes))
        child.stderr.on('data', (bytes) => (output += bytes))
        child.on('error', reject)
        child.on('exit', (code) => resolveExit({ code, output }))
      })
      assert.equal(result.code, 0, result.output)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  }
)
