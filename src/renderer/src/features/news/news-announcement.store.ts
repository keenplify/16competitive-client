import { create } from 'zustand'
import type { NewsPost } from '../../../../shared/news'

type DismissedPost = Pick<NewsPost, 'id' | 'createdAt'>
const storageKey = (playerId: string): string => `16competitive.news.dismissed.${playerId}`

const readDismissed = (playerId: string): DismissedPost | null => {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(storageKey(playerId)) ?? 'null')
    if (typeof value !== 'object' || value === null) return null
    const post = value as Record<string, unknown>
    return typeof post.id === 'string' &&
      typeof post.createdAt === 'string' &&
      Number.isFinite(Date.parse(post.createdAt))
      ? { id: post.id, createdAt: post.createdAt }
      : null
  } catch {
    return null
  }
}

const comparePosts = (a: DismissedPost, b: DismissedPost): number =>
  Date.parse(a.createdAt) - Date.parse(b.createdAt) ||
  a.id.length - b.id.length ||
  a.id.localeCompare(b.id)

interface NewsAnnouncementState {
  playerId: string | null
  post: NewsPost | null
  dismissed: DismissedPost | null
  setAccount: (playerId: string | null) => void
  refresh: () => Promise<void>
  dismiss: () => void
}

let generation = 0
let pendingGeneration: number | null = null

export const useNewsAnnouncementStore = create<NewsAnnouncementState>((set, get) => ({
  playerId: null,
  post: null,
  dismissed: null,
  setAccount: (playerId) => {
    if (playerId === get().playerId) return
    generation++
    set({ playerId, post: null, dismissed: playerId ? readDismissed(playerId) : null })
  },
  refresh: async () => {
    const { playerId } = get()
    if (!playerId || pendingGeneration === generation) return
    const requestGeneration = generation
    pendingGeneration = requestGeneration
    try {
      // The preview is pinned-first and truncated; it cannot identify the newest post.
      const posts = await window.api.news.getAll()
      if (requestGeneration !== generation) return
      const newest = posts
        .filter((post) => Number.isFinite(Date.parse(post.createdAt)))
        .sort((a, b) => comparePosts(b, a))[0]
      const { post, dismissed } = get()
      if (newest && !post && (!dismissed || comparePosts(newest, dismissed) > 0)) {
        set({ post: newest })
      }
    } catch (error) {
      console.error('[News] failed to check announcements', error)
    } finally {
      if (pendingGeneration === requestGeneration) pendingGeneration = null
    }
  },
  dismiss: () => {
    const { playerId, post } = get()
    if (!playerId || !post) return
    const dismissed = { id: post.id, createdAt: post.createdAt }
    set({ post: null, dismissed })
    try {
      window.localStorage.setItem(storageKey(playerId), JSON.stringify(dismissed))
    } catch (error) {
      // Retain the in-memory dismissal when device storage is unavailable.
      console.error('[News] failed to save announcement dismissal', error)
    }
  }
}))
