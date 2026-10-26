import { currentApiOrigin, requestJson } from './browser-session'
import {
  WEB_HELPER_PROTOCOL,
  WEB_NATIVE_HELPER_PROTOCOL,
  webHelperCheckUrl,
  webHelperLaunchUrl
} from '../shared/web-helper-link'

export type LocalLauncher = 'electron' | 'rust'
export type LocalLauncherCheck = LocalLauncher | 'outdated-electron' | 'outdated-rust' | null
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
    ? value : `outdated-${value}`
}

export function preferredLocalLauncher(): LocalLauncher | null {
  const status = cachedLocalLauncherStatus()
  return status === 'electron' || status === 'rust' ? status : null
}

const challenge = async (): Promise<string> => {
  const result = await requestJson<{ token: string }>('/auth/web-handoff', {
    authenticated: true,
    init: { method: 'POST' },
    timeoutMs: 10_000
  })
  if (typeof result.token !== 'string' || !/^[A-Za-z0-9_-]{32,128}$/.test(result.token))
    throw new Error('Invalid local launcher challenge')
  return result.token
}

async function probe(protocol: string, target: LocalLauncher): Promise<'ready' | 'outdated' | 'unavailable'> {
  const handoff = await challenge()
  window.location.href = webHelperCheckUrl(
    { apiOrigin: currentApiOrigin(), handoff },
    import.meta.env.DEV,
    protocol
  )
  for (let attempt = 0; attempt < 12; attempt++) {
    await sleep(500)
    try {
      const status = await requestJson<{ verified: boolean; clientKind?: string; clientVersion?: string }>('/auth/web-handoff/status', {
        authenticated: true,
        init: { method: 'POST', body: JSON.stringify({ token: handoff }) },
        timeoutMs: 3_000
      })
      if (status.verified === true) {
        return status.clientKind === target && status.clientVersion === expectedVersion(target)
          ? 'ready' : 'outdated'
      }
    } catch {
      /* The challenge may have expired or the regional API may be reconnecting. */
    }
  }
  return 'unavailable'
}

export async function checkLocalLauncher(
  target: LocalLauncher = 'electron'
): Promise<LocalLauncherCheck> {
  // Keep each check behind its own click. A browser may reject a second custom
  // protocol navigation after an asynchronous timeout has consumed activation.
  const protocol = target === 'electron' ? WEB_HELPER_PROTOCOL : WEB_NATIVE_HELPER_PROTOCOL
  const result = await probe(protocol, target)
  if (result === 'ready') {
    localStorage.setItem(PREFERENCE_KEY, target)
    localStorage.setItem(PREFERENCE_VERSION_KEY, expectedVersion(target))
    return target
  }
  if (result === 'outdated') {
    if (!preferredLocalLauncher()) {
      localStorage.setItem(PREFERENCE_KEY, target)
      localStorage.setItem(PREFERENCE_VERSION_KEY, 'outdated')
    }
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
