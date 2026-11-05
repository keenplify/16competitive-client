import { create } from 'zustand'
import { isLauncherBgmId, type LauncherBgmId } from './audio.paths'

const STORAGE_KEY = '16competitive.audio-settings'
const DEFAULT_BGM_VOLUME = 50
const DEFAULT_SFX_VOLUME = 50

export type BgmSelection = LauncherBgmId | 'automatic' | 'equipped-kit'

interface StoredAudioSettings {
  communityAudioRevision?: string | null
  selectionVersion?: 2
  bgmVolume: number
  sfxVolume: number
  selectedBgmId: BgmSelection
}

interface AudioSettingsState extends StoredAudioSettings {
  applyCommunityAudioDefaults: (revision: string, volume: number) => void
  setBgmVolume: (value: number) => void
  setSfxVolume: (value: number) => void
  setSelectedBgmId: (value: BgmSelection) => void
}

const clampVolume = (value: number): number => Math.max(0, Math.min(100, Math.round(value)))

const readStoredSettings = (): StoredAudioSettings => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return {
        bgmVolume: DEFAULT_BGM_VOLUME,
        sfxVolume: DEFAULT_SFX_VOLUME,
        selectedBgmId: 'automatic'
      }
    }

    const parsed = JSON.parse(raw) as Partial<StoredAudioSettings>
    return {
      communityAudioRevision:
        typeof parsed.communityAudioRevision === 'string' ? parsed.communityAudioRevision : null,
      bgmVolume:
        typeof parsed.bgmVolume === 'number' ? clampVolume(parsed.bgmVolume) : DEFAULT_BGM_VOLUME,
      sfxVolume:
        typeof parsed.sfxVolume === 'number' ? clampVolume(parsed.sfxVolume) : DEFAULT_SFX_VOLUME,
      selectedBgmId:
        parsed.selectionVersion === 2 &&
        (parsed.selectedBgmId === 'automatic' ||
          parsed.selectedBgmId === 'equipped-kit' ||
          isLauncherBgmId(parsed.selectedBgmId))
          ? parsed.selectedBgmId
          : 'automatic'
    }
  } catch {
    return {
      bgmVolume: DEFAULT_BGM_VOLUME,
      sfxVolume: DEFAULT_SFX_VOLUME,
      selectedBgmId: 'automatic'
    }
  }
}

const persistSettings = (settings: StoredAudioSettings): void => {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...settings, selectionVersion: 2 }))
  } catch {
    // Audio preferences are non-critical. Keep the in-memory values if persistence is unavailable.
  }
}

const initialSettings = readStoredSettings()

export const useAudioSettingsStore = create<AudioSettingsState>((set) => ({
  ...initialSettings,
  applyCommunityAudioDefaults: (revision, volume) =>
    set((state) => {
      if (state.communityAudioRevision === revision) return state
      const next = {
        bgmVolume: clampVolume(volume),
        sfxVolume: state.sfxVolume,
        selectedBgmId: state.selectedBgmId,
        communityAudioRevision: revision
      }
      persistSettings(next)
      return next
    }),
  setBgmVolume: (value) =>
    set((state) => {
      const bgmVolume = clampVolume(value)
      persistSettings({
        bgmVolume,
        sfxVolume: state.sfxVolume,
        communityAudioRevision: state.communityAudioRevision,
        selectedBgmId: state.selectedBgmId
      })
      return { bgmVolume }
    }),
  setSfxVolume: (value) =>
    set((state) => {
      const sfxVolume = clampVolume(value)
      persistSettings({
        bgmVolume: state.bgmVolume,
        sfxVolume,
        communityAudioRevision: state.communityAudioRevision,
        selectedBgmId: state.selectedBgmId
      })
      return { sfxVolume }
    }),
  setSelectedBgmId: (selectedBgmId) =>
    set((state) => {
      persistSettings({
        bgmVolume: state.bgmVolume,
        sfxVolume: state.sfxVolume,
        communityAudioRevision: state.communityAudioRevision,
        selectedBgmId
      })
      return { selectedBgmId }
    })
}))
