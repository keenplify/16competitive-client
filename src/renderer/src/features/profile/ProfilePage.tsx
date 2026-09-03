import { type JSX } from 'react'
import { twMerge } from 'tailwind-merge'
import { useAuthStore } from '../auth/auth.store'
import { SkinsPage } from '../skins/SkinsPage'
import { MatchHistoryPage } from './MatchHistoryPage'
import { useNavigationStore } from '../navigation/navigation.store'

export function ProfilePage(): JSX.Element {
  const player = useAuthStore((state) => state.session?.player)
  const tab = useNavigationStore((state) => state.profileTab)
  const setTab = useNavigationStore((state) => state.setProfileTab)
  return (
    <main className="min-h-[calc(100vh-5rem)] w-full bg-black/60 p-6 text-white sm:p-10">
      <div className="mx-auto w-full max-w-5xl">
        <header className="border-b border-white/10 pb-0">
          <p className="text-xs font-bold tracking-[0.2em] text-sky-400 uppercase">Profile</p>
          <h1 className="mt-2 text-3xl font-semibold">{player?.username ?? 'Player'}</h1>
          <div className="mt-6 flex gap-6" role="tablist" aria-label="Profile sections">
            {(['matches', 'skins'] as const).map((id) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                className={twMerge(
                  'border-b-2 px-1 pb-3 text-sm font-semibold capitalize transition',
                  tab === id
                    ? 'border-sky-400 text-sky-300'
                    : 'border-transparent text-neutral-500 hover:text-white'
                )}
                onClick={() => setTab(id)}
              >
                {id === 'matches' ? 'Match history' : 'Skins'}
              </button>
            ))}
          </div>
        </header>
        {tab === 'matches' ? <MatchHistoryPage showHeader={false} /> : <SkinsPage />}
      </div>
    </main>
  )
}
