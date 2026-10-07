import { Languages } from 'lucide-react'
import { useState, type FormEvent, type JSX } from 'react'
import type { ChatTranslationLanguage } from '../../../../shared/auth'
import { Button } from '../../components/ui/Button'
import { TextField } from '../../components/ui/TextField'
import { SUPPORTED_LANGUAGES, useTranslation } from '../i18n/i18n'
import { useChatTranslationStore } from './chat-translation.store'

export function ChatTranslationSettings(): JSX.Element {
  const { t } = useTranslation()
  const language = useChatTranslationStore((state) => state.language)
  const status = useChatTranslationStore((state) => state.status)
  const error = useChatTranslationStore((state) => state.error)
  const setLanguage = useChatTranslationStore((state) => state.setLanguage)
  const [customCode, setCustomCode] = useState<string | null>(null)
  const [invalidCode, setInvalidCode] = useState(false)

  const customActive =
    language !== null &&
    language !== 'off' &&
    !SUPPORTED_LANGUAGES.some(({ code }) => code === language)
  const normalizedCode = (customCode ?? (customActive ? language : '')).trim().toLowerCase()
  const validCode =
    normalizedCode.length <= 35 && /^[a-z]{2,3}(-[a-z0-9]{2,8})*$/.test(normalizedCode)
  const saveCustomCode = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    if (!validCode) {
      setInvalidCode(true)
      return
    }
    setInvalidCode(false)
    void setLanguage(normalizedCode)
  }

  const options: { value: ChatTranslationLanguage; label: string }[] = [
    { value: 'off', label: t('settings.chatTranslation.off') },
    ...SUPPORTED_LANGUAGES.map(({ code, label }) => ({ value: code, label }))
  ]

  return (
    <section data-i18n-skip className="mt-5 border border-white/10 bg-neutral-900/90 p-5 sm:p-7">
      <div className="flex items-start gap-3">
        <Languages className="mt-0.5 size-5 shrink-0 text-sky-400" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <h3 className="text-lg font-semibold">{t('settings.chatTranslation.title')}</h3>
          <p className="mt-1 text-sm text-neutral-400">
            {t('settings.chatTranslation.description')}
          </p>
          <div
            className="mt-5 inline-flex flex-wrap border border-white/10 bg-black/30 p-1"
            role="group"
            aria-label={t('settings.chatTranslation.title')}
          >
            {options.map(({ value, label }) => (
              <Button
                key={value ?? 'off'}
                variant="ghost"
                aria-pressed={status !== 'loading' && language === value}
                disabled={status !== 'idle'}
                onClick={() => {
                  setCustomCode(null)
                  void setLanguage(value)
                }}
                className={`min-w-24 disabled:opacity-60 ${status !== 'loading' && language === value ? 'bg-sky-500 text-white hover:bg-sky-500 hover:text-white' : ''}`}
              >
                {label}
              </Button>
            ))}
          </div>
          <form className="mt-5 flex flex-wrap items-end gap-3" onSubmit={saveCustomCode}>
            <TextField
              id="chat-translation-custom-language"
              label={t('settings.chatTranslation.customLabel')}
              placeholder={t('settings.chatTranslation.customPlaceholder')}
              hint={t('settings.chatTranslation.customHelp')}
              value={customCode ?? (customActive ? language : '')}
              maxLength={35}
              autoComplete="off"
              onChange={(event) => {
                setCustomCode(event.target.value)
                setInvalidCode(false)
              }}
              className="min-w-40"
            />
            <Button type="submit" disabled={status !== 'idle'} className="h-11 min-w-24">
              {t('settings.chatTranslation.apply')}
            </Button>
          </form>
          <p className="mt-2 min-h-5 text-xs text-sky-300" role="status">
            {customActive ? t('settings.chatTranslation.customActive', { code: language }) : ''}
          </p>
          <p className="mt-3 text-xs text-neutral-500">{t('settings.chatTranslation.help')}</p>
          <p className="mt-2 min-h-5 text-xs text-red-300" role="status">
            {invalidCode
              ? t('settings.chatTranslation.invalidCode')
              : error
                ? t('settings.chatTranslation.error')
                : ''}
          </p>
        </div>
      </div>
    </section>
  )
}
