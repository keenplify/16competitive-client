import { contextBridge, ipcRenderer } from 'electron'
import type { AuthApi } from '../shared/auth'
import { AUTH_CHANNELS } from '../shared/auth'
import type { MatchmakingApi, MatchmakingEvent } from '../shared/matchmaking'
import { MATCHMAKING_CHANNELS } from '../shared/matchmaking'
import type { WindowApi } from '../shared/window'
import { WINDOW_CHANNELS } from '../shared/window'
import type { ModelApi } from '../shared/models'
import { MODEL_CHANNELS } from '../shared/models'
import type { PartyApi } from '../shared/party'
import { PARTY_CHANNELS } from '../shared/party'
import type { GameSettingsApi } from '../shared/game-settings'
import { GAME_SETTINGS_CHANNELS } from '../shared/game-settings'
import type { MatchHistoryApi } from '../shared/match-history'
import { MATCH_HISTORY_CHANNELS } from '../shared/match-history'

const auth: AuthApi = {
  login: (credentials) => ipcRenderer.invoke(AUTH_CHANNELS.login, credentials),
  register: (credentials) => ipcRenderer.invoke(AUTH_CHANNELS.register, credentials),
  restore: () => ipcRenderer.invoke(AUTH_CHANNELS.restore),
  logout: () => ipcRenderer.invoke(AUTH_CHANNELS.logout)
}

const matchmaking: MatchmakingApi = {
  connect: () => ipcRenderer.invoke(MATCHMAKING_CHANNELS.connect),
  joinQueue: (mode, mapId) => ipcRenderer.invoke(MATCHMAKING_CHANNELS.joinQueue, mode, mapId),
  leaveQueue: () => ipcRenderer.invoke(MATCHMAKING_CHANNELS.leaveQueue),
  getQueueStatus: () => ipcRenderer.invoke(MATCHMAKING_CHANNELS.getQueueStatus),
  getMaps: () => ipcRenderer.invoke(MATCHMAKING_CHANNELS.getMaps),
  respondReady: (matchId, accepted) =>
    ipcRenderer.invoke(MATCHMAKING_CHANNELS.respondReady, matchId, accepted),
  reconnectGame: () => ipcRenderer.invoke(MATCHMAKING_CHANNELS.reconnectGame),
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

const models: ModelApi = {
  read: (relativePath) => ipcRenderer.invoke(MODEL_CHANNELS.read, relativePath)
}

const party: PartyApi = {
  get: () => ipcRenderer.invoke(PARTY_CHANNELS.get),
  getInvitations: () => ipcRenderer.invoke(PARTY_CHANNELS.getInvitations),
  invite: (username) => ipcRenderer.invoke(PARTY_CHANNELS.invite, username),
  respond: (invitationId, decision) =>
    ipcRenderer.invoke(PARTY_CHANNELS.respond, invitationId, decision),
  leave: () => ipcRenderer.invoke(PARTY_CHANNELS.leave),
  sendMessage: (message) => ipcRenderer.invoke(PARTY_CHANNELS.sendMessage, message)
}

const gameSettings: GameSettingsApi = {
  get: () => ipcRenderer.invoke(GAME_SETTINGS_CHANNELS.get),
  chooseExecutable: () => ipcRenderer.invoke(GAME_SETTINGS_CHANNELS.chooseExecutable),
  save: (executablePath) => ipcRenderer.invoke(GAME_SETTINGS_CHANNELS.save, executablePath)
}

const matchHistory: MatchHistoryApi = {
  get: () => ipcRenderer.invoke(MATCH_HISTORY_CHANNELS.get),
  getSummary: (matchId) => ipcRenderer.invoke(MATCH_HISTORY_CHANNELS.getSummary, matchId),
  getPlayerProfile: (playerId) =>
    ipcRenderer.invoke(MATCH_HISTORY_CHANNELS.getPlayerProfile, playerId)
}

const api = { auth, gameSettings, matchmaking, matchHistory, models, party, window: windowApi }

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
