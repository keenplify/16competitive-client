import { Languages } from 'lucide-react'
import type { JSX } from 'react'
import { useAuthStore } from '../auth/auth.store'
import { SUPPORTED_LANGUAGES, useLanguageStore, useTranslation } from './i18n'

export function AuthLanguageOverlay(): JSX.Element | null {
  const session = useAuthStore((state) => state.session)
  const status = useAuthStore((state) => state.status)
  const { language, t } = useTranslation()
  const setLanguage = useLanguageStore((state) => state.setLanguage)

  if (session && ['authenticated', 'changing_username', 'logging_out'].includes(status)) return null

  return (
    <div className="fixed top-4 right-4 z-[90] flex max-w-[calc(100vw-2rem)] items-center gap-2 rounded-lg border border-white/10 bg-neutral-950/85 p-1.5 text-white shadow-xl backdrop-blur-md sm:top-6 sm:right-6">
      <Languages className="mx-1 size-4 shrink-0 text-sky-300" aria-hidden="true" />
      <div
        className="flex flex-wrap justify-end gap-1"
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
              onClick={() => setLanguage(option.code)}
              className={`rounded px-2.5 py-1.5 text-xs font-semibold transition sm:px-3 ${
                selected
                  ? 'bg-sky-500 text-white'
                  : 'text-neutral-400 hover:bg-white/5 hover:text-white'
              }`}
            >
              {option.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
