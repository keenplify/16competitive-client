import { useState, type JSX } from 'react'
import { twMerge } from 'tailwind-merge'
import { Button, ButtonLink } from '../../components/ui/Button'
import { ModalDialog } from '../../components/ui/ModalDialog'
import { useTranslation } from '../i18n/i18n'
import { useWebHelperPromptStore } from './web-helper-prompt.store'

const isWindows = navigator.platform.toLowerCase().includes('win')
const helperDownload = isWindows
  ? 'https://github.com/keenplify/16competitive-client/releases/latest/download/competitive16-web-helper.exe'
  : 'https://github.com/keenplify/16competitive-client/releases/latest/download/competitive16-web-helper-linux'

export function WebHelperSetup({ className }: { className?: string }): JSX.Element {
  const { t } = useTranslation()
  const [showLinuxInstructions, setShowLinuxInstructions] = useState(false)
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
          {t('webHelper.check')}
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={status === 'checking'}
          onClick={() => void check('rust')}
        >
          {t('webHelper.checkRust')}
        </Button>
        <ButtonLink
          variant="secondary"
          href={helperDownload}
          download
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => {
            if (!isWindows) setShowLinuxInstructions(true)
          }}
        >
          {t(status === 'outdated-rust' ? 'webHelper.update' : 'webHelper.download')}
        </ButtonLink>
      </div>
      <p className="min-h-12 text-sm text-neutral-300" role="status">
        {statusText}
      </p>
      <ModalDialog
        open={showLinuxInstructions}
        onClose={() => setShowLinuxInstructions(false)}
        label={t('webHelper.linuxTitle')}
      >
        <div className="space-y-4 p-6 text-white">
          <h2 className="text-xl font-semibold">{t('webHelper.linuxTitle')}</h2>
          <p className="text-sm text-neutral-300">{t('webHelper.linuxDescription')}</p>
          <pre className="overflow-x-auto border border-neutral-700 bg-black p-4 text-sm text-sky-200">
            <code>
              {
                'cd ~/Downloads\nchmod +x competitive16-web-helper-linux\n./competitive16-web-helper-linux'
              }
            </code>
          </pre>
          <p className="text-sm text-neutral-300">{t('webHelper.linuxAfter')}</p>
          <Button type="button" variant="secondary" onClick={() => setShowLinuxInstructions(false)}>
            {t('webHelper.close')}
          </Button>
        </div>
      </ModalDialog>
    </div>
  )
}
