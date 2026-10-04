/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/explicit-function-return-type */
const esbuild = require('esbuild')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawn } = require('node:child_process')

async function main() {
  const root = path.resolve(__dirname, '..')
  const mode = ['scoreboard', 'ally-tags'].includes(process.argv[2]) ? process.argv[2] : 'badge'
  const scoreboard = mode === 'scoreboard'
  const allyTags = mode === 'ally-tags'
  const session = process.argv[mode === 'badge' ? 2 : 3]
  if (!session || !path.isAbsolute(session)) {
    throw new Error('Expected an absolute prepared cosmetic-probe session path')
  }
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'papamo-overlay-'))
  const script = path.join(temp, 'renderer.js')
  const html = path.join(temp, 'index.html')
  await esbuild.build({
    entryPoints: [
      path.join(
        __dirname,
        scoreboard
          ? 'scoreboard-probe.tsx'
          : allyTags
            ? 'ally-tags-probe.tsx'
            : 'cosmetic-overlay-probe.tsx'
      )
    ],
    bundle: true,
    jsx: 'automatic',
    platform: 'browser',
    format: 'iife',
    outfile: script
  })
  if (scoreboard) {
    fs.copyFileSync(path.join(__dirname, 'scoreboard-probe.css'), path.join(temp, 'scoreboard.css'))
    fs.copyFileSync(
      path.join(root, 'src', 'renderer', 'public', 'favicon.svg'),
      path.join(temp, 'favicon.svg')
    )
    const fontSource = path.join(
      path.dirname(require.resolve('@fontsource/rajdhani/package.json')),
      'files'
    )
    const fontOutput = path.join(temp, 'fonts')
    fs.mkdirSync(fontOutput, { recursive: true })
    for (const weight of [400, 500, 600, 700]) {
      const filename = `rajdhani-latin-${weight}-normal.woff2`
      fs.copyFileSync(path.join(fontSource, filename), path.join(fontOutput, filename))
    }
    fs.writeFileSync(
      html,
      '<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="scoreboard.css"><div id="root"></div><script src="renderer.js"></script>'
    )
  } else if (allyTags) {
    fs.copyFileSync(path.join(__dirname, 'ally-tags-probe.css'), path.join(temp, 'ally-tags.css'))
    fs.cpSync(
      path.join(root, 'resources', 'weapon-category-icons', 'gamebanana'),
      path.join(temp, 'weapon-icons'),
      { recursive: true }
    )
    fs.writeFileSync(
      html,
      '<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="ally-tags.css"><div id="root"></div><script src="renderer.js"></script>'
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
    [path.join(__dirname, 'cosmetic-overlay-probe.cjs'), session, html, mode],
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
