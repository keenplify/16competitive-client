import { create } from 'zustand'
import type { DailyQuestSnapshot } from '../../../../shared/daily-quests'

interface DailyQuestState {
  status: 'idle' | 'loading' | 'ready' | 'error'
  snapshot: DailyQuestSnapshot | null
  error: string | null
  load: () => Promise<void>
  refresh: () => Promise<void>
}

const loadSnapshot = async (): Promise<DailyQuestSnapshot> => window.api.dailyQuests.get()

export const useDailyQuestStore = create<DailyQuestState>((set, get) => ({
  status: 'idle',
  snapshot: null,
  error: null,
  load: async () => {
    if (get().status === 'loading' || get().status === 'ready') return
    set({ status: 'loading', error: null })
    try {
      set({ status: 'ready', snapshot: await loadSnapshot(), error: null })
    } catch (error) {
      set({
        status: 'error',
        error: error instanceof Error ? error.message : 'Could not load daily quests.'
      })
    }
  },
  refresh: async () => {
    set({ status: 'loading', error: null })
    try {
      set({ status: 'ready', snapshot: await loadSnapshot(), error: null })
    } catch (error) {
      set({
        status: 'error',
        error: error instanceof Error ? error.message : 'Could not refresh daily quests.'
      })
    }
  }
}))
