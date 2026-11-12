import { test } from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { mkdtemp, writeFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawn } from 'node:child_process'
import electron from 'electron'
test('refund reasons are keyboard accessible tooltips without shifting controls', async () => {
  const dir = await mkdtemp(join(tmpdir(), '16c-refund-ui-'))
  try {
    await build({
      stdin: {
        resolveDir: process.cwd(),
        loader: 'tsx',
        contents: `import React from 'react';import {createRoot} from 'react-dom/client';import {RefundAction} from './src/renderer/src/features/skins/RefundAction';const root=createRoot(document.getElementById('root'));window.show=(reason)=>root.render(<RefundAction label="Refund" reason={reason} pending={false} disabled={false} onClick={()=>window.clicked=true}/>);window.show('This skin cannot be refunded because it was not purchased.');`
      },
      bundle: true,
      format: 'iife',
      jsx: 'automatic',
      outfile: join(dir, 'ui.js')
    })
    const css = (await readdir('dist-web/assets')).find((n) => /^index-.*\.css$/.test(n))
    assert.ok(css)
    await writeFile(
      join(dir, 'index.html'),
      `<link rel="stylesheet" href="${pathToFileURL(resolve('dist-web/assets', css))}"><body style="padding:120px;background:#101318;color:white"><div id="root"></div><script src="ui.js"></script>`
    )
    await writeFile(
      join(dir, 'main.cjs'),
      `
 const {app,BrowserWindow}=require('electron');const assert=require('node:assert/strict');const fs=require('node:fs');app.whenReady().then(async()=>{const w=new BrowserWindow({show:false,width:800,height:500});const run=async s=>{try{return await w.webContents.executeJavaScript(s)}catch(e){console.error('Failed expression:',s);throw e}};const pause=()=>new Promise(r=>setTimeout(r,200));try{await w.loadFile(${JSON.stringify(join(dir, 'index.html'))});w.showInactive();await pause();for(const theme of ['modern','vgui2']){await run('document.documentElement.dataset.launcherTheme='+JSON.stringify(theme)+';show("This skin cannot be refunded because it was not purchased.")');await pause();assert.equal(await run('document.querySelector("button").disabled'),true);const width=await run('document.querySelector("#root>span").getBoundingClientRect().width');await run('document.querySelector("[tabindex]").focus()');await pause();assert.ok((await run('document.querySelector("[role=tooltip]").textContent')).includes('not purchased'));fs.writeFileSync('/tmp/refund-'+theme+'.png',(await w.webContents.capturePage()).toPNG());await run('show(null)');await pause();assert.equal(await run('document.querySelector("button").disabled'),false);assert.equal(await run('document.querySelector("#root>span").getBoundingClientRect().width'),width);}w.destroy();app.exit(0)}catch(e){console.error(e);app.exit(1)}})
 `
    )
    const result = await new Promise((done, reject) => {
      const child = spawn(electron, [join(dir, 'main.cjs')], {
        env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined }
      })
      let output = ''
      child.stderr.on('data', (b) => (output += b))
      child.on('error', reject)
      child.on('exit', (code) => done({ code, output }))
    })
    assert.equal(result.code, 0, result.output)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
