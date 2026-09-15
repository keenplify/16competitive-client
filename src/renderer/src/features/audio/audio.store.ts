import { create } from 'zustand'
import {
  DEFAULT_BGM_ID,
  isLauncherBgmId,
  type LauncherBgmId
} from './audio.paths'

const STORAGE_KEY = '16competitive.audio-settings'
const DEFAULT_BGM_VOLUME = 50
const DEFAULT_SFX_VOLUME = 50

interface StoredAudioSettings {
  bgmVolume: number
  sfxVolume: number
  selectedBgmId: LauncherBgmId
}

interface AudioSettingsState extends StoredAudioSettings {
  setBgmVolume: (value: number) => void
  setSfxVolume: (value: number) => void
  setSelectedBgmId: (value: LauncherBgmId) => void
}

const clampVolume = (value: number): number => Math.max(0, Math.min(100, Math.round(value)))

const readStoredSettings = (): StoredAudioSettings => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return {
        bgmVolume: DEFAULT_BGM_VOLUME,
        sfxVolume: DEFAULT_SFX_VOLUME,
        selectedBgmId: DEFAULT_BGM_ID
      }
    }

    const parsed = JSON.parse(raw) as Partial<StoredAudioSettings>
    return {
      bgmVolume:
        typeof parsed.bgmVolume === 'number'
          ? clampVolume(parsed.bgmVolume)
          : DEFAULT_BGM_VOLUME,
      sfxVolume:
        typeof parsed.sfxVolume === 'number'
          ? clampVolume(parsed.sfxVolume)
          : DEFAULT_SFX_VOLUME,
      selectedBgmId: isLauncherBgmId(parsed.selectedBgmId) ? parsed.selectedBgmId : DEFAULT_BGM_ID
    }
  } catch {
    return {
      bgmVolume: DEFAULT_BGM_VOLUME,
      sfxVolume: DEFAULT_SFX_VOLUME,
      selectedBgmId: DEFAULT_BGM_ID
    }
  }
}

const persistSettings = (settings: StoredAudioSettings): void => {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch {
    // Audio preferences are non-critical. Keep the in-memory values if persistence is unavailable.
  }
}

const initialSettings = readStoredSettings()

export const useAudioSettingsStore = create<AudioSettingsState>((set) => ({
  ...initialSettings,
  setBgmVolume: (value) =>
    set((state) => {
      const bgmVolume = clampVolume(value)
      persistSettings({
        bgmVolume,
        sfxVolume: state.sfxVolume,
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
        selectedBgmId: state.selectedBgmId
      })
      return { sfxVolume }
    }),
  setSelectedBgmId: (selectedBgmId) =>
    set((state) => {
      persistSettings({
        bgmVolume: state.bgmVolume,
        sfxVolume: state.sfxVolume,
        selectedBgmId
      })
      return { selectedBgmId }
    })
}))
