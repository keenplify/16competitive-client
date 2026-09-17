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

let removeEventListener: (() => void) | null = null
const refreshInFlight = new Map<string, Promise<void>>()

const readableError = (error: unknown): string =>
  error instanceof Error ? error.message : 'Private chat request failed.'

const mergeMessage = (
  messages: FriendChatMessage[],
  message: FriendChatMessage
): FriendChatMessage[] =>
  [...messages.filter((entry) => entry.id !== message.id), message]
    .sort((left, right) => {
      const timeDifference = Date.parse(left.sentAt) - Date.parse(right.sentAt)
      return timeDifference || left.id.localeCompare(right.id)
    })
    .slice(-10)

export const useFriendChatStore = create<FriendChatState>((set, get) => ({
  openFriendIds: [],
  activeFriendId: null,
  conversations: {},

  start: () => {
    if (removeEventListener) return
    removeEventListener = window.api.matchmaking.onEvent((event) => {
      if (event.type !== 'friend_chat_message') return

      const playerId = useAuthStore.getState().session?.player.id
      if (!playerId) return

      const message = event.message
      const incoming = message.recipientPlayerId === playerId && message.sender.id !== playerId
      const friendId = incoming ? message.sender.id : message.recipientPlayerId
      const current = get().conversations[friendId]
      const alreadyKnown = current?.messages.some((entry) => entry.id === message.id) ?? false

      if (incoming && !alreadyKnown) playFriendMessageSound()

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
  },

  stop: () => {
    removeEventListener?.()
    removeEventListener = null
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
                [friendId]: { ...current, loading: current.messages.length === 0, error: null }
              }
            }
          : state
      })
      try {
        const messages = await window.api.friends.getChatHistory(friendId)
        set((state) => {
          const current = state.conversations[friendId]
          if (!current) return state
          const knownIds = new Set(current.messages.map(({ id }) => id))
          const newIncomingCount = messages.filter(
            (message) => !knownIds.has(message.id) && message.sender.id === friendId
          ).length
          return {
            conversations: {
              ...state.conversations,
              [friendId]: {
                ...current,
                messages,
                loading: false,
                error: null,
                unread:
                  state.activeFriendId === friendId ? 0 : current.unread + newIncomingCount
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
    refreshInFlight.clear()
    set({ openFriendIds: [], activeFriendId: null, conversations: {} })
  }
}))
