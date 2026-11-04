import type { Projection, StickerAtlas } from '../../libs/web-hlmv/lib/sticker-atlas'
import { create } from 'zustand'
import type { StickerPixels, StickerPlacement } from '../../../../shared/sticker-model'
import type { StickerEditorApi, EditorResult } from '../../../../shared/sticker-editor'

declare global {
  interface Window {
    stickerEditor: StickerEditorApi
  }
}
type State = {
  viewportFailed: boolean
  model?: Uint8Array
  applied: { sticker: StickerPixels; projection: Projection }[]
  atlas?: StickerAtlas
  projection?: Projection
  setProjection: (projection: Projection, texture: number) => void
  sticker?: StickerPixels
  placement: StickerPlacement
  placed: boolean
  busy: boolean
  message: string
  output: string
  setPlacement: (patch: Partial<StickerPlacement>) => void
  run: (action: 'load' | 'importSticker' | 'exportModel' | 'launch') => Promise<void>
}
export const useStickerEditor = create<State>((set, get) => ({
  viewportFailed: false,
  applied: [],
  placement: { texture: 0, u: 0.5, v: 0.5, size: 0.18, angle: 0 },
  placed: false,
  busy: false,
  message: '',
  output: '',
  setPlacement: (patch) =>
    set((state) => ({
      placement: { ...state.placement, ...patch },
      projection: state.projection
        ? {
            ...state.projection,
            size: patch.size ?? state.projection.size,
            angle: patch.angle ?? state.projection.angle
          }
        : undefined
    })),
  setProjection: (projection, texture) =>
    set((state) => ({
      projection,
      placed: true,
      message: '',
      placement: { ...state.placement, texture }
    })),
  run: async (action) => {
    if (get().busy) return
    set({ busy: true, message: 'pending' })
    try {
      const api = window.stickerEditor
      if (!api) throw new Error('io')
      let result: EditorResult<unknown>
      if (action === 'load') {
        const loaded = await api.load()
        result = loaded
        if (loaded.ok)
          set({
            model: new Uint8Array(loaded.value.atlas.model),
            atlas: loaded.value.atlas,
            sticker: loaded.value.sticker,
            placed: false,
            projection: undefined
          })
      } else if (action === 'importSticker') {
        const imported = await api.importSticker()
        result = imported
        if (imported.ok) set({ sticker: imported.value })
      } else {
        const saved = await api[action](get().projection!)
        result = saved
        if (saved.ok) set({ output: saved.value })
      }
      set({ message: result.ok ? (action === 'launch' ? 'launched' : 'success') : result.error })
    } catch {
      set({ message: 'io' })
    } finally {
      set({ busy: false })
    }
  }
}))
