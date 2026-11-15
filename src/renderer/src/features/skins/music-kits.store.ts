import { launcherAudio } from '../audio/audio.manager'
import { musicKitPreviewEvent } from '../../../../shared/music-kits'
import { usePaymentsStore } from './payments.store'
import type { MusicCurrency } from '../../../../shared/music-kits'
import { create } from 'zustand'
import type {
  MusicMix,
  MusicEvent,
  MusicKit,
  MusicKitSnapshot,
  MusicTeam
} from '../../../../shared/music-kits'
import { useAuthStore } from '../auth/auth.store'
import { toast } from 'react-toastify'
import { translate, useLanguageStore, type TranslationKey } from '../i18n/i18n'

type MusicState = {
  mixerTeam: MusicTeam | null
  openMixer: (team: MusicTeam) => void
  closeMixer: () => void
  saveMix: (mix: MusicMix) => Promise<void>
  selectMvp: (id: string | null) => Promise<void>
  playingEvent: MusicEvent | null
  open: boolean
  snapshot: MusicKitSnapshot | null
  status: 'idle' | 'loading' | 'ready' | 'error'
  pending: boolean
  error:
    | 'music.error'
    | 'music.insufficient'
    | 'music.changed'
    | 'music.insufficientCash'
    | 'music.currencyUnavailable'
    | null
  event: MusicEvent
  currency: MusicCurrency
  setCurrency: (currency: MusicCurrency) => void
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
  preview: (id: string, event?: MusicEvent) => Promise<void>
  stopPreview: () => void
}
let releasePreviewMute: (() => void) | null = null
let audio: HTMLAudioElement | null = null
let audioUrl: string | null = null
let previewGeneration = 0
let accountGeneration = 0
let loadGeneration = 0
const stopAudio = (): void => {
  previewGeneration++
  releasePreviewMute?.()
  releasePreviewMute = null
  audio?.pause()
  audio = null
  if (audioUrl) URL.revokeObjectURL(audioUrl)
  audioUrl = null
}
const errorKey = (error: unknown): MusicState['error'] => {
  const message = error instanceof Error ? error.message : ''
  return message.includes('INSUFFICIENT_P_CASH')
    ? 'music.insufficientCash'
    : message.includes('MUSIC_CURRENCY_UNAVAILABLE')
      ? 'music.currencyUnavailable'
      : message.includes('INSUFFICIENT_POINTS')
        ? 'music.insufficient'
        : message.includes('MUSIC_PRICE_CHANGED')
          ? 'music.changed'
          : 'music.error'
}
export const MUSIC_MIXER_TOAST_ID = 'music-mixer'
export const useMusicKitsStore = create<MusicState>((set, get) => ({
  mixerTeam: null,
  openMixer: (mixerTeam) => {
    get().stopPreview()
    set({ mixerTeam })
  },
  closeMixer: () => {
    if (get().pending) return
    get().stopPreview()
    set({ mixerTeam: null })
  },
  saveMix: async (mix) => {
    if (get().pending) return
    const generation = accountGeneration
    const t = (key: TranslationKey): string => translate(useLanguageStore.getState().language, key)
    const target = { containerId: get().mixerTeam ? MUSIC_MIXER_TOAST_ID : undefined }
    const feedback = toast.loading(t('music.processing'), target)
    get().stopPreview()
    set({ pending: true, error: null })
    try {
      const snapshot = await window.api.skins.musicMix(mix)
      if (generation !== accountGeneration) throw new Error('ACCOUNT_CHANGED')
      ++loadGeneration
      set({ snapshot, status: 'ready' })
      toast.update(feedback, {
        ...target,
        render: t('music.mixSaved'),
        type: 'success',
        isLoading: false,
        autoClose: 3000
      })
    } catch (e) {
      if (generation === accountGeneration) set({ error: errorKey(e) })
      toast.update(feedback, {
        ...target,
        render: t(errorKey(e) ?? 'music.error'),
        type: 'error',
        isLoading: false,
        autoClose: 5000
      })
    } finally {
      if (generation === accountGeneration) set({ pending: false })
    }
  },
  selectMvp: async (id) => {
    const current = get().snapshot?.mix ?? { muted: false, cues: {} }
    await get().saveMix({
      ...current,
      muted: id === null ? current.muted : false,
      cues: { ...current.cues, mvp: id, roundmvpanthem_02: id, roundmvpanthem_03: id }
    })
  },
  playingEvent: null,
  open: false,
  snapshot: null,
  status: 'idle',
  pending: false,
  error: null,
  filterTeam: null,
  setFilterTeam: (filterTeam) => set({ filterTeam }),
  event: 'mvp',
  currency: 'POINTS',
  setCurrency: (currency) => set({ currency, error: null }),
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
  choosePurchase: (confirm) =>
    set({ confirm, currency: confirm?.pointsEnabled === false ? 'P_CASH' : 'POINTS', error: null }),
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
    const currency = get().currency
    const price =
      currency === 'POINTS'
        ? kit.pointsEnabled === false
          ? null
          : kit.pricePoints
        : (kit.pricePCash ?? null)
    if (price === null) {
      set({ error: 'music.currencyUnavailable' })
      return
    }
    const t = (key: TranslationKey): string => translate(useLanguageStore.getState().language, key)
    const feedback = toast.loading(t('music.processing'))
    set({ pending: true, error: null })
    try {
      const result = await window.api.skins.musicBuy(kit.id, price, currency)
      if (generation !== accountGeneration) throw new Error('ACCOUNT_CHANGED')
      useAuthStore.getState().setPoints(result.points)
      if (result.pCash !== undefined)
        usePaymentsStore.setState((state) => ({
          snapshot: state.snapshot ? { ...state.snapshot, pCash: result.pCash! } : null
        }))
      set({ confirm: null })
      await get().load()
      toast.update(feedback, {
        render: t('music.purchased'),
        type: 'success',
        isLoading: false,
        autoClose: 5000
      })
    } catch (e) {
      toast.update(feedback, {
        render: t(errorKey(e) ?? 'music.error'),
        type: 'error',
        isLoading: false,
        autoClose: 5000
      })
      if (generation === accountGeneration) set({ error: errorKey(e) })
    } finally {
      if (generation === accountGeneration) set({ pending: false })
    }
  },
  equip: async (id, team) => {
    if (get().pending) return
    const generation = accountGeneration
    const t = (key: TranslationKey): string => translate(useLanguageStore.getState().language, key)
    const feedback = toast.loading(t('music.processing'))
    set({ pending: true, error: null })
    try {
      await window.api.skins.musicEquip(id, team)
      if (generation === accountGeneration) await get().load()
      const error = get().error
      toast.update(feedback, {
        render: t(
          generation !== accountGeneration
            ? 'music.error'
            : (error ?? (id === null ? 'music.deactivated' : 'music.activated'))
        ),
        type: generation !== accountGeneration || error ? 'error' : 'success',
        isLoading: false,
        autoClose: 5000
      })
    } catch (e) {
      if (generation === accountGeneration) set({ error: errorKey(e) })
      toast.update(feedback, {
        render: t(errorKey(e) ?? 'music.error'),
        type: 'error',
        isLoading: false,
        autoClose: 5000
      })
    } finally {
      if (generation === accountGeneration) set({ pending: false })
    }
  },
  stopPreview: () => {
    stopAudio()
    set({ playingId: null, playingEvent: null })
  },
  preview: async (id, requested) => {
    const wasPlaying = get().playingId === id && (!requested || get().playingEvent === requested)
    stopAudio()
    set({ playingId: null, playingEvent: null, error: null })
    if (wasPlaying) return
    const kit = get().snapshot?.kits.find((kit) => kit.id === id)
    const event = kit
      ? requested
        ? kit.sounds[requested]
          ? requested
          : undefined
        : musicKitPreviewEvent(kit, get().event)
      : undefined
    const t = (key: TranslationKey): string => translate(useLanguageStore.getState().language, key)
    const target = { containerId: get().mixerTeam ? MUSIC_MIXER_TOAST_ID : undefined }
    const feedback = toast.loading(t('music.processing'), target)
    let feedbackSettled = false
    const generation = previewGeneration
    set({ playingId: id, playingEvent: event ?? null })
    try {
      if (!event) throw new Error('MUSIC_PREVIEW_UNAVAILABLE')
      const bytes = await window.api.skins.musicPreview(id, event)
      if (generation !== previewGeneration) return
      audioUrl = URL.createObjectURL(
        new Blob([bytes], {
          type:
            new Uint8Array(bytes).subarray(0, 4).toString() === '82,73,70,70'
              ? 'audio/wav'
              : 'audio/mpeg'
        })
      )
      audio = new Audio(audioUrl)
      audio.onended = () => {
        if (generation !== previewGeneration) return
        stopAudio()
        set({ playingId: null, playingEvent: null })
      }
      let started = false
      audio.onerror = () => {
        if (!started || generation !== previewGeneration) return
        stopAudio()
        set({ playingId: null, playingEvent: null, error: 'music.error' })
        toast.error(t('music.error'), target)
      }
      releasePreviewMute = launcherAudio.muteBgmForPreview()
      await audio.play()
      if (generation !== previewGeneration) return
      started = true
      feedbackSettled = true
      toast.update(feedback, {
        ...target,
        render: t('music.preview'),
        type: 'success',
        isLoading: false,
        autoClose: 2000
      })
    } catch (e) {
      if (generation !== previewGeneration) return
      feedbackSettled = true
      toast.update(feedback, {
        ...target,
        render: t(errorKey(e) ?? 'music.error'),
        type: 'error',
        isLoading: false,
        autoClose: 5000
      })
      if (generation === previewGeneration) {
        stopAudio()
        set({ playingId: null, playingEvent: null, error: errorKey(e) })
      }
    } finally {
      if (!feedbackSettled && generation !== previewGeneration) {
        if (target.containerId) toast.dismiss({ id: feedback, containerId: target.containerId })
        else toast.dismiss(feedback)
      }
    }
  }
}))
useAuthStore.subscribe((state, previous) => {
  if (state.session?.player.id === previous.session?.player.id) return
  accountGeneration++
  stopAudio()
  useMusicKitsStore.setState({
    mixerTeam: null,
    playingEvent: null,
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
