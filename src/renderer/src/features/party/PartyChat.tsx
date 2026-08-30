import { useEffect, useRef, type FormEvent, type JSX } from 'react'
import { Button } from '../../components/ui/Button'
import { useAuthStore } from '../auth/auth.store'
import { usePartyStore } from './party.store'

export function PartyChat(): JSX.Element | null {
  const playerId = useAuthStore((state) => state.session?.player.id)
  const party = usePartyStore((state) => state.party)
  const entries = usePartyStore((state) => state.chatEntries)
  const draft = usePartyStore((state) => state.chatDraft)
  const sending = usePartyStore((state) => state.chatSending)
  const error = usePartyStore((state) => state.chatError)
  const setDraft = usePartyStore((state) => state.setChatDraft)
  const sendChat = usePartyStore((state) => state.sendChat)
  const clearChat = usePartyStore((state) => state.clearChat)
  const feedRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight })
  }, [entries])

  if (!party && entries.length === 0) return null

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    void sendChat()
  }

  return (
    <aside className="fixed bottom-4 left-4 z-20 flex h-72 w-[calc(100%-2rem)] max-w-lg flex-col overflow-hidden rounded-sm border border-white/20 bg-black/75 text-white shadow-2xl backdrop-blur-sm">
      <div
        ref={feedRef}
        className="flex-1 space-y-1 overflow-y-auto px-3 py-2 font-sans text-xs leading-relaxed"
        role="log"
        aria-live="polite"
        aria-label="Party messages"
      >
        {entries.length === 0 && (
          <p className="text-neutral-500">Party messages and status updates appear here.</p>
        )}
        {entries.map((entry) =>
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
      </div>

      {party ? (
        <form className="border-t border-white/15 bg-black/50 p-2" onSubmit={handleSubmit}>
          <div className="flex">
            <input
              className="h-9 min-w-0 flex-1 border-0 bg-transparent px-2 text-sm outline-none placeholder:text-neutral-500"
              value={draft}
              maxLength={300}
              placeholder="Say to party"
              aria-label="Party message"
              onChange={(event) => setDraft(event.target.value)}
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
            onClick={clearChat}
          >
            Party ended · Close
          </Button>
        </div>
      )}
    </aside>
  )
}
