import { API_BASE_URL } from '../config'
import { getSessionToken, getSessionPlayerId } from '../auth'
import { DEFAULT_CROSSHAIR, parseNativeCrosshairConfig, serializeCrosshairConfig, type CrosshairProfile } from '../../shared/crosshair'

type StoredProfile = { crosshair?: CrosshairProfile; crosshairAccountId?: string; crosshairSyncPending?: boolean }
let loadedToken: string | null = null
let pending: Promise<StoredProfile> | null = null
let pendingToken: string | null = null
let writes: Promise<void> = Promise.resolve()

async function readProfileResponse(response: Response): Promise<unknown> {
  if (!response.body) return null
  const reader = response.body.getReader(), chunks: Uint8Array[] = []
  let size = 0
  try {
    for (;;) {
      const result = await reader.read()
      if (result.done) break
      size += result.value.byteLength
      if (size > 2048) return null
      chunks.push(result.value)
    }
    return JSON.parse(new TextDecoder('utf-8', {fatal:true}).decode(Buffer.concat(chunks))) as unknown
  } finally { await reader.cancel().catch(() => undefined) }
}

export async function uploadCrosshair(profile: CrosshairProfile): Promise<boolean> {
  const token = getSessionToken()
  if (!token) return false
  let saved = false
  const task = writes.catch(() => undefined).then(async () => {
    const response = await fetch(new URL('/auth/crosshair', API_BASE_URL), {
      method: 'PUT', headers: {Authorization: `Bearer ${token}`, 'Content-Type': 'application/json'},
      body: JSON.stringify({profile: serializeCrosshairConfig(profile).trim()}),
      signal: AbortSignal.timeout(5000), redirect: 'error'
    })
    saved = response.ok && getSessionToken() === token
    await response.body?.cancel()
  })
  writes = task.catch(() => undefined)
  try { await task } catch { console.warn('[Crosshair] account sync unavailable; local preference retained') }
  return saved
}

export async function restoreCrosshair(stored: StoredProfile, force = false): Promise<StoredProfile> {
  const token = getSessionToken(), accountId = getSessionPlayerId()
  if (!token || !accountId) return stored
  if (pending) {
    if (pendingToken === token) return pending.catch(() => stored)
    await pending.catch(() => undefined)
    return getSessionToken() === token ? restoreCrosshair(stored, force) : stored
  }
  if (!force && loadedToken === token && !stored.crosshairSyncPending) return stored
  pendingToken = token
  pending = (async () => {
    if (stored.crosshairSyncPending && stored.crosshairAccountId === accountId && stored.crosshair) {
      const saved = await uploadCrosshair(stored.crosshair)
      if (saved) loadedToken = token
      return {...stored,crosshairSyncPending:!saved}
    }
    const response = await fetch(new URL('/auth/crosshair', API_BASE_URL), {
      headers: {Authorization: `Bearer ${token}`}, signal: AbortSignal.timeout(5000), redirect: 'error'
    })
    if (!response.ok) return stored
    const body = await readProfileResponse(response)
    if (!body || typeof body !== 'object' || !('profile' in body) || getSessionToken() !== token) return stored
    const profile = body.profile === null
      ? (!stored.crosshairAccountId || stored.crosshairAccountId === accountId ? stored.crosshair : undefined) ?? DEFAULT_CROSSHAIR
      : parseNativeCrosshairConfig(body.profile)
    const saved = body.profile !== null || await uploadCrosshair(profile)
    loadedToken = saved ? token : null
    return {crosshair:profile,crosshairAccountId:accountId,crosshairSyncPending:!saved}
  })()
  try { return await pending } catch {
    console.warn('[Crosshair] account restore unavailable; local preference retained')
    return stored
  } finally { pending = null; pendingToken = null }
}
