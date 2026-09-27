/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/explicit-function-return-type */
const esbuild = require('esbuild')
const fs = require('node:fs')
const path = require('node:path')

async function main() {
  const root = path.resolve(__dirname, '..')
  const output = path.join(root, 'resources', 'scoreboard')
  fs.mkdirSync(output, { recursive: true })
  await esbuild.build({
    entryPoints: [path.join(__dirname, 'scoreboard-probe.tsx')],
    bundle: true,
    jsx: 'automatic',
    platform: 'browser',
    format: 'iife',
    minify: true,
    outfile: path.join(output, 'renderer.js')
  })
  fs.copyFileSync(path.join(__dirname, 'scoreboard-probe.css'), path.join(output, 'scoreboard.css'))
  fs.copyFileSync(path.join(__dirname, 'scoreboard-preload.cjs'), path.join(output, 'preload.cjs'))
  fs.copyFileSync(
    path.join(__dirname, 'scoreboard-feed.cjs'),
    path.join(output, 'scoreboard-feed.cjs')
  )
  fs.writeFileSync(
    path.join(output, 'index.html'),
    '<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="scoreboard.css"><div id="root"></div><script src="renderer.js"></script>'
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
