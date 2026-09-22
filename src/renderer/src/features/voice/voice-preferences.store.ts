import { create } from 'zustand'

export interface PeerPreference {
  volume: number
  muted: boolean
}

const KEY = '16competitive.voice.preferences'
const DEFAULT: PeerPreference = { volume: 1, muted: false }

const load = (): Record<string, PeerPreference> => {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? '{}')
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return Object.fromEntries(
      Object.entries(parsed)
        .filter((entry): entry is [string, Record<string, unknown>] =>
          Boolean(entry[1] && typeof entry[1] === 'object' && !Array.isArray(entry[1]))
        )
        .map(([id, value]) => [
          id,
          {
            volume:
              typeof value.volume === 'number' && Number.isFinite(value.volume)
                ? Math.max(0, Math.min(1, value.volume))
                : 1,
            muted: value.muted === true
          }
        ])
    )
  } catch {
    return {}
  }
}

interface VoicePreferencesState {
  preferences: Record<string, PeerPreference>
  setPreference: (playerId: string, preference: PeerPreference) => void
}

export const useVoicePreferencesStore = create<VoicePreferencesState>((set) => ({
  preferences: load(),
  setPreference: (playerId, preference) =>
    set((state) => {
      const preferences = { ...state.preferences, [playerId]: preference }
      localStorage.setItem(KEY, JSON.stringify(preferences))
      return { preferences }
    })
}))

export const preferenceFor = (
  preferences: Record<string, PeerPreference>,
  playerId: string
): PeerPreference => preferences[playerId] ?? DEFAULT
