import { clearSessionToken, getSessionToken } from './auth'
import { resolvePreferredMatchmakingApiUrl } from './matchmaking-regions'
import type { LobbyLoadout, OwnedSkin, Skin, UnlockResult } from '../shared/skins'
import { readCachedSkinPreview, writeCachedSkinPreview } from './skin-preview-cache'

// Keep downloaded preview models in the per-user cache so the store does not
// fetch the same .mdl every time it renders a skin.
const PREVIEW_MODEL_CACHE_ENABLED = true
const SKIN_API_URL_CACHE_MS = 5_000

const skinIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const weaponKeyPattern = /^[a-z0-9_]+$/

type ApiError = Error & { code?: string }

let cachedSkinApiUrl: { url: string; expiresAt: number } | null = null
let pendingSkinApiUrl: Promise<string> | null = null

const makeError = (message: string, code?: string): ApiError =>
  Object.assign(new Error(message), { code })

const getSkinApiUrl = async (): Promise<string> => {
  if (cachedSkinApiUrl && cachedSkinApiUrl.expiresAt > Date.now()) return cachedSkinApiUrl.url
  if (pendingSkinApiUrl) return pendingSkinApiUrl

  pendingSkinApiUrl = resolvePreferredMatchmakingApiUrl()
    .then((url) => {
      cachedSkinApiUrl = { url, expiresAt: Date.now() + SKIN_API_URL_CACHE_MS }
      return url
    })
    .finally(() => {
      pendingSkinApiUrl = null
    })
  return pendingSkinApiUrl
}

const skinApiUrl = async (path: string): Promise<string> => {
  const baseUrl = await getSkinApiUrl()
  return new URL(path, `${baseUrl.replace(/\/$/, '')}/`).toString()
}

const isSkin = (value: unknown): value is Skin => {
  if (typeof value !== 'object' || value === null) return false
  const skin = value as Record<string, unknown>
  return (
    typeof skin.id === 'string' &&
    typeof skin.gameVersion === 'string' &&
    typeof skin.weaponKey === 'string' &&
    typeof skin.name === 'string' &&
    (typeof skin.description === 'string' || skin.description === null) &&
    typeof skin.pricePoints === 'number' &&
    (typeof skin.availableFrom === 'string' || skin.availableFrom === null) &&
    (typeof skin.availableUntil === 'string' || skin.availableUntil === null) &&
    typeof skin.creatorName === 'string' &&
    (typeof skin.creatorUrl === 'string' || skin.creatorUrl === null) &&
    typeof skin.sourceUrl === 'string' &&
    typeof skin.licenseName === 'string' &&
    (typeof skin.licenseUrl === 'string' || skin.licenseUrl === null) &&
    typeof skin.attributionText === 'string'
  )
}

const isOwnedSkin = (value: unknown): value is OwnedSkin => {
  if (typeof value !== 'object' || value === null) return false
  const owned = value as Record<string, unknown>
  return (
    isSkin(owned.skin) &&
    typeof owned.acquiredAt === 'string' &&
    typeof owned.acquiredForPoints === 'number' &&
    (typeof owned.equippedAt === 'string' || owned.equippedAt === null) &&
    typeof owned.lobbySelected === 'boolean'
  )
}

const playerRequest = async (path: string, init: RequestInit = {}): Promise<unknown> => {
  const token = getSessionToken()
  if (!token) throw makeError('Sign in to manage skins.', 'UNAUTHORIZED')
  const response = await fetch(await skinApiUrl(path), {
    ...init,
    headers: { authorization: `Bearer ${token}`, ...init.headers },
    signal: AbortSignal.timeout(10_000)
  }).catch(() => {
    throw makeError('Could not reach the shop server.')
  })
  const body: unknown = await response.json().catch(() => null)
  if (response.status === 401) {
    clearSessionToken()
    throw makeError('Your session expired. Sign in again.', 'UNAUTHORIZED')
  }
  if (!response.ok) {
    const error = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {}
    throw makeError(
      typeof error.message === 'string' ? error.message : 'Shop request failed.',
      typeof error.error === 'string' ? error.error : undefined
    )
  }
  return body
}

export const listSkins = async (weaponKey?: unknown): Promise<Skin[]> => {
  if (
    weaponKey !== undefined &&
    (typeof weaponKey !== 'string' || !weaponKeyPattern.test(weaponKey))
  ) {
    throw new Error('Invalid weapon filter')
  }
  const query = weaponKey ? `?weaponKey=${encodeURIComponent(weaponKey)}` : ''
  const body = await fetch(await skinApiUrl(`/skins${query}`), {
    signal: AbortSignal.timeout(10_000)
  }).catch(() => {
    throw new Error('Could not reach the shop server.')
  })
  const data: unknown = await body.json().catch(() => null)
  if (!body.ok) {
    throw new Error(
      body.status >= 500
        ? 'The shop catalog is temporarily unavailable. Please try again shortly.'
        : 'Could not load skins currently on sale.'
    )
  }
  if (!Array.isArray(data) || !data.every(isSkin)) {
    throw new Error('Could not load skins currently on sale.')
  }
  return data
}

export const getOwnedSkins = async (): Promise<OwnedSkin[]> => {
  const data = await playerRequest('/skins/mine')
  if (!Array.isArray(data) || !data.every(isOwnedSkin))
    throw new Error('The server returned an invalid inventory.')
  return data
}

export const getLobbyLoadout = async (): Promise<LobbyLoadout> => {
  const data = await playerRequest('/skins/lobby-loadout')
  if (
    typeof data !== 'object' ||
    data === null ||
    typeof (data as Record<string, unknown>).playerModel !== 'string' ||
    !(
      typeof (data as Record<string, unknown>).weaponSkinId === 'string' ||
      (data as Record<string, unknown>).weaponSkinId === null
    ) ||
    typeof (data as Record<string, unknown>).weaponKey !== 'string' ||
    !(
      typeof (data as Record<string, unknown>).weaponModelPath === 'string' ||
      (data as Record<string, unknown>).weaponModelPath === null
    )
  ) {
    throw new Error('The server returned an invalid lobby loadout.')
  }
  return data as LobbyLoadout
}

const validateSkinId = (skinId: unknown): string => {
  if (typeof skinId !== 'string' || !skinIdPattern.test(skinId)) throw new Error('Invalid skin ID')
  return skinId
}

export const unlockSkin = async (skinId: unknown): Promise<UnlockResult> => {
  const data = await playerRequest(`/skins/${validateSkinId(skinId)}/unlock`, { method: 'POST' })
  if (
    typeof data !== 'object' ||
    data === null ||
    !isSkin((data as Record<string, unknown>).skin) ||
    typeof (data as Record<string, unknown>).points !== 'number'
  ) {
    throw new Error('The server returned an invalid unlock result.')
  }
  return data as UnlockResult
}

export const equipSkin = async (skinId: unknown): Promise<void> => {
  await playerRequest(`/skins/${validateSkinId(skinId)}/equip`, { method: 'POST' })
}

export const unequipSkin = async (skinId: unknown): Promise<void> => {
  await playerRequest(`/skins/${validateSkinId(skinId)}/unequip`, { method: 'POST' })
}

export const setLobbyWeapon = async (skinId: unknown): Promise<void> => {
  await playerRequest(`/skins/${validateSkinId(skinId)}/lobby-weapon`, { method: 'POST' })
}

export const setLobbyWeaponKey = async (weaponKey: unknown): Promise<void> => {
  if (typeof weaponKey !== 'string' || !weaponKeyPattern.test(weaponKey)) {
    throw new Error('Invalid lobby weapon')
  }
  await playerRequest('/skins/lobby-weapon', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ weaponKey })
  })
}

export const setLobbyPlayerModel = async (modelPath: unknown): Promise<void> => {
  if (typeof modelPath !== 'string' || !/^player\/[a-z0-9_]+\/[a-z0-9_]+\.mdl$/i.test(modelPath)) {
    throw new Error('Invalid lobby player model')
  }
  await playerRequest('/skins/lobby-player-model', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ modelPath })
  })
}

export const getSkinPreviewModel = async (skinId: unknown): Promise<ArrayBuffer> => {
  const token = getSessionToken()
  if (!token) throw makeError('Sign in to preview skins.', 'UNAUTHORIZED')
  const validatedSkinId = validateSkinId(skinId)
  if (PREVIEW_MODEL_CACHE_ENABLED) {
    const cached = await readCachedSkinPreview(validatedSkinId)
    if (cached) return cached
  }

  const response = await fetch(await skinApiUrl(`/skins/${validatedSkinId}/preview-model`), {
    headers: { authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(15_000)
  }).catch(() => {
    throw makeError('Could not reach the preview server.')
  })
  if (response.status === 401) {
    clearSessionToken()
    throw makeError('Your session expired. Sign in again.', 'UNAUTHORIZED')
  }
  if (!response.ok) {
    throw makeError(
      response.status === 404
        ? 'This model preview is not available yet.'
        : 'Could not load this model preview.'
    )
  }
  if (!response.headers.get('content-type')?.startsWith('application/octet-stream')) {
    throw makeError('The preview server returned an invalid model.')
  }
  const contentLength = Number(response.headers.get('content-length'))
  if (Number.isFinite(contentLength) && (contentLength < 1 || contentLength > 32 * 1024 * 1024)) {
    throw makeError('The preview model is an unsupported size.')
  }
  const model = await response.arrayBuffer()
  if (model.byteLength === 0 || model.byteLength > 32 * 1024 * 1024) {
    throw makeError('The preview model is an unsupported size.')
  }
  if (PREVIEW_MODEL_CACHE_ENABLED) {
    await writeCachedSkinPreview(validatedSkinId, model).catch((error: unknown) => {
      console.warn('Could not cache skin preview model', { skinId: validatedSkinId, error })
    })
  }
  return model
}
