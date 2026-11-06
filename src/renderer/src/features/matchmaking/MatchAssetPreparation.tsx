import { useEffect, useRef, type JSX } from 'react'
import { Slide, ToastContainer, toast, type Id, type ToastOptions } from 'react-toastify'
import { useTranslation } from '../i18n/i18n'
import { useMatchmakingStore } from './matchmaking.store'

export interface AssetPreparation {
  status: 'idle' | 'checking' | 'downloading' | 'ready' | 'fastdl'
  completedFiles: number
  totalFiles: number
}

export function MatchAssetPreparation(): JSX.Element {
  const surface = useRef<HTMLDivElement>(null)
  const toastId = useRef<Id | null>(null)
  const launchToastId = useRef<Id | null>(null)
  const preparation = useMatchmakingStore((state) => state.assetPreparation)
  const launch = useMatchmakingStore((state) => state.launchPreparation)
  const { t } = useTranslation()

  useEffect(() => {
    if (!launch) return
    const terminal = launch.phase === 'ready' || launch.phase === 'error'
    const label = t(`launch.progress.${launch.phase}`, {
      completed: launch.completed,
      total: launch.total
    })
    const options: ToastOptions = {
      containerId: 'match-assets',
      role: 'status',
      ariaLabel: label,
      isLoading: !terminal,
      type: launch.phase === 'error' ? 'error' : terminal ? 'success' : 'info',
      autoClose: terminal ? 8000 : false,
      closeButton: terminal,
      closeOnClick: false,
      draggable: false,
      hideProgressBar: true
    }
    if (launchToastId.current !== null) {
      toast.update(launchToastId.current, { ...options, render: label })
    } else {
      launchToastId.current = toast(label, options)
    }
    if (terminal) launchToastId.current = null
    const frame = requestAnimationFrame(() => {
      const element = surface.current
      if (element && !element.matches(':popover-open')) element.showPopover()
    })
    return () => cancelAnimationFrame(frame)
  }, [launch, t])

  useEffect(() => {
    if (preparation.status === 'idle' || preparation.status === 'ready') {
      if (toastId.current !== null) toast.dismiss(toastId.current)
      toastId.current = null
      return
    }
    const progress =
      preparation.totalFiles > 0
        ? Math.min(1, Math.max(0, preparation.completedFiles / preparation.totalFiles))
        : 0
    const label =
      preparation.status === 'fastdl'
        ? t('match.assets.fastdl')
        : preparation.status === 'checking'
          ? t('match.assets.checking')
          : t('match.assets.downloading', {
              completed: preparation.completedFiles,
              total: preparation.totalFiles
            })
    const options: ToastOptions = {
      containerId: 'match-assets',
      position: 'top-right',
      type: 'info',
      role: 'status',
      autoClose: preparation.status === 'fastdl' ? 5000 : false,
      closeButton: preparation.status === 'fastdl',
      closeOnClick: false,
      draggable: false,
      hideProgressBar: preparation.status !== 'downloading',
      progress: preparation.status === 'downloading' ? progress : undefined,
      ariaLabel: label
    }
    if (toastId.current !== null) {
      toast.update(toastId.current, { ...options, render: label, delay: 0 })
    } else {
      toastId.current = toast(label, options)
    }
    // Native dialogs occupy the top layer. Show after their effects so progress
    // stays above the ready-check backdrop, in viewport coordinates.
    const frame = requestAnimationFrame(() => {
      const element = surface.current
      if (!element) return
      if (element.matches(':popover-open')) element.hidePopover()
      element.showPopover()
    })
    return () => cancelAnimationFrame(frame)
  }, [preparation, t])

  useEffect(
    () => () => {
      if (toastId.current !== null) toast.dismiss(toastId.current)
      if (launchToastId.current !== null) toast.dismiss(launchToastId.current)
      toastId.current = null
    },
    []
  )
  return (
    <div
      ref={surface}
      popover="manual"
      className="pointer-events-none fixed inset-0 m-0 h-0 w-full overflow-visible border-0 bg-transparent p-0"
    >
      <ToastContainer
        containerId="match-assets"
        position="top-right"
        theme="dark"
        style={{ marginTop: '4rem' }}
        transition={Slide}
        className="launcher-toast-container pointer-events-auto"
      />
    </div>
  )
}
