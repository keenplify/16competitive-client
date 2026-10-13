import { useState, type JSX } from 'react'
import { twMerge } from 'tailwind-merge'
import { Logo } from '../../components/ui/Logo'
import { useTranslation } from '../i18n/i18n'
import { usePartnerBrandingStore } from './partner-branding.store'

export function PartnerLogo({ className }: { className?: string }): JSX.Element {
  const url = usePartnerBrandingStore((state) => (state.enabled ? state.branding?.logoUrl : null))
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null)
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  const { t } = useTranslation()
  const visible = !!url && loadedUrl === url && failedUrl !== url
  return (
    <div className={twMerge('relative size-10', className)}>
      {!visible && <Logo className="h-full w-full" />}
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
