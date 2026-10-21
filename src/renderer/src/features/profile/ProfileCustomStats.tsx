import type { JSX } from 'react'
import { twMerge } from 'tailwind-merge'
import type { PlayerProfile } from '../../../../shared/match-history'
import { useTranslation } from '../i18n/i18n'

export function ProfileCustomStats({
  categories,
  className
}: {
  categories: NonNullable<PlayerProfile['customStats']>['categories']
  className?: string
}): JSX.Element | null {
  const { t, language } = useTranslation()
  if (!categories.length) return null
  return (
    <section
      aria-label={t('profile.customStats')}
      className={twMerge('border-b border-white/15 pb-5', className)}
    >
      <h3 className="mb-2 text-base font-semibold">{t('profile.customStats')}</h3>
      <p className="mb-4 text-sm text-neutral-400">{t('profile.customStatsNote')}</p>
      <div className="divide-y divide-white/15">
        {categories.map((category) => (
          <article key={category.serverId + '/' + category.key} className="py-4 first:pt-0">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h4 className="min-w-0 break-words text-lg font-semibold [overflow-wrap:anywhere]">
                {category.name}
                {category.communityName && (
                  <span className="ml-3 text-sm font-normal text-neutral-300">
                    {category.communityName}
                  </span>
                )}
              </h4>
              <p className="text-sm text-neutral-400">
                {t(category.mix ? 'profile.customStatsMixed' : 'profile.customStatsSeparate')}
              </p>
            </div>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
              {category.stats.map((stat) => (
                <div key={stat.key} className="min-w-0">
                  <dt className="break-words text-sm text-neutral-300 [overflow-wrap:anywhere]">
                    {stat.label}
                  </dt>
                  <dd className="mt-1 break-words text-xl font-semibold tabular-nums [overflow-wrap:anywhere]">
                    {stat.value.toLocaleString(language)}
                  </dd>
                </div>
              ))}
            </dl>
          </article>
        ))}
      </div>
    </section>
  )
}
