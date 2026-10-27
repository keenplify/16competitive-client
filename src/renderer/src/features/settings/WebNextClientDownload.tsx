import type { JSX } from 'react'
import { Download, LoaderCircle } from 'lucide-react'
import { twMerge } from 'tailwind-merge'
import { NEXTCLIENT_DOWNLOAD_URL } from '../../../../shared/game-downloads'
import { useTranslation } from '../i18n/i18n'
import { useWebHelperPromptStore } from '../matchmaking/web-helper-prompt.store'
import { useGameSettingsStore } from './game-settings.store'
import { Button } from '../../components/ui/Button'

export function WebNextClientDownload({ className }: { className?: string }): JSX.Element {
  const { t } = useTranslation()
  const ready = useWebHelperPromptStore((state) => state.nativeReady)
  const platform = useGameSettingsStore((state) => state.platform)
  const status = useGameSettingsStore((state) => state.nextClientInstallStatus)
  const install = useGameSettingsStore((state) => state.installNextClient)
  const cancel = useGameSettingsStore((state) => state.cancelNextClientDetection)
  const native = ready && platform === 'win32'
  const busy = !['idle', 'ready', 'error'].includes(status)
  return (
    <div className={twMerge('mt-5 border border-white/10 bg-neutral-900/90 p-5 sm:p-7', className)}>
      <h3 className="text-lg font-semibold">NextClient</h3>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-neutral-400">
        {t(native ? 'web.nextClientHelperHelp' : 'web.nextClientDownloadHelp')}
      </p>
      {native ? (
        <div className="mt-5 flex min-h-11 flex-wrap gap-3">
          <Button className="min-w-52 gap-2" disabled={busy} onClick={() => void install()}>
            {busy ? (
              <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <Download className="size-4" aria-hidden="true" />
            )}
            {t('web.nextClientDownload')}
          </Button>
          <Button
            variant="ghost"
            className={busy ? '' : 'invisible pointer-events-none'}
            disabled={!busy}
            aria-hidden={!busy}
            tabIndex={busy ? 0 : -1}
            onClick={cancel}
          >
            {t('web.nextClientCancel')}
          </Button>
        </div>
      ) : (
        <a
          href={NEXTCLIENT_DOWNLOAD_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-5 inline-flex min-h-11 items-center border border-sky-400/35 px-4 py-2 text-sm font-semibold text-sky-300 transition-colors hover:bg-sky-400/10 hover:text-sky-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400"
        >
          <Download className="mr-2 size-4 shrink-0" aria-hidden="true" />
          {t('web.nextClientDownload')}
        </a>
      )}
      {native && (
        <p className="mt-3 h-10 overflow-y-auto text-sm text-neutral-400" role="status">
          {status === 'error'
            ? t('webHelper.settingsError')
            : busy
              ? t('web.nextClientInstalling')
              : ''}
        </p>
      )}
    </div>
  )
}
