import translations from '../../../../shared/collection-translations.json'
import { useLanguageStore } from '../i18n/i18n'

export function useCollectionText() {
  const language = useLanguageStore((state) => state.language)
  return (key: keyof typeof translations.en, values: Record<string, string> = {}): string => {
    let text = translations[language][key]
    for (const [name, value] of Object.entries(values)) text = text.replaceAll(`{{${name}}}`, value)
    return text
  }
}
