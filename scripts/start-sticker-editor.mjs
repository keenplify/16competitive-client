import { build } from 'esbuild'
import { mkdtemp, writeFile, copyFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import electron from 'electron'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const output = await mkdtemp(path.join(os.tmpdir(), '16c-sticker-editor-'))
await build({
  entryPoints: [path.join(root, 'scripts/sticker-editor/main.ts')],
  outfile: path.join(output, 'main.cjs'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  external: ['electron']
})
await build({
  entryPoints: [path.join(root, 'scripts/sticker-editor/preload.ts')],
  outfile: path.join(output, 'preload.cjs'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  external: ['electron']
})
await build({
  entryPoints: [path.join(root, 'src/renderer/src/features/sticker-editor/entry.tsx')],
  outfile: path.join(output, 'renderer.js'),
  bundle: true,
  platform: 'browser',
  format: 'iife',
  jsx: 'automatic',
  loader: { '.woff2': 'file', '.woff': 'file' },
  define: { 'process.env.NODE_ENV': '"development"' }
})
await copyFile(
  path.join(root, 'scripts/sticker-editor/index.html'),
  path.join(output, 'index.html')
)
await writeFile(path.join(output, 'package.json'), '{}')
const child = spawn(
  electron,
  [path.join(output, 'main.cjs'), output, root, ...process.argv.slice(2)],
  { stdio: 'inherit', env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined } }
)
child.once('exit', (code) => {
  process.exitCode = code ?? 1
})
