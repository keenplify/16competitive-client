import { MessageSquare, UserPlus, X } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent, type JSX, type MouseEvent } from 'react'
import { twMerge } from 'tailwind-merge'
import { Button } from '../../components/ui/Button'
import { useAuthStore } from '../auth/auth.store'
import { useFriendChatStore } from '../friends/friend-chat.store'
import { useFriendsStore } from '../friends/friends.store'
import { SUPPORTED_LANGUAGES, useLanguageStore } from '../i18n/i18n'
import { usePartyStore, type ChatTab } from './party.store'

const baseTabs: Array<{ id: ChatTab; label: string }> = [
  { id: 'party', label: 'Party' },
  { id: 'language', label: 'Language Chat' },
  { id: 'global', label: 'Global Chat' }
]

interface ChatSender {
  id: string
  username: string
}

export function PartyChat(): JSX.Element {
  const playerId = useAuthStore((state) => state.session?.player.id)
  const party = usePartyStore((state) => state.party)
  const partyEntries = usePartyStore((state) => state.chatEntries)
  const partyDraft = usePartyStore((state) => state.chatDraft)
  const partySending = usePartyStore((state) => state.chatSending)
  const partyError = usePartyStore((state) => state.chatError)
  const chatTab = usePartyStore((state) => state.chatTab)
  const globalEntries = usePartyStore((state) => state.globalChatEntries)
  const languageEntries = usePartyStore((state) => state.languageChatEntries)
  const globalChatLanguage = usePartyStore((state) => state.globalChatLanguage)
  const globalDraft = usePartyStore((state) => state.globalChatDraft)
  const globalSending = usePartyStore((state) => state.globalChatSending)
  const globalError = usePartyStore((state) => state.globalChatError)
  const languageDraft = usePartyStore((state) => state.languageChatDraft)
  const languageSending = usePartyStore((state) => state.languageChatSending)
  const languageError = usePartyStore((state) => state.languageChatError)
  const setPartyDraft = usePartyStore((state) => state.setChatDraft)
  const sendPartyChat = usePartyStore((state) => state.sendChat)
  const clearPartyChat = usePartyStore((state) => state.clearChat)
  const setChatTab = usePartyStore((state) => state.setChatTab)
  const setGlobalDraft = usePartyStore((state) => state.setGlobalChatDraft)
  const setLanguageDraft = usePartyStore((state) => state.setLanguageChatDraft)
  const setGlobalChatLanguage = usePartyStore((state) => state.setGlobalChatLanguage)
  const sendGlobalChat = usePartyStore((state) => state.sendGlobalChat)
  const sendLanguageChat = usePartyStore((state) => state.sendLanguageChat)
  const language = useLanguageStore((state) => state.language)

  const openFriendIds = useFriendChatStore((state) => state.openFriendIds)
  const activeFriendId = useFriendChatStore((state) => state.activeFriendId)
  const conversations = useFriendChatStore((state) => state.conversations)
  const startFriendChat = useFriendChatStore((state) => state.start)
  const stopFriendChat = useFriendChatStore((state) => state.stop)
  const selectFriendChat = useFriendChatStore((state) => state.select)
  const closeFriendChat = useFriendChatStore((state) => state.close)
  const setFriendDraft = useFriendChatStore((state) => state.setDraft)
  const sendFriendChat = useFriendChatStore((state) => state.send)

  const requestFriend = useFriendsStore((state) => state.request)
  const actingPlayerId = useFriendsStore((state) => state.actingPlayerId)
  const feedRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [playerMenu, setPlayerMenu] = useState<{
    player: ChatSender
    x: number
    y: number
  } | null>(null)
  const [chatOpen, setChatOpen] = useState(true)

  const friendConversation = activeFriendId ? conversations[activeFriendId] : undefined
  const globalLanguageLabel =
    SUPPORTED_LANGUAGES.find(({ code }) => code === globalChatLanguage)?.label ??
    globalChatLanguage.toUpperCase()

  useEffect(() => {
    startFriendChat()
    return stopFriendChat
  }, [startFriendChat, stopFriendChat])

  useEffect(() => {
    void setGlobalChatLanguage(language)
  }, [language, setGlobalChatLanguage])

  useEffect(() => {
    feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight })
  }, [
    activeFriendId,
    friendConversation?.messages,
    chatTab,
    partyEntries,
    globalEntries,
    languageEntries
  ])

  useEffect(() => {
    if (!activeFriendId) return
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus())
    return () => window.cancelAnimationFrame(frame)
  }, [activeFriendId])

  useEffect(() => {
    const closeMenu = (): void => setPlayerMenu(null)
    const closeOnEscape = (event: globalThis.KeyboardEvent): void => {
      if (event.key === 'Escape') setPlayerMenu(null)
    }
    window.addEventListener('click', closeMenu)
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      window.removeEventListener('click', closeMenu)
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [])

  const selectBaseTab = (tab: ChatTab): void => {
    setChatTab(tab)
    useFriendChatStore.setState({ activeFriendId: null })
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    if (activeFriendId) {
      void sendFriendChat(activeFriendId)
      return
    }
    void (chatTab === 'party' ? sendPartyChat() : sendGlobalChat())
  }

  const showPlayerMenu = (event: MouseEvent<HTMLSpanElement>, player: ChatSender): void => {
    if (player.id === playerId) return
    event.preventDefault()
    setPlayerMenu({ player, x: event.clientX, y: event.clientY })
  }

  const sendFriendRequest = (): void => {
    if (!playerMenu) return
    const { id } = playerMenu.player
    setPlayerMenu(null)
    void requestFriend(id)
  }

  const draft = activeFriendId
    ? (friendConversation?.draft ?? '')
    : chatTab === 'party'
      ? partyDraft
      : globalDraft
  const sending = activeFriendId
    ? Boolean(friendConversation?.sending)
    : chatTab === 'party'
      ? partySending
      : globalSending
  const error = activeFriendId
    ? friendConversation?.error
    : chatTab === 'party'
      ? partyError
      : globalError
  const canSend = activeFriendId
    ? Boolean(friendConversation)
    : chatTab === 'global' || Boolean(party)
  const placeholder = activeFriendId
    ? `Message ${friendConversation?.friend.username ?? 'friend'}`
    : chatTab === 'party'
      ? 'Say to party'
      : `Say to ${globalLanguageLabel} chat`
  const messageLabel = activeFriendId
    ? `Private message to ${friendConversation?.friend.username ?? 'friend'}`
    : chatTab === 'party'
      ? 'Party message'
      : `${globalLanguageLabel} chat message`

  return (
    <>
      {!chatOpen && (
        <button
          type="button"
          className="fixed bottom-4 left-4 z-[5] flex h-10 items-center gap-2 border border-white/20 bg-black/75 px-3 text-xs font-semibold tracking-wide text-white uppercase shadow-2xl backdrop-blur-sm transition hover:bg-neutral-900"
          onClick={() => setChatOpen(true)}
          aria-label="Open chat"
        >
          <MessageSquare className="size-4 text-sky-300" aria-hidden="true" />
          Chat
        </button>
      )}
      {chatOpen && (
      <aside className="fixed bottom-4 left-4 z-[5] flex h-72 w-[calc(100%-2rem)] max-w-lg flex-col overflow-hidden rounded-sm border border-white/20 bg-black/75 text-white shadow-2xl backdrop-blur-sm">
        <div className="flex shrink-0 border-b border-white/15 bg-black/50">
        <div
          className="flex min-w-0 flex-1 overflow-x-auto"
          role="tablist"
          aria-label="Chat"
        >
          {baseTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={!activeFriendId && chatTab === tab.id}
              className={twMerge(
                'h-9 shrink-0 border-b-2 border-transparent px-4 text-xs font-semibold tracking-wide text-neutral-500 uppercase transition hover:text-white focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-sky-400',
                !activeFriendId && chatTab === tab.id && 'border-sky-400 text-white'
              )}
              onClick={() => selectBaseTab(tab.id)}
            >
              {tab.id === 'global' ? `${globalLanguageLabel} Chat` : tab.label}
            </button>
          ))}
          {openFriendIds.map((friendId) => {
            const conversation = conversations[friendId]
            if (!conversation) return null
            return (
              <button
                key={friendId}
                type="button"
                role="tab"
                aria-selected={activeFriendId === friendId}
                className={twMerge(
                  'group flex h-9 max-w-40 shrink-0 items-center gap-2 border-b-2 border-transparent px-3 text-xs font-semibold text-neutral-500 transition hover:text-white focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-sky-400',
                  activeFriendId === friendId && 'border-sky-400 text-white'
                )}
                onClick={() => selectFriendChat(friendId)}
              >
                <span className="truncate">{conversation.friend.username}</span>
                {conversation.unread > 0 && (
                  <span className="flex min-w-4 items-center justify-center rounded-full bg-sky-400 px-1 text-[9px] font-bold text-neutral-950">
                    {conversation.unread > 9 ? '9+' : conversation.unread}
                  </span>
                )}
                <span
                  role="button"
                  tabIndex={0}
                  aria-label={`Close chat with ${conversation.friend.username}`}
                  className="rounded px-1 text-neutral-600 hover:bg-white/10 hover:text-white"
                  onClick={(event) => {
                    event.stopPropagation()
                    closeFriendChat(friendId)
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter' && event.key !== ' ') return
                    event.preventDefault()
                    event.stopPropagation()
                    closeFriendChat(friendId)
                  }}
                >
                  ×
                </span>
              </button>
            )
          })}
        </div>
        <button
          type="button"
          className="grid size-9 shrink-0 place-items-center text-neutral-500 transition hover:bg-white/5 hover:text-white focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-sky-400"
          onClick={() => setChatOpen(false)}
          aria-label="Close chat"
          title="Close chat"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
        </div>

        <div
          ref={feedRef}
          className="flex-1 space-y-1 overflow-y-auto px-3 py-2 font-sans text-xs leading-relaxed"
          role="log"
          aria-live="polite"
          aria-label={
            activeFriendId
              ? `Private messages with ${friendConversation?.friend.username ?? 'friend'}`
              : chatTab === 'party'
                ? 'Party messages'
                : `${globalLanguageLabel} chat messages`
          }
        >
          {activeFriendId ? (
            <>
              {friendConversation?.loading && (
                <p className="text-neutral-500">Loading recent messages…</p>
              )}
              {!friendConversation?.loading && friendConversation?.messages.length === 0 && (
                <p className="text-neutral-500">
                  No recent messages with {friendConversation.friend.username}. Say hello.
                </p>
              )}
              {friendConversation?.messages.map((entry) => (
                <p key={entry.id} className="break-words" title={entry.sentAt}>
                  <span className="text-cyan-300">[Private] </span>
                  <span className={entry.sender.id === playerId ? 'text-amber-300' : 'text-white'}>
                    {entry.sender.username}
                  </span>
                  <span className="text-neutral-400">: </span>
                  <span className="text-neutral-100">{entry.message}</span>
                </p>
              ))}
            </>
          ) : chatTab === 'party' ? (
            <>
              {partyEntries.length === 0 && (
                <p className="text-neutral-500">
                  {party
                    ? 'Party messages and status updates appear here.'
                    : 'Join or create a party to use party chat.'}
                </p>
              )}
              {partyEntries.map((entry) =>
                entry.type === 'party_chat_notification' ? (
                  <p key={entry.id} className="text-emerald-300" title={entry.sentAt}>
                    {entry.message}
                  </p>
                ) : (
                  <p key={entry.id} className="break-words" title={entry.sentAt}>
                    <span className="text-sky-300">[Party] </span>
                    <span
                      className={twMerge(
                        entry.sender.id === playerId
                          ? 'text-amber-300'
                          : 'cursor-context-menu text-white transition hover:text-sky-300 hover:underline'
                      )}
                      title={entry.sender.id === playerId ? undefined : 'Right-click to add friend'}
                      onContextMenu={(event) => showPlayerMenu(event, entry.sender)}
                    >
                      {entry.sender.username}
                    </span>
                    <span className="text-neutral-400">: </span>
                    <span className="text-neutral-100">{entry.message}</span>
                  </p>
                )
              )}
            </>
          ) : (
            <>
              {globalEntries.length === 0 && (
                <p className="text-neutral-500">Global messages appear here.</p>
              )}
              {globalEntries.map((entry) => (
                <p key={entry.id} className="break-words" title={entry.sentAt}>
                  <span className="text-violet-300">[{globalChatLanguage.toUpperCase()}] </span>
                  <span
                    className={twMerge(
                      entry.sender.id === playerId
                        ? 'text-amber-300'
                        : 'cursor-context-menu text-white transition hover:text-sky-300 hover:underline'
                    )}
                    title={entry.sender.id === playerId ? undefined : 'Right-click to add friend'}
                    onContextMenu={(event) => showPlayerMenu(event, entry.sender)}
                  >
                    {entry.sender.username}
                  </span>
                  <span className="text-neutral-400">: </span>
                  <span className="text-neutral-100">{entry.message}</span>
                </p>
              ))}
            </>
          )}
        </div>

        {canSend ? (
          <form className="border-t border-white/15 bg-black/50 p-2" onSubmit={handleSubmit}>
            <div className="flex">
              <input
                ref={inputRef}
                className="h-9 min-w-0 flex-1 border-0 bg-transparent px-2 text-sm outline-none placeholder:text-neutral-500"
                value={draft}
                maxLength={300}
                placeholder={placeholder}
                aria-label={messageLabel}
                onChange={(event) => {
                  if (activeFriendId) {
                    setFriendDraft(activeFriendId, event.target.value)
                  } else if (chatTab === 'party') {
                    setPartyDraft(event.target.value)
                  } else {
                    setGlobalDraft(event.target.value)
                  }
                }}
              />
              <Button
                className="h-9 rounded-none bg-transparent px-4 text-xs tracking-wide text-neutral-300 uppercase hover:bg-white/5 hover:text-white disabled:bg-transparent"
                variant="ghost"
                type="submit"
                disabled={!draft.trim() || sending}
              >
                Send
              </Button>
            </div>
            {error && <p className="px-2 pt-1 text-xs text-red-400">{error}</p>}
          </form>
        ) : (
          <div className="border-t border-white/15 bg-black/50 p-2">
            <Button
              className="h-9 w-full rounded-none text-xs tracking-wide uppercase"
              variant="ghost"
              disabled={partyEntries.length === 0}
              onClick={clearPartyChat}
            >
              {partyEntries.length > 0 ? 'Party ended · Clear messages' : 'Party chat unavailable'}
            </Button>
          </div>
        )}
      </aside>
      )}
      {playerMenu && (
        <div
          className="fixed z-50 min-w-44 overflow-hidden border border-white/15 bg-neutral-800 py-1 text-white shadow-xl"
          style={{ left: playerMenu.x, top: playerMenu.y }}
          role="menu"
          aria-label={`Options for ${playerMenu.player.username}`}
          onClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-white/10 focus-visible:bg-white/10 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
            role="menuitem"
            disabled={actingPlayerId === playerMenu.player.id}
            onClick={sendFriendRequest}
          >
            <UserPlus className="size-4 text-sky-300" aria-hidden="true" /> Send friend request
          </button>
        </div>
      )}
    </>
  )
}
