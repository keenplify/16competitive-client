/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, readdir, rm, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import { build } from 'vite'
import react from '@vitejs/plugin-react'

const source = resolve(process.argv[2] ?? '')
if (!process.argv[2])
  throw new Error('Usage: node scripts/generate-weapon-previews.mjs /path/to/cstrike/models')
const only = process.argv[3]
const inspectRotations = process.argv[4] === 'inspect'
const names = (await readdir(source))
  .filter((name) => /^p_[a-z0-9_]+\.mdl$/i.test(name) && (!only || name === only))
  .sort()
if (!names.length) throw new Error(`No p_*.mdl files in ${source}`)

const output = resolve('resources/weapon-previews')
const profile = await mkdtemp(join(tmpdir(), 'weapon-previews-'))
const captureDir = join(profile, 'site')
await build({
  root: process.cwd(),
  publicDir: false,
  base: './',
  plugins: [react()],
  resolve: {
    extensions: ['.mjs', '.mts', '.ts', '.tsx', '.js', '.jsx', '.json'],
    dedupe: ['react', 'react-dom', 'styled-components', 'three', 'react-dropzone'],
    alias: { three: resolve('node_modules/three/build/three.module.js') }
  },
  optimizeDeps: { exclude: ['three'] },
  build: {
    outDir: captureDir,
    emptyOutDir: true,
    rollupOptions: { input: resolve('scripts/weapon-previews.html') }
  }
})

let chrome
try {
  await mkdir(join(captureDir, '__weapon_model'), { recursive: true })
  for (const name of names)
    await writeFile(join(captureDir, '__weapon_model', name), await readFile(join(source, name)))
  const url = `file://${join(captureDir, 'scripts/weapon-previews.html')}`
  chrome = spawn(
    'google-chrome',
    [
      '--headless=new',
      '--no-sandbox',
      '--disable-gpu-sandbox',
      '--enable-unsafe-swiftshader',
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--allow-file-access-from-files',
      '--remote-debugging-port=0',
      `--user-data-dir=${profile}`,
      'about:blank'
    ],
    { stdio: 'ignore' }
  )

  let port
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      port = Number((await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0])
      break
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
  }
  if (!port) throw new Error('Chrome DevTools did not start')
  const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json()
  const target = targets.find((entry) => entry.type === 'page')
  if (!target) throw new Error('Chrome page target missing')
  const socket = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    socket.onopen = resolve
    socket.onerror = reject
  })
  let id = 0
  const pending = new Map()
  socket.onmessage = ({ data }) => {
    const result = JSON.parse(data)
    if (!result.id) return
    const callbacks = pending.get(result.id)
    if (!callbacks) return
    pending.delete(result.id)
    result.error
      ? callbacks.reject(new Error(result.error.message))
      : callbacks.resolve(result.result)
  }
  const command = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const next = ++id
      pending.set(next, { resolve, reject })
      socket.send(JSON.stringify({ id: next, method, params }))
    })
  await command('Page.enable')
  await command('Page.navigate', { url })
  await command('Runtime.enable')
  for (let attempt = 0; attempt < 100; attempt++) {
    const result = await command('Runtime.evaluate', {
      expression: 'typeof window.renderWeaponPreview',
      returnByValue: true
    })
    if (result.result.value === 'function') break
    if (attempt === 99) throw new Error('Preview page did not load')
    await new Promise((resolve) => setTimeout(resolve, 100))
  }

  await mkdir(output, { recursive: true })
  const manifest = only
    ? JSON.parse(await readFile(join(output, 'manifest.json'), 'utf8').catch(() => '{}'))
    : {}
  const rotations = inspectRotations
    ? [
        [0, 0, 0],
        [0, 0, 90],
        [0, 0, 190],
        [0, 0, 270],
        [90, 0, 0],
        [90, 0, 90],
        [90, 0, 270],
        [0, 90, 0],
        [0, 90, 90],
        [0, 90, 270]
      ]
    : [null]
  for (const name of names)
    for (const rotation of rotations) {
      const result = await command('Runtime.evaluate', {
        expression: `window.renderWeaponPreview(${JSON.stringify(name)}, ${JSON.stringify(rotation)})`,
        awaitPromise: true,
        returnByValue: true
      })
      if (result.exceptionDetails) throw new Error(`${name}: ${result.exceptionDetails.text}`)
      const dataUrl = result.result.value
      if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/png;base64,'))
        throw new Error(`Invalid PNG for ${name}`)
      const png =
        name === 'p_elite.mdl'
          ? await readFile(resolve('src/renderer/src/assets/elite-pistols.png'))
          : Buffer.from(dataUrl.slice('data:image/png;base64,'.length), 'base64')
      const imageName = `${basename(name, '.mdl')}.png`
      if (inspectRotations) {
        await writeFile(join(profile, `${basename(name, '.mdl')}-${rotation.join('-')}.png`), png)
      } else {
        await writeFile(join(output, imageName), png)
        manifest[name] = {
          image: imageName,
          modelSha256: createHash('sha256')
            .update(await readFile(join(source, name)))
            .digest('hex'),
          ...(name === 'p_elite.mdl' ? { source: 'src/renderer/src/assets/elite-pistols.png' } : {})
        }
      }
      console.log(`${name} -> ${imageName} (${png.length} bytes)`)
    }
  if (!inspectRotations)
    await writeFile(join(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
  else console.log(`Rotation samples: ${profile}`)
  socket.close()
} finally {
  if (chrome && chrome.exitCode === null) {
    chrome.kill()
    await new Promise((resolve) => chrome.once('exit', resolve))
  }
  if (!inspectRotations)
    await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
}
