import { useEffect } from 'react'
import { Gift } from 'lucide-react'
import { twMerge } from 'tailwind-merge'
import type { DailyQuest } from '../../../../shared/daily-quests'
import { isDailyQuestReward } from '../../../../shared/daily-quests'
import { Button } from '../../components/ui/Button'
import { useNavigationStore } from '../navigation/navigation.store'
import { CurrencyIcon } from '../../components/CurrencyIcon'
import { SkinModelThumbnail } from '../skins/SkinModelThumbnail'
import { ensureStickerArtwork, useInventoryStore } from '../inventory/inventory.store'
import { useTranslation } from '../i18n/i18n'

export function MissionReward({
  quest,
  compact = false,
  onOpen,
  className
}: {
  quest: DailyQuest
  compact?: boolean
  onOpen?: () => void
  className?: string
}) {
  const { t } = useTranslation()
  const reward = isDailyQuestReward(quest.reward)
    ? quest.reward
    : { type: 'POINTS' as const, amount: quest.rewardPoints }
  const imagePath = reward.type === 'STICKER' ? reward.imagePath : undefined
  const image = useInventoryStore((state) => (imagePath ? state.images[imagePath] : undefined))
  useEffect(() => {
    if (!imagePath || image) return
    void ensureStickerArtwork(imagePath).catch((error) =>
      console.warn(
        '[DailyMission] reward artwork unavailable',
        error instanceof Error ? error.name : 'unknown'
      )
    )
  }, [imagePath, image])
  const label =
    reward.type === 'SKIN' || reward.type === 'STICKER'
      ? `${reward.amount} × ${reward.name}`
      : `${reward.amount.toLocaleString()} ${t(reward.type === 'POINTS' ? 'mission.points' : 'mission.pcash')}`
  const displayLabel =
    compact && (reward.type === 'SKIN' || reward.type === 'STICKER') ? `×${reward.amount}` : label
  return (
    <Button
      variant="ghost"
      title={t('mission.viewReward', { reward: label })}
      aria-label={t('mission.viewReward', { reward: label })}
      onClick={() => {
        onOpen?.()
        const navigation = useNavigationStore.getState()
        if (reward.type === 'STICKER') navigation.openStickerStore(reward.name)
        else navigation.navigate('store')
      }}
      className={twMerge('flex h-10 w-36 shrink-0 items-center gap-2 p-0', className)}
    >
      <div className="size-10 shrink-0 overflow-hidden" aria-hidden="true">
        {reward.type === 'POINTS' || reward.type === 'P_CASH' ? (
          <CurrencyIcon currency={reward.type} className="size-10" />
        ) : reward.type === 'SKIN' ? (
          <SkinModelThumbnail
            cacheKey={`daily-mission:${reward.skinId}`}
            skinId={reward.skinId}
            weaponKey={reward.weaponKey}
            previewRotation={reward.previewRotation}
            previewHiddenTextures={reward.previewHiddenTextures}
            showAppliedStickers={false}
            fallback={<Gift className="size-10 text-amber-200" />}
            className="size-10"
          />
        ) : image ? (
          <img src={image} alt="" className="size-10 object-contain" />
        ) : (
          <Gift className="size-10 text-amber-200" />
        )}
      </div>
      <span className="whitespace-nowrap text-xs font-semibold leading-4 text-amber-200">
        {displayLabel}
      </span>
    </Button>
  )
}
