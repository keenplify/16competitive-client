import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { mkdtemp, writeFile, rm, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawn } from 'node:child_process'
import electron from 'electron'

test(
  'PayMongo keeps geometry during checkout success and failure in both themes',
  { timeout: 60000 },
  async () => {
    const dir = await mkdtemp(join(tmpdir(), '16c-paymongo-ui-'))
    try {
      await build({
        stdin: {
          resolveDir: process.cwd(),
          loader: 'tsx',
          contents: [
            "import React from 'react';import {createRoot} from 'react-dom/client';import {ToastContainer} from 'react-toastify';",
            "import {PCashTopUpModal} from './src/renderer/src/features/skins/PCashTopUp';import {usePaymentsStore} from './src/renderer/src/features/skins/payments.store';",
            "window.store=usePaymentsStore;window.fixture={enabled:true,pCash:0,orders:[],manual:{methods:[],orders:[]},paymongo:{enabled:true,currency:'PHP',minorPerUsd:5800,orders:[]}};",
            "window.api={skins:{payments:async()=>fixture,createPayment:async(id,amount,provider)=>{window.called={id,amount,provider};return new Promise((resolve,reject)=>{window.settle=()=>resolve({id});window.fail=()=>reject(new Error('Declined'))})}}};",
            "createRoot(document.getElementById('root')).render(<><PCashTopUpModal/><ToastContainer className='launcher-toast-container'/></>);setTimeout(()=>store.setState({ownerId:'test',open:true,preferredProvider:'paymongo',methodId:'paymento',methodResolved:false,snapshot:fixture}),0);"
          ].join('\n')
        },
        bundle: true,
        platform: 'browser',
        format: 'iife',
        jsx: 'automatic',
        loader: { '.svg': 'dataurl' },
        outfile: join(dir, 'renderer.js'),
        plugins: [
          {
            name: 'fixture',
            setup(b) {
              b.onResolve(
                {
                  filter:
                    /i18n\/i18n$|auth\/auth.store$|use-effective-launcher-theme$|partner-identity$/
                },
                (args) => ({ path: args.path, namespace: 'fixture' })
              )
              b.onLoad({ filter: /.*/, namespace: 'fixture' }, (args) => ({
                loader: 'js',
                resolveDir: process.cwd(),
                contents: args.path.endsWith('use-effective-launcher-theme')
                  ? "export const useEffectiveLauncherTheme=()=>window.theme??'modern'"
                  : args.path.endsWith('partner-identity')
                    ? "export const useAppName=()=> '1.6 Competitive'"
                    : args.path.includes('auth.store')
                      ? "import {create} from 'zustand';export const useAuthStore=create(()=>({session:{player:{id:'test'}}}));"
                      : "import {create} from 'zustand';import {paymentTranslations} from './src/renderer/src/features/i18n/payment-translations';export const useLanguageStore=create(()=>({language:'en'}));export const translate=(l,k,p={})=>Object.entries(p).reduce((s,[k,v])=>s.replaceAll('{{'+k+'}}',v),paymentTranslations[l]?.[k]??k);export const useTranslation=()=>({language:useLanguageStore(s=>s.language),t:(k,p)=>translate(useLanguageStore.getState().language,k,p)});"
              }))
            }
          }
        ]
      })
      const css = (await readdir('dist-web/assets')).find((n) => /^index-.*\.css$/.test(n))
      assert.ok(css, 'build the web CSS first')
      await writeFile(
        join(dir, 'index.html'),
        '<link rel="stylesheet" href="' +
          pathToFileURL(resolve('dist-web/assets', css)) +
          '"><style>body{background:#111;color:white}</style><div id="root"></div><script src="renderer.js"></script>'
      )
      const main = [
        "const {app,BrowserWindow}=require('electron');const assert=require('node:assert/strict');const fs=require('node:fs');",
        'app.whenReady().then(async()=>{const w=new BrowserWindow({show:false,width:1000,height:1000,webPreferences:{contextIsolation:true,sandbox:true,backgroundThrottling:false}});setTimeout(()=>{console.error("Electron test timed out");app.exit(1)},15000);w.webContents.on("console-message",(_,level,message)=>console.error(message));const run=s=>w.webContents.executeJavaScript(s);const pause=()=>new Promise(r=>setTimeout(r,250));try{',
        'await w.loadFile(' +
          JSON.stringify(join(dir, 'index.html')) +
          ');w.showInactive();await pause();',
        "for(const theme of ['modern','vgui2']){await run('window.theme='+JSON.stringify(theme)+';document.documentElement.dataset.launcherTheme='+JSON.stringify(theme)+';store.setState({busy:false,error:false,historyOpen:false,snapshot:fixture})');await pause();",
        'assert.equal(await run(\'document.querySelector("select").value\'),\'paymongo\');assert.equal(await run(\'document.querySelector("form").textContent.includes("580.00")\'),true);',
        'const geometry=()=>run(\'JSON.stringify([document.querySelector("dialog").getBoundingClientRect().toJSON(),document.querySelector("button[type=submit]").getBoundingClientRect().toJSON()])\');const before=await geometry();',
        "await run('document.querySelector(\"form\").requestSubmit()');await pause();assert.equal(await run('called.provider'),'paymongo');assert.equal(await run('called.amount'),10);assert.equal(await geometry(),before,'pending geometry '+theme);",
        "assert.equal(await run('document.querySelectorAll(\".Toastify__toast\").length>0'),true);await run('settle()');await pause();assert.equal(await geometry(),before,'success geometry '+theme);",
        "await run('document.querySelector(\"form\").requestSubmit()');await pause();await run('fail()');await pause();assert.equal(await geometry(),before,'failure geometry '+theme);assert.equal(await run('document.querySelector(\"dialog\").textContent.includes(\"Could not update\")'),true);",
        "assert.equal(await run('getComputedStyle(document.querySelector(\"dialog\")).borderRadius'),'0px');fs.writeFileSync(" +
          JSON.stringify(join(tmpdir(), '16c-paymongo-')) +
          "+theme+'.png',(await w.webContents.capturePage()).toPNG());}",
        'w.destroy();app.exit(0);}catch(e){console.error(e);w.destroy();app.exit(1)}});'
      ].join('\n')
      await writeFile(join(dir, 'main.cjs'), main)
      const result = await new Promise((res, reject) => {
        const child = spawn(electron, [join(dir, 'main.cjs')], {
          env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined }
        })
        let output = ''
        child.stdout.on('data', (b) => {
          output += b
        })
        child.stderr.on('data', (b) => {
          output += b
        })
        child.on('error', reject)
        child.on('exit', (code) => res({ code, output }))
      })
      assert.equal(result.code, 0, result.output)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  }
)
