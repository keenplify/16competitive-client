import { useTranslation } from '../i18n/i18n'
export function useProfileModeLabel(): (id: string) => string {
  const { t } = useTranslation()
  const modeLabel = (id: string): string => {
    switch (id) {
      case '5v5':
      case 'ranked':
        return t('profile.modeCompetitive')
      case 'unrated':
        return t('profile.modeUnrated')
      case 'casual':
        return t('profile.modeCasual')
      case 'legacy':
        return 'CS 1.3 · 5v5'
      case 'legacy_3v3':
      case 'cs13_3v3':
        return 'CS 1.3 · 3v3'
      case 'ffa':
        return 'FFA'
      case 'arena':
        return 'Arena'
      default:
        return id
    }
  }
  return modeLabel
}
