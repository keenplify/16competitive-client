import type { JSX } from 'react'
import { twMerge } from 'tailwind-merge'
import { Button } from '../../components/ui/Button'
import { useTranslation } from '../i18n/i18n'
import { useWebHelperPromptStore } from './web-helper-prompt.store'

const helperDownload = navigator.platform.toLowerCase().includes('win')
  ? 'https://github.com/keenplify/16competitive-client/releases/latest/download/competitive16-web-helper.exe'
  : 'https://github.com/keenplify/16competitive-client/releases/latest/download/competitive16-web-helper-linux'

export function WebHelperSetup({ className }: { className?: string }): JSX.Element {
  const { t } = useTranslation()
  const status = useWebHelperPromptStore((state) => state.status)
  const setStatus = useWebHelperPromptStore((state) => state.setStatus)
  const check = async (target: 'electron' | 'rust'): Promise<void> => {
    setStatus('checking')
    try {
      const launcher = await window.api.matchmaking.checkLocalLauncher?.(target)
      setStatus(launcher ?? 'unavailable')
    } catch {
      setStatus('unavailable')
    }
  }
  const statusText =
    status === 'checking'
      ? t('webHelper.checking')
      : status === 'electron'
        ? t('webHelper.electronReady')
        : status === 'rust'
          ? t('webHelper.rustReady')
          : status === 'outdated-electron'
            ? t('webHelper.electronOutdated')
            : status === 'outdated-rust'
              ? t('webHelper.rustOutdated')
          : status === 'unavailable'
            ? t('webHelper.unavailable')
            : '\u00a0'

  return (
    <div className={twMerge('space-y-3', className)}>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          disabled={status === 'checking'}
          onClick={() => void check('electron')}
        >
          {t('webHelper.checkDesktop')}
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={status === 'checking'}
          onClick={() => void check('rust')}
        >
          {t('webHelper.checkRust')}
        </Button>
        <a
          href={helperDownload}
          download
          className="inline-flex min-h-11 items-center border border-sky-400/35 px-4 py-2 text-sm font-semibold text-sky-300 hover:bg-sky-400/10 focus-visible:outline-2 focus-visible:outline-sky-400"
        >
          {t(status === 'outdated-rust' ? 'webHelper.update' : 'webHelper.download')}
        </a>
      </div>
      <p className="min-h-12 text-sm text-neutral-300" role="status">
        {statusText}
      </p>
    </div>
  )
}
