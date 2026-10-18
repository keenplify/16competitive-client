import { ProfileActivity } from './ProfileActivity'
import type { JSX } from 'react'
import { twMerge } from 'tailwind-merge'
import type { PlayerProfile } from '../../../../shared/match-history'
import { useTranslation } from '../i18n/i18n'

export function ProfileOverview({
  profile,
  compact = false,
  className
}: {
  profile: PlayerProfile
  compact?: boolean
  className?: string
}): JSX.Element {
  const { t, language } = useTranslation()
  return (
    <div className={twMerge('flex flex-col gap-6 py-6', className)}>
      <dl
        aria-label={t('profile.stats')}
        className="grid grid-cols-2 gap-y-4 border-b border-white/15 pb-5 sm:grid-cols-4 lg:grid-cols-7"
      >
        {[
          [t('profile.wins'), profile.wins.toLocaleString(language)],
          [t('profile.losses'), profile.losses.toLocaleString(language)],
          [
            t('profile.winRate'),
            profile.wins + profile.losses > 0
              ? new Intl.NumberFormat(language, {
                  style: 'percent',
                  maximumFractionDigits: 1
                }).format(profile.wins / (profile.wins + profile.losses))
              : '—'
          ],
          [t('profile.kills'), profile.kills.toLocaleString(language)],
          [t('profile.assists'), profile.assists.toLocaleString(language)],
          [t('profile.deaths'), profile.deaths.toLocaleString(language)],
          [
            t('profile.kd'),
            profile.deaths > 0
              ? (profile.kills / profile.deaths).toLocaleString(language, {
                  maximumFractionDigits: 2
                })
              : '—'
          ]
        ].map(([label, value]) => (
          <div key={label} className="px-3 first:pl-0">
            <dt className="text-sm text-neutral-300">{label}</dt>
            <dd className="mt-1 text-xl font-semibold tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      {profile.partnerStats && profile.partnerStats.sessions > 0 && (
        <section aria-label={t('profile.partnerStats')} className="border-b border-white/15 pb-5">
          <h3 className="mb-3 text-base font-semibold">{t('profile.partnerStats')}</h3>
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              [t('profile.partnerSessions'), profile.partnerStats.sessions.toLocaleString(language)],
              [t('profile.kills'), profile.partnerStats.kills.toLocaleString(language)],
              [t('profile.deaths'), profile.partnerStats.deaths.toLocaleString(language)],
              [t('profile.kd'), profile.partnerStats.deaths > 0
                ? (profile.partnerStats.kills / profile.partnerStats.deaths).toLocaleString(language, { maximumFractionDigits: 2 })
                : '—']
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-sm text-neutral-300">{label}</dt>
                <dd className="mt-1 text-xl font-semibold tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}
      <ProfileActivity activity={profile.activity} compact={compact} />
    </div>
  )
}
