import { useState, type JSX } from 'react'
import Select, { type SingleValue } from 'react-select'
import { twMerge } from 'tailwind-merge'
import { useAuthStore } from '../auth/auth.store'
import { SkinsPage } from '../skins/SkinsPage'
import { MatchHistoryPage } from './MatchHistoryPage'
import { OperationPage } from '../operations/OperationPage'
import { useNavigationStore } from '../navigation/navigation.store'
import { COUNTRY_OPTIONS, CountryFlag, type CountryOption } from '../../components/CountryFlag'
import { TabList } from '../../components/ui/TabList'

const FLAG_HELP_OPTION: CountryOption = {
  code: '__help__',
  name: 'Choose a flag or leave it blank.'
}

const REPRESENTING_FLAG_OPTIONS: CountryOption[] = [
  FLAG_HELP_OPTION,
  { code: '', name: 'No flag' },
  ...COUNTRY_OPTIONS
]

export function ProfilePage(): JSX.Element {
  const player = useAuthStore((state) => state.session?.player)
  const tab = useNavigationStore((state) => state.profileTab)
  const setTab = useNavigationStore((state) => state.setProfileTab)
  const changeFlagCountryCode = useAuthStore((state) => state.changeFlagCountryCode)
  const [draftFlag, setDraftFlag] = useState<string | null>(null)
  const [savingFlag, setSavingFlag] = useState(false)
  const selectedFlag = draftFlag ?? player?.flagCountryCode ?? ''

  const handleFlagChange = async (option: SingleValue<CountryOption>): Promise<void> => {
    if (option?.code === FLAG_HELP_OPTION.code) return
    const flagCountryCode = option?.code ?? ''
    setDraftFlag(flagCountryCode)
    setSavingFlag(true)
    await changeFlagCountryCode(flagCountryCode || null)
    setDraftFlag(null)
    setSavingFlag(false)
  }

  return (
    <main className="min-h-[calc(100vh-5rem)] w-full p-6 text-white sm:p-10">
      <div className={twMerge('mx-auto w-full max-w-360')}>
        <header className="border-b border-white/10 pb-0 drop-shadow-[0_2px_5px_rgba(0,0,0,0.9)]">
          <p className="text-xs font-bold tracking-[0.2em] text-sky-400 uppercase">Profile</p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-semibold">{player?.username ?? 'Player'}</h1>
            <div className="w-[100px] shrink-0">
              <Select<CountryOption, false>
                inputId="representing-flag"
                aria-label="Representing flag"
                unstyled
                isSearchable
                isDisabled={savingFlag}
                menuPlacement="auto"
                options={REPRESENTING_FLAG_OPTIONS}
                value={
                  REPRESENTING_FLAG_OPTIONS.find((option) => option.code === selectedFlag) ??
                  REPRESENTING_FLAG_OPTIONS[0]
                }
                getOptionLabel={(option) => option.name}
                getOptionValue={(option) => option.code}
                isOptionDisabled={(option) => option.code === FLAG_HELP_OPTION.code}
                onChange={(option) => void handleFlagChange(option)}
                formatOptionLabel={(option, { context }) =>
                  context === 'value' ? (
                    option.code ? (
                      <CountryFlag code={option.code} className="h-4 w-6  object-cover" />
                    ) : (
                      <span
                        className="h-4 w-6  border border-white/15 bg-white/5"
                        aria-label="No flag"
                      />
                    )
                  ) : option.code === FLAG_HELP_OPTION.code ? (
                    <span className="text-xs text-neutral-500">{option.name}</span>
                  ) : (
                    <span className="flex min-w-0 items-center gap-2.5">
                      {option.code ? (
                        <CountryFlag
                          code={option.code}
                          className="h-4 w-6 shrink-0  object-cover"
                        />
                      ) : (
                        <span className="h-4 w-6 shrink-0  border border-white/15 bg-white/5" />
                      )}
                      <span className="truncate">{option.name}</span>
                    </span>
                  )
                }
                classNames={{
                  control: ({ isFocused }) =>
                    `min-h-9 cursor-pointer border bg-neutral-900 text-sm transition ${
                      isFocused
                        ? 'border-sky-400 ring-1 ring-sky-400/20'
                        : 'border-white/15 hover:border-white/30'
                    }`,
                  valueContainer: () => 'justify-center px-2 py-1',
                  input: () => 'text-white',
                  singleValue: () => 'flex justify-center text-white',
                  placeholder: () => 'text-neutral-500',
                  indicatorsContainer: () => 'pr-1 text-neutral-400',
                  dropdownIndicator: () => 'p-1 transition hover:text-white',
                  indicatorSeparator: () => 'hidden',
                  menu: () =>
                    'z-50 mt-1 min-w-56 overflow-hidden border border-white/15 bg-neutral-950 shadow-2xl shadow-black/60',
                  menuList: () => 'max-h-72 p-1',
                  option: ({ isDisabled, isFocused, isSelected }) =>
                    `px-3 py-2 text-sm transition ${
                      isDisabled
                        ? 'cursor-default border-b border-white/10 text-neutral-500'
                        : isSelected
                          ? 'cursor-pointer bg-sky-400/20 text-sky-200'
                          : isFocused
                            ? 'cursor-pointer bg-white/10 text-white'
                            : 'cursor-pointer text-neutral-200'
                    }`,
                  noOptionsMessage: () => 'px-3 py-4 text-sm text-neutral-500'
                }}
              />
            </div>
          </div>
          <TabList
            className="mt-6 border-b-0"
            ariaLabel="Profile sections"
            value={tab}
            items={[
              { value: 'matches', label: 'Match history' },
              { value: 'skins', label: 'Loadout' },
              { value: 'operation', label: 'Operation' }
            ]}
            onChange={setTab}
          />
        </header>
        {tab === 'matches' ? (
          <MatchHistoryPage showHeader={false} />
        ) : tab === 'skins' ? (
          <SkinsPage />
        ) : (
          <OperationPage />
        )}
      </div>
    </main>
  )
}
