import { isMatchmakingMode, type MatchmakingMode } from '../../../../shared/matchmaking'

interface MatchmakingPreferences {
  lastMode?: MatchmakingMode
  mapIdsByMode?: Partial<Record<MatchmakingMode, string[]>>
  // Remember every offered map so new maps default on only once per mode.
  seenMapIdsByMode?: Partial<Record<MatchmakingMode, string[]>>
  // Remember offered review maps so a manual deselection survives catalog refreshes.
  seenReviewMapIdsByMode?: Partial<Record<MatchmakingMode, string[]>>
}

const storageKey = (playerId: string): string => `matchmaking-preferences:v1:${playerId}`

export function readMatchmakingPreferences(playerId: string | undefined): MatchmakingPreferences {
  if (!playerId) return {}
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(storageKey(playerId)) ?? '{}')
    if (!value || typeof value !== 'object') return {}
    const saved = value as Record<string, unknown>
    const readMapIds = (value: unknown): Partial<Record<MatchmakingMode, string[]>> => {
      const result: Partial<Record<MatchmakingMode, string[]>> = {}
      if (!value || typeof value !== 'object') return result
      for (const [mode, mapIds] of Object.entries(value)) {
        if (isMatchmakingMode(mode) && Array.isArray(mapIds)) {
          result[mode] = mapIds.filter((id): id is string => typeof id === 'string')
        }
      }
      return result
    }
    return {
      lastMode: isMatchmakingMode(saved.lastMode) ? saved.lastMode : undefined,
      mapIdsByMode: readMapIds(saved.mapIdsByMode),
      seenMapIdsByMode: readMapIds(saved.seenMapIdsByMode),
      seenReviewMapIdsByMode: readMapIds(saved.seenReviewMapIdsByMode)
    }
  } catch {
    return {}
  }
}

export function saveMatchmakingPreferences(
  playerId: string | undefined,
  changes: {
    lastMode?: MatchmakingMode
    mode?: MatchmakingMode
    mapIds?: string[]
    seenReviewMapIds?: string[]
    seenMapIds?: string[]
  }
): void {
  if (!playerId) return
  try {
    const saved = readMatchmakingPreferences(playerId)
    const next: MatchmakingPreferences = {
      lastMode: changes.lastMode ?? saved.lastMode,
      mapIdsByMode: { ...saved.mapIdsByMode },
      seenMapIdsByMode: { ...saved.seenMapIdsByMode },
      seenReviewMapIdsByMode: { ...saved.seenReviewMapIdsByMode }
    }
    if (changes.mode && changes.mapIds) next.mapIdsByMode![changes.mode] = changes.mapIds
    if (changes.mode && changes.seenMapIds)
      next.seenMapIdsByMode![changes.mode] = changes.seenMapIds
    if (changes.mode && changes.seenReviewMapIds)
      next.seenReviewMapIdsByMode![changes.mode] = changes.seenReviewMapIds
    window.localStorage.setItem(storageKey(playerId), JSON.stringify(next))
  } catch {
    // Matchmaking remains usable when storage is unavailable.
  }
}
