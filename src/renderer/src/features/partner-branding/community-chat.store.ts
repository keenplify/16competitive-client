import { toast } from 'react-toastify'
import { translate, useLanguageStore } from '../i18n/i18n'
import { create } from 'zustand'
import { communityText } from './community-copy'
import type { CommunityChatMessage } from '../../../../shared/partner-community'
import { useAuthStore } from '../auth/auth.store'
type State = {
  accountId: string | null
  communityId: string | null
  chatHidden: boolean
  name: string | null
  messages: CommunityChatMessage[]
  draft: string
  loading: boolean
  sending: boolean
  error: 'chatError' | 'chatRateLimit' | 'chatMembership' | null
  load: () => Promise<void>
  setDraft: (value: string) => void
  send: () => Promise<void>
  clear: () => void
}
let serial = 0
export const useCommunityChatStore = create<State>((set, get) => ({
  chatHidden: false,
  accountId: null,
  communityId: null,
  name: null,
  messages: [],
  draft: '',
  loading: false,
  sending: false,
  error: null,
  load: async () => {
    const accountId = useAuthStore.getState().session?.player.id ?? null
    if (!accountId) {
      get().clear()
      return
    }
    if (get().sending || (get().loading && get().accountId === accountId)) return
    const request = ++serial
    set((state) => ({
      accountId,
      loading: true,
      ...(state.accountId !== accountId
        ? { communityId: null, name: null, messages: [], draft: '', error: null }
        : {})
    }))
    try {
      const history = await window.api.communityChat.history()
      if (request !== serial || useAuthStore.getState().session?.player.id !== accountId) return
      set((state) => ({
        ...history,
        chatHidden: history.chatHidden ?? false,
        messages:
          !history.chatHidden &&
          state.communityId === history.communityId &&
          state.messages.length === history.messages.length &&
          state.messages.every(
            (row, index) =>
              row.id === history.messages[index].id &&
              row.message === history.messages[index].message &&
              row.sender.username === history.messages[index].sender.username
          )
            ? state.messages
            : history.messages,
        loading: false,
        error: null,
        ...(state.communityId !== history.communityId || history.chatHidden ? { draft: '' } : {})
      }))
    } catch {
      if (request === serial) set({ loading: false, error: 'chatError' })
    }
  },
  setDraft: (value) => set({ draft: [...value].slice(0, 300).join(''), error: null }),
  send: async () => {
    const { communityId, accountId, draft, sending } = get()
    if (
      get().chatHidden ||
      !communityId ||
      !draft.trim() ||
      sending ||
      accountId !== useAuthStore.getState().session?.player.id
    )
      return
    const language = useLanguageStore.getState().language
    const feedback = toast.loading(translate(language, 'directory.sendingChat'))
    set({ sending: true, error: null })
    try {
      const message = await window.api.communityChat.send(communityId, draft.trim())
      toast.update(feedback, {
        render: translate(language, 'directory.chatSent'),
        type: 'success',
        isLoading: false,
        autoClose: 3000
      })
      if (get().accountId === accountId && get().communityId === communityId) {
        serial++ // Do not let an older history snapshot remove the just-sent message.
        set((state) => ({
          loading: false,
          draft: state.draft === draft ? '' : state.draft,
          messages: [...state.messages.filter((row) => row.id !== message.id), message].slice(-100)
        }))
      }
    } catch (error) {
      const failureCode = error instanceof Error ? error.message : ''
      const hidden = failureCode.includes('COMMUNITY_CHAT_HIDDEN')
      toast.update(feedback, {
        render: failureCode.includes('CHAT_RATE_LIMIT')
          ? communityText(language, 'chatRateLimit')
          : failureCode.includes('COMMUNITY_ACCESS_REQUIRED')
            ? communityText(language, 'chatMembership')
            : translate(language, hidden ? 'directory.chatHidden' : 'directory.chatSendError'),
        type: 'error',
        isLoading: false,
        autoClose: 6000
      })
      if (get().accountId === accountId && get().communityId === communityId) {
        const code = error instanceof Error ? error.message : ''
        set({
          error: code.includes('CHAT_RATE_LIMIT')
            ? 'chatRateLimit'
            : code.includes('COMMUNITY_ACCESS_REQUIRED')
              ? 'chatMembership'
              : 'chatError'
        })
        if (code.includes('COMMUNITY_CHAT_HIDDEN')) {
          serial++ // Discard history fetched before the owner hid chat.
          set({ loading: false, chatHidden: true, messages: [], draft: '' })
        }
        if (code.includes('COMMUNITY_ACCESS_REQUIRED')) {
          set({ communityId: null, messages: [], draft: '' })
          void get().load()
        }
      }
    } finally {
      if (get().accountId === accountId) set({ sending: false })
    }
  },
  clear: () => {
    serial++
    set({
      chatHidden: false,
      accountId: null,
      communityId: null,
      name: null,
      messages: [],
      draft: '',
      loading: false,
      sending: false,
      error: null
    })
  }
}))
useAuthStore.subscribe((state, previous) => {
  if (state.session?.player.id !== previous.session?.player.id)
    useCommunityChatStore.getState().clear()
})
