// Build and show the external React badge over a windowed NextClient client area.
/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/explicit-function-return-type */
const esbuild = require('esbuild')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawn } = require('node:child_process')

async function main() {
  const bounds = process.argv.slice(2).map(Number)
  if (bounds.length !== 4 || !bounds.every(Number.isSafeInteger))
    throw new Error('Usage: npm run nextclient:overlay:probe -- <x> <y> <width> <height>')
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), '16c-nextclient-overlay-'))
  try {
    await esbuild.build({
      entryPoints: [path.join(__dirname, 'nextclient-overlay-probe.tsx')],
      bundle: true,
      jsx: 'automatic',
      platform: 'browser',
      format: 'iife',
      outfile: path.join(temp, 'renderer.js')
    })
    const html = path.join(temp, 'index.html')
    fs.writeFileSync(
      html,
      `<!doctype html><meta charset="utf-8"><style>
        html,body,#root{margin:0;width:100%;height:100%;background:transparent;overflow:hidden}
        *{box-sizing:border-box}.probe{position:absolute;top:24px;left:24px;display:flex;
          align-items:center;gap:16px;max-width:calc(100% - 48px);padding:13px 19px;
          border:3px solid #e8fbff;border-radius:14px;background:rgba(27,13,49,.92);
          box-shadow:0 8px 28px rgba(0,0,0,.45);color:#fff;font-family:Arial,sans-serif}
        .probe-mark{font-size:25px;font-weight:900;color:#98f9e5}
        strong,small{display:block}strong{font-size:16px;letter-spacing:.5px}
        small{font-size:11px;margin-top:5px;color:#cbbde3}
      </style><div id="root"></div><script src="renderer.js"></script>`
    )
    const child = spawn(
      require('electron'),
      [path.join(__dirname, 'nextclient-overlay-window.cjs'), html, ...bounds.map(String)],
      { stdio: 'inherit' }
    )
    child.once('exit', (code) => {
      fs.rmSync(temp, { recursive: true, force: true })
      process.exitCode = code ?? 1
    })
  } catch (error) {
    fs.rmSync(temp, { recursive: true, force: true })
    throw error
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
