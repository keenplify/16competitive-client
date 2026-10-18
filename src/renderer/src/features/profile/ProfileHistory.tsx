import { useProfileModeLabel } from './useProfileModeLabel'
import { useMatchDetailsStore } from './match-details.store'
import { twMerge } from 'tailwind-merge'
import type { JSX } from 'react'
import type { PlayerProfile } from '../../../../shared/match-history'
import { useTranslation } from '../i18n/i18n'
export function ProfileHistory({ profile }: { profile: PlayerProfile }): JSX.Element {
  const { t, language } = useTranslation()
  const modeLabel = useProfileModeLabel()
  return (
    <div className="py-6">
      {' '}
      <section className="min-w-0" aria-labelledby="profile-recent-matches">
        <h2 id="profile-recent-matches" className="mb-5 text-xl font-semibold">
          {t('profile.recentMatches')}
        </h2>
        <div className="min-h-80 overflow-x-auto border border-white/10 bg-neutral-950/70">
          {profile.recentMatches?.length ? (
            <table className="w-full min-w-[480px] text-left text-sm tabular-nums">
              <thead className="border-b border-white/15 bg-white/5 text-neutral-300">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">
                    {t('profile.match')}
                  </th>
                  <th scope="col" className="px-3 py-3 font-medium">
                    {t('profile.mode')}
                  </th>
                  <th scope="col" className="px-3 py-3 font-medium">
                    {t('profile.result')}
                  </th>
                  <th scope="col" className="px-3 py-3 font-medium">
                    {t('profile.score')}
                  </th>
                  <th scope="col" className="px-3 py-3 font-medium">
                    MMR
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">
                    {t('profile.date')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {profile.recentMatches.map((match) => (
                  <tr key={match.id} className="border-b border-white/10 last:border-0">
                    <th scope="row" className="px-4 py-4 font-medium">
                      <button
                        type="button"
                        className="underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-sky-300"
                        onClick={() => void useMatchDetailsStore.getState().open(match.id)}
                      >
                        {match.mapId}
                      </button>
                    </th>
                    <td className="px-3 py-4 text-neutral-300">{modeLabel(match.mode)}</td>
                    <td
                      className={twMerge(
                        'px-3 py-4',
                        match.result === 'win' ? 'text-emerald-300' : 'text-rose-300'
                      )}
                    >
                      {t(match.result === 'win' ? 'profile.win' : 'profile.loss')}
                    </td>
                    <td className="px-3 py-4">{match.score}</td>
                    <td className="px-3 py-4 text-neutral-300">
                      {match.mmrChange === null
                        ? '—'
                        : `${match.mmrChange > 0 ? '+' : ''}${match.mmrChange}`}
                    </td>
                    <td className="px-4 py-4 text-right text-neutral-300">
                      {new Date(match.completedAt).toLocaleDateString(language)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="p-8 text-sm text-neutral-300">
              {t(profile.recentMatches ? 'profile.noMatches' : 'profile.matchesUnavailable')}
            </p>
          )}
        </div>
      </section>
    </div>
  )
}
