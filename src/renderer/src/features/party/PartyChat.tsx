import { useEffect, useRef, type FormEvent, type JSX } from 'react'
import { twMerge } from 'tailwind-merge'
import { Button } from '../../components/ui/Button'
import { useAuthStore } from '../auth/auth.store'
import { usePartyStore, type ChatTab } from './party.store'

const tabs: Array<{ id: ChatTab; label: string }> = [
  { id: 'party', label: 'Party' },
  { id: 'global', label: 'Global Chat' }
]

export function PartyChat(): JSX.Element {
  const playerId = useAuthStore((state) => state.session?.player.id)
  const party = usePartyStore((state) => state.party)
  const partyEntries = usePartyStore((state) => state.chatEntries)
  const partyDraft = usePartyStore((state) => state.chatDraft)
  const partySending = usePartyStore((state) => state.chatSending)
  const partyError = usePartyStore((state) => state.chatError)
  const chatTab = usePartyStore((state) => state.chatTab)
  const globalEntries = usePartyStore((state) => state.globalChatEntries)
  const globalDraft = usePartyStore((state) => state.globalChatDraft)
  const globalSending = usePartyStore((state) => state.globalChatSending)
  const globalError = usePartyStore((state) => state.globalChatError)
  const setPartyDraft = usePartyStore((state) => state.setChatDraft)
  const sendPartyChat = usePartyStore((state) => state.sendChat)
  const clearPartyChat = usePartyStore((state) => state.clearChat)
  const setChatTab = usePartyStore((state) => state.setChatTab)
  const setGlobalDraft = usePartyStore((state) => state.setGlobalChatDraft)
  const sendGlobalChat = usePartyStore((state) => state.sendGlobalChat)
  const feedRef = useRef<HTMLDivElement>(null)
  const entries = chatTab === 'party' ? partyEntries : globalEntries

  useEffect(() => {
    feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight })
  }, [entries])

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    void (chatTab === 'party' ? sendPartyChat() : sendGlobalChat())
  }

  const draft = chatTab === 'party' ? partyDraft : globalDraft
  const sending = chatTab === 'party' ? partySending : globalSending
  const error = chatTab === 'party' ? partyError : globalError
  const canSend = chatTab === 'global' || Boolean(party)

  return (
    <aside className="fixed bottom-4 left-4 z-[5] flex h-72 w-[calc(100%-2rem)] max-w-lg flex-col overflow-hidden rounded-sm border border-white/20 bg-black/75 text-white shadow-2xl backdrop-blur-sm">
      <div className="flex border-b border-white/15 bg-black/50" role="tablist" aria-label="Chat">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={chatTab === tab.id}
            className={twMerge(
              'h-9 flex-1 border-b-2 border-transparent px-3 text-xs font-semibold tracking-wide text-neutral-500 uppercase transition hover:text-white focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-sky-400',
              chatTab === tab.id && 'border-sky-400 text-white'
            )}
            onClick={() => setChatTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div
        ref={feedRef}
        className="flex-1 space-y-1 overflow-y-auto px-3 py-2 font-sans text-xs leading-relaxed"
        role="log"
        aria-live="polite"
        aria-label={chatTab === 'party' ? 'Party messages' : 'Global messages'}
      >
        {chatTab === 'party' ? (
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
                  <span className={entry.sender.id === playerId ? 'text-amber-300' : 'text-white'}>
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
                <span className="text-violet-300">[Global] </span>
                <span className={entry.sender.id === playerId ? 'text-amber-300' : 'text-white'}>
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
              className="h-9 min-w-0 flex-1 border-0 bg-transparent px-2 text-sm outline-none placeholder:text-neutral-500"
              value={draft}
              maxLength={300}
              placeholder={chatTab === 'party' ? 'Say to party' : 'Say to everyone'}
              aria-label={chatTab === 'party' ? 'Party message' : 'Global message'}
              onChange={(event) =>
                chatTab === 'party'
                  ? setPartyDraft(event.target.value)
                  : setGlobalDraft(event.target.value)
              }
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
  )
}
