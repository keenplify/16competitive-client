import { createStore } from 'zustand/vanilla'

export type PreviewAction =
  'draw' | 'idle' | 'fire' | 'reload' | 'charge' | 'hold' | 'throw' | 'flight' | 'explosion'
export type PreviewWeaponKind = 'firearm' | 'knife' | 'grenade'
export const GRENADE_FLIGHT_MS = 650
export const GRENADE_EXPLOSION_MS = 600

interface PreviewPlayback {
  action: PreviewAction
  held: boolean
  restart: number
  burst: number
  spread: number
  press(): void
  release(): void
  cancel(): void
  finish(): void
  fire(): void
  reload(): void
  settle(): void
}

/** A private playback session per modal; never persisted or shared between skins. */
export function createFirstPersonPreviewStore(kind: PreviewWeaponKind) {
  return createStore<PreviewPlayback>((set, get) => ({
    action: 'draw',
    held: false,
    restart: 0,
    burst: 0,
    spread: 0,
    press: () => {
      const state = get()
      if (kind === 'grenade') {
        if (state.action !== 'idle') return
        set({ held: true, action: 'charge', restart: state.restart + 1 })
      } else {
        set({ held: true })
        get().fire()
      }
    },
    release: () => {
      const state = get()
      set({
        held: false,
        ...(kind === 'grenade' && state.action === 'hold'
          ? { action: 'throw' as const, restart: state.restart + 1 }
          : {})
      })
    },
    cancel: () => {
      const state = get()
      set({
        held: false,
        spread: 0,
        ...(kind === 'grenade' ? { action: 'draw' as const, restart: state.restart + 1 } : {})
      })
    },
    finish: () => {
      const state = get()
      switch (state.action) {
        case 'charge':
          set({
            action: state.held ? 'hold' : 'throw',
            ...(state.held ? {} : { restart: state.restart + 1 })
          })
          break
        case 'throw':
          set({ action: 'flight' })
          break
        case 'flight':
          set({ action: 'explosion', burst: state.burst + 1 })
          break
        case 'explosion':
          set({ action: 'draw', restart: state.restart + 1 })
          break
        case 'hold':
          break
        case 'fire':
          if (state.held && kind === 'knife') get().fire()
          else if (!state.held) set({ action: 'idle' })
          break
        default:
          set({ action: 'idle' })
      }
    },
    fire: () => {
      if (kind === 'grenade') return
      set((state) => ({
        action: 'fire',
        restart: state.restart + 1,
        spread: Math.min(8, state.spread + 2)
      }))
    },
    reload: () => {
      if (kind !== 'firearm') return
      set((state) => ({ held: false, action: 'reload', restart: state.restart + 1 }))
    },
    settle: () => set((state) => ({ spread: Math.max(0, state.spread - 1) }))
  }))
}
