import { app, BrowserWindow } from 'electron'
import { autoUpdater } from 'electron-updater'
import { type AppUpdateStatus, UPDATE_CHANNELS } from '../shared/updater'

let status: AppUpdateStatus = { state: 'idle' }

function setStatus(nextStatus: AppUpdateStatus): void {
  status = nextStatus
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(UPDATE_CHANNELS.status, status)
  }
}

export function getAppUpdateStatus(): AppUpdateStatus {
  return status
}

export function restartAndInstallUpdate(): void {
  if (status.state !== 'downloaded') throw new Error('No downloaded update is available.')
  autoUpdater.quitAndInstall()
}

/** Checks public GitHub Releases in packaged, self-updatable installations. */
export function checkForAppUpdates(): void {
  if (!app.isPackaged) return

  // electron-updater supports Linux self-updates only for AppImage packages.
  if (process.platform === 'linux' && !process.env.APPIMAGE) return

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.on('checking-for-update', () => setStatus({ state: 'checking' }))
  autoUpdater.on('update-available', (info) =>
    setStatus({ state: 'available', version: info.version })
  )
  autoUpdater.on('update-not-available', () => setStatus({ state: 'idle' }))
  autoUpdater.on('download-progress', (progress) => {
    setStatus({
      state: 'downloading',
      version: status.state === 'available' || status.state === 'downloading' ? status.version : '',
      percent: Math.round(progress.percent)
    })
  })
  autoUpdater.on('update-downloaded', (info) =>
    setStatus({ state: 'downloaded', version: info.version })
  )
  autoUpdater.on('error', (error) => {
    console.warn('Automatic update check failed:', error.message)
    setStatus({ state: 'error', message: 'Could not check for launcher updates.' })
  })
  autoUpdater.checkForUpdates().catch((error: unknown) => {
    console.warn(
      'Automatic update check failed:',
      error instanceof Error ? error.message : String(error)
    )
  })
}
