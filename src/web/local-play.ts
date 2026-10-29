import type {
  NativeHelperReadiness,
  NativeHelperSettings,
  NativeHelperSettingsRequest
} from '../shared/native-helper-settings'
import type { DeviceStatus } from '../shared/anti-cheat'
import { parseGameDisplayPreferences } from '../shared/game-display'
import { parseNativeCrosshairConfig } from '../shared/crosshair'
import { parsePlayerPingKey } from '../shared/player-ping'
import type {
  NativeHelperPresence,
  NativeHelperPresenceStatus
} from '../shared/native-helper-presence'
import type { DiscordPartyJoinResult } from '../shared/party'
import type { SkinAssetSyncProgress, NextClientInstallProgress } from '../shared/game-settings'
import { currentApiOrigin, requestJson, getWebSessionToken } from './browser-session'
import {
  WEB_HELPER_PROTOCOL,
  WEB_NATIVE_HELPER_PROTOCOL,
  parseWebHelperCheckLink,
  webHelperCheckUrl,
  webHelperLaunchUrl
} from '../shared/web-helper-link'

import { LocalBridge } from './local-bridge'
import { NativeReadinessRequests } from './native-readiness-requests'

const localBridge = new LocalBridge()

export type LocalLauncher = 'electron' | 'rust'
export type LocalLauncherCheck = LocalLauncher | 'outdated-electron' | 'outdated-rust' | null
let localChannel: { port: number; token: string; origin: string } | null = null
let readiness: { token: string; until: number; value: NativeHelperReadiness } | null = null
const readinessListeners = new Set<() => void>()
export function isNativeCompetitiveReady(): boolean {
  return Boolean(
    readiness &&
    readiness.token === getWebSessionToken() &&
    readiness.until > Date.now() &&
    readiness.value.competitiveReady
  )
}
export function onNativeReadiness(listener: () => void): () => void {
  readinessListeners.add(listener)
  return () => {
    readinessListeners.delete(listener)
  }
}
const readinessRequests = new NativeReadinessRequests()
export function nativeHelperReadiness(force = false): Promise<NativeHelperReadiness> {
  const token = getWebSessionToken()
  if (!token) return Promise.reject(new Error('Authentication required'))
  return readinessRequests.run(token, () => checkNativeHelperReadiness(force))
}
async function checkNativeHelperReadiness(force: boolean): Promise<NativeHelperReadiness> {
  const token = getWebSessionToken()
  if (!token) throw new Error('Authentication required')
  if (!force && readiness?.token === token && readiness.until > Date.now()) return readiness.value
  const deadline = Date.now() + 5000
  for (;;) {
    try {
      await localRequest({ action: 'get' })
      break
    } catch {
      if (Date.now() >= deadline) throw new Error('Native helper bridge unavailable')
      await sleep(100)
    }
  }
  const value = (await localRequest({
    action: 'runtimeCheck',
    apiOrigin: currentApiOrigin()
  })) as NativeHelperReadiness & { protocol: number }
  if (
    value.protocol !== 1 ||
    typeof value.competitiveReady !== 'boolean' ||
    typeof value.device?.banned !== 'boolean' ||
    getWebSessionToken() !== token
  )
    throw new Error('Invalid helper readiness')
  if (
    value.device.banned &&
    (typeof value.device.permanent !== 'boolean' ||
      !Number.isInteger(value.device.offenseCount) ||
      value.device.offenseCount < 1 ||
      !(value.device.expiresAt === null || typeof value.device.expiresAt === 'string') ||
      ![value.device.displayUntil, value.device.reason, value.device.appealEmail].every(
        (v) => typeof v === 'string' && v.length <= 2000
      ))
  )
    throw new Error('Invalid native device status')
  const changed = isNativeCompetitiveReady() !== value.competitiveReady
  readiness = { token, until: Date.now() + 90_000, value }
  if (changed) for (const listener of readinessListeners) listener()
  return value
}
export function nativeDeviceStatus(): DeviceStatus {
  return readiness?.token === getWebSessionToken() ? readiness.value.device : { banned: false }
}
export async function logoutNativeHelper(accountId: string | null): Promise<void> {
  readiness = null
  for (const listener of readinessListeners) listener()
  if (localChannel && accountId)
    await localRequest({ action: 'logout', accountId }).catch(() => undefined)
}
/** Prefer verified helper capture; ordinary web players retain browser voice. */
export async function captureWebMicrophone(): Promise<{ stream: MediaStream; close: () => void }> {
  if (!localChannel || !localBridge.isAuthorized()) {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      },
      video: false
    })
    return {
      stream,
      close: () => {
        for (const track of stream.getTracks()) track.stop()
      }
    }
  }
  try {
    return await captureNativeMicrophone()
  } catch (cause) {
    throw new Error('Native microphone unavailable', { cause })
  }
}

async function captureNativeMicrophone(): Promise<{
  stream: MediaStream
  close: () => void
}> {
  const value = (await localRequest({
    action: 'microphone',
    apiOrigin: window.location.origin
  })) as {
    ok?: unknown
    port?: unknown
    capability?: unknown
  }
  if (
    value.ok !== true ||
    !Number.isInteger(value.port) ||
    Number(value.port) < 1024 ||
    Number(value.port) > 65535 ||
    typeof value.capability !== 'string' ||
    !/^[a-f0-9]{64}$/.test(value.capability)
  )
    throw new Error('Invalid native microphone bridge')
  const peer = new RTCPeerConnection({ iceServers: [] })
  const stream = new MediaStream()
  const close = (): void => {
    void localBridge
      .request(`http://127.0.0.1:${value.port}/close`, {
        method: 'POST',
        headers: { authorization: `Bearer ${value.capability}` },
        credentials: 'omit',
        redirect: 'error',
        signal: AbortSignal.timeout(3000)
      })
      .catch(() => undefined)
    peer.close()
    for (const track of stream.getTracks()) track.stop()
  }
  try {
    peer.addTransceiver('audio', { direction: 'recvonly' })
    const trackReady = new Promise<void>((resolve) => {
      peer.ontrack = (event) => {
        stream.addTrack(event.track)
        resolve()
      }
    })
    await peer.setLocalDescription(await peer.createOffer())
    if (peer.iceGatheringState !== 'complete')
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Native microphone ICE timeout')), 10_000)
        peer.onicegatheringstatechange = () => {
          if (peer.iceGatheringState === 'complete') {
            clearTimeout(timeout)
            resolve()
          }
        }
      })
    const response = await localBridge.request(`http://127.0.0.1:${value.port}/offer`, {
      method: 'POST',
      headers: { authorization: `Bearer ${value.capability}`, 'content-type': 'application/json' },
      body: JSON.stringify(peer.localDescription),
      credentials: 'omit',
      redirect: 'error',
      signal: AbortSignal.timeout(20_000)
    })
    if (!response.ok) throw new Error('Native microphone unavailable')
    const answer = (await response.json()) as RTCSessionDescriptionInit
    if (answer.type !== 'answer' || typeof answer.sdp !== 'string' || answer.sdp.length > 16384)
      throw new Error('Invalid native microphone answer')
    await peer.setRemoteDescription(answer)
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error('Native microphone connection timeout')),
        15_000
      )
      const check = (): void => {
        if (peer.connectionState === 'connected') {
          clearTimeout(timeout)
          resolve()
        }
        if (peer.connectionState === 'failed' || peer.connectionState === 'closed') {
          clearTimeout(timeout)
          reject(new Error('Native microphone disconnected'))
        }
      }
      peer.onconnectionstatechange = check
      check()
    })
    await trackReady
    return { stream, close }
  } catch (error) {
    close()
    throw error
  }
}

export async function nativeDiagnosticLogs(matchId?: string): Promise<string> {
  if (!localChannel) return '[Native helper diagnostics] Helper is not connected.'
  const token = getWebSessionToken()
  if (!token) throw new Error('Authentication required')
  const value = (await localRequest({
    action: 'diagnostics',
    apiOrigin: currentApiOrigin(),
    token,
    matchId
  })) as {
    ok?: unknown
    logs?: unknown
  }
  if (value.ok !== true || typeof value.logs !== 'string' || value.logs.length > 180_000)
    throw new Error('Invalid native helper diagnostics')
  return value.logs
}

/** The existing voice dock receives native key transitions while the game has focus. */
export function startNativeVoice(
  listener: (matchId: string, active: boolean, channel: 'team' | 'party') => void
): () => void {
  const controller = new AbortController(),
    token = getWebSessionToken()
  let previous: { matchId: string; team: boolean; party: boolean } | null = null
  const clear = (): void => {
    if (previous) {
      listener(previous.matchId, false, 'team')
      listener(previous.matchId, false, 'party')
      previous = null
    }
  }
  void (async () => {
    while (!controller.signal.aborted && token && token === getWebSessionToken()) {
      try {
        const c = settingsChannel()
        const response = await localBridge.request(`http://127.0.0.1:${c.port}/settings`, {
          method: 'POST',
          headers: { authorization: `Bearer ${c.token}`, 'content-type': 'application/json' },
          body: JSON.stringify({ action: 'voiceStream' }),
          credentials: 'omit',
          redirect: 'error',
          signal: controller.signal
        })
        if (!response.ok || !response.body) throw new Error('Native voice unavailable')
        const reader = response.body.getReader(),
          decoder = new TextDecoder()
        let pending = ''
        try {
          for (;;) {
            const chunk = await reader.read()
            if (chunk.done) break
            pending += decoder.decode(chunk.value, { stream: true })
            if (pending.length > 8192) throw new Error('Invalid native voice stream')
            let end: number
            while ((end = pending.indexOf('\n\n')) >= 0) {
              const line = pending.slice(0, end)
              pending = pending.slice(end + 2)
              if (token !== getWebSessionToken()) return
              if (!line.startsWith('data: ')) continue
              const v = JSON.parse(line.slice(6)) as {
                matchId: string
                team: boolean
                party: boolean
              }
              if (
                !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(v.matchId) ||
                typeof v.team !== 'boolean' ||
                typeof v.party !== 'boolean'
              )
                continue
              if (previous?.matchId !== v.matchId) clear()
              if (previous?.team !== v.team) listener(v.matchId, v.team, 'team')
              if (previous?.party !== v.party) listener(v.matchId, v.party, 'party')
              previous = v
            }
          }
        } finally {
          await reader.cancel().catch(() => undefined)
        }
      } catch {
        /* Always release talk on a disconnected or stale native feed. */
      } finally {
        clear()
      }
      if (!controller.signal.aborted) await sleep(1000)
    }
  })()
  return () => {
    controller.abort()
    clear()
  }
}
export async function nativeNextClient(install: boolean): Promise<string | null> {
  if (install) {
    await localRequest({ action: 'nextClient', apiOrigin: currentApiOrigin(), install: true })
    const deadline = Date.now() + 15 * 60_000
    for (;;) {
      const state = (await localRequest({ action: 'nextClientStatus' })) as {
        status: string
        progress?: NextClientInstallProgress
      }
      if (state.status === 'ready') return null
      if (state.status === 'error' || Date.now() >= deadline)
        throw new Error('NextClient setup failed')
      if (
        state.progress &&
        ['checking_source', 'downloading', 'extracting', 'launching'].includes(
          state.progress.phase
        ) &&
        Number.isFinite(state.progress.downloadedBytes) &&
        state.progress.downloadedBytes >= 0
      )
        for (const listener of installerListeners) listener(state.progress)
      await sleep(500)
    }
  }
  const value = (await localRequest({
    action: 'nextClient',
    apiOrigin: currentApiOrigin(),
    install
  })) as { ok: boolean; folder?: unknown }
  if (
    value.ok !== true ||
    (value.folder != null && (typeof value.folder !== 'string' || value.folder.length > 4096))
  )
    throw new Error('Invalid NextClient response')
  return typeof value.folder === 'string' ? value.folder : null
}
const installerListeners = new Set<(value: NextClientInstallProgress) => void>()
export function onNativeInstallerProgress(
  listener: (value: NextClientInstallProgress) => void
): () => void {
  installerListeners.add(listener)
  return () => {
    installerListeners.delete(listener)
  }
}
export async function cancelNativeInstaller(): Promise<void> {
  await localRequest({ action: 'nextClientCancel' })
}
const discordJoinListeners = new Set<(result: DiscordPartyJoinResult) => void>()
const assetSyncListeners = new Set<(progress: SkinAssetSyncProgress) => void>()
export function onNativeAssetSync(listener: (progress: SkinAssetSyncProgress) => void): () => void {
  assetSyncListeners.add(listener)
  return () => {
    assetSyncListeners.delete(listener)
  }
}
function parseProgress(value: unknown): SkinAssetSyncProgress {
  if (!value || typeof value !== 'object') throw new Error('Invalid native asset progress')
  const p = value as SkinAssetSyncProgress
  if (
    !['idle', 'syncing', 'ready', 'error'].includes(p.status) ||
    !Number.isInteger(p.completedFiles) ||
    !Number.isInteger(p.totalFiles) ||
    p.completedFiles < 0 ||
    p.totalFiles < 0 ||
    p.completedFiles > p.totalFiles ||
    p.totalFiles > 20000
  )
    throw new Error('Invalid native asset progress')
  return p
}
export async function nativeAssetStatus(): Promise<SkinAssetSyncProgress> {
  return parseProgress(await localRequest({ action: 'assetStatus' }))
}
export async function syncNativeAssets(mode: 'download' | 'repair' = 'download'): Promise<void> {
  const token = getWebSessionToken()
  if (!token) throw new Error('Authentication required')
  let progress = parseProgress(
    await localRequest({
      action: 'assetSync',
      apiOrigin: currentApiOrigin(),
      token,
      repair: mode === 'repair'
    })
  )
  const deadline = Date.now() + 60 * 60 * 1000
  while (true) {
    for (const listener of assetSyncListeners) listener(progress)
    if (progress.status === 'ready') return
    if (progress.status === 'error' || Date.now() >= deadline || getWebSessionToken() !== token)
      throw new Error('Native asset sync failed')
    await sleep(1000)
    progress = await nativeAssetStatus()
  }
}
export function onNativeDiscordJoin(
  listener: (result: DiscordPartyJoinResult) => void
): () => void {
  discordJoinListeners.add(listener)
  return () => {
    discordJoinListeners.delete(listener)
  }
}
function settingsChannel(): { port: number; token: string; origin: string } {
  if (!localChannel)
    localChannel = {
      port: 49152 + (crypto.getRandomValues(new Uint16Array(1))[0] % 16384),
      token: [...crypto.getRandomValues(new Uint8Array(32))]
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join(''),
      origin: window.location.origin
    }
  return localChannel
}
const PREFERENCE_KEY = '16competitive.web.local-launcher'
const PREFERENCE_VERSION_KEY = '16competitive.web.local-launcher-version'
const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => window.setTimeout(resolve, ms))

function expectedVersion(target: LocalLauncher): string {
  return target === 'electron'
    ? __SIXTEEN_COMPETITIVE_VERSION__
    : __SIXTEEN_COMPETITIVE_HELPER_FINGERPRINT__
}

export function cachedLocalLauncherStatus(): LocalLauncherCheck {
  const value = localStorage.getItem(PREFERENCE_KEY)
  if (value !== 'electron' && value !== 'rust') return null
  return localStorage.getItem(PREFERENCE_VERSION_KEY) === expectedVersion(value)
    ? value
    : `outdated-${value}`
}

export function preferredLocalLauncher(): LocalLauncher | null {
  const status = cachedLocalLauncherStatus()
  return status === 'rust' ? status : null
}

export async function nativeProbeNodes(
  nodes: { id: string; publicApiUrl: string; latencyProbe?: { port: number } }[]
): Promise<Map<string, number | null>> {
  const result = await localRequest({
    action: 'probeNodes',
    nodes: nodes.map((node) => ({
      id: node.id,
      apiOrigin: new URL(node.publicApiUrl).origin,
      port: node.latencyProbe?.port ?? 0
    }))
  })
  if (!Array.isArray(result) || result.length !== nodes.length) {
    throw new Error('Invalid native latency response')
  }
  const latency = new Map<string, number | null>()
  for (const item of result) {
    if (
      !item ||
      typeof item !== 'object' ||
      typeof item.id !== 'string' ||
      !nodes.some((node) => node.id === item.id) ||
      latency.has(item.id) ||
      !(
        item.latencyMs === null ||
        (Number.isInteger(item.latencyMs) && item.latencyMs >= 0 && item.latencyMs <= 5000)
      )
    )
      throw new Error('Invalid native latency response')
    latency.set(item.id, item.latencyMs)
  }
  return latency
}

const createChallenge = async (
  baseUrl = currentApiOrigin()
): Promise<{ token: string; expiresAt: string }> => {
  const result = await requestJson<{ token: string; expiresAt: string }>('/auth/web-handoff', {
    baseUrl,
    authenticated: true,
    init: { method: 'POST' },
    timeoutMs: 10_000
  })
  if (typeof result.token !== 'string' || !/^[A-Za-z0-9_-]{32,128}$/.test(result.token))
    throw new Error('Invalid local launcher challenge')
  if (!Number.isFinite(Date.parse(result.expiresAt))) throw new Error('Invalid challenge expiry')
  return result
}

const challenge = async (apiOrigin = currentApiOrigin()): Promise<string> =>
  (await createChallenge(apiOrigin)).token

async function probe(
  protocol: string,
  target: LocalLauncher
): Promise<'ready' | 'outdated' | 'unavailable'> {
  const apiOrigin = currentApiOrigin()
  const handoff = await challenge(apiOrigin)
  window.location.href = webHelperCheckUrl(
    { apiOrigin, handoff, ...(target === 'rust' ? { localSettings: settingsChannel() } : {}) },
    import.meta.env.DEV,
    protocol
  )
  const deadline = Date.now() + (target === 'rust' ? 90_000 : 12_000)
  while (Date.now() < deadline) {
    await sleep(500)
    try {
      const status = await requestJson<{
        verified: boolean
        clientKind?: string
        clientVersion?: string
      }>('/auth/web-handoff/status', {
        baseUrl: apiOrigin,
        authenticated: true,
        clearOnUnauthorized: false,
        init: { method: 'POST', body: JSON.stringify({ token: handoff }) },
        timeoutMs: 3_000
      })
      if (status.verified === true) {
        if (
          target === 'rust' &&
          status.clientKind === target &&
          status.clientVersion === expectedVersion(target)
        )
          localBridge.authorize()
        return status.clientKind === target && status.clientVersion === expectedVersion(target)
          ? 'ready'
          : 'outdated'
      }
    } catch {
      /* The challenge may have expired or the regional API may be reconnecting. */
    }
  }
  return 'unavailable'
}

export async function checkLocalLauncher(
  target: LocalLauncher = 'rust'
): Promise<LocalLauncherCheck> {
  // Probe only the requested protocol; do not chain desktop and native checks.
  // Browsers may require consent before opening the registered application.
  const protocol = target === 'electron' ? WEB_HELPER_PROTOCOL : WEB_NATIVE_HELPER_PROTOCOL
  const result = await probe(protocol, target)
  if (result === 'ready') {
    localStorage.setItem(PREFERENCE_KEY, target)
    localStorage.setItem(PREFERENCE_VERSION_KEY, expectedVersion(target))
    return target
  }
  readiness = null
  for (const listener of readinessListeners) listener()
  if (result === 'outdated') {
    localStorage.setItem(PREFERENCE_KEY, target)
    localStorage.setItem(PREFERENCE_VERSION_KEY, 'outdated')
  } else if (localStorage.getItem(PREFERENCE_KEY) === target) {
    localStorage.removeItem(PREFERENCE_KEY)
    localStorage.removeItem(PREFERENCE_VERSION_KEY)
  }
  return result === 'outdated' ? `outdated-${target}` : null
}

export async function launchWithLocalLauncher(
  matchId: string,
  launcher: LocalLauncher
): Promise<void> {
  const handoff = await challenge()
  const protocol = launcher === 'electron' ? WEB_HELPER_PROTOCOL : WEB_NATIVE_HELPER_PROTOCOL
  window.location.href = webHelperLaunchUrl(
    { apiOrigin: currentApiOrigin(), matchId, handoff },
    import.meta.env.DEV,
    protocol
  )
}

let setupGeneration = 0

export function cancelNativeHelperSetup(): void {
  setupGeneration++
}

export async function createNativeHelperSetup(): Promise<{ checkUrl: string; expiresAt: string }> {
  const apiOrigin = currentApiOrigin()
  const { token, expiresAt } = await createChallenge(apiOrigin)
  return {
    checkUrl: webHelperCheckUrl(
      { apiOrigin, handoff: token, localSettings: settingsChannel() },
      import.meta.env.DEV,
      WEB_NATIVE_HELPER_PROTOCOL
    ),
    expiresAt
  }
}

export async function waitForNativeHelperSetup(setup: {
  checkUrl: string
  expiresAt: string
}): Promise<'rust' | 'outdated-rust' | null> {
  const link = parseWebHelperCheckLink(
    setup.checkUrl,
    import.meta.env.DEV,
    WEB_NATIVE_HELPER_PROTOCOL
  )
  if (!link) throw new Error('Invalid native helper setup link')
  const generation = ++setupGeneration
  const deadline = Math.min(Date.parse(setup.expiresAt), Date.now() + 120_000)
  while (generation === setupGeneration && Date.now() < deadline) {
    await sleep(1000)
    if (generation !== setupGeneration) return null
    try {
      const status = await requestJson<{
        verified: boolean
        clientKind?: string
        clientVersion?: string
      }>('/auth/web-handoff/status', {
        baseUrl: link.apiOrigin,
        authenticated: true,
        clearOnUnauthorized: false,
        init: { method: 'POST', body: JSON.stringify({ token: link.handoff }) },
        timeoutMs: 3_000
      })
      if (generation !== setupGeneration) return null
      if (status.verified === true) {
        if (status.clientKind !== 'rust' || status.clientVersion !== expectedVersion('rust'))
          return 'outdated-rust'
        localBridge.authorize()
        localStorage.setItem(PREFERENCE_KEY, 'rust')
        localStorage.setItem(PREFERENCE_VERSION_KEY, expectedVersion('rust'))
        return 'rust'
      }
    } catch {
      // Keep the bounded setup wait available through transient API failures.
    }
  }
  return null
}

export async function nativeHelperSettings(
  request: NativeHelperSettingsRequest
): Promise<NativeHelperSettings> {
  const value = await localRequest(request)
  if (typeof value !== 'object' || !value) throw new Error('Invalid native helper settings')
  const settings = value as NativeHelperSettings
  if (
    !['win32', 'linux'].includes(settings.platform) ||
    typeof settings.helperVersion !== 'string' ||
    !/^\d{4}\.\d{4}\.\d+$/.test(settings.helperVersion) ||
    !Array.isArray(settings.voicePttKeys) ||
    settings.voicePttKeys.length !== 2 ||
    !settings.voicePttKeys.every(
      (key) => typeof key === 'string' && /^[A-Z0-9]{1,16}$/.test(key)
    ) ||
    settings.voicePttKeys[0] === settings.voicePttKeys[1]
  )
    throw new Error('Invalid native voice settings')
  for (const path of [settings.cs13FolderPath, settings.cs16FolderPath])
    if (path !== null && (typeof path !== 'string' || path.length > 4096))
      throw new Error('Invalid helper folder')
  parseGameDisplayPreferences(settings.display)
  parsePlayerPingKey(settings.playerPingKey)
  if (settings.crosshairConfig !== null) parseNativeCrosshairConfig(settings.crosshairConfig)
  if (
    ![
      settings.fastSwitchEnabled,
      settings.enhancementsEnabled,
      settings.lightweightHud,
      settings.killCardsEnabled,
      settings.nextClientDetected
    ].every((value) => typeof value === 'boolean') ||
    !settings.currentDisplayResolution ||
    ![settings.currentDisplayResolution.width, settings.currentDisplayResolution.height].every(
      (value) => Number.isInteger(value) && value >= 320 && value <= 16384
    )
  )
    throw new Error('Invalid native helper settings')
  return settings
}

export async function nativeHelperPresence(
  activity: NativeHelperPresence | null
): Promise<NativeHelperPresenceStatus> {
  const accountToken = getWebSessionToken()
  const result = (await localRequest({
    action: 'presence',
    activity
  })) as NativeHelperPresenceStatus
  if (
    typeof result?.connected !== 'boolean' ||
    (result.joinSecret !== null &&
      (typeof result.joinSecret !== 'string' ||
        !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(result.joinSecret)))
  )
    throw new Error('Invalid native activity response')
  if (result.joinSecret && activity && accountToken && getWebSessionToken() === accountToken) {
    let joined: DiscordPartyJoinResult
    try {
      const body = await requestJson<{ party: import('../shared/party').Party }>('/party/join', {
        authenticated: true,
        init: { method: 'POST', body: JSON.stringify({ secret: result.joinSecret }) }
      })
      joined = { ok: true, party: body.party }
    } catch {
      joined = { ok: false, message: '', code: 'inviteUnavailable' }
    }
    if (getWebSessionToken() === accountToken)
      for (const listener of discordJoinListeners) listener(joined)
  }
  return { connected: result.connected, joinSecret: null }
}

// Reads only model files through the existing origin-bound helper capability.
export async function readNativeModel(path: string): Promise<ArrayBuffer | null> {
  if (preferredLocalLauncher() !== 'rust') return null
  try {
    const result = (await localRequest({ action: 'modelRead', path })) as { data?: unknown }
    if (typeof result?.data !== 'string' || result.data.length > 45_000_000) return null
    const bytes = Uint8Array.from(atob(result.data), (value) => value.charCodeAt(0))
    if (
      bytes.length < 244 ||
      new DataView(bytes.buffer).getInt32(4, true) !== 10 ||
      String.fromCharCode(...bytes.subarray(0, 4)) !== 'IDST'
    )
      return null
    return bytes.buffer
  } catch {
    // Older/disconnected helpers and missing local models use the web fallback.
    return null
  }
}

async function localRequest(
  request:
    | NativeHelperSettingsRequest
    | { action: 'presence'; activity: NativeHelperPresence | null }
    | { action: 'modelRead'; path: string }
    | { action: 'assetStatus' }
    | { action: 'assetSync'; apiOrigin: string; token: string; repair: boolean }
    | { action: 'runtimeCheck' | 'microphone'; apiOrigin: string }
    | { action: 'diagnostics'; apiOrigin: string; token: string; matchId?: string }
    | { action: 'nextClient'; apiOrigin: string; install: boolean }
    | { action: 'nextClientStatus' | 'nextClientCancel' }
    | { action: 'logout'; accountId: string }
    | { action: 'probeNodes'; nodes: { id: string; apiOrigin: string; port: number }[] }
): Promise<unknown> {
  const channel = settingsChannel()
  const response = await localBridge.request(`http://127.0.0.1:${channel.port}/settings`, {
    method: 'POST',
    headers: { authorization: `Bearer ${channel.token}`, 'content-type': 'application/json' },
    body: JSON.stringify(request),
    signal: AbortSignal.timeout(
      ['get', 'choose', 'runtimeCheck', 'nextClient', 'microphone', 'diagnostics'].includes(
        request.action
      )
        ? 300_000
        : 5_000
    ),
    credentials: 'omit',
    redirect: 'error'
  })
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null)
    const invalidInstallation =
      response.status === 400 &&
      body !== null &&
      typeof body === 'object' &&
      'code' in body &&
      body.code === 'INVALID_GAME_INSTALLATION'
    console.warn('[NativeHelper] Settings request rejected', {
      action: request.action,
      status: response.status,
      code: invalidInstallation ? 'invalidInstallation' : 'unavailable'
    })
    throw Object.assign(new Error('Native helper settings unavailable'), {
      code: invalidInstallation ? 'invalidInstallation' : 'unavailable'
    })
  }
  return await response.json()
}
