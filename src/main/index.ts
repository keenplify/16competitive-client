import { listMusicKits, buyMusicKit, equipMusicKit, previewMusicKit } from './skins'
import { initializePartnerAppIdentity, type InstalledAppIdentity } from './partner-app-identity'
import { DEFAULT_APP_NAME, INSTALLED_APP_ID } from '../shared/partner-app-shortcuts'
import { QueueTrayController } from './queue-tray'
import { getMatchmakingActivity } from './matchmaking-regions'
import { COMMUNITY_DIRECTORY_CHANNELS } from '../shared/community-directory'
import {
  listCommunities,
  joinCommunity,
  leaveCommunity,
  updateCommunity,
  communityOwnerSettings,
  uploadCommunityServerImage
} from './community-directory'
import { release as osRelease } from 'node:os'
import { readInstalledWindowsMajorVersion } from './windows-version'
import {
  formatWindowsCompatibilityError,
  isSupportedOperatingSystem,
  isSupportedWindowsInstallation,
  windowsCompatibilityMessages
} from '../shared/windows-compatibility'
import { detectLanguage } from '../shared/language-detection'
import { COMMUNITY_MEMBERSHIP_CHANNELS } from '../shared/community-membership'
import {
  pendingCommunityTransfer,
  decideCommunityTransfer,
  linkCommunityServer
} from './community-membership'
import {
  listPartnerServers,
  connectPartnerServer,
  startPartnerGroup,
  pendingPartnerGroup,
  getPartnerGroup,
  respondPartnerGroup,
  markPartnerGroupLaunched,
  currentPartnerPresence
} from './partner-servers'
import {
  communityChatHistory,
  sendCommunityChat,
  communityMembers,
  kickCommunityMember
} from './community-chat'
import { PARTNER_SERVER_CHANNELS, COMMUNITY_CHAT_CHANNELS } from '../shared/partner-community'
import { getPartnerBranding } from './partner-branding'
import { PARTNER_BRANDING_CHANNEL, JOINED_BRANDING_CHANNEL } from '../shared/partner-branding'
import { recordAntiCheatFailure, flushAntiCheatFailureReports } from './anticheat/failure-reports'
import { parseDemoLink } from '../shared/demo-link'
import { isAuthReturnLink } from '../shared/auth-link'
import { serverClockNow } from '../shared/server-clock'
import { registerDemoProtocol } from './demo-protocol'
import { registerWebPlayProtocol } from './web-play-protocol'
import { parseWebHelperCheckLink, parseWebHelperLink } from '../shared/web-helper-link'
import { ADMIN_DEMO_CHANNELS } from '../shared/admin-demos'
import { listAdminDemos, watchAdminDemo } from './admin-demos'
import { app, dialog, shell, BrowserWindow, ipcMain, screen, type WebContents } from 'electron'
import { appendFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import {
  authenticate,
  acceptWebPlayHandoff,
  authenticateWithSocial,
  requestPasswordReset,
  completePasswordReset,
  completeSocialWithEmail,
  completeSocialWithPassword,
  changePassword,
  changeFlagCountryCode,
  getChatTranslation,
  setChatTranslation,
  changeUsername,
  checkUsername,
  clearSessionToken,
  connectSocial,
  getSessionToken,
  getSocialConnections,
  getDiscordNotifications,
  setDiscordNotifications,
  testDiscordNotifications,
  getReferralStatus,
  claimReferralCode,
  reopenSocialAuthorization,
  restoreSession
} from './auth'
import { reportClientTelemetry } from './client-telemetry'
import { AUTH_CHANNELS } from '../shared/auth'
import {
  activateIcafeBranch,
  getIcafeBranchInfo,
  linkIcafeBranch,
  unlinkIcafeBranch
} from './icafe-branch'
import { DAILY_QUEST_CHANNELS } from '../shared/daily-quests'
import { getDailyQuests } from './daily-quests'
import { matchmakingConnection } from './matchmaking'
import {
  getMatchmakingNodes,
  getOnlinePlayers,
  getMatchmakingPreferences,
  resolvePreferredMatchmakingApiUrl,
  saveMatchmakingPreferences,
  selectMatchmakingApiUrl
} from './matchmaking-regions'
import { MATCHMAKING_CHANNELS } from '../shared/matchmaking'
import { WINDOW_CHANNELS } from '../shared/window'
import { MODEL_CHANNELS } from '../shared/models'
import { readCounterStrikeModel } from './models'
import {
  clearCachedModelThumbnails,
  readModelThumbnail,
  writeModelThumbnail
} from './model-thumbnail-cache'
import { getMatchmakingMaps } from './matchmaking-maps'
import {
  getMatchHistory,
  getMatchSummary,
  getMatchSurvey,
  getPendingMatchSurvey,
  getPlayerProfile,
  submitMatchSurvey
} from './match-history'
import { MATCH_HISTORY_CHANNELS } from '../shared/match-history'
import { PARTY_CHANNELS } from '../shared/party'
import { FRIEND_CHANNELS } from '../shared/friends'
import {
  getParty,
  getPartyInvitations,
  inviteToParty,
  joinPartyWithDiscordSecret,
  leaveParty,
  respondToPartyInvitation
} from './party'
import {
  acceptFriendRequest,
  discardFriendRequest,
  getFriends,
  removeFriend,
  searchPlayers,
  sendFriendRequest
} from './friends'
import {
  GAME_SETTINGS_CHANNELS,
  type NextClientInstallProgress,
  type SkinAssetSyncMode,
  type SkinAssetSyncProgress
} from '../shared/game-settings'
import {
  chooseCs16Folder,
  getGameSettings,
  getSavedCs16Executable,
  saveGameSettings,
  saveVoicePttKey,
  saveCrosshair,
  saveNextClientIntegration,
  completeGameSetup,
  saveFastSwitch,
  savePlayerPingKey,
  saveKillCards,
  saveLightweightHud,
  saveGameDisplay
} from './game/game-settings'
import { removeStaleMatchUserConfigHandoff } from './game/match-userconfig-handoff'
import { registerLegacyGameIpc } from './game/legacy-game-ipc'
import { removeStaleMatchStartupBridge } from './game/match-startup-bridge'
import {
  cancelNextClientInstaller,
  detectNextClientFolder,
  launchNextClientInstaller
} from './game/nextclient-installer'
import { startSkinAssetSync } from './game/match-assets'
import { repairSkinAssets } from './game/skin-asset-maintenance'
import { clearCachedSkinPreviews } from './skin-preview-cache'
import { restoreStaleManagedSkinAudio } from './game/skin-audio-override'
import {
  closeCounterStrikeForMatch,
  shutdownManagedGame,
  updateActiveCrosshair,
  updateActiveKillCards
} from './game/cs16-launcher'
import { disableSteamScoreboardWrapper } from './game/steam-scoreboard-options'
import { SKIN_CHANNELS } from '../shared/skins'
import {
  getPayments,
  createPayment,
  refreshPayment,
  createManualPayment,
  submitManualPayment,
  cancelManualPayment
} from './skins'
import {
  equipSkin,
  getLobbyLoadout,
  setCharacter,
  getOwnedSkins,
  getSkinResaleQuote,
  getSkinPreviewModel,
  getSkinPreviewExplosionSprite,
  getPendingSkinGift,
  claimSkinGift,
  listSkins,
  setLobbyPlayerModel,
  setLobbyWeapon,
  setLobbyWeaponKey,
  sellSkin,
  unequipSkin,
  unlockSkin
} from './skins'
import {
  checkForAppUpdates,
  checkForPostGameUpdateAtLobby,
  ensureLatestClientForMatchmaking,
  getAppUpdateStatus,
  restartAndInstallUpdate
} from './updater'
import { UPDATE_CHANNELS } from '../shared/updater'
import {
  confirmRendererStartup,
  effectiveClientVersion,
  rollbackRendererStartup,
  selectRendererEntry
} from './renderer-updates'
import { getFeaturedRankedLadder, getTopMmrLeaderboard } from './leaderboard'
import { LEADERBOARD_CHANNELS } from '../shared/leaderboard'
import { NEWS_CHANNELS } from '../shared/news'
import { getLobbyNewsPosts, getNewsPosts, getNewsVisibility } from './news'
import { REDEEM_CODE_CHANNELS } from '../shared/redeem-codes'
import { CUSTOM_GAME_CHANNELS } from '../shared/custom-games'
import {
  addCustomGameBot,
  createCustomGame,
  getCustomGameChatHistory,
  getMyCustomGame,
  joinCustomGame,
  kickCustomGameMember,
  leaveCustomGame,
  listCustomGames,
  moveCustomGameMember,
  moveCustomGameServer,
  setCustomGameTeamCapacity,
  sendCustomGameChatMessage,
  startCustomGame,
  updateCustomGame
} from './custom-games'
import { redeemCode } from './redeem-codes'
import { DIAGNOSTIC_LOG_CHANNELS } from '../shared/diagnostic-logs'
import {
  getDiagnosticLogs,
  installDiagnosticLogCapture,
  reportDiagnosticIssue
} from './diagnostic-logs'
import { showAntiCheatStartupSplash } from './anticheat/startup-splash'
import { AntiCheatUpdateBanner } from './anticheat/update-banner'
import { OPERATION_CHANNELS } from '../shared/operations'
import { getActiveOperation, getMyOperation, markOperationViewed } from './operations'
import { discordPresence } from './discord-presence'
import { DISCORD_CLIENT_ID, REQUIRES_SIGNED_HELPER } from './config'
import { assertHelperForBackend } from './anticheat/helper-process'
import { HelperApprovalConnectionError } from './anticheat/helper-integrity'
import { HelperVerificationRetry } from './anticheat/helper-verification-retry'

const COUNTER_STRIKE_STEAM_STORE_URL = 'https://store.steampowered.com/app/10/CounterStrike/'

let mainWindow
let updateBanner: AntiCheatUpdateBanner | null = null
let focusWindowWhenReady = false
let skinAssetSyncProgress: SkinAssetSyncProgress = {
  status: 'idle',
  completedFiles: 0,
  totalFiles: 0
}

installDiagnosticLogCapture()

function registerDiscordApplicationProtocol(): void {
  if (!/^\d{17,20}$/.test(DISCORD_CLIENT_ID)) return
  const protocol = `discord-${DISCORD_CLIENT_ID}`

  try {
    const registered =
      process.platform === 'win32' && process.defaultApp && process.argv[1]
        ? app.setAsDefaultProtocolClient(protocol, process.execPath, [resolve(process.argv[1])])
        : app.setAsDefaultProtocolClient(protocol)
    if (!registered) {
      console.warn('[DiscordPresence] could not register Discord application protocol', protocol)
    }
  } catch (error) {
    console.warn(
      '[DiscordPresence] Discord application protocol registration failed',
      error instanceof Error ? error.message : String(error)
    )
  }
}

registerDiscordApplicationProtocol()

let lastAutomaticProcessReportAt = 0

const recordProcessFailure = (processType: string, reason: string, exitCode: number): void => {
  if (!app.isReady()) return
  const entry = JSON.stringify({
    at: new Date(serverClockNow()).toISOString(),
    version: app.getVersion(),
    processType,
    reason,
    exitCode
  })
  void appendFile(join(app.getPath('userData'), 'process-failures.jsonl'), `${entry}\n`, {
    mode: 0o600
  }).catch((error: unknown) =>
    console.error('[WindowDebug] Could not record process failure', error)
  )
  if (Date.now() - lastAutomaticProcessReportAt < 30_000) return
  lastAutomaticProcessReportAt = Date.now()
  void reportDiagnosticIssue(
    `Launcher ${processType} process stopped: ${reason} (exit code ${exitCode}).`,
    [],
    `launcher-${app.getVersion()}-${processType}-${reason}`
  ).catch((error: unknown) => console.warn('[WindowDebug] Could not report process failure', error))
}

app.on('child-process-gone', (_event, details) => {
  if (details.type === 'GPU' && details.reason !== 'clean-exit') {
    console.error('[WindowDebug] GPU process gone', details.reason, details.exitCode)
    recordProcessFailure('GPU', details.reason, details.exitCode)
  }
})

function installWindowDiagnostics(window: BrowserWindow): void {
  window.webContents.on('render-process-gone', (_event, details) => {
    if (details.reason === 'clean-exit') return
    console.error('[WindowDebug] Renderer process gone', details.reason, details.exitCode)
    recordProcessFailure('renderer', details.reason, details.exitCode)
  })
  const state = (): Record<string, unknown> => ({
    focused: window.isFocused(),
    visible: window.isVisible(),
    minimized: window.isMinimized(),
    fullScreen: window.isFullScreen(),
    alwaysOnTop: window.isAlwaysOnTop()
  })
  const logEvent = (event: string): void => console.info('[WindowDebug]', event, state())

  console.info('[WindowDebug]', 'environment', {
    platform: process.platform,
    sessionType: process.env.XDG_SESSION_TYPE ?? 'unknown',
    wayland: Boolean(process.env.WAYLAND_DISPLAY),
    x11: Boolean(process.env.DISPLAY),
    ozonePlatform: app.commandLine.getSwitchValue('ozone-platform') || 'default',
    electron: process.versions.electron,
    chrome: process.versions.chrome
  })

  window.on('focus', () => logEvent('focus'))
  window.on('blur', () => logEvent('blur'))
  window.on('show', () => logEvent('show'))
  window.on('hide', () => logEvent('hide'))
  window.on('minimize', () => logEvent('minimize'))
  window.on('restore', () => logEvent('restore'))
  window.on('maximize', () => logEvent('maximize'))
  window.on('unmaximize', () => logEvent('unmaximize'))
  window.on('enter-full-screen', () => logEvent('enter-full-screen'))
  window.on('leave-full-screen', () => logEvent('leave-full-screen'))

  window.webContents.on('before-input-event', (_, input) => {
    if (input.key !== 'Alt' && !(input.alt && input.key === 'Tab')) return
    console.info('[WindowDebug]', 'keyboard', {
      type: input.type,
      key: input.key,
      alt: input.alt,
      shift: input.shift,
      control: input.control,
      meta: input.meta,
      autoRepeat: input.isAutoRepeat,
      focused: window.isFocused(),
      fullScreen: window.isFullScreen()
    })
  })
}

function focusMainWindow(): void {
  const window =
    mainWindow && !mainWindow.isDestroyed() ? mainWindow : BrowserWindow.getAllWindows()[0]

  if (!window || window.isDestroyed()) {
    focusWindowWhenReady = true
    return
  }

  if (window.isMinimized()) window.restore()
  if (!window.isVisible()) window.show()
  app.focus({ steal: true })
  window.focus()
}

function disconnectMatchmakingIntentionally(leaveQueue = false): void {
  matchmakingConnection.shutdown(leaveQueue)
  discordPresence.reset()
}

function publishSkinAssetSyncProgress(sender: WebContents, progress: SkinAssetSyncProgress): void {
  skinAssetSyncProgress = progress
  if (!sender.isDestroyed()) sender.send(GAME_SETTINGS_CHANNELS.assetSyncProgress, progress)
}

async function runSkinAssetSync(sender: WebContents, mode: SkinAssetSyncMode): Promise<void> {
  const startedAt = performance.now()
  let stage = 'requested'
  let lastProgressAt = startedAt
  let warned = false
  const markStage = (next: string): void => {
    stage = next
    lastProgressAt = performance.now()
    warned = false
    console.info('[ResourceLoading] stage', {
      mode,
      stage,
      elapsedMs: Math.round(lastProgressAt - startedAt)
    })
  }
  markStage('requested')
  const stallTimer = setInterval(() => {
    if (warned || performance.now() - lastProgressAt < 30_000) return
    warned = true
    console.warn('[ResourceLoading] no progress for 30 seconds', {
      mode,
      stage,
      elapsedMs: Math.round(performance.now() - startedAt),
      status: skinAssetSyncProgress.status,
      completedFiles: skinAssetSyncProgress.completedFiles,
      totalFiles: skinAssetSyncProgress.totalFiles
    })
  }, 30_000)
  stallTimer.unref()
  publishSkinAssetSyncProgress(sender, {
    status: 'syncing',
    completedFiles: 0,
    totalFiles: 0,
    message: mode === 'repair' ? 'Repairing skin assets…' : 'Checking skin assets…'
  })

  try {
    if (mode === 'repair') {
      markStage('clearing-preview-cache')
      await Promise.all([clearCachedSkinPreviews(), clearCachedModelThumbnails()])
    }
    markStage('selecting-region')
    const apiUrl = await resolvePreferredMatchmakingApiUrl()
    console.info('[ResourceLoading] endpoint selected', { origin: new URL(apiUrl).origin })
    markStage('syncing-assets')
    const onProgress = (progress: SkinAssetSyncProgress): void => {
      lastProgressAt = performance.now()
      warned = false
      stage = `assets-${progress.status}`
      publishSkinAssetSyncProgress(sender, progress)
    }
    if (mode === 'repair') {
      await repairSkinAssets(apiUrl, onProgress)
    } else {
      await startSkinAssetSync(apiUrl, onProgress)
    }
    console.info('[ResourceLoading] finished', {
      mode,
      status: skinAssetSyncProgress.status,
      elapsedMs: Math.round(performance.now() - startedAt)
    })
  } catch (error) {
    console.warn('[ResourceLoading] failed', {
      mode,
      stage,
      elapsedMs: Math.round(performance.now() - startedAt),
      error: error instanceof Error ? error.name : 'UnknownError'
    })
    if (skinAssetSyncProgress.status !== 'error') {
      publishSkinAssetSyncProgress(sender, {
        status: 'error',
        completedFiles: skinAssetSyncProgress.completedFiles,
        totalFiles: skinAssetSyncProgress.totalFiles,
        message: error instanceof Error ? error.message : 'Could not sync skin assets.'
      })
    }
    throw error
  } finally {
    clearInterval(stallTimer)
  }
}

let pendingDemoId: string | null = null
let demoLinkRunning = false
async function processPendingDemo(): Promise<void> {
  if (!pendingDemoId || !getSessionToken() || !app.isReady() || demoLinkRunning) return
  const id = pendingDemoId
  pendingDemoId = null
  demoLinkRunning = true
  try {
    await watchAdminDemo(id)
  } catch (error) {
    await dialog.showMessageBox({
      type: 'error',
      title: 'Demo playback',
      message: error instanceof Error ? error.message : 'Could not open demo.'
    })
  } finally {
    demoLinkRunning = false
  }
}
function acceptDemoLink(value: string): void {
  const id = parseDemoLink(value)
  if (!id) return
  pendingDemoId = id
  if (app.isReady()) {
    focusMainWindow()
    if (!getSessionToken())
      void dialog.showMessageBox({
        type: 'info',
        title: 'Demo playback',
        message: 'Sign in with your administrator account to watch this demo.'
      })
    void processPendingDemo()
  }
}
let pendingWebPlayLink: string | null = null
let webPlayLinkRunning = false

async function processPendingWebPlayLink(): Promise<void> {
  if (!pendingWebPlayLink || !app.isReady() || !mainWindow || webPlayLinkRunning) return
  const value = pendingWebPlayLink
  pendingWebPlayLink = null
  webPlayLinkRunning = true
  try {
    const development = !app.isPackaged
    const check = parseWebHelperCheckLink(value, development)
    const joinLink = parseWebHelperLink(value, development)
    const link = check ?? joinLink
    if (!link) return
    const response = await fetch(`${link.apiOrigin}/auth/web-handoff/consume`, {
      method: 'POST',
      redirect: 'error',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        token: link.handoff,
        clientKind: 'electron',
        clientVersion: app.getVersion()
      }),
      signal: AbortSignal.timeout(10_000)
    })
    if (!response.ok) throw new Error('Web play handoff expired')
    const session: unknown = await response.json()
    if (check) return
    if (
      !joinLink ||
      typeof session !== 'object' ||
      session === null ||
      typeof (session as Record<string, unknown>).token !== 'string'
    )
      throw new Error('Invalid web play session')
    const token = (session as { token: string }).token
    const connection = await fetch(
      `${joinLink.apiOrigin}/matchmaking/matches/${joinLink.matchId}/helper-connection`,
      {
        headers: { authorization: `Bearer ${token}` },
        redirect: 'error',
        signal: AbortSignal.timeout(10_000)
      }
    )
    if (!connection.ok) throw new Error('Match connection is no longer available')
    const details: unknown = await connection.json()
    if (
      typeof details !== 'object' ||
      details === null ||
      (details as Record<string, unknown>).matchId !== joinLink.matchId ||
      !['cs13_3v3', '5v5', '3v3', 'unrated', 'legacy', 'legacy_3v3', 'ffa', 'arena'].includes(
        String((details as Record<string, unknown>).mode)
      )
    )
      throw new Error('Invalid match connection')
    await acceptWebPlayHandoff(session)
    matchmakingConnection.disconnect()
    matchmakingConnection.switchApiUrl(joinLink.apiOrigin)
    mainWindow.reload()
    focusMainWindow()
  } catch (error) {
    console.error('[WebPlay] handoff failed', error instanceof Error ? error.message : error)
  } finally {
    webPlayLinkRunning = false
    if (pendingWebPlayLink) void processPendingWebPlayLink()
  }
}

function acceptWebPlayLink(value: string): boolean {
  if (
    !parseWebHelperCheckLink(value, !app.isPackaged) &&
    !parseWebHelperLink(value, !app.isPackaged)
  )
    return false
  pendingWebPlayLink = value
  void processPendingWebPlayLink()
  return true
}
app.on('open-url', (event, url) => {
  event.preventDefault()
  acceptAppLink(url)
})
function acceptAppLink(value: string): void {
  if (isAuthReturnLink(value)) focusMainWindow()
  else if (acceptWebPlayLink(value)) return
  else acceptDemoLink(value)
}
for (const argument of process.argv) acceptAppLink(argument)

async function withAuthFocus<T>(authentication: Promise<T>): Promise<T> {
  try {
    return await authentication
  } finally {
    focusMainWindow()
  }
}

async function withClientTelemetry<T>(authentication: Promise<T>): Promise<T> {
  const result = await authentication
  const token = getSessionToken()
  if (token) {
    void reportClientTelemetry(token)
    void flushAntiCheatFailureReports()
    void processPendingDemo()
  }
  return result
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', (_event, argv) => {
    for (const argument of argv) acceptAppLink(argument)
    focusMainWindow()
  })
}

let installedAppIdentity: InstalledAppIdentity = { name: DEFAULT_APP_NAME, icon }
if (process.platform === 'linux') app.commandLine.appendSwitch('class', INSTALLED_APP_ID)
const queueTray = new QueueTrayController({
  icon,
  getQueuedMode: () => matchmakingConnection.getQueuedMode(),
  show: focusMainWindow,
  quit: () => {
    quitRequested = true
    app.quit()
  },
  locale: () => app.getLocale()
})
let quitRequested = false

let selectedRendererEntry: string | undefined
const packagedOutputPath = (...parts: string[]): string => join(app.getAppPath(), 'out', ...parts)

function createWindow(): void {
  const displayBounds = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).bounds

  mainWindow = new BrowserWindow({
    x: displayBounds.x,
    y: displayBounds.y,
    width: displayBounds.width,
    height: displayBounds.height,
    frame: false,
    fullscreen: false,
    resizable: true,
    movable: false,
    maximizable: false,
    show: false,
    autoHideMenuBar: true,
    title: installedAppIdentity.name,
    icon: installedAppIdentity.icon,
    webPreferences: {
      preload: packagedOutputPath('preload', 'index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })
  mainWindow.on('page-title-updated', (event) => {
    event.preventDefault()
    mainWindow?.setTitle(installedAppIdentity.name)
  })
  installWindowDiagnostics(mainWindow)

  mainWindow.on('ready-to-show', () => {
    mainWindow.setBounds(displayBounds)
    if (!updateBanner?.isPresenting()) mainWindow.show()
    else updateBanner.launcherReady()
    mainWindow.setFullScreen(true)
    if (focusWindowWhenReady) {
      focusWindowWhenReady = false
      focusMainWindow()
    }
  })

  mainWindow.on('close', (event) => {
    if (!quitRequested && queueTray.hideWhileQueued(mainWindow)) event.preventDefault()
  })

  mainWindow.on('closed', () => {
    disconnectMatchmakingIntentionally()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    const entry = selectedRendererEntry ?? packagedOutputPath('renderer', 'index.html')
    const startupTimer = setTimeout(() => {
      if (rollbackRendererStartup()) {
        app.relaunch()
        app.quit()
      }
    }, 45_000)
    mainWindow.once('closed', () => clearTimeout(startupTimer))
    mainWindow.webContents.on('did-fail-load', (_event, _code, _description, _url, isMainFrame) => {
      if (!isMainFrame) return
      clearTimeout(startupTimer)
      if (rollbackRendererStartup()) {
        app.relaunch()
        app.quit()
      }
    })
    mainWindow.loadFile(entry)
  }
}

app.whenReady().then(async () => {
  const detectedOsRelease = osRelease()
  const reportedOsSupported = isSupportedOperatingSystem(process.platform, detectedOsRelease)
  // Compatibility settings can make Node report 6.2 on Windows 10/11.
  const installedWindowsMajor =
    process.platform === 'win32' && !reportedOsSupported
      ? await readInstalledWindowsMajorVersion()
      : null
  if (!isSupportedWindowsInstallation(process.platform, detectedOsRelease, installedWindowsMajor)) {
    const language = detectLanguage(
      app.getPreferredSystemLanguages(),
      Object.keys(windowsCompatibilityMessages) as (keyof typeof windowsCompatibilityMessages)[],
      'en'
    )
    dialog.showErrorBox(
      '1.6 Competitive',
      formatWindowsCompatibilityError(language, detectedOsRelease, app.getVersion())
    )
    app.quit()
    return
  }
  if (!reportedOsSupported) {
    console.warn('[Startup] Windows process version differs from the installed OS version', {
      reportedRelease: detectedOsRelease,
      installedMajor: installedWindowsMajor
    })
  }

  await disableSteamScoreboardWrapper().catch((error: unknown) => {
    console.error('[Scoreboard] could not disable an earlier Steam launch wrapper', error)
  })
  void registerDemoProtocol().catch((error) => {
    console.warn(
      '[DemoPlayback] External demo links unavailable; in-app playback remains available:',
      error
    )
  })
  void registerWebPlayProtocol().catch((error) => {
    console.warn('[WebPlay] URL handler unavailable', error)
  })
  // Gate production/remote access before creating the renderer or restoring a session.
  try {
    await assertHelperForBackend()
  } catch (error) {
    console.error('[AntiCheat] startup helper verification failed', error)
    await recordAntiCheatFailure('app-verification', { error })
    if (error instanceof HelperApprovalConnectionError) {
      dialog.showErrorBox(
        'Internet connection needed',
        'Connect to the internet and restart the launcher to verify the anti-cheat helper.'
      )
    } else {
      dialog.showErrorBox(
        'Approved helper required',
        'The anti-cheat helper could not be verified. Repair or reinstall the launcher, then try again.'
      )
    }
    app.quit()
    return
  }
  selectedRendererEntry = selectRendererEntry(packagedOutputPath('renderer', 'index.html'))
  if (REQUIRES_SIGNED_HELPER) {
    let checkingHelper = false
    let shuttingDown = false
    const helperRetry = new HelperVerificationRetry()
    let nextHelperCheckAt = Date.now() + 60_000
    const helperGuard = setInterval(() => {
      if (checkingHelper || shuttingDown || Date.now() < nextHelperCheckAt) return
      checkingHelper = true
      void assertHelperForBackend()
        .then(() => {
          helperRetry.verified()
          nextHelperCheckAt = Date.now() + 60_000
        })
        .catch(async (error: unknown) => {
          if (shuttingDown) return
          // The launcher has already verified this helper. Recheck local bytes
          // on every retry, but do not exit for a brief approval-service outage.
          if (
            error instanceof HelperApprovalConnectionError &&
            helperRetry.retryConnectionFailure()
          ) {
            nextHelperCheckAt = Date.now() + 2_000
            console.warn('[AntiCheat] helper approval unavailable; retrying within bounded grace')
            return
          }
          shuttingDown = true
          await recordAntiCheatFailure('periodic-verification', { error })
          console.error('[AntiCheat] periodic helper verification failed', error)
          dialog.showErrorBox(
            error instanceof HelperApprovalConnectionError
              ? 'Internet connection needed'
              : 'Anti-cheat verification unavailable',
            error instanceof HelperApprovalConnectionError
              ? 'Connect to the internet and restart the launcher to verify the anti-cheat helper.'
              : 'The helper could not be verified. Restart or repair the launcher before reconnecting. This is not a cheating ban.'
          )
          app.quit()
        })
        .finally(() => {
          checkingHelper = false
        })
    }, 1_000)
    helperGuard.unref()
    app.once('before-quit', () => {
      shuttingDown = true
      clearInterval(helperGuard)
    })
  }

  const reportRetry = setInterval(() => {
    void flushAntiCheatFailureReports()
  }, 60_000)
  reportRetry.unref()
  app.once('before-quit', () => clearInterval(reportRetry))

  electronApp.setAppUserModelId(INSTALLED_APP_ID)
  try {
    const executable = await getSavedCs16Executable()
    if (executable && (await removeStaleMatchStartupBridge(join(dirname(executable), 'cstrike')))) {
      console.info('[GameLaunch] removed stale temporary startup bridge')
    }
    if (executable && (await removeStaleMatchUserConfigHandoff(dirname(executable)))) {
      console.info('[GameLaunch] removed stale match handoff from userconfig at startup')
    }
  } catch (error) {
    console.warn('[GameLaunch] could not remove stale match handoff at startup', error)
  }
  await restoreStaleManagedSkinAudio().catch((error: unknown) => {
    console.error('[SkinAudio] startup overlay cleanup failed', error)
  })

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  const startupSplashPromise = showAntiCheatStartupSplash().catch((error: unknown) => {
    console.warn(
      '[AntiCheat] startup splash could not be shown',
      error instanceof Error ? error.message : String(error)
    )
    return null
  })

  ipcMain.handle(ADMIN_DEMO_CHANNELS.list, (_, page: unknown) => listAdminDemos(page))
  ipcMain.handle(ADMIN_DEMO_CHANNELS.watch, (_, id: unknown) => watchAdminDemo(id))
  ipcMain.handle(AUTH_CHANNELS.login, (_, credentials: unknown) =>
    withClientTelemetry(authenticate('login', credentials))
  )
  ipcMain.handle(AUTH_CHANNELS.icafeBranchInfo, () => getIcafeBranchInfo())
  ipcMain.handle(AUTH_CHANNELS.icafeBranchLink, async (_, code: unknown) => {
    if (typeof code !== 'string' || !/^\d{6}$/.test(code)) throw new Error('ICAFE_INVALID_CODE')
    const status = await linkIcafeBranch(code)
    const token = getSessionToken()
    if (token) await activateIcafeBranch(token)
    return status
  })
  ipcMain.handle(AUTH_CHANNELS.icafeBranchUnlink, () => unlinkIcafeBranch(getSessionToken()))
  ipcMain.handle(DIAGNOSTIC_LOG_CHANNELS.get, () => getDiagnosticLogs())
  ipcMain.handle(
    DIAGNOSTIC_LOG_CHANNELS.report,
    (_, description: unknown, rendererLogs: unknown, matchId: unknown) => {
      if (
        typeof description !== 'string' ||
        description.trim().length < 1 ||
        description.length > 10_000
      )
        throw new Error('Issue description is invalid.')
      if (!Array.isArray(rendererLogs) || rendererLogs.some((log) => typeof log !== 'string'))
        throw new Error('Diagnostic logs are invalid.')
      if (
        matchId !== undefined &&
        (typeof matchId !== 'string' || !/^[0-9a-f-]{36}$/i.test(matchId))
      )
        throw new Error('Match ID is invalid.')
      return reportDiagnosticIssue(
        description.trim(),
        rendererLogs.slice(0, 2_000),
        undefined,
        matchId
      )
    }
  )
  ipcMain.handle(AUTH_CHANNELS.register, (_, credentials: unknown) =>
    withClientTelemetry(authenticate('register', credentials))
  )
  ipcMain.handle(AUTH_CHANNELS.passwordResetRequest, (_, identifier: unknown) =>
    requestPasswordReset(identifier)
  )
  ipcMain.handle(
    AUTH_CHANNELS.passwordResetComplete,
    (_, identifier: unknown, code: unknown, newPassword: unknown) =>
      completePasswordReset(identifier, code, newPassword)
  )
  ipcMain.handle(AUTH_CHANNELS.social, (_, provider: unknown) =>
    withClientTelemetry(withAuthFocus(authenticateWithSocial(provider)))
  )
  ipcMain.handle(AUTH_CHANNELS.socialReopen, (_, provider: unknown) =>
    reopenSocialAuthorization(provider)
  )
  ipcMain.handle(
    AUTH_CHANNELS.socialComplete,
    (_, provider: unknown, pollToken: unknown, email: unknown) =>
      withClientTelemetry(completeSocialWithEmail(provider, pollToken, email))
  )
  ipcMain.handle(AUTH_CHANNELS.socialPasswordComplete, (_, pollToken: unknown, password: unknown) =>
    withClientTelemetry(completeSocialWithPassword(pollToken, password))
  )
  ipcMain.handle(AUTH_CHANNELS.socialConnections, () => getSocialConnections())
  ipcMain.handle(AUTH_CHANNELS.discordNotificationsGet, () => getDiscordNotifications())
  ipcMain.handle(AUTH_CHANNELS.discordNotificationsSet, (_, enabled: unknown) =>
    setDiscordNotifications(enabled)
  )
  ipcMain.handle(AUTH_CHANNELS.discordNotificationsTest, () => testDiscordNotifications())
  ipcMain.handle(AUTH_CHANNELS.socialConnect, (_, provider: unknown) =>
    withAuthFocus(connectSocial(provider))
  )
  ipcMain.handle(AUTH_CHANNELS.usernameCheck, (_, username: unknown) => checkUsername(username))
  ipcMain.handle(AUTH_CHANNELS.usernameChange, (_, username: unknown) => changeUsername(username))
  ipcMain.handle(AUTH_CHANNELS.referralStatus, () => getReferralStatus())
  ipcMain.handle(AUTH_CHANNELS.referralClaim, (_, code: unknown) => claimReferralCode(code))
  ipcMain.handle(AUTH_CHANNELS.passwordChange, (_, credentials: unknown) =>
    changePassword(credentials)
  )
  ipcMain.handle(AUTH_CHANNELS.flagChange, (_, flagCountryCode: unknown) =>
    changeFlagCountryCode(flagCountryCode)
  )
  ipcMain.handle(AUTH_CHANNELS.chatTranslationGet, () => getChatTranslation())
  ipcMain.handle(AUTH_CHANNELS.chatTranslationSet, (_, language: unknown) =>
    setChatTranslation(language)
  )
  ipcMain.handle(AUTH_CHANNELS.restore, () => withClientTelemetry(restoreSession()))
  ipcMain.handle(AUTH_CHANNELS.logout, () => {
    disconnectMatchmakingIntentionally(true)
    clearSessionToken()
  })
  ipcMain.handle(DAILY_QUEST_CHANNELS.get, () => getDailyQuests())
  ipcMain.handle(MATCHMAKING_CHANNELS.connect, (event) =>
    matchmakingConnection.connect(event.sender)
  )
  ipcMain.handle(MATCHMAKING_CHANNELS.getNodes, () => getMatchmakingNodes())
  ipcMain.handle(MATCHMAKING_CHANNELS.getActivity, (_event, regions) =>
    getMatchmakingActivity(regions)
  )
  ipcMain.handle(MATCHMAKING_CHANNELS.getOnlinePlayers, () => getOnlinePlayers())
  ipcMain.handle(MATCHMAKING_CHANNELS.getPreferences, () => getMatchmakingPreferences())
  ipcMain.handle(MATCHMAKING_CHANNELS.selectNode, async (_, nodeId: unknown) => {
    if (nodeId !== null && (typeof nodeId !== 'string' || nodeId.length > 80)) {
      throw new Error('Invalid matchmaking region')
    }
    const nodes = await getMatchmakingNodes()
    const selected = nodes.find(
      (node) =>
        node.id === nodeId &&
        node.available &&
        typeof node.latencyMs === 'number' &&
        Number.isFinite(node.latencyMs) &&
        Math.round(node.latencyMs) < 300
    )
    const preferences = await saveMatchmakingPreferences({ selectedNodeId: selected?.id ?? null })
    const apiUrl = await selectMatchmakingApiUrl(nodes, preferences.selectedNodeId)
    if (apiUrl) matchmakingConnection.switchApiUrl(apiUrl)
    return preferences
  })
  ipcMain.handle(MATCHMAKING_CHANNELS.setAllowRegionExpansion, (_, value: unknown) => {
    if (typeof value !== 'boolean') throw new Error('Invalid regional search preference')
    return saveMatchmakingPreferences({ allowRegionExpansion: value })
  })
  ipcMain.handle(
    MATCHMAKING_CHANNELS.joinQueue,
    async (
      _,
      mode: unknown,
      mapIds: unknown,
      allowRegionExpansion: unknown,
      preferredRegion: unknown,
      eligibleRegions: unknown
    ) => {
      await ensureLatestClientForMatchmaking()
      return matchmakingConnection.joinQueue(
        mode,
        mapIds,
        allowRegionExpansion,
        preferredRegion,
        eligibleRegions
      )
    }
  )
  ipcMain.handle(MATCHMAKING_CHANNELS.playWithBots, () => matchmakingConnection.playWithBots())
  ipcMain.handle(MATCHMAKING_CHANNELS.joinWarmup, (_event, mode: unknown, mapIds: unknown) =>
    matchmakingConnection.joinWarmup(mode, mapIds)
  )
  ipcMain.handle(MATCHMAKING_CHANNELS.leaveWarmup, () => matchmakingConnection.leaveWarmup())
  ipcMain.handle(MATCHMAKING_CHANNELS.leaveFfa, (_event, matchId: unknown) =>
    matchmakingConnection.leaveFfa(matchId)
  )
  ipcMain.handle(MATCHMAKING_CHANNELS.leaveQueue, () => matchmakingConnection.leaveQueue())
  ipcMain.handle(MATCHMAKING_CHANNELS.getQueueStatus, () => matchmakingConnection.getQueueStatus())
  ipcMain.handle(MATCHMAKING_CHANNELS.getMaps, () => getMatchmakingMaps())
  ipcMain.handle(CUSTOM_GAME_CHANNELS.list, (_, selectedNodeId: unknown) =>
    listCustomGames(selectedNodeId)
  )
  ipcMain.handle(CUSTOM_GAME_CHANNELS.mine, (_, host: unknown) => getMyCustomGame(host))
  ipcMain.handle(CUSTOM_GAME_CHANNELS.chatHistory, (_, roomId: unknown, host: unknown) =>
    getCustomGameChatHistory(roomId, host)
  )
  ipcMain.handle(
    CUSTOM_GAME_CHANNELS.chatSend,
    (_, roomId: unknown, message: unknown, host: unknown) =>
      sendCustomGameChatMessage(roomId, message, host)
  )
  ipcMain.handle(CUSTOM_GAME_CHANNELS.create, (_, settings: unknown) => createCustomGame(settings))
  ipcMain.handle(
    CUSTOM_GAME_CHANNELS.update,
    (_, roomId: unknown, settings: unknown, host: unknown) =>
      updateCustomGame(roomId, settings, host)
  )
  ipcMain.handle(
    CUSTOM_GAME_CHANNELS.join,
    (_, roomId: unknown, password: unknown, host: unknown) => joinCustomGame(roomId, password, host)
  )
  ipcMain.handle(CUSTOM_GAME_CHANNELS.leave, async (_, roomId: unknown, host: unknown) => {
    const currentRoom = await getMyCustomGame(host)
    const result = await leaveCustomGame(roomId, host)
    if (currentRoom && currentRoom.id === roomId && currentRoom.matchId) {
      closeCounterStrikeForMatch(currentRoom.matchId)
    }
    return result
  })
  ipcMain.handle(CUSTOM_GAME_CHANNELS.start, (_, roomId: unknown, host: unknown) =>
    startCustomGame(roomId, host)
  )
  ipcMain.handle(CUSTOM_GAME_CHANNELS.addBot, (_, roomId: unknown, host: unknown) =>
    addCustomGameBot(roomId, host)
  )
  ipcMain.handle(
    CUSTOM_GAME_CHANNELS.setTeamCapacity,
    (_, roomId: unknown, team: unknown, capacity: unknown, host: unknown) =>
      setCustomGameTeamCapacity(roomId, team, capacity, host)
  )
  ipcMain.handle(
    CUSTOM_GAME_CHANNELS.moveMember,
    (_, roomId: unknown, playerId: unknown, team: unknown, host: unknown) =>
      moveCustomGameMember(roomId, playerId, team, host)
  )
  ipcMain.handle(
    CUSTOM_GAME_CHANNELS.moveServer,
    (_, roomId: unknown, targetNodeId: unknown, host: unknown) =>
      moveCustomGameServer(roomId, targetNodeId, host)
  )
  ipcMain.handle(
    CUSTOM_GAME_CHANNELS.kick,
    (_, roomId: unknown, playerId: unknown, host: unknown) =>
      kickCustomGameMember(roomId, playerId, host)
  )
  ipcMain.handle(MATCH_HISTORY_CHANNELS.get, () => getMatchHistory())
  ipcMain.handle(MATCH_HISTORY_CHANNELS.getSummary, (_, matchId: unknown) =>
    getMatchSummary(matchId)
  )
  ipcMain.handle(MATCH_HISTORY_CHANNELS.getPlayerProfile, (_, playerId: unknown) =>
    getPlayerProfile(playerId)
  )
  ipcMain.handle(MATCH_HISTORY_CHANNELS.getSurvey, (_, matchId: unknown) => getMatchSurvey(matchId))
  ipcMain.handle(MATCH_HISTORY_CHANNELS.getPendingSurvey, () => getPendingMatchSurvey())
  ipcMain.handle(
    MATCH_HISTORY_CHANNELS.submitSurvey,
    (_, matchId: unknown, funRating: unknown, fairnessRating: unknown, comment: unknown) =>
      submitMatchSurvey(matchId, funRating, fairnessRating, comment)
  )
  ipcMain.handle(COMMUNITY_DIRECTORY_CHANNELS.leave, (_, expected: unknown) =>
    leaveCommunity(expected)
  )
  ipcMain.handle(COMMUNITY_DIRECTORY_CHANNELS.list, (_, query: unknown) => listCommunities(query))
  ipcMain.handle(COMMUNITY_DIRECTORY_CHANNELS.join, (_, id: unknown, expected: unknown) =>
    joinCommunity(id, expected)
  )
  ipcMain.handle(COMMUNITY_DIRECTORY_CHANNELS.update, (_, input: unknown) => updateCommunity(input))
  ipcMain.handle(COMMUNITY_DIRECTORY_CHANNELS.ownerSettings, () => communityOwnerSettings())
  ipcMain.handle(COMMUNITY_DIRECTORY_CHANNELS.uploadServerImage, (_, id: unknown, bytes: unknown) =>
    uploadCommunityServerImage(id, bytes)
  )
  ipcMain.handle(COMMUNITY_MEMBERSHIP_CHANNELS.pending, () => pendingCommunityTransfer())
  ipcMain.handle(COMMUNITY_MEMBERSHIP_CHANNELS.decide, (_, id: unknown, accept: unknown) =>
    decideCommunityTransfer(id, accept)
  )
  ipcMain.handle(COMMUNITY_MEMBERSHIP_CHANNELS.link, (_, code: unknown) =>
    linkCommunityServer(code)
  )
  ipcMain.handle(PARTNER_BRANDING_CHANNEL, () => getPartnerBranding())
  ipcMain.handle(JOINED_BRANDING_CHANNEL, () =>
    getSessionToken() ? getPartnerBranding() : { branding: null }
  )
  ipcMain.handle(PARTNER_SERVER_CHANNELS.list, (_, communityId?: string) =>
    listPartnerServers(communityId)
  )
  ipcMain.handle(
    PARTNER_SERVER_CHANNELS.connect,
    (_, id: unknown, groupId: unknown, communityId?: string) =>
      connectPartnerServer(id, groupId, communityId)
  )
  ipcMain.handle(PARTNER_SERVER_CHANNELS.startGroup, (_, id: unknown) => startPartnerGroup(id))
  ipcMain.handle(PARTNER_SERVER_CHANNELS.pendingGroup, () => pendingPartnerGroup())
  ipcMain.handle(PARTNER_SERVER_CHANNELS.getGroup, (_, id: unknown) => getPartnerGroup(id))
  ipcMain.handle(PARTNER_SERVER_CHANNELS.respondGroup, (_, id: unknown, accepted: unknown) =>
    respondPartnerGroup(id, accepted)
  )
  ipcMain.handle(PARTNER_SERVER_CHANNELS.markLaunched, (_, id: unknown) =>
    markPartnerGroupLaunched(id)
  )
  ipcMain.handle(PARTNER_SERVER_CHANNELS.presence, () => currentPartnerPresence())
  ipcMain.handle(COMMUNITY_CHAT_CHANNELS.history, () => communityChatHistory())
  ipcMain.handle(COMMUNITY_CHAT_CHANNELS.members, (_, page: unknown, communityId: unknown) =>
    communityMembers(page, communityId)
  )
  ipcMain.handle(COMMUNITY_CHAT_CHANNELS.kickMember, (_, communityId: unknown, playerId: unknown) =>
    kickCommunityMember(communityId, playerId)
  )
  ipcMain.handle(COMMUNITY_CHAT_CHANNELS.send, (_, id: unknown, message: unknown) =>
    sendCommunityChat(id, message)
  )
  ipcMain.handle(SKIN_CHANNELS.musicKits, () => listMusicKits())
  ipcMain.handle(SKIN_CHANNELS.musicBuy, (_, id: unknown, price: unknown) => buyMusicKit(id, price))
  ipcMain.handle(SKIN_CHANNELS.musicEquip, (_, id: unknown, team: unknown) =>
    equipMusicKit(id, team)
  )
  ipcMain.handle(SKIN_CHANNELS.musicPreview, (_, id: unknown, event: unknown) =>
    previewMusicKit(id, event)
  )
  ipcMain.handle(SKIN_CHANNELS.list, (_, weaponKey: unknown) => listSkins(weaponKey))
  ipcMain.handle(SKIN_CHANNELS.payments, () => getPayments())
  ipcMain.handle(
    SKIN_CHANNELS.createManualPayment,
    (_, requestId: unknown, methodId: unknown, amount: unknown) =>
      createManualPayment(requestId, methodId, amount)
  )
  ipcMain.handle(
    SKIN_CHANNELS.submitManualPayment,
    (_, id: unknown, senderName: unknown, reference: unknown) =>
      submitManualPayment(id, senderName, reference)
  )
  ipcMain.handle(SKIN_CHANNELS.cancelManualPayment, (_, id: unknown) => cancelManualPayment(id))
  ipcMain.handle(SKIN_CHANNELS.createPayment, (_, requestId: unknown, amount: unknown) =>
    createPayment(requestId, amount)
  )
  ipcMain.handle(SKIN_CHANNELS.refreshPayment, (_, id: unknown) => refreshPayment(id))
  ipcMain.handle(SKIN_CHANNELS.mine, () => getOwnedSkins())
  ipcMain.handle(SKIN_CHANNELS.resaleQuote, (_, skinId: unknown) => getSkinResaleQuote(skinId))
  ipcMain.handle(SKIN_CHANNELS.sell, (_, skinId: unknown, quote: unknown) =>
    sellSkin(skinId, quote)
  )
  ipcMain.handle(SKIN_CHANNELS.setCharacter, (_, team: unknown, model: unknown) =>
    setCharacter(team, model)
  )
  ipcMain.handle(SKIN_CHANNELS.getLobbyLoadout, () => getLobbyLoadout())
  ipcMain.handle(SKIN_CHANNELS.unlock, (_, skinId: unknown, currency: unknown) =>
    unlockSkin(skinId, currency)
  )
  ipcMain.handle(SKIN_CHANNELS.equip, (_, skinId: unknown) => equipSkin(skinId))
  ipcMain.handle(SKIN_CHANNELS.unequip, (_, skinId: unknown) => unequipSkin(skinId))
  ipcMain.handle(SKIN_CHANNELS.previewModel, (_, skinId: unknown) => getSkinPreviewModel(skinId))
  ipcMain.handle(SKIN_CHANNELS.previewExplosionSprite, (_, skinId: unknown) =>
    getSkinPreviewExplosionSprite(skinId)
  )
  ipcMain.handle(SKIN_CHANNELS.setLobbyWeapon, (_, skinId: unknown) => setLobbyWeapon(skinId))
  ipcMain.handle(SKIN_CHANNELS.setLobbyWeaponKey, (_, weaponKey: unknown) =>
    setLobbyWeaponKey(weaponKey)
  )
  ipcMain.handle(SKIN_CHANNELS.setLobbyPlayerModel, (_, modelPath: unknown) =>
    setLobbyPlayerModel(modelPath)
  )
  ipcMain.handle(SKIN_CHANNELS.pendingGift, () => getPendingSkinGift())
  ipcMain.handle(SKIN_CHANNELS.claimGift, (_, giftId: unknown, skinId: unknown) =>
    claimSkinGift(giftId, skinId)
  )
  ipcMain.handle(MATCHMAKING_CHANNELS.respondReady, (_, matchId: unknown, accepted: unknown) =>
    matchmakingConnection.respondReady(matchId, accepted)
  )
  ipcMain.handle(MATCHMAKING_CHANNELS.reconnectGame, () => matchmakingConnection.reconnectGame())
  ipcMain.handle(MATCHMAKING_CHANNELS.copyConnection, (_, matchId: unknown) =>
    matchmakingConnection.copyConnection(matchId)
  )
  ipcMain.handle(
    MATCHMAKING_CHANNELS.reportPlayer,
    (_, matchId: unknown, targetPlayerId: unknown, reason: unknown, description: unknown) =>
      matchmakingConnection.reportPlayer(matchId, targetPlayerId, reason, description)
  )
  ipcMain.handle(MATCHMAKING_CHANNELS.voiceJoin, (_, context: unknown) =>
    matchmakingConnection.joinVoice(context)
  )
  ipcMain.handle(MATCHMAKING_CHANNELS.voiceLeave, () => matchmakingConnection.leaveVoice())
  ipcMain.handle(
    MATCHMAKING_CHANNELS.voiceSignal,
    (_, targetPlayerId: unknown, signalType: unknown, signal: unknown) =>
      matchmakingConnection.sendVoiceSignal(targetPlayerId, signalType, signal)
  )
  ipcMain.handle(MODEL_CHANNELS.read, (_, relativePath: unknown) =>
    readCounterStrikeModel(relativePath)
  )
  ipcMain.handle(MODEL_CHANNELS.readThumbnail, (_, cacheKey: unknown) =>
    readModelThumbnail(cacheKey)
  )
  ipcMain.handle(MODEL_CHANNELS.writeThumbnail, (_, cacheKey: unknown, png: unknown) =>
    writeModelThumbnail(cacheKey, png)
  )
  ipcMain.handle(FRIEND_CHANNELS.list, () => getFriends())
  ipcMain.handle(FRIEND_CHANNELS.search, (_, query: unknown) => searchPlayers(query))
  ipcMain.handle(FRIEND_CHANNELS.request, (_, playerId: unknown) => sendFriendRequest(playerId))
  ipcMain.handle(FRIEND_CHANNELS.accept, (_, requestId: unknown) => acceptFriendRequest(requestId))
  ipcMain.handle(FRIEND_CHANNELS.discard, (_, requestId: unknown) =>
    discardFriendRequest(requestId)
  )
  ipcMain.handle(FRIEND_CHANNELS.remove, (_, playerId: unknown) => removeFriend(playerId))
  ipcMain.handle(PARTY_CHANNELS.get, async () => {
    const party = await getParty()
    discordPresence.setParty(party)
    return party
  })
  ipcMain.handle(PARTY_CHANNELS.getInvitations, () => getPartyInvitations())
  ipcMain.handle(PARTY_CHANNELS.invite, (_, username: unknown) => inviteToParty(username))
  ipcMain.handle(PARTY_CHANNELS.respond, (_, invitationId: unknown, decision: unknown) =>
    respondToPartyInvitation(invitationId, decision)
  )
  ipcMain.handle(PARTY_CHANNELS.leave, () => leaveParty())
  ipcMain.handle(PARTY_CHANNELS.sendMessage, (_, message: unknown) =>
    matchmakingConnection.sendPartyMessage(message)
  )
  ipcMain.handle(PARTY_CHANNELS.sendGlobalMessage, (_, message: unknown, scope: unknown) =>
    matchmakingConnection.sendGlobalMessage(message, scope)
  )
  ipcMain.handle(PARTY_CHANNELS.setGlobalChatLanguage, (_, language: unknown) =>
    matchmakingConnection.setGlobalChatLanguage(language)
  )

  discordPresence.setJoinHandler(async (secret) => {
    try {
      const party = await joinPartyWithDiscordSecret(secret)
      discordPresence.setParty(party)
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(PARTY_CHANNELS.discordJoinResult, { ok: true, party })
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not join the Discord party.'
      console.warn('[DiscordPresence] party join failed', message)
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(PARTY_CHANNELS.discordJoinResult, { ok: false, message })
      }
    } finally {
      focusMainWindow()
    }
  })

  ipcMain.handle(WINDOW_CHANNELS.maximize, () => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.setFullScreen(true)
  })
  ipcMain.handle(WINDOW_CHANNELS.focus, () => {
    focusMainWindow()
  })
  ipcMain.handle(WINDOW_CHANNELS.openCounterStrikeSteamStore, () =>
    shell.openExternal(COUNTER_STRIKE_STEAM_STORE_URL)
  )
  ipcMain.handle(WINDOW_CHANNELS.exit, () => mainWindow?.close())
  ipcMain.handle(GAME_SETTINGS_CHANNELS.get, () => getGameSettings())
  ipcMain.handle(GAME_SETTINGS_CHANNELS.setDisplay, (_, preferences: unknown) =>
    saveGameDisplay(preferences)
  )
  registerLegacyGameIpc()
  ipcMain.handle(GAME_SETTINGS_CHANNELS.chooseFolder, () => chooseCs16Folder())
  ipcMain.handle(GAME_SETTINGS_CHANNELS.installNextClient, (event) =>
    launchNextClientInstaller((progress: NextClientInstallProgress) => {
      if (!event.sender.isDestroyed()) {
        event.sender.send(GAME_SETTINGS_CHANNELS.nextClientInstallProgress, progress)
      }
    })
  )
  ipcMain.handle(GAME_SETTINGS_CHANNELS.cancelNextClientInstall, () => cancelNextClientInstaller())
  ipcMain.handle(GAME_SETTINGS_CHANNELS.detectNextClient, () => detectNextClientFolder())
  ipcMain.handle(GAME_SETTINGS_CHANNELS.setVoicePttKey, (_, key: unknown) => saveVoicePttKey(key))
  ipcMain.handle(GAME_SETTINGS_CHANNELS.setCrosshair, async (_, profile: unknown) => {
    const settings = await saveCrosshair(profile)
    await updateActiveCrosshair(settings.crosshair)
    return settings
  })
  ipcMain.handle(GAME_SETTINGS_CHANNELS.setNextClientIntegration, (_, enabled: unknown) =>
    saveNextClientIntegration(enabled)
  )
  ipcMain.handle(GAME_SETTINGS_CHANNELS.completeSetup, (_, mode: unknown) =>
    completeGameSetup(mode)
  )
  ipcMain.handle(GAME_SETTINGS_CHANNELS.setPlayerPingKey, (_, key: unknown) =>
    savePlayerPingKey(key)
  )
  ipcMain.handle(GAME_SETTINGS_CHANNELS.setFastSwitch, (_, enabled: unknown) =>
    saveFastSwitch(enabled)
  )
  ipcMain.handle(GAME_SETTINGS_CHANNELS.setLightweightHud, (_, enabled: unknown) =>
    saveLightweightHud(enabled)
  )
  ipcMain.handle(GAME_SETTINGS_CHANNELS.setKillCards, async (_, enabled: unknown) => {
    const settings = await saveKillCards(enabled)
    await updateActiveKillCards(settings.killCardsEnabled)
    return settings
  })
  ipcMain.handle(GAME_SETTINGS_CHANNELS.getAssetSyncStatus, () => skinAssetSyncProgress)
  ipcMain.handle(GAME_SETTINGS_CHANNELS.syncAssets, (event, mode: unknown) => {
    if (mode !== 'download' && mode !== 'repair') throw new Error('Invalid asset sync mode.')
    return runSkinAssetSync(event.sender, mode)
  })
  ipcMain.handle(GAME_SETTINGS_CHANNELS.save, async (event, folderPath: unknown) => {
    const settings = await saveGameSettings(folderPath)
    void runSkinAssetSync(event.sender, 'download').catch((error: unknown) => {
      console.warn(
        '[GameSettings] skin asset sync retry failed',
        error instanceof Error ? error.message : String(error)
      )
    })
    return settings
  })
  ipcMain.handle(UPDATE_CHANNELS.getStatus, () => getAppUpdateStatus())
  ipcMain.handle(UPDATE_CHANNELS.checkAfterGameAtLobby, () => checkForPostGameUpdateAtLobby())
  ipcMain.handle(UPDATE_CHANNELS.getCurrentVersion, () => effectiveClientVersion())
  ipcMain.handle(UPDATE_CHANNELS.restartAndInstall, () => restartAndInstallUpdate())
  ipcMain.handle(UPDATE_CHANNELS.retry, () => checkForAppUpdates())
  ipcMain.handle(UPDATE_CHANNELS.openDownload, () =>
    shell.openExternal('https://github.com/keenplify/16competitive-client/releases/latest')
  )
  ipcMain.handle(UPDATE_CHANNELS.rendererReady, (event) => {
    if (
      event.sender === mainWindow?.webContents &&
      event.senderFrame === mainWindow.webContents.mainFrame
    )
      confirmRendererStartup()
  })
  ipcMain.handle(LEADERBOARD_CHANNELS.getTopMmr, (_, continentOf: unknown) => {
    if (
      continentOf !== undefined &&
      (typeof continentOf !== 'string' || !/^[A-Z]{2}$/.test(continentOf))
    ) {
      throw new Error('Invalid leaderboard country')
    }
    return getTopMmrLeaderboard(continentOf)
  })
  ipcMain.handle(LEADERBOARD_CHANNELS.getFeaturedLadder, () => getFeaturedRankedLadder())
  ipcMain.handle(NEWS_CHANNELS.getPreview, () => getLobbyNewsPosts())
  ipcMain.handle(NEWS_CHANNELS.getAll, () => getNewsPosts())
  ipcMain.handle(NEWS_CHANNELS.getVisibility, () => getNewsVisibility())
  ipcMain.handle(OPERATION_CHANNELS.getActive, () => getActiveOperation())
  ipcMain.handle(OPERATION_CHANNELS.getMine, () => getMyOperation())
  ipcMain.handle(OPERATION_CHANNELS.markViewed, (_, operationId: unknown, viewedPoints: unknown) =>
    markOperationViewed(operationId, viewedPoints)
  )
  ipcMain.handle(REDEEM_CODE_CHANNELS.redeem, (_, code: unknown) => redeemCode(code))

  const startupSplash = await startupSplashPromise
  updateBanner = new AntiCheatUpdateBanner(startupSplash, () => mainWindow)
  await Promise.all([
    updateBanner.checkBeforeStartup(),
    new Promise<void>((resolve) => setTimeout(resolve, 3_000))
  ])
  await initializePartnerAppIdentity(icon, (identity) => {
    installedAppIdentity = identity
    const userData = app.getPath('userData')
    app.setName(identity.name)
    app.setPath('userData', userData)
    queueTray.setIdentity(identity.name, identity.icon)
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.setTitle(identity.name)
      mainWindow.setIcon(identity.icon)
    }
  }).catch((error: unknown) =>
    console.warn('[PartnerIdentity] could not load installed branding', error)
  )
  createWindow()
  void processPendingDemo()
  void processPendingWebPlayLink()
  updateBanner.finishStartup()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

let cleaningOverlayBeforeQuit = false
app.on('before-quit', (event) => {
  quitRequested = true
  queueTray.destroy()
  disconnectMatchmakingIntentionally()
  discordPresence.stop()
  if (cleaningOverlayBeforeQuit) return

  cleaningOverlayBeforeQuit = true
  event.preventDefault()
  void shutdownManagedGame()
    .catch((error: unknown) => {
      console.error('[GameLaunch] managed game cleanup during launcher shutdown failed', error)
    })
    .finally(() => app.quit())
})
