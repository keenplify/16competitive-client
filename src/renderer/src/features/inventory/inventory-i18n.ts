import translations from '../../../../shared/inventory-translations.json'
import { useLanguageStore } from '../i18n/i18n'
export type InventoryText = keyof typeof translations.en
export const inventoryText = (key: InventoryText): string => translations[useLanguageStore.getState().language][key]
export function useInventoryText() {
  const language = useLanguageStore(s => s.language)
  return (key: InventoryText): string => translations[language][key]
}
