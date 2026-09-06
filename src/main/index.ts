import { app, shell, BrowserWindow, ipcMain, screen } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { authenticate, clearSessionToken, restoreSession } from './auth'
import { AUTH_CHANNELS } from '../shared/auth'
import { matchmakingConnection } from './matchmaking'
import {
  getMatchmakingNodes,
  getMatchmakingPreferences,
  saveMatchmakingPreferences
} from './matchmaking-regions'
import { MATCHMAKING_CHANNELS } from '../shared/matchmaking'
import { WINDOW_CHANNELS } from '../shared/window'
import { MODEL_CHANNELS } from '../shared/models'
import { readCounterStrikeModel } from './models'
import { readModelThumbnail, writeModelThumbnail } from './model-thumbnail-cache'
import { getMatchmakingMaps } from './matchmaking-maps'
import { getMatchHistory, getMatchSummary, getPlayerProfile } from './match-history'
import { MATCH_HISTORY_CHANNELS } from '../shared/match-history'
import { PARTY_CHANNELS } from '../shared/party'
import {
  getParty,
  getPartyInvitations,
  inviteToParty,
  leaveParty,
  respondToPartyInvitation
} from './party'
import { GAME_SETTINGS_CHANNELS } from '../shared/game-settings'
import { chooseCs16Executable, getGameSettings, saveGameSettings } from './game/game-settings'
import { SKIN_CHANNELS } from '../shared/skins'
import {
  equipSkin,
  getOwnedSkins,
  getSkinPreviewModel,
  listSkins,
  unequipSkin,
  unlockSkin
} from './skins'
import { checkForAppUpdates } from './updater'
import { getAppUpdateStatus, restartAndInstallUpdate } from './updater'
import { UPDATE_CHANNELS } from '../shared/updater'
import { getTopMmrLeaderboard } from './leaderboard'
import { LEADERBOARD_CHANNELS } from '../shared/leaderboard'
import { NEWS_CHANNELS } from '../shared/news'
import { getLobbyNewsPosts, getNewsPosts } from './news'
import { REDEEM_CODE_CHANNELS } from '../shared/redeem-codes'
import { redeemCode } from './redeem-codes'

const COUNTER_STRIKE_STEAM_STORE_URL = 'https://store.steampowered.com/app/10/CounterStrike/'

let mainWindow
let fullScreenRecoveryTimer: ReturnType<typeof setTimeout> | null = null
let isShuttingDown = false

function stopFullScreenRecovery(): void {
  isShuttingDown = true
  if (fullScreenRecoveryTimer) clearTimeout(fullScreenRecoveryTimer)
  fullScreenRecoveryTimer = null
}

function lockWindowFullScreen(): void {
  if (isShuttingDown || !mainWindow || mainWindow.isDestroyed() || mainWindow.isFullScreen()) return
  mainWindow.setFullScreen(true)
}

function scheduleFullScreenRecovery(): void {
  if (isShuttingDown || fullScreenRecoveryTimer) return
  fullScreenRecoveryTimer = setTimeout(() => {
    fullScreenRecoveryTimer = null
    lockWindowFullScreen()
  }, 0)
}

// A second shortcut launch is a separate Electron process. Acquire this lock
// before creating any windows so that process exits without showing anything.
if (!app.requestSingleInstanceLock()) {
  app.quit()
}

function createWindow(): void {
  isShuttingDown = false

  const displayBounds = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).bounds

  // Create the browser window.
  mainWindow = new BrowserWindow({
    x: displayBounds.x,
    y: displayBounds.y,
    width: displayBounds.width,
    height: displayBounds.height,
    frame: false,
    // Enter fullscreen after the display-sized window has been mapped. Some
    // Linux window managers otherwise keep Electron's initial content surface
    // at its fallback size and center it on a black fullscreen background.
    fullscreen: false,
    resizable: true,
    movable: false,
    maximizable: false,
    show: false,
    autoHideMenuBar: true,
    title: '1.6 Competitive',
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.setBounds(displayBounds)
    mainWindow.show()
    lockWindowFullScreen()
  })

  // Closing a fullscreen window can emit leave-full-screen. Do not force the
  // window back into fullscreen while Electron is quitting for an update.
  mainWindow.on('close', stopFullScreenRecovery)
  mainWindow.on('closed', () => {
    stopFullScreenRecovery()
    matchmakingConnection.disconnect()
  })
  mainWindow.on('leave-full-screen', scheduleFullScreenRecovery)

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  ipcMain.handle(AUTH_CHANNELS.login, (_, credentials: unknown) =>
    authenticate('login', credentials)
  )
  ipcMain.handle(AUTH_CHANNELS.register, (_, credentials: unknown) =>
    authenticate('register', credentials)
  )
  ipcMain.handle(AUTH_CHANNELS.restore, () => restoreSession())
  ipcMain.handle(AUTH_CHANNELS.logout, () => {
    matchmakingConnection.disconnect()
    clearSessionToken()
  })
  ipcMain.handle(MATCHMAKING_CHANNELS.connect, (event) =>
    matchmakingConnection.connect(event.sender)
  )
  ipcMain.handle(MATCHMAKING_CHANNELS.getNodes, () => getMatchmakingNodes())
  ipcMain.handle(MATCHMAKING_CHANNELS.getPreferences, () => getMatchmakingPreferences())
  ipcMain.handle(MATCHMAKING_CHANNELS.selectNode, (_, nodeId: unknown) => {
    if (nodeId !== null && (typeof nodeId !== 'string' || nodeId.length > 80)) {
      throw new Error('Invalid matchmaking region')
    }
    return saveMatchmakingPreferences({ selectedNodeId: nodeId })
  })
  ipcMain.handle(MATCHMAKING_CHANNELS.setAllowRegionExpansion, (_, value: unknown) => {
    if (typeof value !== 'boolean') throw new Error('Invalid regional search preference')
    return saveMatchmakingPreferences({ allowRegionExpansion: value })
  })
  ipcMain.handle(
    MATCHMAKING_CHANNELS.joinQueue,
    (_, mode: unknown, mapIds: unknown, allowRegionExpansion: unknown) =>
      matchmakingConnection.joinQueue(mode, mapIds, allowRegionExpansion)
  )
  ipcMain.handle(MATCHMAKING_CHANNELS.leaveQueue, () => matchmakingConnection.leaveQueue())
  ipcMain.handle(MATCHMAKING_CHANNELS.getQueueStatus, () => matchmakingConnection.getQueueStatus())
  ipcMain.handle(MATCHMAKING_CHANNELS.getMaps, () => getMatchmakingMaps())
  ipcMain.handle(MATCH_HISTORY_CHANNELS.get, () => getMatchHistory())
  ipcMain.handle(MATCH_HISTORY_CHANNELS.getSummary, (_, matchId: unknown) =>
    getMatchSummary(matchId)
  )
  ipcMain.handle(MATCH_HISTORY_CHANNELS.getPlayerProfile, (_, playerId: unknown) =>
    getPlayerProfile(playerId)
  )
  ipcMain.handle(SKIN_CHANNELS.list, (_, weaponKey: unknown) => listSkins(weaponKey))
  ipcMain.handle(SKIN_CHANNELS.mine, () => getOwnedSkins())
  ipcMain.handle(SKIN_CHANNELS.unlock, (_, skinId: unknown) => unlockSkin(skinId))
  ipcMain.handle(SKIN_CHANNELS.equip, (_, skinId: unknown) => equipSkin(skinId))
  ipcMain.handle(SKIN_CHANNELS.unequip, (_, skinId: unknown) => unequipSkin(skinId))
  ipcMain.handle(SKIN_CHANNELS.previewModel, (_, skinId: unknown) => getSkinPreviewModel(skinId))
  ipcMain.handle(MATCHMAKING_CHANNELS.respondReady, (_, matchId: unknown, accepted: unknown) =>
    matchmakingConnection.respondReady(matchId, accepted)
  )
  ipcMain.handle(MATCHMAKING_CHANNELS.reconnectGame, () => matchmakingConnection.reconnectGame())
  ipcMain.handle(MODEL_CHANNELS.read, (_, relativePath: unknown) =>
    readCounterStrikeModel(relativePath)
  )
  ipcMain.handle(MODEL_CHANNELS.readThumbnail, (_, cacheKey: unknown) =>
    readModelThumbnail(cacheKey)
  )
  ipcMain.handle(MODEL_CHANNELS.writeThumbnail, (_, cacheKey: unknown, png: unknown) =>
    writeModelThumbnail(cacheKey, png)
  )
  ipcMain.handle(PARTY_CHANNELS.get, () => getParty())
  ipcMain.handle(PARTY_CHANNELS.getInvitations, () => getPartyInvitations())
  ipcMain.handle(PARTY_CHANNELS.invite, (_, username: unknown) => inviteToParty(username))
  ipcMain.handle(PARTY_CHANNELS.respond, (_, invitationId: unknown, decision: unknown) =>
    respondToPartyInvitation(invitationId, decision)
  )
  ipcMain.handle(PARTY_CHANNELS.leave, () => leaveParty())
  ipcMain.handle(PARTY_CHANNELS.sendMessage, (_, message: unknown) =>
    matchmakingConnection.sendPartyMessage(message)
  )
  ipcMain.handle(PARTY_CHANNELS.sendGlobalMessage, (_, message: unknown) =>
    matchmakingConnection.sendGlobalMessage(message)
  )
  ipcMain.handle(WINDOW_CHANNELS.maximize, () => {
    lockWindowFullScreen()
  })
  ipcMain.handle(WINDOW_CHANNELS.openCounterStrikeSteamStore, () =>
    shell.openExternal(COUNTER_STRIKE_STEAM_STORE_URL)
  )
  ipcMain.handle(WINDOW_CHANNELS.exit, () => app.quit())
  ipcMain.handle(GAME_SETTINGS_CHANNELS.get, () => getGameSettings())
  ipcMain.handle(GAME_SETTINGS_CHANNELS.chooseExecutable, () => chooseCs16Executable())
  ipcMain.handle(GAME_SETTINGS_CHANNELS.save, (_, executablePath: unknown) =>
    saveGameSettings(executablePath)
  )
  ipcMain.handle(UPDATE_CHANNELS.getStatus, () => getAppUpdateStatus())
  ipcMain.handle(UPDATE_CHANNELS.restartAndInstall, () => restartAndInstallUpdate())
  ipcMain.handle(LEADERBOARD_CHANNELS.getTopMmr, () => getTopMmrLeaderboard())
  ipcMain.handle(NEWS_CHANNELS.getPreview, () => getLobbyNewsPosts())
  ipcMain.handle(NEWS_CHANNELS.getAll, () => getNewsPosts())
  ipcMain.handle(REDEEM_CODE_CHANNELS.redeem, (_, code: unknown) => redeemCode(code))

  createWindow()
  checkForAppUpdates()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', stopFullScreenRecovery)

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
