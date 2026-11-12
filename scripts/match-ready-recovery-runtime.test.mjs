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
  'preparing match can close, ready actions work, and modal releases background in both themes',
  { timeout: 60000 },
  async () => {
    const dir = await mkdtemp(join(tmpdir(), '16c-ready-recovery-'))
    try {
      await build({
        stdin: {
          resolveDir: process.cwd(),
          loader: 'tsx',
          contents: `
import React from 'react';import {createRoot} from 'react-dom/client';
import {MatchReadyOverlay} from './src/renderer/src/features/matchmaking/MatchReadyOverlay';
window.theme='modern';window.clicks=0;
createRoot(document.getElementById('root')).render(<><button id='background' style={{position:'fixed',top:24,left:24,width:100,height:36}} onClick={()=>window.clicks++}>Background</button><MatchReadyOverlay/></>);
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
                    /matchmaking\.store$|queue-warmup\.store$|pcash-bets\.store$|ready-player-ranks\.store$|\/PCashStakePanel$|i18n\/i18n$|use-effective-launcher-theme$|partner-identity$/
                },
                (args) => ({ path: args.path, namespace: 'fixture' })
              )
              b.onLoad({ filter: /.*/, namespace: 'fixture' }, (args) => ({
                loader: 'js',
                resolveDir: process.cwd(),
                contents: args.path.endsWith('/PCashStakePanel')
                  ? 'export const PCashStakePanel=()=>null'
                  : args.path.endsWith('use-effective-launcher-theme')
                    ? 'export const useEffectiveLauncherTheme=()=>window.theme'
                    : args.path.endsWith('partner-identity')
                      ? 'export const useAppName=()=>"1.6 Competitive"'
                      : args.path.endsWith('i18n/i18n')
                        ? 'export const useTranslation=()=>({t:(key)=>key==="icafe.close"?"Close":key})'
                        : args.path.endsWith('matchmaking.store')
                          ? `import {create} from 'zustand';
const player=(id)=>({id,username:id,mmr:1000,isBot:id!=='human'});
window.fixture={matchId:'fixture',mode:'cs13_3v3',mapId:'de_dust',teams:{teamA:['human','b1','b2','b3','b4'].map(player),teamB:['b5','b6','b7','b8','b9'].map(player)}};
export const useMatchmakingStore=create((set,get)=>({match:window.fixture,queueStatus:'match_found',readyDeadline:null,readyDeclineAvailableAt:null,acceptedPlayerIds:[],readyPlayersRequired:0,readyResponse:'pending',error:null,dismissedReadyMatchId:null,dismissPreparingReadyCheck:()=>set({dismissedReadyMatchId:get().match.matchId}),respondReady:async(accepted)=>set({readyResponse:accepted?'accepted':'declined'})}));window.queue=useMatchmakingStore;`
                          : args.path.endsWith('queue-warmup.store')
                            ? `import {create} from 'zustand';export const useQueueWarmupStore=create(()=>({matchId:null,status:'idle'}))`
                            : args.path.endsWith('pcash-bets.store')
                              ? `import {create} from 'zustand';export const usePCashBetsStore=create(()=>({busy:false,matchId:null,amount:'0',snapshot:null}))`
                              : `import {create} from 'zustand';export const useReadyPlayerRanksStore=create(()=>({ranks:{},load:async()=>{}}))`
              }))
            }
          }
        ]
      })
      const css = (await readdir('dist-web/assets')).find((name) => /^index-.*\.css$/.test(name))
      assert.ok(css, 'build web first')
      await writeFile(
        join(dir, 'index.html'),
        `<link rel="stylesheet" href="${pathToFileURL(resolve('dist-web/assets', css))}"><link rel="stylesheet" href="renderer.css"><div id="root"></div><script src="renderer.js"></script>`
      )
      await writeFile(
        join(dir, 'main.cjs'),
        `
const {app,BrowserWindow}=require('electron');const assert=require('node:assert/strict');const fs=require('node:fs');
app.whenReady().then(async()=>{const w=new BrowserWindow({show:false,width:1100,height:900,webPreferences:{contextIsolation:true,sandbox:true,backgroundThrottling:false}});const run=s=>w.webContents.executeJavaScript(s);const pause=()=>new Promise(r=>setTimeout(r,250));const click=async selector=>{const r=await run('(()=>{const r=document.querySelector('+JSON.stringify(selector)+').getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()');w.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,...r});w.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,...r});await pause();};
try{await w.loadFile(${JSON.stringify(join(dir, 'index.html'))});w.showInactive();await pause();
for(const theme of ['modern','vgui2']){
 await run('window.theme='+JSON.stringify(theme)+';document.documentElement.dataset.launcherTheme='+JSON.stringify(theme)+';window.clicks=0;queue.setState({match:{...fixture},queueStatus:"match_found",dismissedReadyMatchId:null,readyResponse:"pending",readyDeadline:null})');await pause();
 assert.equal(await run('document.querySelector("dialog").open'),true);
 assert.equal(await run('document.querySelector(".match-ready-actions button").disabled'),true);
 await click('button[aria-label="Close"]');assert.equal(await run('document.querySelector("dialog")'),null);
 await click('#background');assert.equal(await run('window.clicks'),1);
 await run('queue.setState({queueStatus:"ready_check",dismissedReadyMatchId:null,readyDeadline:new Date(Date.now()+120000).toISOString(),acceptedPlayerIds:[],readyPlayersRequired:10})');await pause();
 assert.equal(await run('document.querySelector(".match-ready-actions button").disabled'),false);
 const height=await run('document.querySelector("dialog").getBoundingClientRect().height');await click('.match-ready-actions button');
 assert.equal(await run('queue.getState().readyResponse'),'accepted');
 assert.equal(await run('document.querySelector("dialog").getBoundingClientRect().height'),height);
 fs.writeFileSync(${JSON.stringify(join(tmpdir(), '16c-ready-recovery-'))}+theme+'.png',(await w.webContents.capturePage()).toPNG());
 await run('queue.setState({match:null,queueStatus:"idle"})');await pause();assert.equal(await run('document.querySelector("dialog")'),null);
 await click('#background');assert.equal(await run('window.clicks'),2);assert.equal(await run('document.body.style.overflow'),'');
}w.destroy();app.exit(0);}catch(e){console.error(e);w.destroy();app.exit(1)}});
`
      )
      const result = await new Promise((done, reject) => {
        const child = spawn(electron, [join(dir, 'main.cjs')], {
          env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined }
        })
        let output = ''
        child.stdout.on('data', (b) => (output += b))
        child.stderr.on('data', (b) => (output += b))
        child.on('error', reject)
        child.on('exit', (code) => done({ code, output }))
      })
      assert.equal(result.code, 0, result.output)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  }
)
