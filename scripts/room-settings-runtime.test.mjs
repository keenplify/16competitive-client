import { test } from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { mkdtemp, writeFile, rm, readdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { tmpdir } from 'node:os'
import { spawn } from 'node:child_process'
import electron from 'electron'

test(
  'room settings save, Legacy Mode help and pending/error layout in both themes',
  { timeout: 60000 },
  async () => {
    const dir = await mkdtemp(join(tmpdir(), '16c-room-settings-'))
    try {
      await build({
        stdin: {
          resolveDir: process.cwd(),
          loader: 'tsx',
          contents: `
import React from 'react';import {createRoot} from 'react-dom/client';
import {RoomSettingsModal} from './src/renderer/src/features/matchmaking/RoomSettingsModal';
window.theme='modern';window.room={id:'room',name:'Custom Game',mode:'unrated',mapId:'de_dust2',state:'WAITING',friendlyFire:true};
window.saved=[];const root=createRoot(document.getElementById('root'));
window.render=()=>root.render(<RoomSettingsModal key={window.room.mode} room={window.room} maps={[]}/>);window.render();
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
                    /i18n\/i18n$|custom-games.store$|matchmaking.store$|community\/links$|use-effective-launcher-theme$|partner-identity$/
                },
                (args) => ({ path: args.path, namespace: 'fixture' })
              )
              b.onLoad({ filter: /.*/, namespace: 'fixture' }, (args) => ({
                loader: 'js',
                resolveDir: process.cwd(),
                contents: args.path.endsWith('custom-games.store')
                  ? `import {create} from 'zustand';export const useCustomGamesStore=create(()=>({closeRoomSettings:()=>{},savingSettings:false,error:null,updateRoom:async settings=>{window.saved.push(settings);return true}}));window.settings=useCustomGamesStore;`
                  : args.path.endsWith('matchmaking.store')
                    ? `export const useMatchmakingStore=select=>select({customModes:['unrated','cs13_3v3']});`
                    : args.path.endsWith('community/links')
                      ? `export const useHideDesktopOnlyFeatures=()=>false;`
                      : args.path.endsWith('use-effective-launcher-theme')
                        ? `export const useEffectiveLauncherTheme=()=>window.theme;`
                        : args.path.endsWith('partner-identity')
                          ? `export const useAppName=()=>"1.6 Competitive";`
                          : `import {roomSettingsTranslations} from './src/renderer/src/features/i18n/room-settings-translations';export const useTranslation=()=>({t:key=>roomSettingsTranslations.en[key]??key});`
              }))
            }
          }
        ]
      })
      const css = (await readdir('dist-web/assets')).find((n) => /^index-.*\.css$/.test(n))
      assert.ok(css)
      await writeFile(
        join(dir, 'index.html'),
        `<link rel="stylesheet" href="${pathToFileURL(resolve('dist-web/assets', css))}"><style>body{background:#101318}</style><div id="root"></div><script src="renderer.js"></script>`
      )
      await writeFile(
        join(dir, 'main.cjs'),
        `
const {app,BrowserWindow}=require('electron'),assert=require('node:assert/strict'),fs=require('node:fs');
app.whenReady().then(async()=>{const w=new BrowserWindow({show:false,width:1000,height:900,webPreferences:{contextIsolation:true,sandbox:true,backgroundThrottling:false}});const run=s=>w.webContents.executeJavaScript(s),pause=()=>new Promise(r=>setTimeout(r,200));try{
 await w.loadFile(${JSON.stringify(join(dir, 'index.html'))});w.showInactive();await pause();
 for(const theme of ['modern','vgui2']){
  await run('window.theme='+JSON.stringify(theme)+';document.documentElement.dataset.launcherTheme='+JSON.stringify(theme)+';window.room.mode="unrated";window.render()');await pause();
  assert.equal(await run('document.querySelector("button[type=submit]").disabled'),false);
  await run('[...document.querySelectorAll("label")].find(e=>e.textContent.includes("Legacy Mode")).querySelector("input").click();document.querySelector("button[type=submit]").click()');await pause();
  assert.equal(await run('window.saved.at(-1).legacyMode'),true);
  await run('[...document.querySelectorAll("button")].find(e=>e.getAttribute("aria-label")?.includes("CS 1.6 custom games only")).focus()');await pause();
  assert.equal(await run('!!document.querySelector("dialog [role=tooltip]")'),true,'tooltip belongs to the native dialog top layer');
  assert.equal(await run('getComputedStyle(document.querySelector("[role=tooltip]")).visibility'), 'visible');
  fs.writeFileSync(${JSON.stringify(join(tmpdir(), '16c-room-settings-'))}+theme+'.png',(await w.webContents.capturePage()).toPNG());
  const geometry=()=>run('JSON.stringify([document.querySelector("dialog").getBoundingClientRect().height,document.querySelector("button[type=submit]").getBoundingClientRect().width])');
  const before=await geometry();await run('settings.setState({savingSettings:true})');await pause();assert.equal(await geometry(),before);
  await run('settings.setState({savingSettings:false,error:"offline"})');await pause();assert.equal(await geometry(),before);
  await run('settings.setState({error:null});window.room.mode="cs13_3v3";window.render()');await pause();
  assert.equal(await run('document.querySelector("button[type=submit]").disabled'),false,'current room saves with missing catalog');
  assert.equal(await run('[...document.querySelectorAll("label")].find(e=>e.textContent.includes("Legacy Mode")).querySelector("input").disabled'),true);
  await run('document.querySelector("button[type=submit]").click()');await pause();assert.equal(await run('window.saved.at(-1).legacyMode'),false);
 }
 w.destroy();app.exit(0);
}catch(error){console.error(error);w.destroy();app.exit(1)}});
`
      )
      const result = await new Promise((yes, no) => {
        const child = spawn(electron, [join(dir, 'main.cjs')], {
          env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined }
        })
        let output = ''
        child.stdout.on('data', (b) => (output += b))
        child.stderr.on('data', (b) => (output += b))
        child.on('error', no)
        child.on('exit', (code) => yes({ code, output }))
      })
      assert.equal(result.code, 0, result.output)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  }
)
