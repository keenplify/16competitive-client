/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/explicit-function-return-type */
const esbuild = require('esbuild')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawn } = require('node:child_process')

async function main() {
  const scoreboard = process.argv[2] === 'scoreboard'
  const session = process.argv[scoreboard ? 3 : 2]
  if (!session || !path.isAbsolute(session)) {
    throw new Error('Expected an absolute prepared cosmetic-probe session path')
  }
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'papamo-overlay-'))
  const script = path.join(temp, 'renderer.js')
  const html = path.join(temp, 'index.html')
  await esbuild.build({
    entryPoints: [
      path.join(__dirname, scoreboard ? 'scoreboard-probe.tsx' : 'cosmetic-overlay-probe.tsx')
    ],
    bundle: true,
    jsx: 'automatic',
    platform: 'browser',
    format: 'iife',
    outfile: script
  })
  if (scoreboard) {
    fs.copyFileSync(path.join(__dirname, 'scoreboard-probe.css'), path.join(temp, 'scoreboard.css'))
    fs.writeFileSync(
      html,
      '<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="scoreboard.css"><div id="root"></div><script src="renderer.js"></script>'
    )
  } else
    fs.writeFileSync(
      html,
      `<!doctype html><meta charset="utf-8"><style>
    html,body,#root{margin:0;width:360px;height:96px;background:transparent;overflow:hidden}
    *{box-sizing:border-box}.badge{display:flex;align-items:center;gap:16px;width:360px;height:96px;
      padding:14px 20px;border:4px solid white;border-radius:18px;background:#8615d9;
      color:white;font-family:Arial,sans-serif}.mark{font-size:24px;font-weight:900}
    strong,small{display:block}strong{font-size:18px;letter-spacing:1px}
    small{font-size:12px;margin-top:5px}
  </style><div id="root"></div><script src="renderer.js"></script>`
    )
  const electron = require('electron')
  const child = spawn(
    electron,
    [
      path.join(__dirname, 'cosmetic-overlay-probe.cjs'),
      session,
      html,
      scoreboard ? 'scoreboard' : 'badge'
    ],
    { stdio: 'inherit' }
  )
  child.once('exit', (code) => {
    fs.rmSync(temp, { recursive: true, force: true })
    process.exitCode = code ?? 1
  })
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
