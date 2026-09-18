import { useEffect, useState, type JSX } from 'react'
import Select, { type SingleValue } from 'react-select'
import { twMerge } from 'tailwind-merge'
import { useAuthStore } from '../auth/auth.store'
import { SkinsPage } from '../skins/SkinsPage'
import { MatchHistoryPage } from './MatchHistoryPage'
import { useNavigationStore } from '../navigation/navigation.store'
import {
  COUNTRY_OPTIONS,
  CountryFlag,
  type CountryOption
} from '../../components/CountryFlag'

const REPRESENTING_FLAG_OPTIONS: CountryOption[] = [
  { code: '', name: 'No flag' },
  ...COUNTRY_OPTIONS
]

export function ProfilePage(): JSX.Element {
  const player = useAuthStore((state) => state.session?.player)
  const tab = useNavigationStore((state) => state.profileTab)
  const setTab = useNavigationStore((state) => state.setProfileTab)
  const changeFlagCountryCode = useAuthStore((state) => state.changeFlagCountryCode)
  const [draftFlag, setDraftFlag] = useState(player?.flagCountryCode ?? '')
  const [savingFlag, setSavingFlag] = useState(false)

  useEffect(() => {
    setDraftFlag(player?.flagCountryCode ?? '')
  }, [player?.flagCountryCode])

  const handleFlagChange = async (option: SingleValue<CountryOption>): Promise<void> => {
    const flagCountryCode = option?.code ?? ''
    const previousFlag = player?.flagCountryCode ?? ''
    setDraftFlag(flagCountryCode)
    setSavingFlag(true)
    const saved = await changeFlagCountryCode(flagCountryCode || null)
    if (!saved) setDraftFlag(previousFlag)
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
            <label
              htmlFor="representing-flag"
              className="min-w-64 flex-1 text-xs font-semibold text-neutral-300"
            >
              Representing flag
              <Select<CountryOption, false>
                inputId="representing-flag"
                unstyled
                isSearchable
                isDisabled={savingFlag}
                menuPlacement="auto"
                options={REPRESENTING_FLAG_OPTIONS}
                value={
                  REPRESENTING_FLAG_OPTIONS.find((option) => option.code === draftFlag) ??
                  REPRESENTING_FLAG_OPTIONS[0]
                }
                getOptionLabel={(option) => option.name}
                getOptionValue={(option) => option.code}
                onChange={(option) => void handleFlagChange(option)}
                formatOptionLabel={(option) => (
                  <span className="flex min-w-0 items-center gap-2.5">
                    {option.code ? (
                      <CountryFlag
                        code={option.code}
                        className="h-4 w-6 shrink-0 rounded-[2px] object-cover"
                      />
                    ) : (
                      <span className="h-4 w-6 shrink-0 rounded-[2px] border border-white/15 bg-white/5" />
                    )}
                    <span className="truncate">{option.name}</span>
                  </span>
                )}
                classNames={{
                  control: ({ isFocused }) =>
                    `mt-1 min-h-10 cursor-pointer border bg-neutral-900 text-sm transition ${
                      isFocused
                        ? 'border-sky-400 ring-1 ring-sky-400/20'
                        : 'border-white/15 hover:border-white/30'
                    }`,
                  valueContainer: () => 'px-3 py-1',
                  input: () => 'text-white',
                  singleValue: () => 'text-white',
                  placeholder: () => 'text-neutral-500',
                  indicatorsContainer: () => 'px-2 text-neutral-400',
                  dropdownIndicator: () => 'p-1 transition hover:text-white',
                  indicatorSeparator: () => 'mx-1 w-px bg-white/10',
                  menu: () =>
                    'z-50 mt-1 overflow-hidden border border-white/15 bg-neutral-950 shadow-2xl shadow-black/60',
                  menuList: () => 'max-h-72 p-1',
                  option: ({ isFocused, isSelected }) =>
                    `cursor-pointer px-3 py-2 text-sm transition ${
                      isSelected
                        ? 'bg-sky-400/20 text-sky-200'
                        : isFocused
                          ? 'bg-white/10 text-white'
                          : 'text-neutral-200'
                    }`,
                  noOptionsMessage: () => 'px-3 py-4 text-sm text-neutral-500'
                }}
              />
            </label>
            <p className="w-full text-xs text-neutral-500">
              {savingFlag ? 'Saving flag…' : 'Choose a flag or leave it blank.'}
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
