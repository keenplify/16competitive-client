import type { JSX } from 'react'
import { useTranslation } from '../i18n/i18n'
import { WebHelperDownloads } from './WebHelperDownloads'

export function OutdatedHelperNotice(): JSX.Element {
  const { t } = useTranslation()
  return (
    <div className="grid gap-2">
      <span>{t('webHelper.rustOutdated')}</span>
      <WebHelperDownloads />
    </div>
  )
}
