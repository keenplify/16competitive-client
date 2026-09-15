import { Languages } from 'lucide-react'
import type { JSX } from 'react'
import {
  SUPPORTED_LANGUAGES,
  useLanguageStore,
  useTranslation,
  type LanguageCode
} from './i18n'

export function LanguageSettings(): JSX.Element {
  const { language, t } = useTranslation()
  const setLanguage = useLanguageStore((state) => state.setLanguage)

  return (
    <section className="border border-white/10 bg-neutral-900/90 p-5 sm:p-7">
      <div className="flex items-start gap-3">
        <Languages className="mt-0.5 size-5 shrink-0 text-sky-400" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <h3 className="text-lg font-semibold">{t('settings.language.title')}</h3>
          <p className="mt-1 text-sm text-neutral-400">{t('settings.language.description')}</p>

          <div
            className="mt-5 inline-flex rounded-md border border-white/10 bg-black/30 p-1"
            role="group"
            aria-label={t('settings.language.title')}
          >
            {SUPPORTED_LANGUAGES.map((option) => {
              const selected = option.code === language
              return (
                <button
                  key={option.code}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setLanguage(option.code as LanguageCode)}
                  className={`rounded px-4 py-2 text-sm font-semibold transition ${
                    selected
                      ? 'bg-sky-500 text-white shadow-[0_0_18px_rgba(14,165,233,0.2)]'
                      : 'text-neutral-400 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  {option.label}
                </button>
              )
            })}
          </div>

          <p className="mt-3 text-xs text-neutral-500">{t('settings.language.help')}</p>
        </div>
      </div>
    </section>
  )
}
