import type {
  NativeHelperSettings,
  NativeHelperSettingsRequest
} from '../shared/native-helper-settings'
import { parseGameDisplayPreferences } from '../shared/game-display'
import { currentApiOrigin, requestJson } from './browser-session'
import {
  WEB_HELPER_PROTOCOL,
  WEB_NATIVE_HELPER_PROTOCOL,
  parseWebHelperCheckLink,
  webHelperCheckUrl,
  webHelperLaunchUrl
} from '../shared/web-helper-link'

export type LocalLauncher = 'electron' | 'rust'
export type LocalLauncherCheck = LocalLauncher | 'outdated-electron' | 'outdated-rust' | null
let localChannel: { port: number; token: string; origin: string } | null = null
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
  const channel = settingsChannel()
  const response = await fetch(`http://127.0.0.1:${channel.port}/settings`, {
    method: 'POST',
    headers: { authorization: `Bearer ${channel.token}`, 'content-type': 'application/json' },
    body: JSON.stringify(request),
    signal: AbortSignal.timeout(request.action === 'choose' ? 120_000 : 5_000),
    credentials: 'omit',
    redirect: 'error'
  })
  if (!response.ok) throw new Error('Native helper settings unavailable')
  const value: unknown = await response.json()
  if (typeof value !== 'object' || !value) throw new Error('Invalid native helper settings')
  const settings = value as NativeHelperSettings
  for (const path of [settings.cs13FolderPath, settings.cs16FolderPath])
    if (path !== null && (typeof path !== 'string' || path.length > 4096))
      throw new Error('Invalid helper folder')
  parseGameDisplayPreferences(settings.display)
  if (
    ![
      settings.fastSwitchEnabled,
      settings.enhancementsEnabled,
      settings.lightweightHud,
      settings.killCardsEnabled
    ].every((value) => typeof value === 'boolean') ||
    !settings.currentDisplayResolution ||
    ![settings.currentDisplayResolution.width, settings.currentDisplayResolution.height].every(
      (value) => Number.isInteger(value) && value >= 320 && value <= 16384
    )
  )
    throw new Error('Invalid native helper settings')
  return settings
}
