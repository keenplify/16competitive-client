import { ArrowLeft } from 'lucide-react'
import { ButtonLink } from '../renderer/src/components/ui/Button'
import { useTranslation } from '../renderer/src/features/i18n/i18n'
import { partnerReturnUrl } from './partner-return'

export function PartnerReturnLink(): React.JSX.Element | null {
  const { t } = useTranslation()
  const href = partnerReturnUrl()
  if (!href) return null
  return (
    <ButtonLink
      href={href}
      variant="secondary"
      className="fixed bottom-4 left-4 z-[100002] max-w-[calc(100vw-2rem)] gap-2"
    >
      <ArrowLeft className="size-4 shrink-0" aria-hidden="true" />
      {t('partnerLogin.returnToPartner', { partner: 'GameHub' })}
    </ButtonLink>
  )
}
