import { ChevronLeft, X } from 'lucide-react'
import { twMerge } from 'tailwind-merge'
import type { JSX } from 'react'
import { Button } from '../../components/ui/Button'
import { useTranslation } from '../i18n/i18n'

export function ProfilePopupNavigation({
  onBack,
  onClose,
  className
}: {
  onBack: () => void
  onClose: () => void
  className?: string
}): JSX.Element {
  const { t } = useTranslation()
  return (
    <div className={twMerge('flex items-center justify-between', className)}>
      <Button
        variant="ghost"
        className="size-10 p-0"
        onClick={onBack}
        aria-label={t('profile.back')}
        title={t('profile.back')}
      >
        <ChevronLeft className="size-5" aria-hidden="true" />
      </Button>
      <Button
        variant="ghost"
        className="size-10 p-0"
        onClick={onClose}
        aria-label={t('profile.close')}
        title={t('profile.close')}
      >
        <X className="size-5" aria-hidden="true" />
      </Button>
    </div>
  )
}
