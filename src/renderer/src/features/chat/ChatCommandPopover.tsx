import { useFriendsStore } from '../friends/friends.store'
import { useLanguageStore } from '../i18n/i18n'
import copy from './chat-command-translations.json'

export function ChatCommandPopover({ draft, onChoose }: { draft: string; onChoose: (value: string) => void }) {
  const friends = useFriendsStore(state => state.friends)
  const language = useLanguageStore(state => state.language)
  const t = copy[language]
  if (!draft.startsWith('/')) return null
  const whisper = draft.match(/^\/w(?:\s+(.*))?$/i)
  const query = whisper?.[1] ?? ''
  const choosingFriend = !!whisper && !/\s/.test(query.replace(/^"/, ''))
  const commands = [
    { key: '/w', label: t.whisper, syntax: `/w <${t.username}> <${t.message}>` },
    { key: '/r', label: t.reply, syntax: `/r <${t.message}>` },
    { key: '/a', label: t.announce, syntax: `/a <${t.message}>` }
  ].filter(item => item.key.startsWith(draft.toLowerCase()) || draft.toLowerCase().startsWith(`${item.key} `) || item.key === '/a' && draft.toLowerCase().startsWith('/announce'))
  if (!commands.length) return null
  return <div className="absolute inset-x-0 bottom-full z-20 max-h-60 overflow-y-auto border border-white/15 bg-neutral-950 p-2 shadow-xl" aria-label={t.whisper}>
    {commands.map(item => <button key={item.key} type="button" className="flex w-full items-center justify-between gap-3 px-2 py-2 text-left text-xs hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-sky-300" onClick={() => onChoose(`${item.key} `)}>
      <span className="font-semibold text-sky-300">{item.label}</span><code className="text-neutral-300">{item.syntax}</code>
    </button>)}
    {choosingFriend && friends.filter(friend => friend.username.toLocaleLowerCase().startsWith(query.replace(/^"/, '').toLocaleLowerCase())).slice(0, 8).map(friend => <button key={friend.id} type="button" className="block w-full px-2 py-2 text-left text-sm text-cyan-300 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-sky-300" onClick={() => onChoose(`/w ${/\s/.test(friend.username) ? JSON.stringify(friend.username) : friend.username} `)}>{friend.username}</button>)}
  </div>
}
