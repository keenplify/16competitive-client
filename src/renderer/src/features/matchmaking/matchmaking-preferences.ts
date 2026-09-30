import { isMatchmakingMode, type MatchmakingMode } from '../../../../shared/matchmaking'

interface MatchmakingPreferences {
  lastMode?: MatchmakingMode
  mapIdsByMode?: Partial<Record<MatchmakingMode, string[]>>
}

const storageKey = (playerId: string): string => `matchmaking-preferences:v1:${playerId}`

export function readMatchmakingPreferences(playerId: string | undefined): MatchmakingPreferences {
  if (!playerId) return {}
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(storageKey(playerId)) ?? '{}')
    if (!value || typeof value !== 'object') return {}
    const saved = value as Record<string, unknown>
    const mapIdsByMode: MatchmakingPreferences['mapIdsByMode'] = {}
    if (saved.mapIdsByMode && typeof saved.mapIdsByMode === 'object') {
      for (const [mode, mapIds] of Object.entries(saved.mapIdsByMode)) {
        if (isMatchmakingMode(mode) && Array.isArray(mapIds)) {
          mapIdsByMode[mode] = mapIds.filter((id): id is string => typeof id === 'string')
        }
      }
    }
    return {
      lastMode: isMatchmakingMode(saved.lastMode) ? saved.lastMode : undefined,
      mapIdsByMode
    }
  } catch {
    return {}
  }
}

export function saveMatchmakingPreferences(
  playerId: string | undefined,
  changes: { lastMode?: MatchmakingMode; mode?: MatchmakingMode; mapIds?: string[] }
): void {
  if (!playerId) return
  try {
    const saved = readMatchmakingPreferences(playerId)
    const next: MatchmakingPreferences = {
      lastMode: changes.lastMode ?? saved.lastMode,
      mapIdsByMode: { ...saved.mapIdsByMode }
    }
    if (changes.mode && changes.mapIds) next.mapIdsByMode![changes.mode] = changes.mapIds
    window.localStorage.setItem(storageKey(playerId), JSON.stringify(next))
  } catch {
    // Matchmaking remains usable when storage is unavailable.
  }
}
