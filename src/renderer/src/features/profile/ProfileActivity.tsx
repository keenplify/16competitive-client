import { useLauncherThemeStore } from '../settings/launcher-theme.store'
import { useProfileModeLabel } from './useProfileModeLabel'
import { ProfileMapChart } from './ProfileMapChart'
import type { JSX } from 'react'
import { twMerge } from 'tailwind-merge'
import type { ProfileActivitySnapshot } from '../../../../shared/match-history'
import { type ProfileActivityEntry } from '../../../../shared/profile-activity'
import { useTranslation } from '../i18n/i18n'

function ActivityList({
  title,
  entries,
  total,
  mode = false,
  className
}: {
  title: string
  entries: ProfileActivityEntry[]
  total: number
  mode?: boolean
  className?: string
}): JSX.Element {
  const { t, language } = useTranslation()
  const percent = new Intl.NumberFormat(language, { style: 'percent', maximumFractionDigits: 0 })
  const modeLabel = useProfileModeLabel()
  return (
    <section className={twMerge('min-w-0', className)}>
      <h2 className="mb-4 text-xl font-semibold">{title}</h2>
      <ol className="divide-y divide-white/10 border-y border-white/15">
        {entries.map((entry) => (
          <li key={entry.id} className="py-4">
            <div className="flex items-baseline justify-between gap-4">
              <h3 className="truncate font-semibold">{mode ? modeLabel(entry.id) : entry.id}</h3>
              <span className="shrink-0 text-sm tabular-nums text-neutral-300">
                {t('profile.matchCount', { count: entry.matches })}
              </span>
            </div>
            <div className="my-2 h-1 bg-white/10" aria-hidden="true">
              <div
                className="h-full bg-sky-400"
                style={{ width: `${(entry.matches / total) * 100}%` }}
              />
            </div>
            <div className="flex justify-between gap-3 text-sm tabular-nums text-neutral-300">
              <span>{t('profile.share', { percent: percent.format(entry.matches / total) })}</span>
              <span>
                {t('profile.winPercent', { percent: percent.format(entry.wins / entry.matches) })}
              </span>
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}
export function ProfileActivity({
  activity,
  compact = false
}: {
  activity?: ProfileActivitySnapshot
  compact?: boolean
}): JSX.Element {
  const { t, language } = useTranslation()
  const theme = useLauncherThemeStore((state) => state.theme)
  if (!activity) return <p className="py-8 text-neutral-300">{t('profile.activityUnavailable')}</p>
  return (
    <section className={twMerge('profile-activity', compact ? 'py-0' : 'py-2')}>
      <div
        className={`${compact ? 'mb-4' : 'mb-6'} flex flex-wrap justify-between gap-2 text-sm text-neutral-300`}
      >
        <span>{t('profile.allMatches', { count: activity.total.toLocaleString(language) })}</span>
        <span>
          {t('profile.refreshed', {
            date: new Date(activity.refreshedAt).toLocaleString(language)
          })}
        </span>
      </div>
      {activity.total === 0 ? (
        <p className="py-8 text-neutral-300">{t('profile.noMatches')}</p>
      ) : (
        <div className="grid gap-8 md:grid-cols-2">
          <ActivityList
            title={t('profile.mostModes')}
            entries={activity.modes}
            total={activity.total}
            mode
          />
          {theme === 'vgui2' ? (
            <ActivityList
              title={t('profile.mostMaps')}
              entries={activity.maps}
              total={activity.total}
            />
          ) : (
            <ProfileMapChart entries={activity.maps} compact={compact} />
          )}
        </div>
      )}
    </section>
  )
}
