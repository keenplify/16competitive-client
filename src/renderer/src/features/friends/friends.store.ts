import { create } from 'zustand'
import type {
  FriendPlayer,
  FriendSearchResult,
  IncomingFriendRequest
} from '../../../../shared/friends'

interface FriendsState {
  friends: FriendPlayer[]
  incomingRequests: IncomingFriendRequest[]
  query: string
  results: FriendSearchResult[]
  loading: boolean
  searching: boolean
  actingPlayerId: string | null
  error: string | null
  notice: string | null
  start: () => void
  stop: () => void
  refresh: () => Promise<void>
  setQuery: (query: string) => void
  search: () => Promise<void>
  request: (playerId: string) => Promise<void>
  accept: (requestId: string) => Promise<void>
  discard: (requestId: string) => Promise<void>
  remove: (playerId: string) => Promise<void>
  reset: () => void
}

let removeEventListener: (() => void) | null = null
let refreshInFlight: Promise<void> | null = null
let refreshTimer: number | null = null

const readableError = (error: unknown): string =>
  error instanceof Error ? error.message : 'Friends request failed.'

export const useFriendsStore = create<FriendsState>((set, get) => ({
  friends: [],
  incomingRequests: [],
  query: '',
  results: [],
  loading: false,
  searching: false,
  actingPlayerId: null,
  error: null,
  notice: null,

  start: () => {
    if (removeEventListener) return
    removeEventListener = window.api.matchmaking.onEvent((event) => {
      if (
        event.type === 'authenticated' ||
        event.type === 'friend_request_received' ||
        event.type === 'friends_updated'
      ) {
        void get().refresh()
      }
    })
    void get().refresh()
    refreshTimer = window.setInterval(() => void get().refresh(), 20_000)
  },

  stop: () => {
    removeEventListener?.()
    removeEventListener = null
    if (refreshTimer !== null) window.clearInterval(refreshTimer)
    refreshTimer = null
  },

  refresh: async () => {
    if (refreshInFlight) return refreshInFlight
    set({ loading: true })
    const operation = window.api.friends
      .list()
      .then((snapshot) => {
        set({ ...snapshot, loading: false, error: null })
      })
      .catch((error: unknown) => {
        set({ loading: false, error: readableError(error) })
      })
    refreshInFlight = operation
    try {
      await operation
    } finally {
      if (refreshInFlight === operation) refreshInFlight = null
    }
  },

  setQuery: (query) =>
    set({
      query: query.slice(0, 32),
      results: query.trim().length < 2 ? [] : get().results,
      error: null,
      notice: null
    }),

  search: async () => {
    const query = get().query.trim()
    if (query.length < 2) {
      set({ results: [], searching: false })
      return
    }
    set({ searching: true, error: null })
    try {
      const results = await window.api.friends.search(query)
      if (get().query.trim() === query) set({ results, searching: false })
    } catch (error) {
      if (get().query.trim() === query) {
        set({ searching: false, error: readableError(error) })
      }
    }
  },

  request: async (playerId) => {
    set({ actingPlayerId: playerId, error: null, notice: null })
    try {
      await window.api.friends.request(playerId)
      await Promise.all([get().refresh(), get().search()])
      set({ actingPlayerId: null, notice: 'Friend request sent.' })
    } catch (error) {
      set({ actingPlayerId: null, error: readableError(error) })
    }
  },

  accept: async (requestId) => {
    set({ actingPlayerId: requestId, error: null, notice: null })
    try {
      await window.api.friends.accept(requestId)
      await get().refresh()
      set({ actingPlayerId: null, notice: 'Friend request accepted.' })
    } catch (error) {
      set({ actingPlayerId: null, error: readableError(error) })
    }
  },

  discard: async (requestId) => {
    set({ actingPlayerId: requestId, error: null, notice: null })
    try {
      await window.api.friends.discard(requestId)
      await get().refresh()
      set({ actingPlayerId: null })
    } catch (error) {
      set({ actingPlayerId: null, error: readableError(error) })
    }
  },

  remove: async (playerId) => {
    set({ actingPlayerId: playerId, error: null, notice: null })
    try {
      await window.api.friends.remove(playerId)
      await get().refresh()
      set({ actingPlayerId: null })
    } catch (error) {
      set({ actingPlayerId: null, error: readableError(error) })
    }
  },

  reset: () => {
    get().stop()
    set({
      friends: [],
      incomingRequests: [],
      query: '',
      results: [],
      loading: false,
      searching: false,
      actingPlayerId: null,
      error: null,
      notice: null
    })
  }
}))
