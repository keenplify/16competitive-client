import { create } from 'zustand'
import type {
  Party,
  PartyInvitationDecision,
  PendingPartyInvitation
} from '../../../../shared/party'
import type { GlobalChatMessage, PartyChatEvent } from '../../../../shared/matchmaking'

type PartyRequestStatus = 'idle' | 'loading' | 'inviting' | 'responding' | 'leaving'
export type ChatTab = 'party' | 'global'

interface PartyState {
  party: Party | null
  invitations: PendingPartyInvitation[]
  inviteUsername: string
  status: PartyRequestStatus
  error: string | null
  notice: string | null
  chatEntries: PartyChatEvent[]
  chatDraft: string
  chatSending: boolean
  chatError: string | null
  chatTab: ChatTab
  globalChatEntries: GlobalChatMessage[]
  globalChatDraft: string
  globalChatSending: boolean
  globalChatError: string | null
  start: () => void
  stop: () => void
  refresh: () => Promise<void>
  setInviteUsername: (username: string) => void
  invite: () => Promise<void>
  respond: (invitationId: string, decision: PartyInvitationDecision) => Promise<void>
  leave: () => Promise<void>
  setChatDraft: (message: string) => void
  sendChat: () => Promise<void>
  clearChat: () => void
  setChatTab: (tab: ChatTab) => void
  setGlobalChatDraft: (message: string) => void
  sendGlobalChat: () => Promise<void>
  reset: () => void
}

let removePartyEventListener: (() => void) | null = null
const MAX_CHAT_ENTRIES = 100

const appendChatEntry = (entries: PartyChatEvent[], entry: PartyChatEvent): PartyChatEvent[] => {
  if (entries.some(({ id }) => id === entry.id)) return entries
  return [...entries, entry].slice(-MAX_CHAT_ENTRIES)
}

const mergeGlobalChatEntries = (
  entries: GlobalChatMessage[],
  incoming: GlobalChatMessage[]
): GlobalChatMessage[] => {
  const messages = new Map(entries.map((entry) => [entry.id, entry]))
  for (const entry of incoming) messages.set(entry.id, entry)
  return [...messages.values()]
    .sort((left, right) => left.sentAt.localeCompare(right.sentAt))
    .slice(-MAX_CHAT_ENTRIES)
}

const readableError = (error: unknown): string => {
  if (!(error instanceof Error)) return 'Party request failed.'
  const remoteError = error.message.match(/Error: (.+)$/)
  return remoteError?.[1] ?? error.message
}

export const usePartyStore = create<PartyState>((set, get) => ({
  party: null,
  invitations: [],
  inviteUsername: '',
  status: 'idle',
  error: null,
  notice: null,
  chatEntries: [],
  chatDraft: '',
  chatSending: false,
  chatError: null,
  chatTab: 'global',
  globalChatEntries: [],
  globalChatDraft: '',
  globalChatSending: false,
  globalChatError: null,

  start: () => {
    if (removePartyEventListener) return

    removePartyEventListener = window.api.matchmaking.onEvent((event) => {
      if (event.type === 'party_chat_message' || event.type === 'party_chat_notification') {
        set((state) => ({ chatEntries: appendChatEntry(state.chatEntries, event) }))
      }
      if (event.type === 'global_chat_message') {
        set((state) => ({
          globalChatEntries: mergeGlobalChatEntries(state.globalChatEntries, [event])
        }))
      }
      if (event.type === 'global_chat_history') {
        set((state) => ({
          globalChatEntries: mergeGlobalChatEntries(state.globalChatEntries, event.messages)
        }))
      }
      if (event.type === 'match_found') {
        const partyId = get().party?.id
        if (partyId) {
          const entries: PartyChatEvent[] = [
            {
              type: 'party_chat_notification',
              id: `match-found:${event.matchId}`,
              partyId,
              code: 'MATCH_FOUND',
              message: `Match found on ${event.mapId} for ${event.mode}.`,
              sentAt: new Date().toISOString()
            },
            {
              type: 'party_chat_notification',
              id: `match-players:${event.matchId}`,
              partyId,
              code: 'MATCH_FOUND',
              message: `Players: ${[...event.teams.teamA, ...event.teams.teamB]
                .map(({ username }) => username)
                .join(', ')}.`,
              sentAt: new Date().toISOString()
            }
          ]
          set((state) => ({
            chatEntries: entries.reduce(appendChatEntry, state.chatEntries)
          }))
        }
      }
      const partyId = get().party?.id
      if (partyId) {
        const notification = (() => {
          switch (event.type) {
            case 'match_ready_check':
              return {
                code: 'MATCH_READY' as const,
                message: 'Match found. Waiting for players to accept.'
              }
            case 'match_ready_updated':
              return {
                code: 'MATCH_READY' as const,
                message: `${event.acceptedPlayerIds.length} / ${event.playersRequired} players ready.`
              }
            case 'match_countdown':
              return event.secondsRemaining > 0
                ? {
                    code: 'MATCH_COUNTDOWN' as const,
                    message: `Game server starts in ${event.secondsRemaining} second${event.secondsRemaining === 1 ? '' : 's'}.`
                  }
                : null
            case 'match_server_starting':
              return { code: 'MATCH_SERVER' as const, message: 'Starting the game server…' }
            case 'match_connect':
              return {
                code: 'MATCH_SERVER' as const,
                message: `Game server ready at ${event.host}:${event.port}.`
              }
            case 'match_cancelled':
              return { code: 'MATCH_CANCELLED' as const, message: event.message }
            default:
              return null
          }
        })()
        if (notification) {
          const entry: PartyChatEvent = {
            type: 'party_chat_notification',
            id: `${event.type}:${'matchId' in event ? event.matchId : crypto.randomUUID()}:${'secondsRemaining' in event ? event.secondsRemaining : Date.now()}`,
            partyId,
            ...notification,
            sentAt: new Date().toISOString()
          }
          set((state) => ({ chatEntries: appendChatEntry(state.chatEntries, entry) }))
        }
      }
      if (
        event.type === 'authenticated' ||
        event.type === 'party_invitation_received' ||
        event.type === 'party_updated' ||
        event.type === 'party_disbanded'
      ) {
        void get().refresh()
      }
    })

    void get().refresh()
    void window.api.matchmaking.connect().catch((error: unknown) => {
      set({ error: readableError(error) })
    })
  },

  stop: () => {
    removePartyEventListener?.()
    removePartyEventListener = null
    set({
      chatEntries: [],
      chatDraft: '',
      chatSending: false,
      chatError: null,
      globalChatEntries: [],
      globalChatDraft: '',
      globalChatSending: false,
      globalChatError: null
    })
  },

  refresh: async () => {
    if (get().status !== 'idle') return
    if (!get().party) set({ status: 'loading' })
    try {
      const [party, invitations] = await Promise.all([
        window.api.party.get(),
        window.api.party.getInvitations()
      ])
      set((state) => {
        const chatPartyId = state.chatEntries.at(-1)?.partyId
        return {
          party,
          invitations,
          status: 'idle',
          error: null,
          chatEntries: party && chatPartyId && chatPartyId !== party.id ? [] : state.chatEntries
        }
      })
    } catch (error) {
      set({ status: 'idle', error: readableError(error) })
    }
  },

  setInviteUsername: (inviteUsername) => set({ inviteUsername, error: null, notice: null }),

  invite: async () => {
    const username = get().inviteUsername.trim()
    if (!/^[A-Za-z0-9_]{3,32}$/.test(username)) {
      set({ error: 'Enter a username with 3–32 letters, numbers, or underscores.' })
      return
    }

    set({ status: 'inviting', error: null, notice: null })
    try {
      const invitation = await window.api.party.invite(username)
      const [party, invitations] = await Promise.all([
        window.api.party.get(),
        window.api.party.getInvitations()
      ])
      set({
        party,
        invitations,
        inviteUsername: '',
        status: 'idle',
        notice: `Invitation sent to ${invitation.invitedPlayer.username}.`
      })
    } catch (error) {
      set({ status: 'idle', error: readableError(error) })
    }
  },

  respond: async (invitationId, decision) => {
    set({ status: 'responding', error: null, notice: null })
    try {
      await window.api.party.respond(invitationId, decision)
      const [party, invitations] = await Promise.all([
        window.api.party.get(),
        window.api.party.getInvitations()
      ])
      set({
        party,
        invitations,
        status: 'idle',
        notice: decision === 'accept' ? 'Party invitation accepted.' : 'Party invitation declined.'
      })
    } catch (error) {
      set({ status: 'idle', error: readableError(error) })
    }
  },

  leave: async () => {
    set({ status: 'leaving', error: null, notice: null })
    try {
      const result = await window.api.party.leave()
      set({
        party: null,
        chatDraft: '',
        status: 'idle',
        notice: result.disbanded ? 'Party disbanded.' : 'You left the party.'
      })
    } catch (error) {
      set({ status: 'idle', error: readableError(error) })
    }
  },

  setChatDraft: (chatDraft) => set({ chatDraft: chatDraft.slice(0, 300), chatError: null }),

  sendChat: async () => {
    const message = get().chatDraft.trim()
    if (!message || get().chatSending) return
    set({ chatSending: true, chatError: null })
    try {
      await window.api.party.sendMessage(message)
      set({ chatDraft: '', chatSending: false })
    } catch (error) {
      set({ chatSending: false, chatError: readableError(error) })
    }
  },

  clearChat: () => set({ chatEntries: [], chatDraft: '', chatError: null }),

  setChatTab: (chatTab) => set({ chatTab }),

  setGlobalChatDraft: (globalChatDraft) =>
    set({ globalChatDraft: globalChatDraft.slice(0, 300), globalChatError: null }),

  sendGlobalChat: async () => {
    const message = get().globalChatDraft.trim()
    if (!message || get().globalChatSending) return
    set({ globalChatSending: true, globalChatError: null })
    try {
      await window.api.party.sendGlobalMessage(message)
      set({ globalChatDraft: '', globalChatSending: false })
    } catch (error) {
      set({ globalChatSending: false, globalChatError: readableError(error) })
    }
  },

  reset: () => {
    get().stop()
    set({
      party: null,
      invitations: [],
      inviteUsername: '',
      status: 'idle',
      error: null,
      notice: null,
      chatEntries: [],
      chatDraft: '',
      chatSending: false,
      chatError: null,
      chatTab: 'global',
      globalChatEntries: [],
      globalChatDraft: '',
      globalChatSending: false,
      globalChatError: null
    })
  }
}))
