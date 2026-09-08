import { app, BrowserWindow } from 'electron'
import { autoUpdater } from 'electron-updater'
import { type AppUpdateStatus, UPDATE_CHANNELS } from '../shared/updater'

let status: AppUpdateStatus = { state: 'idle' }
let installStarted = false
let forcedExitTimer: ReturnType<typeof setTimeout> | null = null
let requiredUpdateVersion: string | null = null
let updaterInitialized = false
let updateCheckInFlight: Promise<void> | null = null

const INSTALL_QUIT_TIMEOUT_MS = 2_000
const MATCHMAKING_UPDATE_CHECK_TIMEOUT_MS = 15_000

function setStatus(nextStatus: AppUpdateStatus): void {
  status = nextStatus
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(UPDATE_CHANNELS.status, status)
  }
}

function supportsSelfUpdate(): boolean {
  if (!app.isPackaged) return false
  // electron-updater supports Linux self-updates only for AppImage packages.
  return process.platform !== 'linux' || Boolean(process.env.APPIMAGE)
}

function requiredUpdateError(): Error {
  const version =
    requiredUpdateVersion ??
    (status.state === 'available' || status.state === 'downloading' || status.state === 'downloaded'
      ? status.version
      : null)
  return new Error(
    version
      ? `Launcher update v${version} is required before matchmaking. Please let the update finish and restart the client.`
      : 'A launcher update is required before matchmaking. Please let the update finish and restart the client.'
  )
}

function hasPendingUpdate(): boolean {
  const currentStatus = status
  return (
    requiredUpdateVersion !== null ||
    currentStatus.state === 'available' ||
    currentStatus.state === 'downloading' ||
    currentStatus.state === 'downloaded'
  )
}

function initializeUpdater(): void {
  if (updaterInitialized || !supportsSelfUpdate()) return
  updaterInitialized = true

  app.once('will-quit', () => {
    if (forcedExitTimer) clearTimeout(forcedExitTimer)
    forcedExitTimer = null
  })

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = false
  autoUpdater.on('checking-for-update', () => setStatus({ state: 'checking' }))
  autoUpdater.on('update-available', (info) => {
    requiredUpdateVersion = info.version
    setStatus({ state: 'available', version: info.version })
  })
  autoUpdater.on('update-not-available', () => {
    requiredUpdateVersion = null
    setStatus({ state: 'idle' })
  })
  autoUpdater.on('download-progress', (progress) => {
    setStatus({
      state: 'downloading',
      version:
        status.state === 'available' || status.state === 'downloading'
          ? status.version
          : requiredUpdateVersion ?? '',
      percent: Math.round(progress.percent)
    })
  })
  autoUpdater.on('update-downloaded', (info) => {
    requiredUpdateVersion = info.version
    setStatus({ state: 'downloaded', version: info.version })
    forceRestartAndInstall()
  })
  autoUpdater.on('error', (error) => {
    if (forcedExitTimer) clearTimeout(forcedExitTimer)
    forcedExitTimer = null
    installStarted = false
    console.warn('Automatic update failed:', error.message)
    setStatus({
      state: 'error',
      message: requiredUpdateVersion
        ? 'The required launcher update could not be installed.'
        : 'Could not check for launcher updates.',
      ...(requiredUpdateVersion ? { requiredVersion: requiredUpdateVersion } : {})
    })
  })
}

async function runUpdateCheck(): Promise<void> {
  if (!supportsSelfUpdate()) return
  initializeUpdater()
  if (updateCheckInFlight) return updateCheckInFlight

  const check = autoUpdater
    .checkForUpdates()
    .then(() => {
      // electron-updater normally emits update-not-available first, but keep
      // the state deterministic if a provider resolves without an event.
      if (status.state === 'checking') setStatus({ state: 'idle' })
    })
    .catch((error: unknown) => {
      if (status.state !== 'error') {
        console.warn(
          'Automatic update check failed:',
          error instanceof Error ? error.message : String(error)
        )
        setStatus({ state: 'error', message: 'Could not check for launcher updates.' })
      }
      throw error
    })
    .finally(() => {
      if (updateCheckInFlight === check) updateCheckInFlight = null
    })

  updateCheckInFlight = check
  return check
}

export function getAppUpdateStatus(): AppUpdateStatus {
  return status
}

export function restartAndInstallUpdate(): void {
  if (status.state !== 'downloaded') throw new Error('No downloaded update is available.')
  if (installStarted) return

  installStarted = true
  // The platform installer waits for this process to exit. If a window or
  // third-party listener ever prevents the graceful quit, do not leave the
  // launcher visibly stuck with the installer waiting behind it.
  forcedExitTimer = setTimeout(() => app.exit(0), INSTALL_QUIT_TIMEOUT_MS)
  autoUpdater.quitAndInstall()
}

function forceRestartAndInstall(): void {
  // Give the renderer a moment to display the blocking restart state before
  // handing control to the platform updater.
  setTimeout(restartAndInstallUpdate, 500)
}

/** Checks public GitHub Releases in packaged, self-updatable installations. */
export function checkForAppUpdates(): void {
  if (!supportsSelfUpdate()) return
  initializeUpdater()
  void runUpdateCheck().catch(() => undefined)
}

/**
 * Performs a fresh update check before a player is allowed to enter matchmaking.
 * Development builds and Linux packages that electron-updater cannot self-update
 * are intentionally exempt so local development and deb/snap installs still work.
 */
export async function ensureLatestClientForMatchmaking(): Promise<void> {
  if (!supportsSelfUpdate()) return
  initializeUpdater()

  if (hasPendingUpdate()) {
    throw requiredUpdateError()
  }

  let timeout: ReturnType<typeof setTimeout> | null = null
  try {
    await Promise.race([
      runUpdateCheck(),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error('Launcher update check timed out.')),
          MATCHMAKING_UPDATE_CHECK_TIMEOUT_MS
        )
      })
    ])
  } catch {
    if (hasPendingUpdate()) {
      throw requiredUpdateError()
    }
    throw new Error(
      'Could not verify that this launcher is up to date. Check your connection and try matchmaking again.'
    )
  } finally {
    if (timeout) clearTimeout(timeout)
  }

  if (hasPendingUpdate()) {
    throw requiredUpdateError()
  }
  if (status.state === 'error') {
    throw new Error(
      'Could not verify that this launcher is up to date. Check your connection and try matchmaking again.'
    )
  }
}
