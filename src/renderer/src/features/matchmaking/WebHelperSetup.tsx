import { useEffect, useState, type JSX } from 'react'
import { ArrowUpRight, Copy, LoaderCircle } from 'lucide-react'
import { twMerge } from 'tailwind-merge'
import { Button, ButtonLink } from '../../components/ui/Button'
import { ModalDialog } from '../../components/ui/ModalDialog'
import { useTranslation } from '../i18n/i18n'
import { useNativeHelperSettingsStore } from '../settings/native-helper-settings.store'
import { useWebHelperPromptStore } from './web-helper-prompt.store'

const isWindows = navigator.platform.toLowerCase().includes('win')
const helperRelease = 'https://github.com/keenplify/16competitive-client/releases/latest/download/'
const helperSource = 'https://github.com/keenplify/16competitive-client/tree/main/web-helper'

export function WebHelperSetup({
  className,
  onContinue,
  inlineSetup = false,
  instructionsOnly = false
}: {
  className?: string
  onContinue?: () => void
  inlineSetup?: boolean
  instructionsOnly?: boolean
}): JSX.Element {
  const { t } = useTranslation()
  const status = useWebHelperPromptStore((state) => state.status)
  const installedVersion = useNativeHelperSettingsStore((state) => state.settings?.helperVersion)
  const setupOpen = useWebHelperPromptStore((state) => state.setupOpen)
  const command = useWebHelperPromptStore((state) => state.setupCommand)
  const prepareSetup = useWebHelperPromptStore((state) => state.prepareSetup)
  const renewSetupCommand = useWebHelperPromptStore((state) => state.renewSetupCommand)
  const closeSetup = useWebHelperPromptStore((state) => state.closeSetup)
  const [copyFeedback, setCopyFeedback] = useState<{
    command: string | null
    status: 'copied' | 'failed'
  } | null>(null)
  const copyStatus = setupOpen && copyFeedback?.command === command ? copyFeedback.status : 'idle'
  const copyCommand = async (): Promise<void> => {
    try {
      const freshCommand = await renewSetupCommand()
      if (!freshCommand) throw new Error('Could not renew setup command')
      await navigator.clipboard.writeText(freshCommand)
      setCopyFeedback({ command: freshCommand, status: 'copied' })
    } catch {
      setCopyFeedback({
        command: useWebHelperPromptStore.getState().setupCommand,
        status: 'failed'
      })
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
    <div className={twMerge('space-y-4 text-white', !instructionsOnly && 'p-6')}>
      {!instructionsOnly && <h2 className="text-xl font-semibold">{t('webHelper.linuxTitle')}</h2>}
      {!instructionsOnly && (
        <p className="text-sm leading-6 text-neutral-300">{t('webHelper.linuxDescription')}</p>
      )}
      <div className="relative">
        <textarea
          readOnly
          spellCheck={false}
          aria-label={t('webHelper.copyCommand')}
          value={command ?? (status === 'checking' ? t('webHelper.checking') : statusText)}
          onFocus={(event) => event.currentTarget.select()}
          className="h-56 w-full resize-none select-text overflow-auto border border-neutral-700 bg-black p-4 pr-14 font-mono text-sm leading-6 text-sky-200 selection:bg-sky-400/40 focus-visible:outline-2 focus-visible:outline-sky-300"
        />
        <Button
          variant="ghost"
          className="absolute top-2 right-2 size-9 border-0 bg-neutral-900 p-0 text-sky-200 hover:bg-neutral-800"
          disabled={status === 'checking' && !command}
          aria-label={t('webHelper.copyCommand')}
          title={t('webHelper.copyCommand')}
          onClick={() => void copyCommand()}
        >
          <Copy className="size-4" aria-hidden="true" />
        </Button>
      </div>
      <p className="h-16 overflow-auto text-sm leading-6 text-neutral-300" role="status">
        {status === 'unavailable' || status === 'outdated-rust'
          ? statusText
          : t('webHelper.linuxAfter')}
      </p>
      <div className="flex flex-wrap items-center gap-3">
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

  if (instructionsOnly) return setupInstructions

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
      <div className="grid min-h-12 grid-cols-2 gap-3 border-y border-white/10 py-2 text-xs text-neutral-300">
        <span>
          {t('webHelper.installedVersion', {
            version:
              status === 'rust'
                ? (installedVersion ?? '…')
                : status === 'outdated-rust'
                  ? t('webHelper.olderVersion')
                  : '—'
          })}
        </span>
        <span className="text-right">
          {t('webHelper.latestVersion', { version: __SIXTEEN_COMPETITIVE_VERSION__ })}
        </span>
        <span className={twMerge('col-span-2', status === 'outdated-rust' && 'text-amber-300')}>
          {t(
            status === 'outdated-rust'
              ? 'webHelper.updateAvailable'
              : status === 'rust'
                ? 'webHelper.upToDate'
                : 'webHelper.versionUnavailable'
          )}
        </span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {status !== 'rust' &&
          (isWindows
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
      </div>
      <div className="flex items-center justify-between gap-3">
        <ButtonLink
          variant="ghost"
          className="web-helper-source-link h-9 w-fit gap-1 border-0 bg-transparent px-0 text-xs text-sky-300 shadow-none hover:bg-transparent hover:text-sky-200"
          href={helperSource}
          target="_blank"
          rel="noopener noreferrer"
        >
          {t('webHelper.viewSourceCode')}
          <ArrowUpRight className="size-3.5" aria-hidden="true" />
        </ButtonLink>
        {onContinue && (
          <Button
            className="h-9 border-0 bg-transparent px-3 text-xs text-neutral-300 hover:bg-white/5"
            variant="ghost"
            onClick={onContinue}
          >
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
