import { create } from 'zustand'
import type { FriendChatMessage, FriendPlayer } from '../../../../shared/friends'
import { useAuthStore } from '../auth/auth.store'
import { playFriendMessageSound } from './friend-message-sound'

type ChatFriend = Pick<FriendPlayer, 'id' | 'username'>

export interface FriendConversation {
  friend: ChatFriend
  messages: FriendChatMessage[]
  draft: string
  loading: boolean
  sending: boolean
  error: string | null
  unread: number
}

interface FriendChatState {
  openFriendIds: string[]
  activeFriendId: string | null
  conversations: Record<string, FriendConversation>
  start: () => void
  stop: () => void
  open: (friend: ChatFriend) => Promise<void>
  close: (friendId: string) => void
  select: (friendId: string) => void
  setDraft: (friendId: string, draft: string) => void
  send: (friendId: string) => Promise<void>
  refresh: (friendId: string) => Promise<void>
  refreshOpen: () => Promise<void>
  reset: () => void
}

interface OfflineConversation {
  friend: ChatFriend
  messages: FriendChatMessage[]
  unread: number
  latestIncomingAt: number
}

let removeEventListener: (() => void) | null = null
let beforeUnloadHandler: (() => void) | null = null
let activePlayerId: string | null = null
let canAdvanceOfflineMarker = true
let bootstrapGeneration = 0
const refreshInFlight = new Map<string, Promise<void>>()

const readableError = (error: unknown): string =>
  error instanceof Error ? error.message : 'Private chat request failed.'

const compareMessages = (left: FriendChatMessage, right: FriendChatMessage): number => {
  const timeDifference = Date.parse(left.sentAt) - Date.parse(right.sentAt)
  return timeDifference || left.id.localeCompare(right.id)
}

const mergeMessages = (...messageGroups: FriendChatMessage[][]): FriendChatMessage[] => {
  const messagesById = new Map<string, FriendChatMessage>()
  for (const messages of messageGroups) {
    for (const message of messages) messagesById.set(message.id, message)
  }
  return [...messagesById.values()].sort(compareMessages).slice(-10)
}

const mergeMessage = (
  messages: FriendChatMessage[],
  message: FriendChatMessage
): FriendChatMessage[] => mergeMessages(messages, [message])

const offlineMarkerKey = (playerId: string): string => `friend-chat:last-offline:${playerId}`

const readOfflineMarker = (playerId: string): string | null => {
  try {
    const value = window.localStorage.getItem(offlineMarkerKey(playerId))
    return value && Number.isFinite(Date.parse(value)) ? value : null
  } catch {
    return null
  }
}

const writeOfflineMarker = (playerId: string, at = new Date().toISOString()): void => {
  try {
    window.localStorage.setItem(offlineMarkerKey(playerId), at)
  } catch {
    // Chat still works if local persistence is unavailable.
  }
}

const bootstrapOfflineChats = async (
  playerId: string,
  offlineSince: string,
  generation: number,
  set: (
    partial:
      | Partial<FriendChatState>
      | ((state: FriendChatState) => Partial<FriendChatState> | FriendChatState)
  ) => void,
  get: () => FriendChatState
): Promise<void> => {
  const offlineSinceMs = Date.parse(offlineSince)
  const snapshot = await window.api.friends.list()
  const histories = await Promise.all(
    snapshot.friends.map(async (friend) => ({
      friend: { id: friend.id, username: friend.username },
      messages: await window.api.friends.getChatHistory(friend.id)
    }))
  )

  if (generation !== bootstrapGeneration || activePlayerId !== playerId) return

  const offlineConversations: OfflineConversation[] = histories
    .map(({ friend, messages }) => {
      const incoming = messages.filter(
        (message) =>
          message.recipientPlayerId === playerId &&
          message.sender.id === friend.id &&
          Date.parse(message.sentAt) > offlineSinceMs
      )
      if (incoming.length === 0) return null
      return {
        friend,
        messages,
        unread: incoming.length,
        latestIncomingAt: Math.max(...incoming.map((message) => Date.parse(message.sentAt)))
      }
    })
    .filter((conversation): conversation is OfflineConversation => conversation !== null)
    .sort((left, right) => right.latestIncomingAt - left.latestIncomingAt)

  const stateBeforeBootstrap = get()
  const hasNewOfflineMessage = offlineConversations.some(({ friend, messages }) => {
    const knownIds = new Set(
      (stateBeforeBootstrap.conversations[friend.id]?.messages ?? []).map((message) => message.id)
    )
    return messages.some(
      (message) =>
        message.recipientPlayerId === playerId &&
        Date.parse(message.sentAt) > offlineSinceMs &&
        !knownIds.has(message.id)
    )
  })

  if (offlineConversations.length > 0) {
    const focusedFriendId = offlineConversations[0].friend.id
    const offlineFriendIds = offlineConversations.map(({ friend }) => friend.id)

    set((state) => {
      const conversations = { ...state.conversations }
      for (const offlineConversation of offlineConversations) {
        const existing = conversations[offlineConversation.friend.id]
        conversations[offlineConversation.friend.id] = {
          ...(existing ?? {
            draft: '',
            loading: false,
            sending: false,
            error: null,
            unread: 0
          }),
          friend: offlineConversation.friend,
          messages: mergeMessages(existing?.messages ?? [], offlineConversation.messages),
          loading: false,
          error: null,
          unread:
            offlineConversation.friend.id === focusedFriendId
              ? 0
              : Math.max(existing?.unread ?? 0, offlineConversation.unread)
        }
      }

      return {
        openFriendIds: [
          ...offlineFriendIds,
          ...state.openFriendIds.filter((friendId) => !offlineFriendIds.includes(friendId))
        ],
        activeFriendId: focusedFriendId,
        conversations
      }
    })

    if (hasNewOfflineMessage) {
      playFriendMessageSound()
      void window.api.friends.requestAttention()
    }
  }

  if (generation === bootstrapGeneration && activePlayerId === playerId) {
    canAdvanceOfflineMarker = true
    writeOfflineMarker(playerId)
  }
}

export const useFriendChatStore = create<FriendChatState>((set, get) => ({
  openFriendIds: [],
  activeFriendId: null,
  conversations: {},

  start: () => {
    const playerId = useAuthStore.getState().session?.player.id
    if (!playerId) return
    if (removeEventListener && activePlayerId === playerId) return

    if (removeEventListener) get().stop()

    activePlayerId = playerId
    const generation = ++bootstrapGeneration
    const offlineSince = readOfflineMarker(playerId)
    canAdvanceOfflineMarker = offlineSince === null

    if (!offlineSince) writeOfflineMarker(playerId)

    removeEventListener = window.api.matchmaking.onEvent((event) => {
      if (event.type !== 'friend_chat_message') return

      const currentPlayerId = useAuthStore.getState().session?.player.id
      if (!currentPlayerId || currentPlayerId !== activePlayerId) return

      const message = event.message
      const incoming =
        message.recipientPlayerId === currentPlayerId && message.sender.id !== currentPlayerId
      const friendId = incoming ? message.sender.id : message.recipientPlayerId
      const current = get().conversations[friendId]
      const alreadyKnown = current?.messages.some((entry) => entry.id === message.id) ?? false

      if (incoming && !alreadyKnown) {
        playFriendMessageSound()
        void window.api.friends.requestAttention()
      }

      if (!incoming && !current) return

      set((state) => {
        const conversation = state.conversations[friendId]
        const wasKnown = conversation?.messages.some((entry) => entry.id === message.id) ?? false
        const unreadIncrement =
          incoming && !wasKnown && state.activeFriendId !== friendId ? 1 : 0

        return {
          openFriendIds: state.openFriendIds.includes(friendId)
            ? state.openFriendIds
            : [...state.openFriendIds, friendId],
          conversations: {
            ...state.conversations,
            [friendId]: conversation
              ? {
                  ...conversation,
                  messages: mergeMessage(conversation.messages, message),
                  loading: false,
                  unread: conversation.unread + unreadIncrement
                }
              : {
                  friend: { id: message.sender.id, username: message.sender.username },
                  messages: [message],
                  draft: '',
                  loading: false,
                  sending: false,
                  error: null,
                  unread: state.activeFriendId === friendId ? 0 : 1
                }
          }
        }
      })

      if (incoming) void get().refresh(friendId)
    })

    beforeUnloadHandler = () => {
      if (activePlayerId && canAdvanceOfflineMarker) writeOfflineMarker(activePlayerId)
    }
    window.addEventListener('beforeunload', beforeUnloadHandler)

    if (offlineSince) {
      void bootstrapOfflineChats(playerId, offlineSince, generation, set, get).catch(() => {
        // Keep the old marker so a later login can retry discovering messages received offline.
      })
    }
  },

  stop: () => {
    const stoppedPlayerId = activePlayerId
    const currentPlayerId = useAuthStore.getState().session?.player.id ?? null
    const sameAuthenticatedPlayer = Boolean(
      stoppedPlayerId && currentPlayerId && stoppedPlayerId === currentPlayerId
    )

    removeEventListener?.()
    removeEventListener = null

    if (beforeUnloadHandler) {
      window.removeEventListener('beforeunload', beforeUnloadHandler)
      beforeUnloadHandler = null
    }

    if (stoppedPlayerId && canAdvanceOfflineMarker) writeOfflineMarker(stoppedPlayerId)

    activePlayerId = null
    bootstrapGeneration += 1
    refreshInFlight.clear()

    if (!sameAuthenticatedPlayer) {
      set({ openFriendIds: [], activeFriendId: null, conversations: {} })
    }
  },

  open: async (friend) => {
    set((state) => ({
      openFriendIds: state.openFriendIds.includes(friend.id)
        ? state.openFriendIds
        : [...state.openFriendIds, friend.id],
      activeFriendId: friend.id,
      conversations: {
        ...state.conversations,
        [friend.id]: {
          ...(state.conversations[friend.id] ?? {
            messages: [],
            draft: '',
            loading: false,
            sending: false,
            error: null,
            unread: 0
          }),
          friend,
          unread: 0
        }
      }
    }))
    await get().refresh(friend.id)
  },

  close: (friendId) =>
    set((state) => {
      const openFriendIds = state.openFriendIds.filter((id) => id !== friendId)
      const conversations = { ...state.conversations }
      delete conversations[friendId]
      const activeFriendId =
        state.activeFriendId === friendId ? (openFriendIds.at(-1) ?? null) : state.activeFriendId
      return { openFriendIds, conversations, activeFriendId }
    }),

  select: (friendId) =>
    set((state) => ({
      activeFriendId: friendId,
      conversations: state.conversations[friendId]
        ? {
            ...state.conversations,
            [friendId]: { ...state.conversations[friendId], unread: 0 }
          }
        : state.conversations
    })),

  setDraft: (friendId, draft) =>
    set((state) => {
      const conversation = state.conversations[friendId]
      if (!conversation) return state
      return {
        conversations: {
          ...state.conversations,
          [friendId]: { ...conversation, draft: draft.slice(0, 300), error: null }
        }
      }
    }),

  send: async (friendId) => {
    const conversation = get().conversations[friendId]
    const message = conversation?.draft.trim()
    if (!conversation || !message || conversation.sending) return
    set((state) => ({
      conversations: {
        ...state.conversations,
        [friendId]: { ...conversation, sending: true, error: null }
      }
    }))
    try {
      await window.api.friends.sendChatMessage(friendId, message)
      set((state) => {
        const current = state.conversations[friendId]
        return current
          ? {
              conversations: {
                ...state.conversations,
                [friendId]: { ...current, draft: '', sending: false }
              }
            }
          : state
      })
      await get().refresh(friendId)
    } catch (error) {
      set((state) => {
        const current = state.conversations[friendId]
        return current
          ? {
              conversations: {
                ...state.conversations,
                [friendId]: { ...current, sending: false, error: readableError(error) }
              }
            }
          : state
      })
    }
  },

  refresh: async (friendId) => {
    const existing = refreshInFlight.get(friendId)
    if (existing) return existing
    const conversation = get().conversations[friendId]
    if (!conversation) return

    const operation = (async () => {
      set((state) => {
        const current = state.conversations[friendId]
        return current
          ? {
              conversations: {
                ...state.conversations,
                [friendId]: {
                  ...current,
                  loading: current.messages.length === 0,
                  error: null
                }
              }
            }
          : state
      })
      try {
        const messages = await window.api.friends.getChatHistory(friendId)
        set((state) => {
          const current = state.conversations[friendId]
          if (!current) return state
          return {
            conversations: {
              ...state.conversations,
              [friendId]: {
                ...current,
                messages: mergeMessages(current.messages, messages),
                loading: false,
                error: null,
                unread: state.activeFriendId === friendId ? 0 : current.unread
              }
            }
          }
        })
      } catch (error) {
        set((state) => {
          const current = state.conversations[friendId]
          return current
            ? {
                conversations: {
                  ...state.conversations,
                  [friendId]: { ...current, loading: false, error: readableError(error) }
                }
              }
            : state
        })
      }
    })()

    refreshInFlight.set(friendId, operation)
    try {
      await operation
    } finally {
      if (refreshInFlight.get(friendId) === operation) refreshInFlight.delete(friendId)
    }
  },

  refreshOpen: async () => {
    await Promise.all(get().openFriendIds.map((friendId) => get().refresh(friendId)))
  },

  reset: () => {
    get().stop()
    set({ openFriendIds: [], activeFriendId: null, conversations: {} })
  }
}))
