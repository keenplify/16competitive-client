import { characterWeaponAttachment } from './skin-model-presentation'
import { Users, Check, LoaderCircle } from 'lucide-react'
import { useEffect, useState, type JSX } from 'react'
import { twMerge } from 'tailwind-merge'
import type { CharacterTeam, Skin } from '../../../../shared/skins'
import { ModelViewer } from '../../libs/web-hlmv/ui/ModelViewer'
import { characterAnimationLabels } from '../party/character-animation'
import { presentationModelPath } from '../party/party-models'
import { useTranslation } from '../i18n/i18n'
import { getCachedSkinModel } from './skin-model-cache'

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
  const [buffer, setBuffer] = useState<ArrayBuffer>()
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    if (!skin) return
    let active = true
    void getCachedSkinModel(skin.id, skin.playerModelPath ?? '').then(
      (value) => {
        if (active) setBuffer(value)
      },
      () => {
        if (active) setFailed(true)
      }
    )
    return () => {
      active = false
    }
  }, [skin])
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
          {(!skin || buffer) && (
            <ModelViewer
              modelBuffer={buffer}
              modelKey={skin?.id}
              modelPath={skin ? undefined : presentationModelPath(`player/${model}/${model}.mdl`)}
              {...characterWeaponAttachment(`player_${team}`)}
              animation={characterAnimationLabels(team === 'ct' ? 'm4a1' : 'ak47')}
              camera={{ distanceMultiplier: 1.05 }}
              cameraLocked
              maxFrameRate={20}
              className="absolute inset-0"
            />
          )}
          {failed && (
            <span className="absolute inset-0 flex items-center justify-center text-xs">
              {skin?.name}
            </span>
          )}
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
