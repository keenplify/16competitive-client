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
  'settings keyword search and helper window keep accessible, stable layouts',
  { timeout: 60000 },
  async () => {
    const dir = await mkdtemp(join(tmpdir(), '16c-settings-search-'))
    try {
      await build({
        stdin: {
          resolveDir: process.cwd(),
          loader: 'tsx',
          contents: `
import React,{useRef} from 'react';import {createRoot} from 'react-dom/client';
import {SettingsSearch} from './src/renderer/src/features/settings/SettingsSearch';
import {useSettingsSearchStore} from './src/renderer/src/features/settings/settings-search.store';
import {LauncherWindow} from './src/renderer/src/components/ui/LauncherWindow';
import {WebHelperSetup} from './src/renderer/src/features/matchmaking/WebHelperSetup';
window.theme='vgui2';window.searchStore=useSettingsSearchStore;
function Fixture(){const content=useRef(null);return <><div style={{height:400,overflow:'auto',padding:24}}><SettingsSearch contentRef={content}/><div ref={content}><section><label><input type="checkbox" className="peer sr-only" defaultChecked/><span id="switch-box" className="h-6 w-11 after:absolute after:top-1 after:left-1 after:size-4 peer-checked:after:translate-x-5"/></label><h3>Language</h3><p>Choose your preferred language.</p></section><section><h3>Voice & Audio</h3><p>Microphone volume and push to talk.</p></section><section><h3>Assets</h3><p>Repair downloaded skins.</p><input value="private-value" readOnly/></section></div></div><LauncherWindow title="Run the helper on Linux"><WebHelperSetup instructionsOnly/></LauncherWindow></>}
createRoot(document.getElementById('root')).render(<Fixture/>);
`
        },
        bundle: true,
        platform: 'browser',
        format: 'iife',
        define: { __SIXTEEN_COMPETITIVE_VERSION__: JSON.stringify('test') },
        jsx: 'automatic',
        outfile: join(dir, 'renderer.js'),
        plugins: [
          {
            name: 'fixture',
            setup(b) {
              b.onResolve(
                {
                  filter:
                    /i18n\/i18n$|web-helper-prompt.store$|native-helper-settings.store$|use-effective-launcher-theme$|partner-identity$/
                },
                (args) => {
                  if (args.path.includes('shared')) return
                  return { path: args.path, namespace: 'stub' }
                }
              )
              b.onLoad({ filter: /.*/, namespace: 'stub' }, (args) => ({
                loader: 'js',
                resolveDir: process.cwd(),
                contents: args.path.endsWith('use-effective-launcher-theme')
                  ? 'export const useEffectiveLauncherTheme=()=>window.theme'
                  : args.path.endsWith('partner-identity')
                    ? 'export const useAppName=()=>"1.6 Competitive"'
                    : args.path.endsWith('/i18n')
                      ? 'export const useTranslation=()=>({language:"en",t:(k,p)=>p?.count?String(p.count):k})'
                      : args.path.endsWith('web-helper-prompt.store')
                        ? `import {create} from 'zustand';export const useWebHelperPromptStore=create(()=>({status:'unavailable',setupOpen:true,setupCommand:'cd ~/Downloads\\n'+('safe example command '.repeat(80)),renewSetupCommand:async()=>null}));`
                        : `import {create} from 'zustand';export const useNativeHelperSettingsStore=create(()=>({settings:null}));`
              }))
            }
          }
        ]
      })
      const css = (await readdir('dist-web/assets')).find((n) => /^index-.*\.css$/.test(n))
      assert.ok(css, 'build the web renderer first')
      await writeFile(
        join(dir, 'index.html'),
        `<link rel="stylesheet" href="${pathToFileURL(resolve('dist-web/assets', css))}"><style>body{background:#101318;padding:24px}</style><div id="root"></div><script src="renderer.js"></script>`
      )
      await writeFile(
        join(dir, 'main.cjs'),
        `
const {app,BrowserWindow}=require('electron');const assert=require('node:assert/strict');const fs=require('node:fs');
app.whenReady().then(async()=>{const w=new BrowserWindow({show:false,width:1000,height:800,webPreferences:{contextIsolation:true,sandbox:true,backgroundThrottling:false}});const run=s=>w.webContents.executeJavaScript(s);const pause=()=>new Promise(r=>setTimeout(r,350));try{
await w.loadFile(${JSON.stringify(join(dir, 'index.html'))});w.showInactive();await pause();
await run("document.documentElement.dataset.launcherTheme='vgui2'");await pause();
assert.ok(['none','0px','0px 0px'].includes(await run("getComputedStyle(document.querySelector('#switch-box'),'::after').translate")));
await run("document.activeElement.blur();document.dispatchEvent(new KeyboardEvent('keydown',{key:'m',bubbles:true,cancelable:true}))");await pause();
assert.equal(await run("document.activeElement.id"),'settings-search');
assert.equal(await run("searchStore.getState().query"),'m');
await run("document.querySelector('input[readonly]').focus();document.dispatchEvent(new KeyboardEvent('keydown',{key:'x',bubbles:true,cancelable:true}))");await pause();
assert.equal(await run("searchStore.getState().query"),'m');
await run("document.activeElement.blur();document.dispatchEvent(new KeyboardEvent('keydown',{key:'a',ctrlKey:true,bubbles:true,cancelable:true}))");await pause();
assert.equal(await run("searchStore.getState().query"),'m');
await run("document.querySelector('#settings-search').focus();searchStore.getState().setQuery('MICROPHONE')");await pause();
assert.equal(await run("document.querySelector('#settings-search-results button').textContent"),'Voice & Audio');
const before=await run("document.querySelector('#settings-search').getBoundingClientRect().height");
await run("searchStore.getState().setQuery('private-value')");await pause();
assert.equal(await run("document.querySelectorAll('#settings-search-results button').length"),0);
assert.equal(await run("document.querySelector('#settings-search').getBoundingClientRect().height"),before);
await run("searchStore.getState().setQuery('repair skins')");await pause();
assert.equal(await run("document.querySelector('#settings-search-results button').textContent"),'Assets');
await run("document.querySelector('#settings-search-results button').click()");await pause();
assert.equal(await run("document.activeElement.textContent"),'Assets');
assert.equal(await run("document.querySelector('#settings-search-results').hidden"),true);
await run("document.querySelector('textarea').focus()");await pause();
assert.equal(await run("document.querySelector('textarea').scrollTop"),0);
assert.equal(await run("getComputedStyle(document.querySelector('.vgui-scrollbar')).display"),'none');
assert.notEqual(await run("getComputedStyle(document.querySelector('textarea')).borderTopColor"),'rgba(0, 0, 0, 0)');
fs.writeFileSync('/tmp/16c-settings-helper.png',(await w.webContents.capturePage()).toPNG());
w.setSize(700,500);await pause();
assert.equal(await run("getComputedStyle(document.querySelector('.vgui-scrollbar')).display"),'flex');
await run("document.querySelector('.vgui-scrollbar button:last-child').click()");await pause();
assert.ok(await run("document.querySelector('.vgui-window-content').scrollTop>0"));
w.destroy();app.exit(0);
}catch(e){console.error(e);w.destroy();app.exit(1)}});
`
      )
      const result = await new Promise((resolveResult, reject) => {
        const child = spawn(electron, [join(dir, 'main.cjs')], {
          env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined }
        })
        let output = ''
        child.stdout.on('data', (b) => (output += b))
        child.stderr.on('data', (b) => (output += b))
        child.on('error', reject)
        child.on('exit', (code) => resolveResult({ code, output }))
      })
      assert.equal(result.code, 0, result.output)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  }
)
