import { Award, LoaderCircle } from 'lucide-react'
import { useEffect, useState, type JSX } from 'react'
import type { OperationTier } from '../../../../shared/operations'
import type { OwnedSkin } from '../../../../shared/skins'
import { Button } from '../../components/ui/Button'
import { CurrencyIcon } from '../../components/CurrencyIcon'
import elitePistolsImage from '../../assets/elite-pistols.png'
import { ModelViewer } from '../../libs/web-hlmv/ui/ModelViewer'
import { useMatchmakingStore } from '../matchmaking/matchmaking.store'
import { getCachedSkinModel } from '../skins/skin-model-cache'
import {
  getSkinCameraDistanceMultiplier,
  getSkinCameraTarget,
  getSkinPresentationRotation
} from '../skins/skin-model-presentation'

function SkinSpotlight({ tier }: { tier: OperationTier }): JSX.Element {
  const skinId = tier.skinId!
  const weaponKey = tier.skin!.weaponKey!
  const [model, setModel] = useState<ArrayBuffer | null>(null)
  const [modelError, setModelError] = useState<string | null>(null)
  const [owned, setOwned] = useState<OwnedSkin | null>(null)
  const [inventoryLoading, setInventoryLoading] = useState(true)
  const [inventoryError, setInventoryError] = useState<string | null>(null)
  const [equipping, setEquipping] = useState(false)
  const queueStatus = useMatchmakingStore((state) => state.queueStatus)
  const loadoutLocked = [
    'match_found', 'ready_check', 'countdown', 'starting_server', 'server_ready'
  ].includes(queueStatus)

  useEffect(() => {
    let active = true
    if (weaponKey !== 'elite') {
      void getCachedSkinModel(skinId).then(
        (bytes) => { if (active) setModel(bytes) },
        (reason: unknown) => {
          if (active) setModelError(reason instanceof Error ? reason.message : 'Could not load model.')
        }
      )
    }
    void window.api.skins.mine().then(
      (inventory) => {
        if (active) {
          setOwned(inventory.find((item) => item.skin.id === skinId) ?? null)
          setInventoryLoading(false)
        }
      },
      (reason: unknown) => {
        if (active) {
          setInventoryError(reason instanceof Error ? reason.message : 'Could not load inventory.')
          setInventoryLoading(false)
        }
      }
    )
    return () => { active = false }
  }, [skinId, weaponKey])

  const equip = (): void => {
    if (!owned || owned.equippedAt || equipping || loadoutLocked) return
    setEquipping(true)
    setInventoryError(null)
    void window.api.skins.equip(skinId)
      .then(() => window.api.skins.mine())
      .then((inventory) => setOwned(inventory.find((item) => item.skin.id === skinId) ?? null))
      .catch((reason: unknown) =>
        setInventoryError(reason instanceof Error ? reason.message : 'Could not equip skin.')
      )
      .finally(() => setEquipping(false))
  }

  return (
    <div className="flex h-full flex-col items-center justify-end pb-16 md:pb-[14%]">
      <div className="relative min-h-0 w-full flex-1">
        {weaponKey === 'elite' ? (
          <img className="h-full w-full object-contain" src={elitePistolsImage} alt={tier.skin?.name ?? 'Elite pistols'} />
        ) : model ? (
          <ModelViewer
            modelBuffer={model}
            modelKey={skinId}
            presentationRotation={getSkinPresentationRotation(weaponKey)}
            camera={{
              distanceMultiplier: getSkinCameraDistanceMultiplier(weaponKey, 0.9),
              target: getSkinCameraTarget(weaponKey)
            }}
            animation="idle1"
            maxFrameRate={30}
            disableZoom
            lockCameraDistance
            orbitAngleLimit={0.7}
            rotateSpeed={0.45}
            className="absolute inset-0"
          />
        ) : (
          <div className="grid h-full place-items-center text-sm text-rose-300" role="status">
            {modelError ?? <LoaderCircle className="size-7 animate-spin text-sky-300" />}
          </div>
        )}
      </div>
      <div className="z-10 flex max-w-full flex-col items-center gap-2 rounded bg-black/60 px-5 py-3 backdrop-blur-sm">
        <p className="max-w-full truncate text-sm font-semibold text-white">{tier.skin?.name ?? 'Weapon skin'}</p>
        {inventoryError && <p className="text-center text-xs text-rose-300">{inventoryError}</p>}
        <Button
          className="min-w-28"
          disabled={inventoryLoading || !owned || Boolean(owned.equippedAt) || equipping || loadoutLocked}
          onClick={equip}
        >
          {inventoryLoading ? 'Checking…' : equipping ? 'Equipping…' : owned?.equippedAt
            ? 'Equipped' : loadoutLocked ? 'Loadout locked' : owned ? 'Equip' : 'Unlock to equip'}
        </Button>
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
