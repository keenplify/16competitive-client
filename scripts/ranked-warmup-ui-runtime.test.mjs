import { test } from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { mkdtemp, writeFile, rm, mkdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { spawn } from 'node:child_process'
import electron from 'electron'

test(
  'warmup notice keeps its geometry and the queue has no manual bot button',
  { timeout: 30000 },
  async () => {
    const dir = await mkdtemp(join(tmpdir(), '16c-ranked-ui-'))
    await mkdir('out', { recursive: true })
    try {
      await build({
        stdin: {
          loader: 'tsx',
          resolveDir: process.cwd(),
          contents: `
        import React from 'react';import {createRoot} from 'react-dom/client';import {create} from 'zustand';
        import {RankedWarmupNotice} from './src/renderer/src/features/matchmaking/RankedWarmupNotice';
        import {MatchSearchPanel} from './src/renderer/src/features/matchmaking/MatchSearchPanel';
        const useState=create(()=>({phase:'WARMUP',ratingMultiplier:1}));window.noticeState=useState;
        function App(){const state=useState();return <><h1>Match found → Accept → Warmup</h1><RankedWarmupNotice {...state}/><button id="anchor">Reconnect</button><MatchSearchPanel/><MatchSearchPanel variant="compact"/></>}
        createRoot(document.getElementById('root')).render(<App/>);
      `
        },
        bundle: true,
        platform: 'browser',
        jsx: 'automatic',
        outfile: join(dir, 'renderer.js'),
        plugins: [
          {
            name: 'fixture',
            setup(b) {
              b.onResolve(
                { filter: /^\.\/matchmaking.store$|^\.\/PlayerActivity$|^\.\.\/i18n\/i18n$/ },
                (a) => ({ path: a.path, namespace: 'fixture' })
              )
              b.onLoad({ filter: /.*/, namespace: 'fixture' }, (a) => ({
                loader: 'js',
                resolveDir: process.cwd(),
                contents: a.path.includes('matchmaking.store')
                  ? `import {create} from 'zustand';export const useMatchmakingStore=create(()=>({queueStatus:'queued',queueStartedAt:Date.now(),selectedMode:'5v5',selectedMapIds:['de_dust2'],activeRegion:'eu',maps:[],leaveQueue:async()=>{}}));window.queueState=useMatchmakingStore;`
                  : a.path.includes('PlayerActivity')
                    ? `export const PlayerActivity=()=>null;`
                    : `import {matchNotificationTranslations as texts} from './src/renderer/src/features/i18n/match-notification-translations';export const useTranslation=()=>({t:key=>texts.en[key]??key});`
              }))
            }
          }
        ]
      })
      // The status component's fixed utility geometry is asserted in the actual Chromium renderer.
      await writeFile(
        join(dir, 'index.html'),
        `<style>body{background:#10151e;color:white;font:16px sans-serif;margin:40px}p[role=status]{height:40px;line-height:20px;color:#aaa}aside{margin-top:20px;padding:15px;border:1px solid #486}button{border-radius:0}</style><div id="root"></div><script src="renderer.js"></script>`
      )
      await writeFile(
        join(dir, 'main.cjs'),
        `
      const {app,BrowserWindow}=require('electron'),assert=require('node:assert/strict'),fs=require('node:fs');
      app.whenReady().then(async()=>{const w=new BrowserWindow({show:false,width:1000,height:800,webPreferences:{contextIsolation:true,offscreen:true,backgroundThrottling:false}});
      try{await w.loadFile(${JSON.stringify(join(dir, 'index.html'))});const run=s=>w.webContents.executeJavaScript(s);const wait=()=>new Promise(r=>setTimeout(r,150));await wait();
        assert.match(await run('document.body.innerText'),/startearly/);
        const y=await run('document.querySelector("#anchor").getBoundingClientRect().y');
        for(const state of [{phase:'STARTING',ratingMultiplier:0.5},{phase:'LIVE',ratingMultiplier:0.5},{phase:'LIVE',ratingMultiplier:1},{phase:'WARMUP',ratingMultiplier:1}]){
          await run('noticeState.setState('+JSON.stringify(state)+')');await wait();
          assert.equal(await run('document.querySelector("#anchor").getBoundingClientRect().y'),y);
          if(state.ratingMultiplier===0.5)assert.match(await run('document.querySelector("p[role=status]").innerText'),/Half MMR/);
        }
        for(const mode of ['5v5','3v3','ffa'])for(const queueStatus of ['joining','queued','leaving']){
          await run('queueState.setState('+JSON.stringify({selectedMode:mode,queueStatus})+')');await wait();
          assert.equal(await run('Array.from(document.querySelectorAll("button")).some(b=>/play with bots/i.test(b.innerText))'),false);
        }
        fs.writeFileSync(${JSON.stringify(resolve('out/ranked-warmup-ui.png'))},(await w.webContents.capturePage()).toPNG());
        w.destroy();app.exit(0);
      }catch(e){console.error(e);w.destroy();app.exit(1)}});
    `
      )
      const result = await new Promise((res, rej) => {
        const child = spawn(electron, [join(dir, 'main.cjs')], {
          env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined },
          stdio: ['ignore', 'pipe', 'pipe']
        })
        let output = ''
        child.stdout.on('data', (b) => (output += b))
        child.stderr.on('data', (b) => (output += b))
        child.on('error', rej)
        child.on('exit', (code) => res({ code, output }))
      })
      assert.equal(result.code, 0, result.output)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  }
)
