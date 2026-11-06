import { test } from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { mkdtemp, writeFile, rm, readdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { spawn } from 'node:child_process'
import electron from 'electron'

test(
  'community chat control keeps layout stable through pending, failure and success',
  { timeout: 30000 },
  async () => {
    const dir = await mkdtemp(join(tmpdir(), '16c-community-chat-ui-'))
    try {
      await build({
        stdin: {
          resolveDir: process.cwd(),
          loader: 'tsx',
          contents: `
import React from 'react';import {createRoot} from 'react-dom/client';
import {CommunityEditPage} from './src/renderer/src/features/communities/CommunityEditPage';
import {useCommunitiesStore} from './src/renderer/src/features/communities/communities.store';
window.community=useCommunitiesStore;
createRoot(document.getElementById('root')).render(<CommunityEditPage friendsCollapsed={true}/>);
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
              b.onResolve({ filter: /\/communities.store$|i18n\/i18n$/ }, (args) => ({
                path: args.path.endsWith('communities.store') ? 'communities' : 'i18n',
                namespace: 'fixture'
              }))
              b.onLoad({ filter: /.*/, namespace: 'fixture' }, (args) => ({
                loader: 'js',
                resolveDir: process.cwd(),
                contents:
                  args.path === 'communities'
                    ? `import {create} from 'zustand';export const useCommunitiesStore=create((set,get)=>({editDraft:{name:'Fixture community',description:'Community settings',communityCountryCode:null,servers:[]},editLoading:false,editLoadError:false,saving:false,saveError:false,savedServerIds:[],updateDraft:patch=>set({editDraft:{...get().editDraft,...patch}}),cancelEdit:()=>{},saveEdit:()=>{},addServer:()=>{}}));`
                    : `import {communityDirectoryTranslations} from './src/renderer/src/features/i18n/community-directory-translations';export const useTranslation=()=>({language:'en',t:key=>communityDirectoryTranslations.en[key]??key});`
              }))
            }
          }
        ]
      })
      const css = (await readdir('dist-web/assets')).find((name) => /^index-.*\.css$/.test(name))
      assert.ok(css, 'run npm run build:web first')
      await writeFile(
        join(dir, 'index.html'),
        `<link rel="stylesheet" href="file://${resolve('dist-web/assets', css)}"><style>body{background:#0b1220}</style><div id="root"></div><script src="renderer.js"></script>`
      )
      await writeFile(
        join(dir, 'main.cjs'),
        `
const {app,BrowserWindow}=require('electron');const assert=require('assert/strict');const fs=require('fs');
app.whenReady().then(async()=>{const w=new BrowserWindow({show:false,width:1280,height:900,webPreferences:{contextIsolation:true,sandbox:true}});const run=s=>w.webContents.executeJavaScript(s);const pause=()=>new Promise(r=>setTimeout(r,100));try{
await w.loadFile(${JSON.stringify(join(dir, 'index.html'))});await pause();
const geometry=()=>run('Array.from(document.querySelectorAll("input,textarea,button[type=submit]")).map(e=>{const r=e.getBoundingClientRect();return [r.x,r.y,r.width,r.height]})');
const initial=await geometry();assert.equal(await run('document.querySelector("input[type=checkbox]").checked'),false);
await run('document.querySelector("input[type=checkbox]").click()');await pause();assert.equal(await run('community.getState().editDraft.hideCommunityChat'),true);
await run('community.setState({saving:true})');await pause();assert.equal(await run('document.querySelector("input[type=checkbox]").disabled'),true);assert.deepEqual(await geometry(),initial);
await run('community.setState({saving:false,saveError:true})');await pause();assert.deepEqual(await geometry(),initial);assert.equal(await run('document.querySelector("input[type=checkbox]").checked'),true);
await run('community.setState({saveError:false})');await pause();assert.deepEqual(await geometry(),initial);
assert.equal(await run('getComputedStyle(document.querySelector("button[type=submit]")).borderRadius'),'0px');
fs.writeFileSync('/tmp/16c-community-chat-toggle.png',(await w.webContents.capturePage()).toPNG());w.destroy();app.exit(0);
}catch(e){console.error(e);w.destroy();app.exit(1)}});
`
      )
      const result = await new Promise((resolveResult, reject) => {
        const child = spawn(electron, [join(dir, 'main.cjs')], {
          env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined },
          stdio: ['ignore', 'pipe', 'pipe']
        })
        let output = ''
        child.stdout.on('data', (data) => {
          output += data
        })
        child.stderr.on('data', (data) => {
          output += data
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
