export const UPDATE_CHANNELS = {
  getStatus: 'updater:get-status',
  restartAndInstall: 'updater:restart-and-install',
  status: 'updater:status'
} as const

export type AppUpdateStatus =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'available'; version: string }
  | { state: 'downloading'; version: string; percent: number }
  | { state: 'downloaded'; version: string }
  | { state: 'error'; message: string }

export interface UpdaterApi {
  getStatus(): Promise<AppUpdateStatus>
  restartAndInstall(): Promise<void>
  onStatus(listener: (status: AppUpdateStatus) => void): () => void
}
