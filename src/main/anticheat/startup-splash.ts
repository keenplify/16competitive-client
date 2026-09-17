import { BrowserWindow, screen } from 'electron'

const SPLASH_WIDTH = 420
const SPLASH_HEIGHT = 112
const SPLASH_MARGIN = 24
const SPLASH_VISIBLE_MS = 3_000

const splashHtml = (): string => `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      * { box-sizing: border-box; }
      html, body {
        width: 100%;
        height: 100%;
        margin: 0;
        overflow: hidden;
        background: transparent;
        font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        user-select: none;
      }
      body {
        display: flex;
        align-items: stretch;
        justify-content: stretch;
        padding: 1px;
      }
      .banner {
        position: relative;
        display: flex;
        width: 100%;
        height: 100%;
        align-items: center;
        gap: 14px;
        overflow: hidden;
        border: 1px solid rgba(255, 255, 255, 0.13);
        border-radius: 10px;
        background: rgba(10, 10, 12, 0.96);
        box-shadow: 0 18px 48px rgba(0, 0, 0, 0.42);
        padding: 18px 20px;
        color: #f7f7f8;
      }
      .icon {
        display: grid;
        width: 48px;
        height: 48px;
        flex: 0 0 48px;
        place-items: center;
        border-radius: 9px;
        border: 1px solid rgba(255, 255, 255, 0.12);
        background: rgba(255, 255, 255, 0.055);
      }
      svg { width: 27px; height: 27px; }
      .copy { min-width: 0; }
      .title {
        font-size: 14px;
        font-weight: 750;
        letter-spacing: 0.035em;
        white-space: nowrap;
      }
      .status {
        margin-top: 5px;
        font-size: 12px;
        color: rgba(255, 255, 255, 0.58);
        letter-spacing: 0.02em;
      }
      .bar {
        position: absolute;
        left: 0;
        bottom: 0;
        height: 2px;
        width: 100%;
        transform-origin: left center;
        background: rgba(255, 255, 255, 0.72);
        animation: countdown 3s linear forwards;
      }
      @keyframes countdown {
        from { transform: scaleX(1); opacity: 0.8; }
        to { transform: scaleX(0); opacity: 0.35; }
      }
    </style>
  </head>
  <body>
    <div class="banner">
      <div class="icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round">
          <path d="M20 13c0 5-3.5 7.5-8 9-4.5-1.5-8-4-8-9V5l8-3 8 3v8Z" />
          <path d="m9 12 2 2 4-4" />
        </svg>
      </div>
      <div class="copy">
        <div class="title">1.6 Competitive Anti-Cheat</div>
        <div class="status">Integrity checks active</div>
      </div>
      <div class="bar"></div>
    </div>
  </body>
</html>`

const delay = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, milliseconds))

export async function showAntiCheatStartupSplash(): Promise<BrowserWindow> {
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  const { x, y, width, height } = display.workArea
  const splash = new BrowserWindow({
    x: x + width - SPLASH_WIDTH - SPLASH_MARGIN,
    y: y + height - SPLASH_HEIGHT - SPLASH_MARGIN,
    width: SPLASH_WIDTH,
    height: SPLASH_HEIGHT,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: false,
    show: false,
    hasShadow: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  splash.setIgnoreMouseEvents(true)
  await splash.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(splashHtml())}`)
  if (!splash.isDestroyed()) splash.showInactive()
  await delay(SPLASH_VISIBLE_MS)
  return splash
}
