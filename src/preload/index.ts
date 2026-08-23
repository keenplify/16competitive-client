import { contextBridge, ipcRenderer } from 'electron'
import type { AuthApi } from '../shared/auth'
import { AUTH_CHANNELS } from '../shared/auth'
import type { MatchmakingApi, MatchmakingEvent } from '../shared/matchmaking'
import { MATCHMAKING_CHANNELS } from '../shared/matchmaking'
import type { WindowApi } from '../shared/window'
import { WINDOW_CHANNELS } from '../shared/window'

const auth: AuthApi = {
  login: (credentials) => ipcRenderer.invoke(AUTH_CHANNELS.login, credentials),
  register: (credentials) => ipcRenderer.invoke(AUTH_CHANNELS.register, credentials),
  logout: () => ipcRenderer.invoke(AUTH_CHANNELS.logout)
}

const matchmaking: MatchmakingApi = {
  connect: () => ipcRenderer.invoke(MATCHMAKING_CHANNELS.connect),
  joinQueue: (mode) => ipcRenderer.invoke(MATCHMAKING_CHANNELS.joinQueue, mode),
  leaveQueue: () => ipcRenderer.invoke(MATCHMAKING_CHANNELS.leaveQueue),
  getQueueStatus: () => ipcRenderer.invoke(MATCHMAKING_CHANNELS.getQueueStatus),
  onEvent: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, message: MatchmakingEvent): void =>
      listener(message)
    ipcRenderer.on(MATCHMAKING_CHANNELS.event, handler)
    return () => ipcRenderer.removeListener(MATCHMAKING_CHANNELS.event, handler)
  }
}

const windowApi: WindowApi = {
  maximize: () => ipcRenderer.invoke(WINDOW_CHANNELS.maximize)
}

const api = { auth, matchmaking, window: windowApi }

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-expect-error This branch is only used when context isolation is disabled.
  window.api = api
}
