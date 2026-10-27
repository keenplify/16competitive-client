import { createPortal } from 'react-dom'
import { useTranslation } from '../features/i18n/i18n'

export function AlphaReleaseWatermark(): React.JSX.Element {
  const { t } = useTranslation()
  return createPortal(
    <div className="pointer-events-none fixed bottom-16 right-3 z-[2147483647] select-none text-right text-white/35">
      <p className="text-sm">{t('release.alpha')}</p>
      <p className="text-xs">{t('release.bugs')}</p>
    </div>,
    document.body
  )
}
