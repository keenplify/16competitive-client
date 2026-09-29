// Development-only transparent, click-through window. No game DLL or memory access.
/* eslint-disable @typescript-eslint/no-require-imports */
const { app, BrowserWindow } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

const [html, rawX, rawY, rawWidth, rawHeight] = process.argv.slice(2)
const values = [rawX, rawY, rawWidth, rawHeight].map(Number)
const [x, y, width, height] = values
if (
  process.platform !== 'win32' ||
  !html ||
  !path.isAbsolute(html) ||
  !fs.statSync(html, { throwIfNoEntry: false })?.isFile() ||
  !values.every(Number.isSafeInteger) ||
  Math.abs(x) > 16384 ||
  Math.abs(y) > 16384 ||
  width < 360 ||
  width > 8192 ||
  height < 96 ||
  height > 8192
) {
  throw new Error('Expected local HTML and bounded game client-area x y width height')
}

app
  .whenReady()
  .then(async () => {
    const window = new BrowserWindow({
      x,
      y,
      width,
      height,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      resizable: false,
      focusable: false,
      skipTaskbar: true,
      hasShadow: false,
      show: false,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        backgroundThrottling: false
      }
    })
    window.setIgnoreMouseEvents(true, { forward: true })
    window.setAlwaysOnTop(true, 'floating')
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    window.webContents.on('will-navigate', (event) => event.preventDefault())
    window.webContents.on('did-fail-load', (_event, code, description) =>
      console.error('NextClient overlay load:', code, description)
    )
    await window.loadFile(html)
    window.showInactive()
    console.log('NextClient React overlay visible for 30 seconds')
    setTimeout(() => app.quit(), 30_000)
  })
  .catch((error) => {
    console.error('NextClient overlay failed:', error)
    app.exit(1)
  })
