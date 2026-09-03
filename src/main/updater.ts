import { app } from 'electron'
import { autoUpdater } from 'electron-updater'

/** Checks public GitHub Releases in packaged, self-updatable installations. */
export function checkForAppUpdates(): void {
  if (!app.isPackaged) return

  // electron-updater supports Linux self-updates only for AppImage packages.
  if (process.platform === 'linux' && !process.env.APPIMAGE) return

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.on('error', (error) => {
    console.warn('Automatic update check failed:', error.message)
  })
  autoUpdater.checkForUpdates().catch((error: unknown) => {
    console.warn(
      'Automatic update check failed:',
      error instanceof Error ? error.message : String(error)
    )
  })
}
