const STORAGE_KEY = '16competitive.language'

const localeLanguageMap: Record<string, 'en' | 'ru' | 'tl' | 'th' | 'id'> = {
  en: 'en',
  ru: 'ru',
  tl: 'tl',
  fil: 'tl',
  th: 'th',
  id: 'id',
  in: 'id'
}

const detectPreferredLanguage = (): 'en' | 'ru' | 'tl' | 'th' | 'id' => {
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
  if (!existing || !['en', 'ru', 'tl', 'th', 'id'].includes(existing)) {
    window.localStorage.setItem(STORAGE_KEY, detectPreferredLanguage())
  }
} catch {
  // Language detection is best effort. The i18n store will fall back to English.
}
