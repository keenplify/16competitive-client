import { Users, Check, LoaderCircle } from 'lucide-react'
import { type JSX } from 'react'
import { twMerge } from 'tailwind-merge'
import type { CharacterTeam, Skin } from '../../../../shared/skins'
import { isWebRuntime } from '../../web-runtime'
import { PartyModelScene } from '../party/PartyModelScene'
import { useLobbyLoadoutStore } from '../party/lobby-loadout.store'
import { useGameSettingsStore } from '../settings/game-settings.store'
import { presentationModelPath } from '../party/party-models'
import { useTranslation } from '../i18n/i18n'

interface CharacterPanelProps {
  team: CharacterTeam
  model: string
  skin?: Skin
  selected: boolean
  disabled: boolean
  onSelect: () => void
  onShowInParty: () => void
  partySelected: boolean
  partyPending: boolean
  className?: string
}
export function CharacterPanel(props: CharacterPanelProps): JSX.Element {
  // Remount when the model changes so stale asynchronous previews never flash.
  return <CharacterPanelContent key={props.skin?.playerModelPath ?? props.model} {...props} />
}
function CharacterPanelContent({
  team,
  model,
  skin,
  selected,
  disabled,
  onSelect,
  onShowInParty,
  partySelected,
  partyPending,
  className
}: CharacterPanelProps): JSX.Element {
  const { t } = useTranslation()
  const weaponKey = useLobbyLoadoutStore((state) => state.weaponKey)
  const weaponModelPath = useLobbyLoadoutStore((state) => state.weaponModelPath)
  const weaponSkinId = useLobbyLoadoutStore((state) => state.weaponSkinId)
  const installationPath = useGameSettingsStore((state) => state.savedPath)
  const stockModelPath = `player/${model}/${model}.mdl`
  const modelPath = skin ? `skin:${skin.id}` : presentationModelPath(stockModelPath)
  return (
    <div className={twMerge('relative self-start', className)}>
      <button
        type="button"
        title={t(team === 'ct' ? 'character.filterCt' : 'character.filterT')}
        aria-pressed={selected}
        disabled={disabled}
        onClick={onSelect}
        className={twMerge(
          'character-panel relative flex w-full h-[420px] flex-col self-start border border-white/15 bg-black/20 text-center focus-visible:outline-2 focus-visible:outline-sky-300',
          selected &&
            (team === 'ct' ? 'border-sky-400 bg-sky-400/10' : 'border-amber-300 bg-amber-300/10'),
          undefined
        )}
      >
        <span className="px-2 py-3 text-xs font-bold">
          {t(team === 'ct' ? 'character.ct' : 'character.t')}
        </span>
        <span className="pointer-events-none relative block min-h-64 w-full flex-1">
          <PartyModelScene
            actors={[
              {
                member: {
                  id: `character-preview-${team}`,
                  username: model,
                  mmr: 0,
                  lobbyPlayerModel: modelPath,
                  lobbyWeaponSkinId: weaponSkinId,
                  lobbyWeaponKey: weaponKey,
                  lobbyWeaponModelPath: weaponModelPath,
                  clientMode: isWebRuntime() ? 'web' : 'desktop'
                },
                modelPath,
                fallbackModelPath: stockModelPath,
                weaponPath:
                  weaponModelPath ?? `p_${weaponKey === 'mp5navy' ? 'mp5' : weaponKey}.mdl`,
                weaponSkinId,
                weaponKey,
                isLeader: false,
                isCurrentPlayer: true
              }
            ]}
            sourceRevision={installationPath ?? 'unloaded'}
            showNameplates={false}
            verticalOffset={-35}
            cameraDistance={130}
            followPointer={false}
            maxFrameRate={20}
            className="absolute inset-0 h-full w-full"
          />
        </span>
        <span className="px-2 py-3 pr-10 text-sm font-semibold">
          {skin?.name ?? model.toUpperCase()}
        </span>
      </button>
      <button
        type="button"
        disabled={disabled || partyPending || partySelected}
        onClick={onShowInParty}
        aria-label={t(partySelected ? 'character.partySelected' : 'character.party')}
        title={t(partySelected ? 'character.partySelected' : 'character.party')}
        className="absolute right-2 bottom-2 flex size-8 items-center justify-center border border-white/20 bg-black/60 text-white hover:bg-white/20 disabled:opacity-60"
      >
        {partyPending ? (
          <LoaderCircle className="size-4 animate-spin" />
        ) : partySelected ? (
          <Check className="size-4" />
        ) : (
          <Users className="size-4" />
        )}
      </button>
    </div>
  )
}
