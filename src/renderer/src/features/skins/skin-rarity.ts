import type { Skin } from '../../../../shared/skins'

export type SkinRarity =
  'FIELD' | 'FORGE' | 'STRIKE' | 'VANGUARD' | 'NEON' | 'CRIMSON' | 'RELIC' | 'VAULT'

export interface SkinRarityPresentation {
  label: string
  className: string
}

export const skinRarityOrder: SkinRarity[] = [
  'FIELD',
  'FORGE',
  'STRIKE',
  'VANGUARD',
  'NEON',
  'CRIMSON',
  'RELIC',
  'VAULT'
]

const presentation: Record<SkinRarity, SkinRarityPresentation> = {
  FIELD: {
    label: 'Field',
    className: 'border-neutral-300/30 bg-neutral-200/10 text-neutral-200'
  },
  FORGE: {
    label: 'Forge',
    className: 'border-sky-300/30 bg-sky-300/10 text-sky-200'
  },
  STRIKE: {
    label: 'Strike',
    className: 'border-blue-500/35 bg-blue-500/10 text-blue-300'
  },
  VANGUARD: {
    label: 'Vanguard',
    className: 'border-purple-400/35 bg-purple-400/10 text-purple-300'
  },
  NEON: { label: 'Neon', className: 'border-pink-400/35 bg-pink-400/10 text-pink-300' },
  CRIMSON: { label: 'Crimson', className: 'border-red-400/35 bg-red-400/10 text-red-300' },
  RELIC: {
    label: 'Relic',
    className: 'border-amber-300/40 bg-amber-300/10 text-amber-200'
  },
  VAULT: {
    label: 'Vault',
    className: 'border-orange-400/40 bg-orange-400/10 text-orange-200'
  }
}

// The catalog has no server-side rarity field yet, so this is a predictable
// display fallback based on the existing Point price. Relic remains reserved
// for special items such as premium-only knives; Vault is intentionally never
// inferred from price and will require explicit catalog metadata later.
export const skinRarity = (
  skin: Pick<Skin, 'weaponKey' | 'pricePoints' | 'pointsEnabled' | 'pricePCash'>
): SkinRarity => {
  if (!skin.pointsEnabled && skin.pricePCash !== null) return 'RELIC'
  if (skin.weaponKey === 'knife' && skin.pricePoints >= 100_000) return 'RELIC'
  if (skin.pricePoints >= 10_000) return 'CRIMSON'
  if (skin.pricePoints >= 7_500) return 'NEON'
  if (skin.pricePoints >= 3_500) return 'VANGUARD'
  if (skin.pricePoints >= 2_500) return 'STRIKE'
  if (skin.pricePoints >= 2_000) return 'FORGE'
  return 'FIELD'
}

export const skinRarityPresentationFor = (rarity: SkinRarity): SkinRarityPresentation =>
  presentation[rarity]

export const skinRarityPresentation = (
  skin: Parameters<typeof skinRarity>[0]
): SkinRarityPresentation => presentation[skinRarity(skin)]
