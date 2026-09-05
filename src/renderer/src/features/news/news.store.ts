import { create } from 'zustand'
import type { NewsPost } from '../../../../shared/news'

type NewsStatus = 'idle' | 'loading' | 'ready' | 'refreshing' | 'error'

interface NewsState {
  previewPosts: NewsPost[]
  previewStatus: NewsStatus
  allPosts: NewsPost[]
  allStatus: NewsStatus
  loadPreview: () => Promise<void>
  loadAll: () => Promise<void>
}

let latestPreviewRequest = 0
let latestAllRequest = 0

export const useNewsStore = create<NewsState>((set, get) => ({
  previewPosts: [],
  previewStatus: 'idle',
  allPosts: [],
  allStatus: 'idle',

  loadPreview: async () => {
    if (get().previewStatus === 'loading') return
    const request = ++latestPreviewRequest
    set({ previewStatus: 'loading' })
    try {
      const previewPosts = await window.api.news.getPreview()
      if (request === latestPreviewRequest) set({ previewPosts, previewStatus: 'ready' })
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      console.error('[News] failed to load posts', error)
      if (request === latestPreviewRequest) set({ previewStatus: 'error' })
    }
  },

  loadAll: async () => {
    const { allPosts, allStatus } = get()
    if (allStatus === 'loading' || allStatus === 'refreshing') return

    const request = ++latestAllRequest
    set({ allStatus: allPosts.length > 0 ? 'refreshing' : 'loading' })
    try {
      const nextPosts = await window.api.news.getAll()
      if (request === latestAllRequest) set({ allPosts: nextPosts, allStatus: 'ready' })
    } catch (error) {
      console.error('[News] failed to load all posts', error)
      if (request === latestAllRequest) {
        set({ allStatus: allPosts.length > 0 ? 'ready' : 'error' })
      }
    }
  }
}))
