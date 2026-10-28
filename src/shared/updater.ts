export const UPDATE_CHANNELS = {
  getCurrentVersion: 'updater:get-current-version',
  getStatus: 'updater:get-status',
  checkAfterGameAtLobby: 'updater:check-after-game-at-lobby',
  restartAndInstall: 'updater:restart-and-install',
  retry: 'updater:retry',
  openDownload: 'updater:open-download',
  rendererReady: 'updater:renderer-ready',
  status: 'updater:status'
} as const

export type AppUpdateStatus =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'available'; version: string }
  | {
      state: 'downloading'
      version: string
      percent: number
      downloadedBytes?: number
      totalBytes?: number | null
      bytesPerSecond?: number
    }
  | { state: 'downloaded'; version: string }
  | {
      state: 'error'
      message: string
      requiredVersion?: string
      failure?: 'install' | 'download' | 'check'
    }

export interface UpdaterApi {
  getCurrentVersion(): Promise<string>
  getStatus(): Promise<AppUpdateStatus>
  checkAfterGameAtLobby(): Promise<void>
  restartAndInstall(): Promise<void>
  retry(): Promise<void>
  openDownload(): Promise<void>
  rendererReady(): Promise<void>
  onStatus(listener: (status: AppUpdateStatus) => void): () => void
}

export function formatUpdateTransfer(
  status: Extract<AppUpdateStatus, { state: 'downloading' }>,
  language: string
): string {
  const downloadedBytes = status.downloadedBytes
  if (typeof downloadedBytes !== 'number' || !Number.isFinite(downloadedBytes) || downloadedBytes < 0)
    return ''
  const format = new Intl.NumberFormat(language, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1
  })
  const downloaded = format.format(downloadedBytes / 1_000_000)
  const totalBytes = status.totalBytes
  const total =
    typeof totalBytes === 'number' && Number.isFinite(totalBytes) && totalBytes > 0
      ? ` / ${format.format(totalBytes / 1_000_000)}`
      : ''
  const bytesPerSecond = status.bytesPerSecond
  const speed =
    typeof bytesPerSecond === 'number' && Number.isFinite(bytesPerSecond) && bytesPerSecond >= 0
      ? ` · ${format.format(bytesPerSecond / 1_000_000)} MB/s`
      : ''
  return `${downloaded}${total} MB${speed}`
}
