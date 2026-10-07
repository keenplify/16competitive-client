import { Languages } from 'lucide-react'
import { useMemo, type JSX } from 'react'
import CreatableSelect from 'react-select/creatable'
import { useTranslation } from '../i18n/i18n'
import { CHAT_TRANSLATION_LANGUAGES } from './chat-translation-languages'
import { useChatTranslationStore } from './chat-translation.store'

type LanguageOption = { value: string; label: string }

const isValidLanguageCode = (value: string): boolean =>
  value.length <= 35 && /^[a-z]{2,3}(-[a-z0-9]{2,8})*$/.test(value)

export function ChatTranslationSettings(): JSX.Element {
  const { language: interfaceLanguage, t } = useTranslation()
  const language = useChatTranslationStore((state) => state.language)
  const status = useChatTranslationStore((state) => state.status)
  const error = useChatTranslationStore((state) => state.error)
  const setLanguage = useChatTranslationStore((state) => state.setLanguage)

  const options = useMemo(() => {
    const names = new Intl.DisplayNames([interfaceLanguage], { type: 'language' })
    const collator = new Intl.Collator(interfaceLanguage, { sensitivity: 'base' })
    const languages: LanguageOption[] = CHAT_TRANSLATION_LANGUAGES.map(({ code, name }) => {
      const localizedName = names.of(code)
      return {
        value: code,
        label:
          code !== 'tl' && localizedName && localizedName.toLowerCase() !== code
            ? localizedName
            : name
      }
    })
    if (language && language !== 'off' && !languages.some(({ value }) => value === language)) {
      const localizedName = names.of(language)
      languages.push({
        value: language,
        label:
          localizedName && localizedName.toLowerCase() !== language
            ? localizedName
            : t('settings.chatTranslation.customLabel')
      })
    }
    languages.sort((a, b) => collator.compare(a.label, b.label) || a.value.localeCompare(b.value))
    return [{ value: 'off', label: t('settings.chatTranslation.off') }, ...languages]
  }, [interfaceLanguage, language, t])

  return (
    <section data-i18n-skip className="mt-5 border border-white/10 bg-neutral-900/90 p-5 sm:p-7">
      <div className="flex items-start gap-3">
        <Languages className="mt-0.5 size-5 shrink-0 text-sky-400" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <h3 className="text-lg font-semibold">{t('settings.chatTranslation.title')}</h3>
          <p className="mt-1 text-sm text-neutral-400">
            {t('settings.chatTranslation.description')}
          </p>
          <div className="mt-5 max-w-md">
            <label
              htmlFor="chat-translation-language"
              className="mb-2 block text-sm text-neutral-300"
            >
              {t('settings.chatTranslation.languageLabel')}
            </label>
            <CreatableSelect<LanguageOption, false>
              inputId="chat-translation-language"
              unstyled
              isSearchable
              isClearable={false}
              isDisabled={status !== 'idle'}
              isLoading={status === 'loading'}
              menuPlacement="auto"
              menuPortalTarget={document.body}
              menuPosition="fixed"
              options={options}
              value={options.find((option) => option.value === language) ?? null}
              getOptionLabel={(option) => `${option.label} (${option.value})`}
              getOptionValue={(option) => option.value}
              placeholder={t('settings.chatTranslation.searchPlaceholder')}
              noOptionsMessage={() => t('settings.chatTranslation.noLanguages')}
              formatCreateLabel={(input) =>
                `${t('settings.chatTranslation.useCode')} ${input.trim().toLowerCase()}`
              }
              isValidNewOption={(input) => {
                const code = input.trim().toLowerCase()
                return isValidLanguageCode(code) && !options.some(({ value }) => value === code)
              }}
              onCreateOption={(input) => void setLanguage(input.trim().toLowerCase())}
              onChange={(option) => {
                if (option) void setLanguage(option.value)
              }}
              styles={{ menuPortal: (base) => ({ ...base, zIndex: 100 }) }}
              classNames={{
                control: ({ isFocused }) =>
                  `min-h-11 cursor-pointer border bg-black/30 text-sm transition ${isFocused ? 'border-sky-400 ring-1 ring-sky-400/20' : 'border-white/15 hover:border-white/30'}`,
                valueContainer: () => 'px-3 py-2',
                input: () => 'text-white',
                singleValue: () => 'text-white',
                placeholder: () => 'text-neutral-500',
                indicatorsContainer: () => 'pr-2 text-neutral-400',
                dropdownIndicator: () => 'p-1 hover:text-white',
                indicatorSeparator: () => 'hidden',
                menu: () =>
                  'overflow-hidden border border-white/15 bg-neutral-950 shadow-2xl shadow-black/60',
                menuList: () => 'max-h-72 p-1',
                option: ({ isFocused, isSelected }) =>
                  `cursor-pointer px-3 py-2 text-sm ${isSelected ? 'bg-sky-500/20 text-sky-200' : isFocused ? 'bg-white/10 text-white' : 'text-neutral-200'}`,
                noOptionsMessage: () => 'px-3 py-3 text-sm text-neutral-500'
              }}
            />
          </div>
          <p className="mt-3 text-xs text-neutral-500">{t('settings.chatTranslation.help')}</p>
          <p className="mt-2 min-h-5 text-xs text-red-300" role="status">
            {error ? t('settings.chatTranslation.error') : ''}
          </p>
        </div>
      </div>
    </section>
  )
}
