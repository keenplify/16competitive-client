import { app } from 'electron'
import { readFile, mkdir } from 'node:fs/promises'
import { join, isAbsolute } from 'node:path'
import { createConnection } from 'node:net'
import { setNativeHelperApiUrl, LOCAL_DEVELOPMENT } from './config'
import { acceptNativeHelperSession, getSessionPlayerId, getSessionToken } from './auth'
import { API_BASE_URL } from './config'
import { requestHelperDevice } from './anticheat/helper-process'
import { parseDeviceStatus } from './anticheat/hardware-fingerprint'
import {
  getGameSettings,
  saveGameSettings,
  saveNextClientIntegration,
  saveFastSwitch,
  saveVoicePttKey,
  savePlayerPingKey,
  saveLightweightHud,
  saveKillCards,
  saveGameDisplay
} from './game/game-settings'
import {
  launchCounterStrikeForMatch,
  shutdownManagedGame,
  updateActiveCrosshair,
  updateActiveKillCards,
  getActiveScoreboardDirectory
} from './game/cs16-launcher'
import { startMatchAssetPreload, startSkinAssetSync } from './game/match-assets'
import { repairSkinAssets } from './game/skin-asset-maintenance'
import { writeLiveSessionFile } from './game/live-session-file'
import { configureNativeHelperSharedAssets } from './game/shared-skin-storage'
import {
  detectNextClientFolder,
  launchNextClientInstaller,
  cancelNextClientInstaller
} from './game/nextclient-installer'

// stdout is a bounded machine protocol. Tokens and connection credentials never
// enter argv, a log file, or persisted account storage.
console.log = console.info = console.warn = console.error = (): void => undefined
const index = process.argv.indexOf('--native-helper-runtime')
const dataRoot = process.argv[index + 1]
const port = Number(process.argv[index + 2])
const capability = process.argv[index + 3]
if (!dataRoot || !isAbsolute(dataRoot)) throw new Error('Invalid helper data root')
if (
  !Number.isInteger(port) ||
  port < 1024 ||
  port > 65535 ||
  !/^[a-f0-9]{64}$/.test(capability ?? '')
)
  throw new Error('Invalid runtime control channel')
const channel = createConnection({ host: '127.0.0.1', port })
const emit = (value: unknown): void => {
  channel.write(JSON.stringify(value) + '\n')
}
channel.once('connect', () => emit({ protocol: 1, capability }))
channel.on('error', () => {
  void stop(1)
})
channel.on('close', () => {
  if (!stopping) void stop(1)
})
configureNativeHelperSharedAssets(app.getPath('userData'))
app.setPath('userData', join(dataRoot, 'runtime-data'))
app.setPath('sessionData', join(dataRoot, 'runtime-data', 'chromium'))
app.on('window-all-closed', () => {
  /* Offscreen windows are owned by the game session. */
})
let stopping = false
let revokeOnExit = false
const startedAt = Date.now()
let poll: NodeJS.Timeout | undefined
let voiceHeartbeat: NodeJS.Timeout | undefined
let voiceWrites: Promise<void> = Promise.resolve()
let voiceState = { matchId: '', team: false, party: false }
function publishVoice(): void {
  const data = JSON.stringify(voiceState)
  voiceWrites = voiceWrites
    .catch(() => undefined)
    .then(() => writeLiveSessionFile(join(dataRoot, 'voice-ptt.json'), data))
}
async function stop(code = 0): Promise<void> {
  if (stopping) return
  stopping = true
  clearInterval(poll)
  clearInterval(voiceHeartbeat)
  voiceState = { ...voiceState, team: false, party: false }
  publishVoice()
  await voiceWrites.catch(() => undefined)
  try {
    await shutdownManagedGame()
  } catch {
    code = 1
  }
  if (revokeOnExit && getSessionToken()) {
    await fetch(`${API_BASE_URL}/auth/logout`, {
      method: 'POST',
      headers: { authorization: `Bearer ${getSessionToken()}` },
      redirect: 'error',
      signal: AbortSignal.timeout(3000)
    })
      .then((response) => response.body?.cancel())
      .catch(() => undefined)
  }
  const timeout = setTimeout(() => app.exit(code), 2000)
  channel.end(() => {
    clearTimeout(timeout)
    app.exit(code)
  })
}
app.on('before-quit', (event) => {
  event.preventDefault()
  void stop()
})
process.on('SIGTERM', () => {
  void stop()
})
process.on('SIGINT', () => {
  void stop()
})

let lastPreferences = ''
let stage = 'control'
async function syncPreferences(initial = false): Promise<void> {
  const bytes = await readFile(join(dataRoot, 'web-helper.json'))
  if (bytes.length > 16384) throw new Error('Invalid helper preferences')
  const raw = bytes.toString('utf8')
  if (raw === lastPreferences) return
  const prefs = JSON.parse(raw) as {
    cs16?: unknown
    settings: {
      enhancementsEnabled: unknown
      fastSwitchEnabled: unknown
      playerPingKey: unknown
      lightweightHud: unknown
      killCardsEnabled: unknown
      display: unknown
      voicePttKeys?: unknown[]
    }
  }
  if (typeof prefs.cs16 !== 'string' || !isAbsolute(prefs.cs16))
    throw new Error('Choose a Counter-Strike folder first')
  if (initial) await saveGameSettings(prefs.cs16)
  const s = prefs.settings
  const appliedPath = join(app.getPath('userData'), 'helper-preferences.json')
  const applied = await readFile(appliedPath, 'utf8')
    .then((raw) => JSON.parse(raw) as { enhancementsEnabled?: unknown })
    .catch(() => null)
  const previous = await getGameSettings()
  if (
    !previous.nextClientIntegrationDisabledReason ||
    applied?.enhancementsEnabled !== s.enhancementsEnabled
  )
    await saveNextClientIntegration(s.enhancementsEnabled)
  await saveFastSwitch(s.fastSwitchEnabled)
  await savePlayerPingKey(s.playerPingKey)
  await saveLightweightHud(s.lightweightHud)
  await saveKillCards(s.killCardsEnabled)
  await saveGameDisplay(s.display)
  if (Array.isArray(s.voicePttKeys) && s.voicePttKeys.length === 2) {
    await saveVoicePttKey(s.voicePttKeys[0])
    await saveVoicePttKey(`party:${s.voicePttKeys[1]}`)
  }
  // Account restoration uses the existing parser and sync, including account
  // switching. A previous player's local profile cannot replace this account.
  const settings = await getGameSettings(true)
  await updateActiveCrosshair(settings.crosshair)
  await updateActiveKillCards(settings.killCardsEnabled)
  await writeLiveSessionFile(
    appliedPath,
    JSON.stringify({ enhancementsEnabled: s.enhancementsEnabled })
  )
  lastPreferences = raw
}

async function run(input: unknown): Promise<void> {
  if (!input || typeof input !== 'object') throw new Error('Invalid runtime request')
  const request = input as Record<string, unknown>
  if (
    request.protocol !== 1 ||
    typeof request.apiOrigin !== 'string' ||
    ![
      'check',
      'detectNextClient',
      'installNextClient',
      'syncAssets',
      'repairAssets',
      'launch'
    ].includes(String(request.action)) ||
    Object.keys(request).some(
      (key) => !['protocol', 'action', 'apiOrigin', 'token', 'matchId'].includes(key)
    )
  )
    throw new Error('Invalid runtime protocol')
  setNativeHelperApiUrl(request.apiOrigin)
  stage = 'startup'
  await app.whenReady()
  await mkdir(app.getPath('userData'), { recursive: true, mode: 0o700 })
  if (request.action === 'detectNextClient') {
    emit({ ok: true, folder: await detectNextClientFolder() })
    return
  }
  if (request.action === 'installNextClient') {
    const path = join(dataRoot, 'nextclient-progress.json')
    const cancel = setInterval(() => {
      void readFile(join(dataRoot, 'nextclient.cancel'))
        .then(() => cancelNextClientInstaller())
        .catch(() => undefined)
    }, 250)
    let writes: Promise<void> = Promise.resolve()
    try {
      await launchNextClientInstaller((progress) => {
        writes = writes.then(() =>
          writeLiveSessionFile(path, JSON.stringify({ status: 'installing', progress }))
        )
      })
      await writes
      await writeLiveSessionFile(path, JSON.stringify({ status: 'ready' }))
      emit({ ok: true })
    } catch {
      await writes.catch(() => undefined)
      await writeLiveSessionFile(path, JSON.stringify({ status: 'error' }))
      throw new Error('NextClient setup failed')
    } finally {
      clearInterval(cancel)
    }
    return
  }
  const device = parseDeviceStatus(
    await requestHelperDevice({
      apiUrl: request.apiOrigin,
      allowInsecureLocal: LOCAL_DEVELOPMENT
    })
  )
  if (request.action === 'check') {
    let installationReady = false
    try {
      await syncPreferences(true)
      installationReady = true
    } catch {
      /* Folder selection remains available. */
    }
    emit({ ok: true, protocol: 1, device, competitiveReady: !device.banned && installationReady })
    return
  }
  if (device.banned) throw new Error('This device cannot join competitive matches')
  if (request.action === 'syncAssets' || request.action === 'repairAssets') {
    await acceptNativeHelperSession(request.token)
    await syncPreferences(true)
    let progressWrites: Promise<void> = Promise.resolve()
    const progress = (value: unknown): void => {
      progressWrites = progressWrites.then(() =>
        writeLiveSessionFile(join(dataRoot, 'asset-progress.json'), JSON.stringify(value))
      )
    }
    try {
      if (request.action === 'repairAssets') await repairSkinAssets(request.apiOrigin, progress)
      else await startSkinAssetSync(request.apiOrigin, progress)
      await progressWrites
      emit({ ok: true })
    } catch {
      await progressWrites.catch(() => undefined)
      await writeLiveSessionFile(
        join(dataRoot, 'asset-progress.json'),
        JSON.stringify({ status: 'error', completedFiles: 0, totalFiles: 0 })
      )
      throw new Error('Asset sync failed')
    }
    return
  }
  if (
    request.action !== 'launch' ||
    typeof request.matchId !== 'string' ||
    !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(request.matchId)
  )
    throw new Error('Invalid match request')
  await acceptNativeHelperSession(request.token)
  revokeOnExit = true
  stage = 'preferences'
  await syncPreferences(true)
  stage = 'connection'
  const response = await fetch(
    `${request.apiOrigin}/matchmaking/matches/${request.matchId}/helper-connection`,
    {
      headers: { authorization: `Bearer ${request.token}` },
      redirect: 'error',
      signal: AbortSignal.timeout(10_000)
    }
  )
  const connection: unknown = await response.json()
  if (!response.ok || !connection || typeof connection !== 'object')
    throw new Error('Match connection is no longer available')
  const c = connection as Record<string, unknown>
  if (
    c.matchId !== request.matchId ||
    !['5v5', '3v3', 'unrated', 'legacy', 'legacy_3v3', 'ffa', 'arena'].includes(String(c.mode)) ||
    typeof c.host !== 'string' ||
    typeof c.port !== 'number' ||
    typeof c.password !== 'string' ||
    typeof c.joinToken !== 'string'
  )
    throw new Error('Invalid match connection')
  stage = 'assets'
  await startMatchAssetPreload(request.matchId, request.apiOrigin)
  stage = 'game'
  voiceState.matchId = request.matchId
  voiceHeartbeat = setInterval(publishVoice, 500)
  await launchCounterStrikeForMatch({
    matchId: request.matchId,
    host: c.host,
    port: c.port,
    password: c.password,
    joinToken: c.joinToken,
    apiUrl: request.apiOrigin,
    onVoicePtt: (active, kind) => {
      voiceState = { ...voiceState, [kind]: active }
      publishVoice()
    },
    onExit: () => {
      void stop()
    }
  })
  emit({ ok: true, event: 'launched', sessionDirectory: getActiveScoreboardDirectory() })
  let refreshing = false
  let nextMatchCheck = Date.now() + 15_000
  poll = setInterval(() => {
    if (refreshing || stopping) return
    refreshing = true
    void (async () => {
      const logout = await readFile(join(dataRoot, 'runtime-logout.json'), 'utf8')
        .then((s) => JSON.parse(s) as { accountId: string; at: number })
        .catch(() => null)
      if (
        logout &&
        logout.accountId === getSessionPlayerId() &&
        logout.at >= startedAt &&
        logout.at <= Date.now()
      ) {
        await stop()
        return
      }
      await syncPreferences()
      if (Date.now() >= nextMatchCheck) {
        nextMatchCheck = Date.now() + 15_000
        const state = await fetch(
          `${request.apiOrigin}/matchmaking/matches/${request.matchId}/helper-connection`,
          {
            headers: { authorization: `Bearer ${request.token}` },
            redirect: 'error',
            signal: AbortSignal.timeout(5000)
          }
        ).catch(() => null)
        if (state && [401, 403, 404, 409, 410].includes(state.status)) await stop()
        await state?.body?.cancel()
      }
    })()
      .catch(() => {
        emit({ event: 'preferencesUnavailable' })
      })
      .finally(() => {
        refreshing = false
      })
  }, 1000)
  // Ownership tickets have the same fixed lifetime in the shared native path.
  setTimeout(
    () => {
      void stop()
    },
    2 * 60 * 60 * 1000
  ).unref()
  await new Promise<void>(() => {
    /* Game lifetime owns the background runtime. */
  })
}

let input = Buffer.alloc(0)
const startup = setTimeout(() => {
  void stop(1)
}, 30_000)
channel.on('data', (chunk: Buffer) => {
  input = Buffer.concat([input, chunk])
  if (input.length > 16384) {
    channel.removeAllListeners('data')
    channel.pause()
    input.fill(0)
    input = Buffer.alloc(0)
    void stop(1)
    return
  }
  const end = input.indexOf(10)
  if (end < 0) return
  clearTimeout(startup)
  channel.removeAllListeners('data')
  let request: unknown
  try {
    request = JSON.parse(input.subarray(0, end).toString('utf8'))
  } catch {
    void stop(1)
    return
  }
  input.fill(0)
  void run(request)
    .then(() => stop())
    .catch((error: unknown) => {
      emit({
        ok: false,
        error: 'runtimeUnavailable',
        stage,
        ...(!app.isPackaged && LOCAL_DEVELOPMENT && error instanceof Error
          ? { diagnostic: error.message }
          : {})
      })
      void stop(1)
    })
})
