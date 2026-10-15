import { isMatchmakingMode, type MatchmakingMap, type MatchmakingMapCatalog } from './matchmaking'
import { isServerCustomGameMode } from './custom-games'

const MAP_ID_PATTERN = /^[a-z0-9_]{1,64}$/
const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const isPreviewUrl = (value: unknown): value is string | null => {
  if (value === null) return true
  if (typeof value !== 'string') return false
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}

const isMap = (value: unknown): value is MatchmakingMap =>
  isObject(value) &&
  typeof value.id === 'string' &&
  MAP_ID_PATTERN.test(value.id) &&
  typeof value.displayName === 'string' &&
  value.displayName.length > 0 &&
  value.displayName.length <= 80 &&
  typeof value.game === 'string' &&
  value.game.length > 0 &&
  value.game.length <= 32 &&
  isPreviewUrl(value.previewUrl) &&
  Array.isArray(value.supportedModes) &&
  value.supportedModes.every(isMatchmakingMode) &&
  Array.isArray(value.webModes) &&
  value.webModes.every(isMatchmakingMode) &&
  value.webModes.every((mode) => (value.supportedModes as unknown[]).includes(mode)) &&
  Array.isArray(value.customModes) &&
  value.customModes.every(isServerCustomGameMode)

export function parseMatchmakingMapCatalog(body: unknown): MatchmakingMapCatalog {
  if (!isObject(body) || !Array.isArray(body.maps) || !body.maps.every(isMap)) {
    throw new Error('The matchmaking server returned invalid maps')
  }
  // Older APIs advertise enabled custom modes only through their map pools.
  const customModes =
    body.customModes === undefined
      ? [...new Set(body.maps.flatMap((map) => map.customModes))]
      : body.customModes
  if (!Array.isArray(customModes) || !customModes.every(isServerCustomGameMode)) {
    throw new Error('The matchmaking server returned invalid custom modes')
  }
  return { maps: body.maps, customModes: [...new Set(customModes)] }
}
