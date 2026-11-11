import type { RewardReceipt } from '../../../../shared/reward-inbox'
import { skinRarity, type SkinRarity } from '../skins/skin-rarity'

/** Match the shop's display tiers; this never changes grant odds or entitlement. */
export function rewardRarity(reward: RewardReceipt): SkinRarity {
  if (reward.type === 'P_CASH') return 'RELIC'
  if (reward.type === 'POINTS') return 'FIELD'
  if (reward.type === 'SHOWCASE') return 'VANGUARD'
  return skinRarity({
    weaponKey: reward.weaponKey ?? '',
    pricePoints: reward.pricePoints ?? 0,
    pointsEnabled: reward.pointsEnabled ?? true,
    pricePCash: reward.pricePCash ?? null
  })
}
