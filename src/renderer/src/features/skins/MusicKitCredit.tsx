import type { JSX } from 'react'
import { twMerge } from 'tailwind-merge'
import type { MusicKit } from '../../../../shared/music-kits'
import { useTranslation } from '../i18n/i18n'

export function MusicKitCredit({
  kit,
  className
}: {
  kit: MusicKit
  className?: string
}): JSX.Element {
  const { t } = useTranslation()
  const credit = kit.artistName || (kit.artistUrl ? t('music.artistSite') : '')
  return (
    <p
      className={twMerge('min-h-5 truncate text-xs text-neutral-300', className)}
      title={credit || undefined}
    >
      {credit &&
        (kit.artistUrl ? (
          <a
            href={kit.artistUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="underline decoration-white/30 underline-offset-2 hover:text-sky-300 focus-visible:text-sky-300"
            aria-label={`${t('music.artistCredit')}: ${credit}`}
          >
            {credit}
          </a>
        ) : (
          <span>{credit}</span>
        ))}
    </p>
  )
}
