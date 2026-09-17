import { useEffect, useMemo, useState, type JSX } from 'react'
import { twMerge } from 'tailwind-merge'
import { useAuthStore } from '../auth/auth.store'
import { SkinsPage } from '../skins/SkinsPage'
import { MatchHistoryPage } from './MatchHistoryPage'
import { useNavigationStore } from '../navigation/navigation.store'
import {
  CountryFlag,
  detectLocaleCountryCode,
  orderedCountryOptions,
  countryFlagEmoji
} from '../../components/CountryFlag'

export function ProfilePage(): JSX.Element {
  const player = useAuthStore((state) => state.session?.player)
  const tab = useNavigationStore((state) => state.profileTab)
  const setTab = useNavigationStore((state) => state.setProfileTab)
  const changeFlagCountryCode = useAuthStore((state) => state.changeFlagCountryCode)
  const detectedCode = useMemo(() => detectLocaleCountryCode(), [])
  const countryOptions = useMemo(() => orderedCountryOptions(detectedCode), [detectedCode])
  const [draftFlag, setDraftFlag] = useState(player?.flagCountryCode ?? '')
  const [savingFlag, setSavingFlag] = useState(false)

  useEffect(() => {
    setDraftFlag(player?.flagCountryCode ?? '')
  }, [player?.flagCountryCode])

  const saveFlag = async (): Promise<void> => {
    setSavingFlag(true)
    await changeFlagCountryCode(draftFlag || null)
    setSavingFlag(false)
  }

  return (
    <main className="min-h-[calc(100vh-5rem)] w-full p-6 text-white sm:p-10">
      <div className={twMerge('mx-auto w-full max-w-360')}>
        <header className="border-b border-white/10 pb-0 drop-shadow-[0_2px_5px_rgba(0,0,0,0.9)]">
          <p className="text-xs font-bold tracking-[0.2em] text-sky-400 uppercase">Profile</p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-semibold">{player?.username ?? 'Player'}</h1>
            <CountryFlag code={player?.flagCountryCode} className="text-2xl" />
          </div>
          <div className="mt-4 flex max-w-xl flex-wrap items-end gap-2">
            <label className="min-w-64 flex-1 text-xs font-semibold text-neutral-300">
              Representing flag
              <select
                className="mt-1 h-10 w-full border border-white/15 bg-neutral-900 px-3 text-sm text-white outline-none focus:border-sky-400"
                value={draftFlag}
                onChange={(event) => setDraftFlag(event.target.value)}
              >
                <option value="">No flag</option>
                {countryOptions.map((country, index) => (
                  <option key={country.code} value={country.code}>
                    {country.code === detectedCode && index === 0 ? 'Suggested · ' : ''}
                    {country.name} {countryFlagEmoji(country.code)}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="h-10 border border-sky-400/40 bg-sky-400/10 px-4 text-xs font-bold text-sky-300 uppercase transition hover:bg-sky-400/20 disabled:opacity-50"
              disabled={savingFlag || draftFlag === (player?.flagCountryCode ?? '')}
              onClick={() => void saveFlag()}
            >
              {savingFlag ? 'Saving…' : 'Save flag'}
            </button>
            <p className="w-full text-xs text-neutral-500">
              {detectedCode
                ? `${detectedCode} is suggested from your device locale, but nothing is selected automatically.`
                : 'Choose a flag or leave it blank.'}
            </p>
          </div>
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
                    : 'border-transparent text-neutral-300 hover:text-white'
                )}
                onClick={() => setTab(id)}
              >
                {id === 'matches' ? 'Match history' : 'Loadout'}
              </button>
            ))}
          </div>
        </header>
        {tab === 'matches' ? <MatchHistoryPage showHeader={false} /> : <SkinsPage />}
      </div>
    </main>
  )
}
