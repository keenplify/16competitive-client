import { BrowserWindow, screen } from 'electron'
import type { GameResolution } from '../../shared/game-display'

/** Electron display sizes use DIP; GoldSrc launch dimensions use physical pixels. */
export function currentGameDisplayResolution(): GameResolution {
  const window =
    BrowserWindow.getFocusedWindow() ??
    BrowserWindow.getAllWindows().find(
      (candidate) => !candidate.isDestroyed() && candidate.isVisible()
    )
  const display = window
    ? screen.getDisplayMatching(window.getBounds())
    : screen.getPrimaryDisplay()
  return {
    width: Math.round(display.size.width * display.scaleFactor),
    height: Math.round(display.size.height * display.scaleFactor)
  }
}
