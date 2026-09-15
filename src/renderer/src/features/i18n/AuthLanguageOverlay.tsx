import { Languages } from 'lucide-react'
import type { JSX } from 'react'
import { useAuthStore } from '../auth/auth.store'
import { SUPPORTED_LANGUAGES, useLanguageStore, useTranslation, type LanguageCode } from './i18n'

export function AuthLanguageOverlay(): JSX.Element | null {
  const session = useAuthStore((state) => state.session)
  const status = useAuthStore((state) => state.status)
  const { language } = useTranslation()
  const setLanguage = useLanguageStore((state) => state.setLanguage)

  if (session && ['authenticated', 'changing_username', 'logging_out'].includes(status)) return null

  return (
    <div className="fixed top-4 right-4 z-[90] flex items-center gap-2 rounded-lg border border-white/10 bg-neutral-950/85 p-1.5 text-white shadow-xl backdrop-blur-md sm:top-6 sm:right-6">
      <Languages className="mx-1 size-4 text-sky-300" aria-hidden="true" />
      <div className="flex gap-1" role="group" aria-label="Language">
        {SUPPORTED_LANGUAGES.map((option) => {
          const selected = option.code === language
          return (
            <button
              key={option.code}
              type="button"
              aria-pressed={selected}
              onClick={() => setLanguage(option.code as LanguageCode)}
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
