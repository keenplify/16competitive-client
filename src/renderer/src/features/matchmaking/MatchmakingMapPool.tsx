import type { CSSProperties, JSX } from 'react'
import { twMerge } from 'tailwind-merge'
import type { MatchmakingMap } from '../../../../shared/matchmaking'
import { useTranslation } from '../i18n/i18n'
import { MatchmakingMapCard } from './MatchmakingMapCard'

export function MatchmakingMapPool({
  maps,
  selectedMapIds,
  disabled,
  onSelect,
  className
}: {
  maps: MatchmakingMap[]
  selectedMapIds: string[]
  disabled: boolean
  onSelect: (mapId: string) => void
  className?: string
}): JSX.Element {
  const { t } = useTranslation()
  const groups = [
    { review: false, maps: maps.filter((map) => !map.feedbackEnabled) },
    { review: true, maps: maps.filter((map) => map.feedbackEnabled) }
  ].filter((group) => group.maps.length > 0)
  const regularCount = groups.find((group) => !group.review)?.maps.length ?? 0
  const reviewCount = groups.find((group) => group.review)?.maps.length ?? 0
  const reviewColumns = Math.ceil(reviewCount / 3)
  return (
    <section
      className={twMerge('flex min-h-0 flex-1 flex-col', className)}
      aria-label={t('warmup.map')}
    >
      <div className="mb-2 flex shrink-0 items-center justify-between gap-3">
        <h2 className="text-[10px] font-bold tracking-[0.18em] text-sky-300 uppercase">
          {t('play.mapPool')}
        </h2>
        <p className="text-xs text-neutral-200">
          {t('play.mapsSelected', {
            selected: maps.filter((map) => selectedMapIds.includes(map.id)).length,
            total: maps.length
          })}
        </p>
      </div>
      <div className="min-h-0 flex-1 overflow-x-auto overflow-y-hidden pb-1">
        <div
          className={twMerge(
            'play-map-layout grid h-full min-h-0 gap-3',
            reviewCount > 0 &&
              (regularCount > 0 ? 'play-map-layout-with-review' : 'play-map-layout-review-only')
          )}
          style={
            {
              '--play-map-regular-columns': regularCount,
              '--play-map-review-min-width': `${reviewColumns * 132}px`,
              '--play-map-review-width': `${reviewColumns * 16}%`,
              '--play-map-review-only-width': `${reviewColumns * 220}px`,
              '--play-map-min-width': `${regularCount * 150 + reviewColumns * 132 + (regularCount && reviewCount ? 12 : 0)}px`
            } as CSSProperties
          }
        >
          {groups.map((group) => (
            <div key={String(group.review)} className="flex min-h-0 min-w-0 flex-col gap-2">
              <h3
                className={twMerge(
                  'shrink-0 text-[10px] font-semibold tracking-[0.16em] uppercase',
                  group.review ? 'text-amber-300' : 'text-neutral-400'
                )}
              >
                {t(group.review ? 'matchmaking.reviewMaps' : 'matchmaking.regularMaps')}
              </h3>
              <div
                className={twMerge(
                  'grid min-h-0 flex-1 gap-2',
                  !group.review && 'play-map-group-grid'
                )}
                style={
                  group.review
                    ? {
                        gridTemplateColumns: `repeat(${reviewColumns}, minmax(0, 1fr))`,
                        gridTemplateRows: `repeat(${Math.ceil(reviewCount / reviewColumns)}, minmax(0, 1fr))`
                      }
                    : undefined
                }
              >
                {group.maps.map((map) => (
                  <MatchmakingMapCard
                    key={map.id}
                    map={map}
                    className={group.review ? 'play-review-map-card' : undefined}
                    selected={selectedMapIds.includes(map.id)}
                    disabled={disabled}
                    onSelect={() => onSelect(map.id)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
