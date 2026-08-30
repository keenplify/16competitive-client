import { create } from 'zustand'
import { fetchNewsPosts, type NewsPost } from './news.api'

type NewsStatus = 'idle' | 'loading' | 'ready' | 'refreshing' | 'error'

interface NewsState {
  posts: NewsPost[]
  status: NewsStatus
  loadPreview: () => Promise<void>
  loadAll: () => Promise<void>
}

let latestNewsRequest = 0

export const useNewsStore = create<NewsState>((set, get) => ({
  posts: [],
  status: 'idle',

  loadPreview: async () => {
    const { status } = get()
    if (status === 'loading' || status === 'refreshing' || status === 'ready') return

    const request = ++latestNewsRequest
    set({ status: 'loading' })
    try {
      const posts = await fetchNewsPosts(3, new AbortController().signal)
      if (request === latestNewsRequest) set({ posts, status: 'ready' })
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      console.error('[News] failed to load posts', error)
      if (request === latestNewsRequest) set({ status: 'error' })
    }
  },

  loadAll: async () => {
    const { posts, status } = get()
    if (status === 'refreshing') return

    const request = ++latestNewsRequest
    set({ status: posts.length > 0 ? 'refreshing' : 'loading' })
    try {
      const nextPosts = await fetchNewsPosts(20, new AbortController().signal)
      if (request === latestNewsRequest) set({ posts: nextPosts, status: 'ready' })
    } catch (error) {
      console.error('[News] failed to load all posts', error)
      if (request === latestNewsRequest) set({ status: posts.length > 0 ? 'ready' : 'error' })
    }
  }
}))
