import { Download, FolderOpen, LoaderCircle, Play } from 'lucide-react'
import { useEffect, type JSX } from 'react'
import { twMerge } from 'tailwind-merge'
import { Button } from '../../components/ui/Button'
import { TextField } from '../../components/ui/TextField'
import { useTranslation } from '../i18n/i18n'
import { useLegacyGameStore } from './legacy-game.store'

export function LegacyGameSettings({
  className,
  embedded = false,
  showLaunch = true
}: {
  className?: string
  embedded?: boolean
  showLaunch?: boolean
}): JSX.Element {
  const { t } = useTranslation()
  const profile = useLegacyGameStore((state) => state.profile)
  const status = useLegacyGameStore((state) => state.status)
  const error = useLegacyGameStore((state) => state.error)
  const launched = useLegacyGameStore((state) => state.launched)
  const load = useLegacyGameStore((state) => state.load)
  const choose = useLegacyGameStore((state) => state.choose)
  const launch = useLegacyGameStore((state) => state.launch)
  const openDownload = useLegacyGameStore((state) => state.openDownload)
  useEffect(() => {
    void load()
  }, [load])
  const busy = status !== 'idle'
  const usesWine = profile.installation?.runtime === 'wine'
  return (
    <section
      aria-labelledby={embedded ? undefined : 'legacy-game-title'}
      aria-label={embedded ? t('legacy.title') : undefined}
      aria-busy={busy}
      className={twMerge(
        embedded
          ? 'rounded-none'
          : 'mt-5 rounded-none border border-white/10 bg-neutral-900/90 p-5 sm:p-7',
        className
      )}
    >
      {!embedded && (
        <h3 id="legacy-game-title" className="text-lg font-semibold">
          {t('legacy.title')}
        </h3>
      )}
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-neutral-400">
        {t(embedded ? 'legacy.queueUnavailable' : 'legacy.description')}
      </p>
      <div className="mt-5">
        <TextField
          id="legacy-game-folder"
          label={t('legacy.folder')}
          value={profile.folderPath ?? ''}
          placeholder={t('legacy.empty')}
          readOnly
          className="font-mono"
        />
      </div>
      <div className={twMerge('mt-3 grid gap-3', showLaunch && 'sm:grid-cols-2')}>
        <Button variant="secondary" disabled={busy} onClick={() => void choose()}>
          {status === 'choosing' ? (
            <LoaderCircle className="mr-2 size-4 shrink-0 animate-spin" aria-hidden="true" />
          ) : (
            <FolderOpen className="mr-2 size-4 shrink-0" aria-hidden="true" />
          )}
          {t('legacy.choose')}
        </Button>
        {showLaunch && (
          <Button
            variant="ghost"
            disabled={busy || !profile.installation}
            onClick={() => void launch()}
          >
            {status === 'launching' ? (
              <LoaderCircle className="mr-2 size-4 shrink-0 animate-spin" aria-hidden="true" />
            ) : (
              <Play className="mr-2 size-4 shrink-0" aria-hidden="true" />
            )}
            {t(usesWine ? 'legacy.launchWine' : 'legacy.launch')}
          </Button>
        )}
      </div>
      <Button
        variant="ghost"
        className="mt-3 gap-2 text-sky-300"
        disabled={busy}
        onClick={() => void openDownload()}
      >
        <Download className="size-4 shrink-0" aria-hidden="true" />
        {t('legacy.download')}
      </Button>
      <p className="mt-1 text-xs leading-5 text-neutral-400">{t('legacy.downloadHelp')}</p>
      <div className="mt-3 h-20 overflow-auto text-sm leading-5" role="status" aria-live="polite">
        {error ? (
          <p className="text-red-400">{t(`legacy.error.${error}`)}</p>
        ) : launched ? (
          <p className="text-emerald-300">{t('legacy.launched')}</p>
        ) : usesWine ? (
          <p className="text-neutral-400">{t('legacy.wineRuntime')}</p>
        ) : null}
      </div>
    </section>
  )
}
