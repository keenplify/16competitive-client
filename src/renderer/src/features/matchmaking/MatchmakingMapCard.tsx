import type { JSX } from 'react'
import { Check } from 'lucide-react'
import { twMerge } from 'tailwind-merge'
import type { MatchmakingMap } from '../../../../shared/matchmaking'
import { useTranslation } from '../i18n/i18n'
import { localMapPreviews } from './map-previews'

interface MapCardProps {
  map: MatchmakingMap
  selected: boolean
  disabled: boolean
  onSelect: () => void
  className?: string
}

export function MatchmakingMapCard({
  map,
  selected,
  disabled,
  onSelect,
  className
}: MapCardProps): JSX.Element {
  const { t } = useTranslation()
  return (
    <button
      type="button"
      className={twMerge(
        'group relative h-full min-h-0 overflow-hidden border border-white/20 bg-neutral-900 text-left shadow-[0_12px_30px_rgba(0,0,0,0.35)] transition duration-200 hover:border-sky-300 hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300 disabled:cursor-not-allowed disabled:opacity-60',
        selected && 'border-sky-300 ring-2 ring-sky-300/40',
        className
      )}
      disabled={disabled}
      aria-pressed={selected}
      aria-label={`${map.displayName}, ${t(selected ? 'warmup.mapSelected' : 'warmup.mapNotSelected')}`}
      onClick={onSelect}
    >
      <div className="absolute inset-0 flex items-center justify-center bg-[radial-gradient(circle_at_30%_20%,rgba(56,189,248,0.24),transparent_38%),linear-gradient(135deg,#172033,#0a0a0a)]">
        {map.previewUrl || localMapPreviews[map.id] ? (
          <img
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            src={map.previewUrl ?? localMapPreviews[map.id]}
            alt=""
            onError={(event) => {
              const localPreview = localMapPreviews[map.id]
              event.currentTarget.onerror = null
              if (localPreview && event.currentTarget.src !== localPreview) {
                event.currentTarget.src = localPreview
              } else {
                event.currentTarget.hidden = true
              }
            }}
          />
        ) : (
          <span className="font-audiowide text-4xl text-white/25 uppercase">
            {map.displayName.slice(0, 2)}
          </span>
        )}
      </div>
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/15 to-black/20" />
      <div className="absolute top-2 right-2 flex size-6 items-center justify-center border border-white/70 bg-black/60 text-white">
        {selected && <Check className="size-4" strokeWidth={3} aria-hidden="true" />}
      </div>
      <div className="absolute inset-x-0 bottom-0 px-3 pb-3 text-center drop-shadow-[0_2px_3px_rgba(0,0,0,0.9)]">
        <p className="font-audiowide text-sm leading-tight text-white uppercase sm:text-base">
          {map.displayName}
        </p>
        <p className="mt-1 font-mono text-[10px] text-white/75">{map.id}</p>
      </div>
    </button>
  )
}
