import { create } from 'zustand'
import type {
  MusicEvent,
  MusicKit,
  MusicKitSnapshot,
  MusicTeam
} from '../../../../shared/music-kits'
import { useAuthStore } from '../auth/auth.store'

type MusicState = {
  open: boolean
  snapshot: MusicKitSnapshot | null
  status: 'idle' | 'loading' | 'ready' | 'error'
  pending: boolean
  error: 'music.error' | 'music.insufficient' | 'music.changed' | null
  event: MusicEvent
  confirm: MusicKit | null
  playingId: string | null
  show: () => void
  close: () => void
  load: () => Promise<void>
  setEvent: (event: MusicEvent) => void
  choosePurchase: (kit: MusicKit | null) => void
  buy: () => Promise<void>
  equip: (id: string | null, team: MusicTeam) => Promise<void>
  filterTeam: MusicTeam | null
  setFilterTeam: (team: MusicTeam | null) => void
  preview: (id: string) => Promise<void>
  stopPreview: () => void
}
let audio: HTMLAudioElement | null = null
let audioUrl: string | null = null
let previewGeneration = 0
let accountGeneration = 0
let loadGeneration = 0
const stopAudio = (): void => {
  previewGeneration++
  audio?.pause()
  audio = null
  if (audioUrl) URL.revokeObjectURL(audioUrl)
  audioUrl = null
}
const errorKey = (error: unknown): MusicState['error'] => {
  const message = error instanceof Error ? error.message : ''
  return message.includes('INSUFFICIENT_POINTS')
    ? 'music.insufficient'
    : message.includes('MUSIC_PRICE_CHANGED')
      ? 'music.changed'
      : 'music.error'
}
export const useMusicKitsStore = create<MusicState>((set, get) => ({
  open: false,
  snapshot: null,
  status: 'idle',
  pending: false,
  error: null,
  filterTeam: null,
  setFilterTeam: (filterTeam) => set({ filterTeam }),
  event: 'killingspree',
  confirm: null,
  playingId: null,
  show: () => {
    set({ open: true, error: null, confirm: null })
    void get().load()
  },
  close: () => {
    if (get().pending) return
    stopAudio()
    set({ open: false, confirm: null, playingId: null })
  },
  setEvent: (event) => {
    stopAudio()
    set({ event, playingId: null })
  },
  choosePurchase: (confirm) => set({ confirm, error: null }),
  load: async () => {
    const generation = accountGeneration
    const request = ++loadGeneration
    set({ status: 'loading', error: null })
    try {
      const snapshot = await window.api.skins.musicKits()
      if (generation === accountGeneration && request === loadGeneration)
        set({ snapshot, status: 'ready' })
    } catch (e) {
      if (generation === accountGeneration && request === loadGeneration)
        set({ status: 'error', error: errorKey(e) })
    }
  },
  buy: async () => {
    const kit = get().confirm
    if (!kit || get().pending) return
    const generation = accountGeneration
    set({ pending: true, error: null })
    try {
      const result = await window.api.skins.musicBuy(kit.id, kit.pricePoints)
      if (generation !== accountGeneration) return
      useAuthStore.getState().setPoints(result.points)
      set({ confirm: null })
      await get().load()
    } catch (e) {
      if (generation === accountGeneration) set({ error: errorKey(e) })
    } finally {
      if (generation === accountGeneration) set({ pending: false })
    }
  },
  equip: async (id, team) => {
    if (get().pending) return
    const generation = accountGeneration
    set({ pending: true, error: null })
    try {
      await window.api.skins.musicEquip(id, team)
      if (generation === accountGeneration) await get().load()
    } catch (e) {
      if (generation === accountGeneration) set({ error: errorKey(e) })
    } finally {
      if (generation === accountGeneration) set({ pending: false })
    }
  },
  stopPreview: () => {
    stopAudio()
    set({ playingId: null })
  },
  preview: async (id) => {
    const wasPlaying = get().playingId === id
    stopAudio()
    set({ playingId: null, error: null })
    if (wasPlaying) return
    const generation = previewGeneration
    set({ playingId: id })
    try {
      const bytes = await window.api.skins.musicPreview(id, get().event)
      if (generation !== previewGeneration) return
      audioUrl = URL.createObjectURL(new Blob([bytes], { type: 'audio/wav' }))
      audio = new Audio(audioUrl)
      audio.onended = () => {
        stopAudio()
        set({ playingId: null })
      }
      await audio.play()
    } catch (e) {
      if (generation === previewGeneration) {
        stopAudio()
        set({ playingId: null, error: errorKey(e) })
      }
    }
  }
}))
useAuthStore.subscribe((state, previous) => {
  if (state.session?.player.id === previous.session?.player.id) return
  accountGeneration++
  stopAudio()
  useMusicKitsStore.setState({
    open: false,
    snapshot: null,
    status: 'idle',
    pending: false,
    error: null,
    confirm: null,
    playingId: null,
    filterTeam: null
  })
})
