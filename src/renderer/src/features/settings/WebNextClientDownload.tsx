import type { JSX } from 'react'
import { Download } from 'lucide-react'
import { twMerge } from 'tailwind-merge'
import { NEXTCLIENT_DOWNLOAD_URL } from '../../../../shared/game-downloads'
import { useTranslation } from '../i18n/i18n'

export function WebNextClientDownload({ className }: { className?: string }): JSX.Element {
  const { t } = useTranslation()
  return (
    <div className={twMerge('mt-5 border border-white/10 bg-neutral-900/90 p-5 sm:p-7', className)}>
      <h3 className="text-lg font-semibold">NextClient</h3>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-neutral-400">
        {t('web.nextClientDownloadHelp')}
      </p>
      <a
        href={NEXTCLIENT_DOWNLOAD_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-5 inline-flex min-h-11 items-center border border-sky-400/35 px-4 py-2 text-sm font-semibold text-sky-300 transition-colors hover:bg-sky-400/10 hover:text-sky-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400"
      >
        <Download className="mr-2 size-4 shrink-0" aria-hidden="true" />
        {t('web.nextClientDownload')}
      </a>
    </div>
  )
}
