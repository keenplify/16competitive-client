import type { JSX } from 'react'
import { twMerge } from 'tailwind-merge'

export interface AssetPreparation {
  status: 'idle' | 'checking' | 'downloading' | 'ready'
  completedFiles: number
  totalFiles: number
}

interface MatchAssetPreparationProps {
  preparation: AssetPreparation
  className?: string
}

export function MatchAssetPreparation({
  preparation,
  className
}: MatchAssetPreparationProps): JSX.Element | null {
  if (preparation.status === 'idle') return null
  const hasKnownTotal = preparation.totalFiles > 0
  const progress = hasKnownTotal
    ? Math.min(100, Math.round((preparation.completedFiles / preparation.totalFiles) * 100))
    : 0
  const label =
    preparation.status === 'ready'
      ? 'Required skins are ready'
      : preparation.status === 'checking'
        ? 'Checking required skins…'
        : `Downloading required skins · ${preparation.completedFiles} / ${preparation.totalFiles}`

  return (
    <section
      className={twMerge(
        'border border-emerald-300/35 bg-black/25 px-4 py-3 text-center',
        className
      )}
      aria-live="polite"
    >
      <p className="text-xs font-bold tracking-[0.14em] text-emerald-100 uppercase">{label}</p>
      {preparation.status !== 'ready' && (
        <div
          className="mt-2 h-1.5 overflow-hidden bg-black/40"
          role="progressbar"
          aria-label="Required skin download progress"
          aria-valuemin={0}
          aria-valuemax={hasKnownTotal ? preparation.totalFiles : undefined}
          aria-valuenow={hasKnownTotal ? preparation.completedFiles : undefined}
        >
          <div
            className={twMerge(
              'h-full bg-emerald-300 transition-[width] duration-300',
              preparation.status === 'checking' && 'w-1/3 animate-pulse'
            )}
            style={preparation.status === 'downloading' ? { width: `${progress}%` } : undefined}
          />
        </div>
      )}
    </section>
  )
}
