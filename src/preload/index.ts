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
import type { GameSettingsApi, SkinAssetSyncProgress } from '../shared/game-settings'
import { GAME_SETTINGS_CHANNELS } from '../shared/game-settings'
import type { MatchHistoryApi } from '../shared/match-history'
import { MATCH_HISTORY_CHANNELS } from '../shared/match-history'
import type { SkinsApi } from '../shared/skins'
import { SKIN_CHANNELS } from '../shared/skins'
import type { UpdaterApi } from '../shared/updater'
import { UPDATE_CHANNELS } from '../shared/updater'
import type { LeaderboardApi } from '../shared/leaderboard'
import { LEADERBOARD_CHANNELS } from '../shared/leaderboard'
import type { NewsApi } from '../shared/news'
import { NEWS_CHANNELS } from '../shared/news'
import type { RedeemCodesApi } from '../shared/redeem-codes'
import { REDEEM_CODE_CHANNELS } from '../shared/redeem-codes'
import type { DiagnosticLogsApi } from '../shared/diagnostic-logs'
import { DIAGNOSTIC_LOG_CHANNELS } from '../shared/diagnostic-logs'

const auth: AuthApi = {
  login: (credentials) => ipcRenderer.invoke(AUTH_CHANNELS.login, credentials),
  register: (credentials) => ipcRenderer.invoke(AUTH_CHANNELS.register, credentials),
  social: (provider) => ipcRenderer.invoke(AUTH_CHANNELS.social, provider),
  completeSocial: (provider, pollToken, email) =>
    ipcRenderer.invoke(AUTH_CHANNELS.socialComplete, provider, pollToken, email),
  getSocialConnections: () => ipcRenderer.invoke(AUTH_CHANNELS.socialConnections),
  connectSocial: (provider) => ipcRenderer.invoke(AUTH_CHANNELS.socialConnect, provider),
  checkUsername: (username) => ipcRenderer.invoke(AUTH_CHANNELS.usernameCheck, username),
  changeUsername: (username) => ipcRenderer.invoke(AUTH_CHANNELS.usernameChange, username),
  changePassword: (credentials) => ipcRenderer.invoke(AUTH_CHANNELS.passwordChange, credentials),
  restore: () => ipcRenderer.invoke(AUTH_CHANNELS.restore),
  logout: () => ipcRenderer.invoke(AUTH_CHANNELS.logout)
}

const matchmaking: MatchmakingApi = {
  connect: () => ipcRenderer.invoke(MATCHMAKING_CHANNELS.connect),
  getNodes: () => ipcRenderer.invoke(MATCHMAKING_CHANNELS.getNodes),
  selectNode: (nodeId) => ipcRenderer.invoke(MATCHMAKING_CHANNELS.selectNode, nodeId),
  getPreferences: () => ipcRenderer.invoke(MATCHMAKING_CHANNELS.getPreferences),
  setAllowRegionExpansion: (value) =>
    ipcRenderer.invoke(MATCHMAKING_CHANNELS.setAllowRegionExpansion, value),
  joinQueue: (mode, mapIds, allowRegionExpansion, preferredRegion) =>
    ipcRenderer.invoke(
      MATCHMAKING_CHANNELS.joinQueue,
      mode,
      mapIds,
      allowRegionExpansion,
      preferredRegion
    ),
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
  maximize: () => ipcRenderer.invoke(WINDOW_CHANNELS.maximize),
  focus: () => ipcRenderer.invoke(WINDOW_CHANNELS.focus),
  openCounterStrikeSteamStore: () =>
    ipcRenderer.invoke(WINDOW_CHANNELS.openCounterStrikeSteamStore),
  exit: () => ipcRenderer.invoke(WINDOW_CHANNELS.exit)
}

const models: ModelApi = {
  read: (relativePath) => ipcRenderer.invoke(MODEL_CHANNELS.read, relativePath),
  readThumbnail: (cacheKey) => ipcRenderer.invoke(MODEL_CHANNELS.readThumbnail, cacheKey),
  writeThumbnail: (cacheKey, png) =>
    ipcRenderer.invoke(MODEL_CHANNELS.writeThumbnail, cacheKey, png)
}

const party: PartyApi = {
  get: () => ipcRenderer.invoke(PARTY_CHANNELS.get),
  getInvitations: () => ipcRenderer.invoke(PARTY_CHANNELS.getInvitations),
  invite: (username) => ipcRenderer.invoke(PARTY_CHANNELS.invite, username),
  respond: (invitationId, decision) =>
    ipcRenderer.invoke(PARTY_CHANNELS.respond, invitationId, decision),
  leave: () => ipcRenderer.invoke(PARTY_CHANNELS.leave),
  sendMessage: (message) => ipcRenderer.invoke(PARTY_CHANNELS.sendMessage, message),
  sendGlobalMessage: (message) => ipcRenderer.invoke(PARTY_CHANNELS.sendGlobalMessage, message)
}

const gameSettings: GameSettingsApi = {
  get: () => ipcRenderer.invoke(GAME_SETTINGS_CHANNELS.get),
  chooseExecutable: () => ipcRenderer.invoke(GAME_SETTINGS_CHANNELS.chooseExecutable),
  save: (executablePath) => ipcRenderer.invoke(GAME_SETTINGS_CHANNELS.save, executablePath),
  getAssetSyncStatus: () => ipcRenderer.invoke(GAME_SETTINGS_CHANNELS.getAssetSyncStatus),
  syncAssets: (mode) => ipcRenderer.invoke(GAME_SETTINGS_CHANNELS.syncAssets, mode),
  onAssetSyncProgress: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, progress: SkinAssetSyncProgress): void =>
      listener(progress)
    ipcRenderer.on(GAME_SETTINGS_CHANNELS.assetSyncProgress, handler)
    return () => ipcRenderer.removeListener(GAME_SETTINGS_CHANNELS.assetSyncProgress, handler)
  }
}

const matchHistory: MatchHistoryApi = {
  get: () => ipcRenderer.invoke(MATCH_HISTORY_CHANNELS.get),
  getSummary: (matchId) => ipcRenderer.invoke(MATCH_HISTORY_CHANNELS.getSummary, matchId),
  getPlayerProfile: (playerId) =>
    ipcRenderer.invoke(MATCH_HISTORY_CHANNELS.getPlayerProfile, playerId)
}

const skins: SkinsApi = {
  list: (weaponKey) => ipcRenderer.invoke(SKIN_CHANNELS.list, weaponKey),
  mine: () => ipcRenderer.invoke(SKIN_CHANNELS.mine),
  getLobbyLoadout: () => ipcRenderer.invoke(SKIN_CHANNELS.getLobbyLoadout),
  unlock: (skinId) => ipcRenderer.invoke(SKIN_CHANNELS.unlock, skinId),
  equip: (skinId) => ipcRenderer.invoke(SKIN_CHANNELS.equip, skinId),
  unequip: (skinId) => ipcRenderer.invoke(SKIN_CHANNELS.unequip, skinId),
  previewModel: (skinId) => ipcRenderer.invoke(SKIN_CHANNELS.previewModel, skinId),
  setLobbyWeapon: (skinId) => ipcRenderer.invoke(SKIN_CHANNELS.setLobbyWeapon, skinId),
  setLobbyWeaponKey: (weaponKey) => ipcRenderer.invoke(SKIN_CHANNELS.setLobbyWeaponKey, weaponKey),
  setLobbyPlayerModel: (modelPath) =>
    ipcRenderer.invoke(SKIN_CHANNELS.setLobbyPlayerModel, modelPath)
}

const updater: UpdaterApi = {
  getCurrentVersion: () => ipcRenderer.invoke(UPDATE_CHANNELS.getCurrentVersion),
  getStatus: () => ipcRenderer.invoke(UPDATE_CHANNELS.getStatus),
  restartAndInstall: () => ipcRenderer.invoke(UPDATE_CHANNELS.restartAndInstall),
  onStatus: (listener) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      status: Parameters<typeof listener>[0]
    ): void => listener(status)
    ipcRenderer.on(UPDATE_CHANNELS.status, handler)
    return () => ipcRenderer.removeListener(UPDATE_CHANNELS.status, handler)
  }
}

const leaderboard: LeaderboardApi = {
  getTopMmr: () => ipcRenderer.invoke(LEADERBOARD_CHANNELS.getTopMmr)
}

const news: NewsApi = {
  getPreview: () => ipcRenderer.invoke(NEWS_CHANNELS.getPreview),
  getAll: () => ipcRenderer.invoke(NEWS_CHANNELS.getAll)
}

const redeemCodes: RedeemCodesApi = {
  redeem: (code) => ipcRenderer.invoke(REDEEM_CODE_CHANNELS.redeem, code)
}

const diagnosticLogs: DiagnosticLogsApi = {
  get: () => ipcRenderer.invoke(DIAGNOSTIC_LOG_CHANNELS.get),
  report: (description, rendererLogs) =>
    ipcRenderer.invoke(DIAGNOSTIC_LOG_CHANNELS.report, description, rendererLogs)
}

const api = {
  auth,
  gameSettings,
  leaderboard,
  matchmaking,
  matchHistory,
  models,
  news,
  party,
  redeemCodes,
  skins,
  updater,
  window: windowApi,
  diagnosticLogs
}

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
