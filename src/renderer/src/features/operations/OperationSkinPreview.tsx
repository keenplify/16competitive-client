import { Award, LoaderCircle } from 'lucide-react'
import { type CSSProperties, type JSX } from 'react'
import type { OperationTier } from '../../../../shared/operations'
import { CurrencyIcon } from '../../components/CurrencyIcon'
import { useAuthStore } from '../auth/auth.store'
import { useGameSettingsStore } from '../settings/game-settings.store'
import { useLobbyLoadoutStore } from '../party/lobby-loadout.store'
import { PartyModelScene } from '../party/PartyModelScene'
import { presentationModelPath } from '../party/party-models'

const spotlightGlowStyle: CSSProperties = {
  filter:
    'drop-shadow(0 0 10px rgba(255,255,255,0.28)) ' +
    'drop-shadow(0 0 28px rgba(125,211,252,0.18))'
}

const defaultWeaponModelPath = (weaponKey: string): string =>
  `p_${weaponKey === 'mp5navy' ? 'mp5' : weaponKey}.mdl`

function SkinSpotlight({ tier }: { tier: OperationTier }): JSX.Element {
  const skinId = tier.skinId!
  const weaponKey = tier.skin!.weaponKey!
  const player = useAuthStore((state) => state.session?.player)
  const operativeModel = useLobbyLoadoutStore((state) => state.playerModel)
  const installationPath = useGameSettingsStore((state) => state.savedPath)

  return (
    <div className="relative flex h-full flex-col items-center justify-end pb-5 md:pb-7">
      <div className="absolute inset-0" style={spotlightGlowStyle}>
        {player ? (
          <PartyModelScene
            actors={[
              {
                member: {
                  id: player.id,
                  username: player.username,
                  mmr: player.mmr,
                  lobbyPlayerModel: operativeModel,
                  lobbyWeaponSkinId: skinId,
                  lobbyWeaponKey: weaponKey,
                  lobbyWeaponModelPath: null
                },
                modelPath: presentationModelPath(operativeModel),
                fallbackModelPath: operativeModel,
                weaponPath: defaultWeaponModelPath(weaponKey),
                weaponSkinId: skinId,
                weaponKey,
                isLeader: false,
                isCurrentPlayer: true,
                forceWeaponSkinPreview: true
              }
            ]}
            sourceRevision={installationPath ?? 'unloaded'}
            showNameplates={false}
            className="h-full w-full"
            verticalOffset={-35}
          />
        ) : (
          <div className="grid h-full place-items-center" role="status">
            <LoaderCircle className="size-7 animate-spin text-sky-300" />
          </div>
        )}
      </div>
    </div>
  )
}

export function OperationSkinPreview({ tier }: { tier: OperationTier }): JSX.Element {
  if (tier.rewardType === 'SKIN' && tier.skinId && tier.skin?.weaponKey) {
    return <SkinSpotlight tier={tier} />
  }

  if (tier.rewardType === 'POINTS' || tier.rewardType === 'P_CASH') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <CurrencyIcon currency={tier.rewardType} animated className="size-44 sm:size-56" />
        <p className="rounded bg-black/60 px-5 py-2 text-xl font-black text-white backdrop-blur-sm">
          {(tier.amount ?? 0).toLocaleString()} {tier.rewardType === 'POINTS' ? 'Points' : 'Papa Cash'}
        </p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 text-sky-200">
      <Award className="size-36 drop-shadow-[0_0_30px_rgba(56,189,248,.45)]" />
      <p className="rounded bg-black/60 px-5 py-2 text-xl font-black text-white">
        {tier.showcaseName ?? 'Showcase'}
      </p>
    </div>
  )
}
