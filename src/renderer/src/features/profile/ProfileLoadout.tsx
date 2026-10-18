import { SkinModelThumbnail } from '../skins/SkinModelThumbnail'
import type { JSX } from 'react'
import type { PlayerProfile } from '../../../../shared/match-history'
import { useTranslation } from '../i18n/i18n'
export function ProfileLoadout({ profile }: { profile: PlayerProfile }): JSX.Element {
  const { t } = useTranslation()
  const skins = [...(profile.loadout ?? [])].sort(
    (a, b) => Number(!!b.equipped) - Number(!!a.equipped)
  )
  return (
    <div className="py-6">
      {' '}
      <section aria-labelledby="profile-loadout">
        <h2 id="profile-loadout" className="mb-3 text-xl font-semibold">
          {t('profile.loadout')}
        </h2>
        <div className="border border-white/10 bg-neutral-950/70 p-3">
          {profile.loadout?.length ? (
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
              {skins.map((skin) => (
                <li
                  key={skin.id}
                  className="relative grid min-w-0 grid-rows-[5rem_3.5rem] gap-2 border border-white/10 bg-black/35 p-2"
                >
                  <SkinModelThumbnail
                    key={skin.id}
                    cacheKey={`skin:${skin.id}`}
                    skinId={skin.id}
                    weaponKey={skin.weaponKey}
                    fallback={<span className="text-sm text-neutral-300">{skin.weaponKey}</span>}
                    className="h-20 overflow-hidden bg-slate-950/75"
                  />
                  <div className="min-w-0 text-center">
                    <p className="truncate text-xs font-semibold" title={skin.name}>
                      {skin.name}
                    </p>
                    <p className="truncate text-xs text-neutral-400">
                      {skin.weaponKey.toUpperCase()}
                    </p>
                    {skin.equipped && (
                      <p className="text-xs font-medium text-emerald-300">
                        {t('profile.equipped')}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="p-6 text-sm text-neutral-300">
              {t(profile.loadout ? 'profile.noLoadout' : 'profile.loadoutUnavailable')}
            </p>
          )}
        </div>
      </section>
    </div>
  )
}
