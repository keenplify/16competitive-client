import { create } from 'zustand'
import type { AdminDemo } from '../../../../shared/admin-demos'
interface State {
  allowed: boolean
  rows: AdminDemo[]
  page: number
  hasMore: boolean
  loading: boolean
  watching: string | null
  message: string
  error: string
  generation: number
  reset(): void
  load(page?: number): Promise<void>
  watch(id: string): Promise<void>
}
export const useAdminDemosStore = create<State>((set, get) => ({
  allowed: false,
  rows: [],
  page: 1,
  hasMore: false,
  loading: false,
  watching: null,
  message: '',
  error: '',
  generation: 0,
  reset: () =>
    set({
      allowed: false,
      rows: [],
      error: '',
      message: '',
      watching: null,
      generation: get().generation + 1
    }),
  load: async (page = 1) => {
    if (!window.api.adminDemos) return
    const generation = get().generation
    set({ loading: true, error: '' })
    try {
      const data = await window.api.adminDemos.list(page)
      if (generation !== get().generation) return
      set({ allowed: !!data, rows: data?.recordings ?? [], hasMore: data?.hasMore ?? false, page })
    } catch (error) {
      if (generation === get().generation)
        set({ error: error instanceof Error ? error.message : 'Could not load demos.' })
    } finally {
      if (generation === get().generation) set({ loading: false })
    }
  },
  watch: async (id) => {
    if (!window.api.adminDemos || get().watching) return
    const generation = get().generation
    set({ watching: id, error: '', message: 'Downloading and preparing demo…' })
    try {
      await window.api.adminDemos.watch(id)
      if (generation === get().generation)
        set({ message: 'Playback launch sent to Counter-Strike.' })
    } catch (error) {
      if (generation === get().generation)
        set({ message: '', error: error instanceof Error ? error.message : 'Could not play demo.' })
    } finally {
      if (generation === get().generation) set({ watching: null })
    }
  }
}))
