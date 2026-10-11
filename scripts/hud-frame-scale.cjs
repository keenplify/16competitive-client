/* eslint-disable @typescript-eslint/no-require-imports -- Electron main-process test uses CommonJS. */
// Run with Electron --force-device-scale-factor=1 (also test 1.25, 1.5 and 2).
const { app, BrowserWindow, nativeImage } = require('electron')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const os = require('node:os')
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), '16c-hud-scale-')))
const ts = require('typescript')

const source = fs.readFileSync(path.join(__dirname, '../src/main/game/hud-frame.ts'), 'utf8')
const exportsObject = {}
vm.runInNewContext(
  ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText,
  { exports: exportsObject }
)
const { encodeHudFrame } = exportsObject
app.on('window-all-closed', () => {})
const timeout = setTimeout(() => app.exit(2), 20000)
app
  .whenReady()
  .then(async () => {
    assert.equal(encodeHudFrame(nativeImage.createEmpty(), 1104, 720, 512 * 1024), null)
    for (const [width, height, limit] of [
      [1104, 720, 512 * 1024],
      [480, 280, 128 * 1024]
    ]) {
      await new Promise((resolve, reject) => {
        const window = new BrowserWindow({
          width,
          height,
          frame: false,
          transparent: true,
          show: false,
          webPreferences: { offscreen: true, backgroundThrottling: false }
        })
        let loaded = false
        let done = false
        window.webContents.on('paint', (_event, _dirty, image) => {
          if (!loaded || done || image.isEmpty()) return
          try {
            const png = encodeHudFrame(image, width, height, limit)
            if (!png) return
            done = true
            assert.ok(png)
            assert.equal(png.readUInt32BE(16), width)
            assert.equal(png.readUInt32BE(20), height)
            assert.equal(encodeHudFrame(image, width, height, 1), null)
            console.log(
              JSON.stringify({
                source: image.getSize(),
                output: [width, height],
                bytes: png.length
              })
            )
            window.destroy()
            resolve()
          } catch (error) {
            reject(error)
          }
        })
        window
          .loadURL(
            'data:text/html,<body style="background:purple;color:white">HUD scale regression</body>'
          )
          .then(() => {
            loaded = true
            window.webContents.invalidate()
          })
          .catch(reject)
      })
    }
    clearTimeout(timeout)
    app.exit(0)
  })
  .catch((error) => {
    console.error(error)
    app.exit(1)
  })
