import { BrowserWindow, screen } from 'electron'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import artworkPath from '../../../resources/papamo-guard/cs16-splash-v1.png?asset'
import emblemPath from '../../../resources/papamo-guard/emblem-v3.png?asset'
import { papamoGuardSplashHtml } from './startup-splash-view'

const SPLASH_WIDTH = 320
const SPLASH_HEIGHT = 480
const SPLASH_MARGIN = 24
const SPLASH_VISIBLE_MS = 3_000

const delay = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, milliseconds))

export async function showAntiCheatStartupSplash(): Promise<BrowserWindow> {
  const [artwork, emblem] = await Promise.all([readFile(artworkPath), readFile(emblemPath)])
  const html = papamoGuardSplashHtml({
    artwork: `data:image/png;base64,${artwork.toString('base64')}`,
    emblem: `data:image/png;base64,${emblem.toString('base64')}`
  })
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  const { x, y, width, height } = display.workArea
  const splash = new BrowserWindow({
    x: x + width - SPLASH_WIDTH - SPLASH_MARGIN,
    y: y + height - SPLASH_HEIGHT - SPLASH_MARGIN,
    width: SPLASH_WIDTH,
    height: SPLASH_HEIGHT,
    frame: false,
    roundedCorners: false,
    backgroundColor: '#080a09',
    title: 'Papamo Guard',
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: false,
    show: false,
    hasShadow: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  splash.setIgnoreMouseEvents(true)
  // Embedded artwork exceeds Chromium's URL limit. Load a local document instead.
  const temporaryDirectory = await mkdtemp(join(tmpdir(), 'papamo-guard-splash-'))
  try {
    const documentPath = join(temporaryDirectory, 'index.html')
    await writeFile(documentPath, html, { mode: 0o600 })
    await splash.loadFile(documentPath)
  } catch (error) {
    if (!splash.isDestroyed()) splash.destroy()
    throw error
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true }).catch((error: unknown) => {
      console.warn('[Papamo Guard] splash temporary file cleanup failed', error)
    })
  }
  if (!splash.isDestroyed()) splash.showInactive()
  await delay(SPLASH_VISIBLE_MS)
  return splash
}
