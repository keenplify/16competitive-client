import { IssueReportForm } from '../issue-report/IssueReportForm'
import { useIssueReport } from '../issue-report/issue-report.store'
import { Clipboard, Download, LoaderCircle } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useEffectiveLauncherTheme } from '../settings/use-effective-launcher-theme'
import type { SkinAssetSyncProgress } from '../../../../shared/game-settings'
import { isLegacyRuntimeLanguage, useLanguageStore, useTranslation } from '../i18n/i18n'
import { translateRuntimePortuguese } from '../i18n/ui-translations-portuguese'
import { translateRuntimeHindi } from '../i18n/ui-translations-hindi'
import { translateRuntimeSea } from '../i18n/ui-translations-sea'
import { translateRuntimeText } from '../i18n/ui-translations'
import { useNavigationStore } from '../navigation/navigation.store'
import { useCustomGamesStore } from '../matchmaking/custom-games.store'
import reportLabels from '../../../../shared/issue-report-translations.json'

type RailMode = 'expanded' | 'collapsed' | 'absent'

function assetErrorKey(
  code: string
):
  | 'assets.sync.authFailed'
  | 'match.assets.storageDenied'
  | 'assets.sync.networkFailed'
  | 'assets.sync.serviceFailed' {
  if (code === 'ASSET_AUTH_FAILED') return 'assets.sync.authFailed'
  if (code === 'ASSET_STORAGE_FAILED') return 'match.assets.storageDenied'
  if (code === 'ASSET_NETWORK_FAILED') return 'assets.sync.networkFailed'
  return 'assets.sync.serviceFailed'
}

export function SkinAssetSyncIndicator(): React.JSX.Element | null {
  const { t } = useTranslation()
  const theme = useEffectiveLauncherTheme()
  const language = useLanguageStore((state) => state.language)
  const page = useNavigationStore((state) => state.page)
  const playView = useCustomGamesStore((state) => state.playView)
  const [progress, setProgress] = useState<SkinAssetSyncProgress | null>(null)
  const reportOpen = useIssueReport((s) => s.open)
  const [railMode, setRailMode] = useState<RailMode>('absent')

  useEffect(() => {
    let active = true
    const applyProgress = (nextProgress: SkinAssetSyncProgress): void => {
      if (active) setProgress(nextProgress)
    }
    const unsubscribeSettings = window.api.gameSettings.onAssetSyncProgress(applyProgress)
    const unsubscribeMatchmaking = window.api.matchmaking.onEvent((event) => {
      if (event.type === 'skin_assets_sync_progress') {
        applyProgress(event)
      }
    })
    void window.api.gameSettings
      .getAssetSyncStatus()
      .then(applyProgress)
      .catch(() => undefined)
    return () => {
      active = false
      unsubscribeSettings()
      unsubscribeMatchmaking()
    }
  }, [])

  useEffect(() => {
    const translateFriendsLabel = (source: string): string => {
      if (language === 'th' || language === 'id') return translateRuntimeSea(language, source)
      if (language === 'pt') return translateRuntimePortuguese(language, source)
      if (language === 'hi') return translateRuntimeHindi(language, source)
      return isLegacyRuntimeLanguage(language) ? translateRuntimeText(language, source) : source
    }
    const friendsLabel = translateFriendsLabel('Friends panel')
    const collapsedFriendsLabel = translateFriendsLabel('Expand Friends panel')
    const detectRail = (): void => {
      const rail = Array.from(document.querySelectorAll<HTMLElement>('aside[aria-label]')).find(
        (candidate) => {
          const label = candidate.getAttribute('aria-label')
          return label === friendsLabel || label === collapsedFriendsLabel
        }
      )
      if (!rail || rail.getClientRects().length === 0) {
        setRailMode('absent')
        return
      }
      setRailMode(
        rail.getAttribute('aria-label') === collapsedFriendsLabel ? 'collapsed' : 'expanded'
      )
    }

    detectRail()
    const observer = new MutationObserver(detectRail)
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['aria-label', 'class']
    })
    window.addEventListener('resize', detectRail)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', detectRail)
    }
  }, [language])

  const percentage =
    progress && progress.totalFiles > 0
      ? Math.round((progress.completedFiles / progress.totalFiles) * 100)
      : 0
  const failed = progress?.status === 'error'
  const reportPosition =
    railMode === 'expanded'
      ? 'right-4 bottom-[calc(55vh+1rem)] md:right-[19rem] md:bottom-4'
      : railMode === 'collapsed'
        ? 'right-[3.75rem] bottom-4'
        : 'right-4 bottom-4'
  const reportPositionForPlay =
    page === 'play' && playView === 'matchmaking'
      ? railMode === 'expanded'
        ? 'right-4 bottom-24 md:right-[19rem] md:bottom-24'
        : railMode === 'collapsed'
          ? 'right-[3.75rem] bottom-24'
          : 'right-4 bottom-24'
      : reportPosition

  const renderPanels = (children: ReactNode): ReactNode =>
    theme === 'vgui2'
      ? createPortal(
          <div
            className={`fixed ${reportPositionForPlay} z-40 mb-24 flex flex-col items-end gap-2 text-xs`}
          >
            {children}
          </div>,
          document.body
        )
      : children

  return (
    <div
      className={`launcher-desktop-notices fixed ${reportPositionForPlay} z-40 flex flex-col items-end gap-2 text-xs transition-[right,bottom] duration-300`}
    >
      <button
        type="button"
        onClick={() => useIssueReport.setState({ open: true })}
        className="flex items-center gap-2  border border-cyan-300/30 bg-slate-950/90 px-3 py-2 text-cyan-100 shadow-xl backdrop-blur transition hover:bg-slate-800"
      >
        <Clipboard className="size-4" aria-hidden="true" />
        {reportLabels[language].title}
      </button>
      {renderPanels(
        <>
          {reportOpen && <IssueReportForm />}
          {progress && (progress.status === 'syncing' || progress.status === 'error') && (
            <aside
              className={`flex w-96 max-w-[calc(100vw-2rem)] items-start gap-2 rounded-none border px-3 py-2 shadow-xl backdrop-blur ${failed ? 'border-red-300/30 bg-red-950/90 text-red-100' : 'border-cyan-300/30 bg-slate-950/90 text-cyan-100'}`}
              role="status"
              aria-live="polite"
            >
              {failed ? (
                <Download className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              ) : (
                <LoaderCircle className="mt-0.5 size-4 shrink-0 animate-spin" aria-hidden="true" />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex h-5 items-center justify-between gap-2">
                  <span className="truncate">
                    {failed
                      ? progress.errorCode
                        ? t(assetErrorKey(progress.errorCode))
                        : (progress.message ?? 'Could not download skin assets.')
                      : t('assets.sync.downloading', { percent: percentage })}
                  </span>
                  <span className="shrink-0 tabular-nums">
                    {t('assets.sync.files', {
                      completed: progress.completedFiles,
                      total: progress.totalFiles
                    })}
                  </span>
                </div>
                <div className="h-8 text-[11px] leading-4" title={progress.currentFile}>
                  <span className="line-clamp-2 break-all font-mono">
                    {progress.currentFile ?? (failed ? '' : t('assets.sync.checking'))}
                  </span>
                </div>
              </div>
            </aside>
          )}
        </>
      )}
    </div>
  )
}
