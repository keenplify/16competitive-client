export const UPDATE_CHANNELS = {
  getCurrentVersion: 'updater:get-current-version',
  getStatus: 'updater:get-status',
  checkAfterGameAtLobby: 'updater:check-after-game-at-lobby',
  restartAndInstall: 'updater:restart-and-install',
  status: 'updater:status'
} as const

export type AppUpdateStatus =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'available'; version: string }
  | { state: 'downloading'; version: string; percent: number }
  | { state: 'downloaded'; version: string }
  | { state: 'error'; message: string; requiredVersion?: string }

export interface UpdaterApi {
  getCurrentVersion(): Promise<string>
  getStatus(): Promise<AppUpdateStatus>
  checkAfterGameAtLobby(): Promise<void>
  restartAndInstall(): Promise<void>
  onStatus(listener: (status: AppUpdateStatus) => void): () => void
}
