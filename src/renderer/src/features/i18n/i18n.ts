import { useCallback } from 'react'
import { create } from 'zustand'

export const SUPPORTED_LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'ru', label: 'Русский' }
] as const

export type LanguageCode = (typeof SUPPORTED_LANGUAGES)[number]['code']

const english = {
  'nav.lobbyNavigation': 'Lobby navigation',
  'nav.home': 'Home',
  'nav.settings': 'Settings',
  'nav.inventory': 'Inventory',
  'nav.leaderboard': 'Leaderboard',
  'nav.play': 'Play',
  'nav.store': 'Store',
  'nav.news': 'News',
  'settings.language.title': 'Language',
  'settings.language.description': 'Choose the language used by the launcher interface.',
  'settings.language.help': 'Changes apply immediately and are saved on this device.'
} as const

export type TranslationKey = keyof typeof english

const russian: Record<TranslationKey, string> = {
  'nav.lobbyNavigation': 'Навигация лобби',
  'nav.home': 'Главная',
  'nav.settings': 'Настройки',
  'nav.inventory': 'Инвентарь',
  'nav.leaderboard': 'Рейтинг',
  'nav.play': 'Играть',
  'nav.store': 'Магазин',
  'nav.news': 'Новости',
  'settings.language.title': 'Язык',
  'settings.language.description': 'Выберите язык интерфейса лаунчера.',
  'settings.language.help': 'Изменения применяются сразу и сохраняются на этом устройстве.'
}

const translations: Record<LanguageCode, Record<TranslationKey, string>> = {
  en: english,
  ru: russian
}

const STORAGE_KEY = '16competitive.language'

export const isLanguageCode = (value: unknown): value is LanguageCode =>
  SUPPORTED_LANGUAGES.some((language) => language.code === value)

const readStoredLanguage = (): LanguageCode => {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    return isLanguageCode(stored) ? stored : 'en'
  } catch {
    return 'en'
  }
}

const applyDocumentLanguage = (language: LanguageCode): void => {
  if (typeof document !== 'undefined') document.documentElement.lang = language
}

const persistLanguage = (language: LanguageCode): void => {
  try {
    window.localStorage.setItem(STORAGE_KEY, language)
  } catch {
    // Language preference is non-critical. Keep the in-memory value if storage is unavailable.
  }
}

interface LanguageState {
  language: LanguageCode
  setLanguage: (language: LanguageCode) => void
}

const initialLanguage = readStoredLanguage()
applyDocumentLanguage(initialLanguage)

export const useLanguageStore = create<LanguageState>((set) => ({
  language: initialLanguage,
  setLanguage: (language) => {
    persistLanguage(language)
    applyDocumentLanguage(language)
    set({ language })
  }
}))

export const translate = (language: LanguageCode, key: TranslationKey): string =>
  translations[language][key] ?? english[key]

export function useTranslation(): {
  language: LanguageCode
  t: (key: TranslationKey) => string
} {
  const language = useLanguageStore((state) => state.language)
  const t = useCallback((key: TranslationKey) => translate(language, key), [language])
  return { language, t }
}
