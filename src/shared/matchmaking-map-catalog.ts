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

type CatalogMap = Omit<MatchmakingMap, 'supportedModes' | 'webModes' | 'customModes'> & {
  supportedModes: string[]
  webModes: string[]
  customModes: string[]
}

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string')

const isMap = (value: unknown): value is CatalogMap =>
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
  isStringArray(value.supportedModes) &&
  isStringArray(value.webModes) &&
  value.webModes.every((mode) => (value.supportedModes as unknown[]).includes(mode)) &&
  isStringArray(value.customModes)

export function parseMatchmakingMapCatalog(body: unknown): MatchmakingMapCatalog {
  if (!isObject(body) || !Array.isArray(body.maps) || !body.maps.every(isMap)) {
    throw new Error('The matchmaking server returned invalid maps')
  }
  // Older APIs advertise enabled custom modes only through their map pools.
  const customModes =
    body.customModes === undefined
      ? [...new Set(body.maps.flatMap((map) => map.customModes))]
      : body.customModes
  if (!isStringArray(customModes)) {
    throw new Error('The matchmaking server returned invalid custom modes')
  }
  // A rolling server upgrade can advertise modes this client does not support.
  // Keep the known map pools usable without translating IDs into queue requests
  // that an older server may reject (for example fight_yard versus arena).
  const maps: MatchmakingMap[] = body.maps.map((map) => ({
    ...map,
    supportedModes: map.supportedModes.filter(isMatchmakingMode),
    webModes: map.webModes.filter(isMatchmakingMode),
    customModes: map.customModes.filter(isServerCustomGameMode)
  }))
  return { maps, customModes: [...new Set(customModes.filter(isServerCustomGameMode))] }
}
