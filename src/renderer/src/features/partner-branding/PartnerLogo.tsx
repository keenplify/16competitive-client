import { hasPartnerPageContext } from './partner-identity'
import { useState, type JSX } from 'react'
import { twMerge } from 'tailwind-merge'
import { Logo } from '../../components/ui/Logo'
import { useTranslation } from '../i18n/i18n'
import { usePartnerBrandingStore } from './partner-branding.store'

export function PartnerLogo({ className }: { className?: string }): JSX.Element {
  const url = usePartnerBrandingStore((state) => state.branding?.logoUrl)
  const stockAllowed = usePartnerBrandingStore(
    (state) => state.resolved && !state.branding && !hasPartnerPageContext()
  )
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null)
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  const { t } = useTranslation()
  const visible = !!url && loadedUrl === url && failedUrl !== url
  return (
    <div className={twMerge('relative size-10', className)}>
      {!visible && stockAllowed && <Logo className="h-full w-full" />}
      {url && failedUrl !== url && (
        <img
          key={url}
          src={url}
          alt={t('auth.partnerLogo')}
          className={twMerge(
            'absolute inset-0 h-full w-full object-contain',
            !visible && 'invisible'
          )}
          onLoad={() => setLoadedUrl(url)}
          onError={() => setFailedUrl(url)}
        />
      )}
    </div>
  )
}
