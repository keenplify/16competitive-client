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
  'compatibility consent modal keeps layout in both launcher themes',
  { timeout: 60000 },
  async () => {
    const dir = await mkdtemp(join(tmpdir(), '16c-compat-modal-'))
    try {
      await build({
        stdin: {
          resolveDir: process.cwd(),
          loader: 'tsx',
          contents: `
import React from 'react';import {createRoot} from 'react-dom/client';
import {IssueReportForm} from './src/renderer/src/features/issue-report/IssueReportForm';
import {useIssueReport} from './src/renderer/src/features/issue-report/issue-report.store';
import {ButtonWithHelp} from './src/renderer/src/components/ui/ButtonWithHelp';
window.theme='modern';window.report=useIssueReport;window.rejectUpload=true;window.sent=[];window.botClicks=0;
window.fixture={id:'fixture',totalBytes:7400000,files:['cstrike/cl_dlls/client.dll','hw.dll','valve/cl_dlls/GameUI.dll','vgui2.dll'].map(path=>({path,size:1850000,sha256:'a'.repeat(64)}))};
window.api={gameSettings:{getAssetSyncStatus:async()=>null},diagnosticLogs:{compatibility:async()=>window.fixture,report:async(...args)=>{window.sent.push(args);if(window.rejectUpload && args[4])throw Error('COMPATIBILITY_UPLOAD_FAILED');return {id:'report'}}}};
useIssueReport.setState({open:true,description:'Solo legacy queue is stuck'});useIssueReport.setState({consentOpen:true,compatibilityPreview:window.fixture});
createRoot(document.getElementById('root')).render(<><IssueReportForm/><div id='bot-control' style={{width:180,height:32,marginTop:16}}><ButtonWithHelp className='h-8 w-full' buttonClassName='text-[10px]' helpText='Fill empty slots with bots so you can play even when alone. Solo bot matches use half the normal MMR gain or loss.' onClick={()=>window.botClicks++}>Play with Bots</ButtonWithHelp></div></>);
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
                    /i18n\/i18n$|auth\/auth.store$|matchmaking\/matchmaking.store$|matchmaking\/custom-games.store$|\/diagnostic-logs$|use-effective-launcher-theme$|partner-identity$/
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
                    : args.path.endsWith('/diagnostic-logs')
                      ? 'export const getRendererDiagnosticLogs=()=>[]'
                      : `import {create} from 'zustand'; export const useTranslation=()=>({t:k=>k});export const ${args.path.includes('auth.store') ? 'useAuthStore' : args.path.includes('custom-games') ? 'useCustomGamesStore' : args.path.includes('matchmaking.store') ? 'useMatchmakingStore' : 'useLanguageStore'}=create(()=>(${args.path.includes('i18n') ? '{language:"en"}' : args.path.includes('auth.store') ? '{session:{player:{id:"test"}}}' : '{}'}));`
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
for(const theme of ['modern','vgui2']){
 await run('window.theme='+JSON.stringify(theme)+';document.documentElement.dataset.launcherTheme='+JSON.stringify(theme)+';report.setState({consentOpen:true,compatibilityPreview:fixture,consentError:false,busy:false})');await pause();
 assert.equal(await run('document.querySelector("dialog").open'),true);
 assert.equal(await run('[...document.querySelectorAll("dialog button")].some(b=>b.textContent==="Not now")'),true);
 const geometry=()=>run('JSON.stringify([document.querySelector("section").getBoundingClientRect().height,document.querySelector("dialog").getBoundingClientRect().height])');const before=await geometry();
 fs.writeFileSync(${JSON.stringify(join(tmpdir(), '16c-compatibility-'))}+theme+'.png',(await w.webContents.capturePage()).toPNG());
 await run('report.setState({compatibilityPreview:null,busy:true})');await pause();assert.equal(await geometry(),before,'loading layout '+theme);
 await run('report.setState({busy:false,consentError:true})');await pause();assert.equal(await geometry(),before,'error layout '+theme);
 await run('report.setState({compatibilityPreview:fixture,consentError:false})');await pause();
 assert.equal(await run('getComputedStyle(document.querySelector("dialog")).borderRadius'),'0px');
}
await run('report.setState({rememberConsent:true});[...document.querySelectorAll("dialog button")].find(b=>b.textContent==="Include files").click()');await pause();
assert.equal(await run('report.getState().consentOpen'),true,'failed upload reopens choice');
assert.equal(await run('report.getState().description'),'Solo legacy queue is stuck');
assert.equal(await run('report.getState().busy'),false);
assert.equal(await run('localStorage.getItem("compatibility-report-consent-v1:test")'),'yes');
await run('window.rejectUpload=false;[...document.querySelectorAll("dialog button")].find(b=>b.textContent==="Include files").click()');await pause();
assert.equal(await run('report.getState().open'),false);
assert.equal(await run('sent.length'),2);
assert.equal(await run('sent[0][4]===sent[1][4]'),true,'retry reuses snapshot');
for(const theme of ['modern','vgui2']){
 await run('document.documentElement.dataset.launcherTheme='+JSON.stringify(theme));
 const geometry=()=>run('JSON.stringify(document.querySelector("#bot-control").getBoundingClientRect().toJSON())');const before=await geometry();
 await run('document.querySelector("#bot-control button").dispatchEvent(new MouseEvent("mouseover",{bubbles:true}))');await pause();
 assert.equal(await run('document.querySelector("[role=tooltip]")!==null'),true,'hover anywhere on the action shows help');
 await run('document.querySelector("#bot-control button").focus()');await pause();
 assert.match(await run('document.querySelector("[role=tooltip]").textContent'),/half the normal MMR/);
 await run('document.querySelector("#bot-control button").click()');await pause();
 assert.equal(await run('document.querySelectorAll("#bot-control button").length'),1,'one button only');
 assert.equal(await run('botClicks'),theme==='modern'?1:2,'icon and label share the same action');
 assert.equal(await geometry(),before,'tooltip preserves layout');
 assert.equal(await run('getComputedStyle(document.querySelector("[role=tooltip]")).visibility'),'visible');
 await pause();
 fs.writeFileSync(${JSON.stringify(join(tmpdir(), '16c-bot-tooltip-'))}+theme+'.png',(await w.webContents.capturePage()).toPNG());
 await run('document.querySelector("#bot-control button").blur()');
}
await run('report.setState({open:true,description:"retry report"});report.setState({consentOpen:true,compatibilityPreview:fixture})');await pause();
await run('[...document.querySelectorAll("dialog button")].find(b=>b.textContent==="Not now").click()');await pause();assert.equal(await run('document.querySelector("dialog")===null'),true);assert.equal(await run('report.getState().compatibility'),null);
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
