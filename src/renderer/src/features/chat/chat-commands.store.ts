import { create } from 'zustand'
import { toast } from 'react-toastify'
import { useFriendChatStore } from '../friends/friend-chat.store'
import { useLanguageStore } from '../i18n/i18n'
import { useAuthStore } from '../auth/auth.store'
import copy from './chat-command-translations.json'

export const isChatCommand = (value: string): boolean => /^\/(?:w|r|a|announce)(?:\s|$)/i.test(value.trimStart())

export const useChatCommandsStore = create<{ pending: boolean; send: (draft: string) => Promise<boolean> }>((set, get) => ({
  pending: false,
  send: async (draft) => {
    if (get().pending) return false
    const text = copy[useLanguageStore.getState().language]
    const command = draft.trim().match(/^\/(w|r|a|announce)(?:\s+([\s\S]*))?$/i)
    if (!command) return false
    const accountId = useAuthStore.getState().session?.player.id
    const body = command[2]?.trim() ?? ''
    let recipient: { id: string; username: string } | undefined
    let message = body
    const feedback = toast.loading(text.pending)
    set({ pending: true })
    try {
      if (command[1].toLowerCase() === 'r') {
        recipient = useFriendChatStore.getState().lastIncoming?.sender
        if (!recipient) throw new Error(text.noTarget)
      } else if (command[1].toLowerCase() === 'w') {
        const match = body.match(/^(?:"([^"]+)"|(\S+))\s+([\s\S]+)$/)
        if (!match) throw new Error(`/w <${text.username}> <${text.message}>`)
        const username = (match[1] ?? match[2]).toLocaleLowerCase('en-US')
        const snapshot = await window.api.friends.list()
        recipient = snapshot.friends.find(friend => friend.username.toLocaleLowerCase('en-US') === username)
        if (!recipient) throw new Error(text.friendRequired)
        message = match[3].trim()
      }
      if (!message || message.length > 300) throw new Error(text.usage)
      if (useAuthStore.getState().session?.player.id !== accountId) throw new Error(text.failed)
      if (!recipient) await window.api.friends.announce(message, crypto.randomUUID())
      else await window.api.friends.sendChatMessage(recipient.id, message)
      if (recipient && useAuthStore.getState().session?.player.id === accountId) {
        await useFriendChatStore.getState().open(recipient)
      }
      toast.update(feedback, { render: text.sent, type: 'success', isLoading: false, autoClose: 2500 })
      return true
    } catch (error) {
      const known = [text.noTarget, text.friendRequired, text.usage, `/w <${text.username}> <${text.message}>`]
      toast.update(feedback, { render: error instanceof Error && known.includes(error.message) ? error.message : text.failed, type: 'error', isLoading: false, autoClose: 6000 })
      return false
    } finally {
      set({ pending: false })
    }
  }
}))
