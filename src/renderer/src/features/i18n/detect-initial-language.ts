const STORAGE_KEY = '16competitive.language'

type SupportedLanguage = 'en' | 'ru' | 'tl' | 'th' | 'id' | 'hi' | 'pt'

const localeLanguageMap: Record<string, SupportedLanguage> = {
  en: 'en',
  ru: 'ru',
  tl: 'tl',
  fil: 'tl',
  th: 'th',
  id: 'id',
  in: 'id',
  hi: 'hi',
  pt: 'pt'
}

const supportedLanguages: SupportedLanguage[] = ['en', 'ru', 'tl', 'th', 'id', 'hi', 'pt']

const detectPreferredLanguage = (): SupportedLanguage => {
  const locales = [
    ...(typeof navigator !== 'undefined' ? navigator.languages : []),
    typeof navigator !== 'undefined' ? navigator.language : undefined,
    typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().locale : undefined
  ].filter((locale): locale is string => Boolean(locale))

  for (const locale of locales) {
    const language = locale.toLowerCase().split(/[-_]/, 1)[0]
    const supported = localeLanguageMap[language]
    if (supported) return supported
  }

  return 'en'
}

try {
  const existing = window.localStorage.getItem(STORAGE_KEY)
  if (!existing || !supportedLanguages.includes(existing as SupportedLanguage)) {
    window.localStorage.setItem(STORAGE_KEY, detectPreferredLanguage())
  }
} catch {
  // Language detection is best effort. The i18n store will fall back to English.
}
