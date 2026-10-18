import { ProfileActivity } from './ProfileActivity'
import type { JSX } from 'react'
import { twMerge } from 'tailwind-merge'
import type { PlayerProfile } from '../../../../shared/match-history'
import { useTranslation } from '../i18n/i18n'
import { CountryFlag } from '../../components/CountryFlag'
import { ProfileRankInsignia } from '../../components/ui/ProfileRankInsignia'
import { ProfileFlag } from './ProfileFlag'

export function ProfileOverview({
  profile,
  own,
  compact = false,
  className
}: {
  profile: PlayerProfile
  own: boolean
  compact?: boolean
  className?: string
}): JSX.Element {
  const { t, language } = useTranslation()
  return (
    <div className={twMerge('flex flex-col gap-6 py-6', className)}>
      <header className="flex min-h-32 flex-wrap items-center justify-between gap-6 border-b border-white/15 pb-6">
        <div className="flex min-w-0 items-center gap-4">
          <div className="size-16 shrink-0">
            {profile.level !== undefined && (
              <ProfileRankInsignia
                level={profile.level}
                title={profile.levelTitle ?? ''}
                ariaLabel={t('profile.levelValue', { level: profile.level })}
                className="size-16"
              />
            )}
          </div>
          <div className="min-w-0">
            <h1 className="break-words text-3xl font-semibold">{profile.username}</h1>
            <div className="mt-2 flex min-h-9 items-center gap-3 text-sm text-neutral-300">
              {own ? (
                <ProfileFlag />
              ) : (
                <CountryFlag code={profile.flagCountryCode} className="h-4 w-6 object-cover" />
              )}
              <span>
                {t('profile.since', {
                  date: new Date(profile.createdAt).toLocaleDateString(language)
                })}
              </span>
            </div>
          </div>
        </div>
        <dl className="flex min-w-56 gap-10 tabular-nums">
          <div>
            <dt className="text-sm text-neutral-300">{t('profile.level')}</dt>
            <dd className="mt-1 text-3xl font-semibold">{profile.level ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-sm text-neutral-300">MMR</dt>
            <dd className="mt-1 text-3xl font-semibold text-sky-300">
              {profile.mmr.toLocaleString(language)}
            </dd>
          </div>
        </dl>
      </header>
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
              [
                t('profile.partnerSessions'),
                profile.partnerStats.sessions.toLocaleString(language)
              ],
              [t('profile.kills'), profile.partnerStats.kills.toLocaleString(language)],
              [t('profile.deaths'), profile.partnerStats.deaths.toLocaleString(language)],
              [
                t('profile.kd'),
                profile.partnerStats.deaths > 0
                  ? (profile.partnerStats.kills / profile.partnerStats.deaths).toLocaleString(
                      language,
                      { maximumFractionDigits: 2 }
                    )
                  : '—'
              ]
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
