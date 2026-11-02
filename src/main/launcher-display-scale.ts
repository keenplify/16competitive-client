import type { BrowserWindow, Screen } from 'electron'

/** Keep the existing launcher design at its 100% display-scale dimensions. */
export function launcherZoomFactor(displayScaleFactor: number): number {
  if (!Number.isFinite(displayScaleFactor) || displayScaleFactor <= 0) return 1
  return 1 / displayScaleFactor
}

/** Native page zoom covers dialogs/portals as well as the main renderer. */
export function installLauncherDisplayScale(window: BrowserWindow, displays: Screen): void {
  // BrowserWindow.webContents itself throws once the native window is destroyed.
  const contents = window.webContents
  const update = (): void => {
    if (window.isDestroyed() || contents.isDestroyed()) return
    const display = displays.getDisplayMatching(window.getBounds())
    const zoom = launcherZoomFactor(display.scaleFactor)
    if (Math.abs(contents.getZoomFactor() - zoom) > 0.0001) {
      contents.setZoomFactor(zoom)
    }
  }

  update()
  window.on('move', update)
  window.on('resize', update)
  contents.on('did-finish-load', update)
  displays.on('display-metrics-changed', update)
  displays.on('display-removed', update)
  window.once('closed', () => {
    window.removeListener('move', update)
    window.removeListener('resize', update)
    contents.removeListener('did-finish-load', update)
    displays.removeListener('display-metrics-changed', update)
    displays.removeListener('display-removed', update)
  })
}
