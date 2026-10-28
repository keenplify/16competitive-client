import { useEffect, useState, type JSX } from 'react'
import { LoaderCircle } from 'lucide-react'
import { twMerge } from 'tailwind-merge'
import { Button, ButtonLink } from '../../components/ui/Button'
import { ModalDialog } from '../../components/ui/ModalDialog'
import { useTranslation } from '../i18n/i18n'
import { useWebHelperPromptStore } from './web-helper-prompt.store'

const isWindows = navigator.platform.toLowerCase().includes('win')
const helperRelease = 'https://github.com/keenplify/16competitive-client/releases/latest/download/'

export function WebHelperSetup({
  className,
  onContinue,
  inlineSetup = false
}: {
  className?: string
  onContinue?: () => void
  inlineSetup?: boolean
}): JSX.Element {
  const { t } = useTranslation()
  const status = useWebHelperPromptStore((state) => state.status)
  const setupOpen = useWebHelperPromptStore((state) => state.setupOpen)
  const command = useWebHelperPromptStore((state) => state.setupCommand)
  const prepareSetup = useWebHelperPromptStore((state) => state.prepareSetup)
  const closeSetup = useWebHelperPromptStore((state) => state.closeSetup)
  const [copyFeedback, setCopyFeedback] = useState<{
    command: string
    status: 'copied' | 'failed'
  } | null>(null)
  const copyStatus = setupOpen && copyFeedback?.command === command ? copyFeedback.status : 'idle'
  const copyCommand = async (): Promise<void> => {
    if (!command) return
    try {
      await navigator.clipboard.writeText(command)
      setCopyFeedback({ command, status: 'copied' })
    } catch {
      setCopyFeedback({ command, status: 'failed' })
    }
  }
  useEffect(() => {
    const checkAfterInstall = (): void => {
      const state = useWebHelperPromptStore.getState()
      if (state.awaitingInstall && !state.setupOpen && state.status !== 'checking')
        void state.checkNative()
    }
    window.addEventListener('focus', checkAfterInstall)
    return () => window.removeEventListener('focus', checkAfterInstall)
  }, [])
  const statusText =
    status === 'checking'
      ? t('webHelper.checking')
      : status === 'rust'
        ? t('webHelper.rustReady')
        : status === 'outdated-rust'
          ? t('webHelper.rustOutdated')
          : status === 'unavailable'
            ? t('webHelper.unavailable')
            : '\u00a0'
  const setupInstructions = (
    <div className="space-y-4 p-6 text-white">
      <h2 className="text-xl font-semibold">{t('webHelper.linuxTitle')}</h2>
      <p className="text-sm leading-6 text-neutral-300">{t('webHelper.linuxDescription')}</p>
      <pre className="h-56 overflow-auto whitespace-pre-wrap break-all border border-neutral-700 bg-black p-4 text-sm text-sky-200">
        <code>{command ?? t('webHelper.checking')}</code>
      </pre>
      <p className="h-16 overflow-auto text-sm leading-6 text-neutral-300" role="status">
        {status === 'unavailable' || status === 'outdated-rust'
          ? statusText
          : t('webHelper.linuxAfter')}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="primary" disabled={!command} onClick={() => void copyCommand()}>
          {t('webHelper.copyCommand')}
        </Button>
        <Button variant="secondary" onClick={closeSetup}>
          {t('webHelper.close')}
        </Button>
      </div>
      <p className="h-12 overflow-auto text-sm leading-6 text-neutral-300" role="status">
        {copyStatus === 'copied'
          ? t('webHelper.commandCopied')
          : copyStatus === 'failed'
            ? t('webHelper.copyFailed')
            : '\u00a0'}
      </p>
    </div>
  )

  return (
    <div className={twMerge('space-y-4', className)}>
      <p
        className="flex min-h-12 items-start gap-2 text-sm leading-6 text-neutral-300"
        role="status"
      >
        {status === 'checking' && (
          <LoaderCircle className="mt-1 size-4 shrink-0 animate-spin" aria-hidden="true" />
        )}
        <span>{statusText}</span>
      </p>
      <div className={twMerge('grid gap-3', onContinue && 'sm:grid-cols-2')}>
        {(isWindows
          ? [{ file: 'competitive16-web-helper.exe', arch: null }]
          : [
              { file: 'competitive16-web-helper-linux', arch: 'x64' as const },
              { file: 'competitive16-web-helper-linux-arm64', arch: 'arm64' as const }
            ]
        ).map(({ file, arch }) => (
          <ButtonLink
            key={file}
            variant="primary"
            className="h-auto min-h-11 py-2 text-center"
            href={`${helperRelease}${file}`}
            download
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => {
              if (arch) void prepareSetup(arch)
              else useWebHelperPromptStore.getState().awaitInstall()
            }}
          >
            {t('webHelper.download')}
            {arch ? ` · Linux ${arch === 'x64' ? 'x64' : 'ARM64'}` : ''}
          </ButtonLink>
        ))}
        {onContinue && (
          <Button className="h-auto min-h-11 py-2" variant="secondary" onClick={onContinue}>
            {t('webHelper.notNow')}
          </Button>
        )}
      </div>
      {inlineSetup && setupOpen && (
        <div className="border border-white/10 bg-neutral-900/90">{setupInstructions}</div>
      )}
      {!inlineSetup && (
        <ModalDialog
          open={setupOpen}
          onClose={closeSetup}
          label={t('webHelper.linuxTitle')}
          className="max-w-xl"
          vguiTitlebar={false}
        >
          {setupInstructions}
        </ModalDialog>
      )}
    </div>
  )
}
