// Development-only Electron offscreen renderer for the opt-in private session.
// React runs here; the cosmetic module reads bounded PNG frames and draws them
// through GoldSrc's own HUD callback. This process never touches game memory.
/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/explicit-function-return-type */
const { app, BrowserWindow } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const { readSnapshot } = require('./scoreboard-feed.cjs')

const session = process.argv[2]
const html = process.argv[3]
const scoreboard = process.argv[4] === 'scoreboard'
const width = scoreboard ? 736 : 360
const height = scoreboard ? 512 : 96
if (
  !session ||
  !html ||
  !path.isAbsolute(session) ||
  !path.isAbsolute(html) ||
  !fs.statSync(path.join(session, 'manifest.json'), { throwIfNoEntry: false })?.isFile()
) {
  throw new Error('Expected an absolute prepared cosmetic-probe session and local overlay page')
}

app.disableHardwareAcceleration()
app.whenReady().then(async () => {
  const window = new BrowserWindow({
    width,
    height,
    frame: false,
    transparent: true,
    show: false,
    webPreferences: {
      offscreen: true,
      ...(scoreboard ? { preload: path.join(__dirname, 'scoreboard-preload.cjs') } : {}),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false
    }
  })
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', (event) => event.preventDefault())
  window.webContents.on('did-fail-load', (_event, code, description) =>
    console.error('Overlay load:', code, description)
  )
  window.webContents.setFrameRate(4)
  let firstFrame = true
  window.webContents.on('paint', (_event, _dirty, image) => {
    const { width, height } = image.getSize()
    if (width !== (scoreboard ? 736 : 360) || height !== (scoreboard ? 512 : 96)) return
    const bytes = image.toPNG()
    if (bytes.length > 512 * 1024) return
    const temporary = path.join(session, 'overlay.png.tmp')
    const destination = path.join(session, 'overlay.png')
    try {
      fs.writeFileSync(temporary, bytes, { mode: 0o600 })
      fs.renameSync(temporary, destination)
      if (firstFrame) {
        console.log('React offscreen frame ready; enable the session overlay to display it.')
        firstFrame = false
      }
    } catch (error) {
      console.error('Overlay frame write failed:', error.message)
    }
  })
  await window.loadFile(html)
  window.webContents.startPainting()
  if (scoreboard) {
    const publish = () => {
      window.webContents.send('scoreboard-snapshot', readSnapshot(session))
      window.webContents.invalidate()
    }
    publish()
    setInterval(publish, 500)
  }
})
