import { create } from 'zustand'
import type { NewsVisibility } from '../../../../shared/news'

interface NewsVisibilityState {
  visibility: NewsVisibility | null
  refresh: () => Promise<void>
}

export const useNewsVisibilityStore = create<NewsVisibilityState>((set) => ({
  visibility: null,
  refresh: async () => {
    try {
      set({ visibility: await window.api.news.getVisibility() })
    } catch (error) {
      console.error('[News] failed to load visibility', error)
      // Keep the last verified setting; older API deployments retain the existing behavior.
      set((state) =>
        state.visibility
          ? state
          : {
              visibility: { popupEnabled: true, railEnabled: true }
            }
      )
    }
  }
}))
