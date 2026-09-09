export type SkinPresentationRotation = readonly [number, number, number]
export type SkinPreviewContext = 'thumbnail' | 'detail'

export interface SkinPreviewZoom {
  /** Store and Loadout card previews. > 1 zooms out, < 1 zooms in. */
  thumbnail: number
  /** Large interactive Store preview. > 1 zooms out, < 1 zooms in. */
  detail: number
}

/**
 * Central per-weapon preview framing controls.
 *
 * 1.00 = current/default framing
 * 1.20 = move the camera 20% farther away (zoom out)
 * 0.85 = move the camera 15% closer (zoom in)
 *
 * Store cards and Loadout cards both use `thumbnail`, so adjusting a weapon
 * here keeps those previews consistent. The large Store modal uses `detail`.
 */
export const SKIN_PREVIEW_ZOOM_BY_WEAPON: Record<string, SkinPreviewZoom> = {
  // Pistols
  glock18: { thumbnail: 1.25, detail: 1 },
  usp: { thumbnail: 1, detail: 1 },
  p228: { thumbnail: 1, detail: 1 },
  deagle: { thumbnail: 1, detail: 1 },
  elite: { thumbnail: 1, detail: 1 },
  fiveseven: { thumbnail: 1, detail: 1 },

  // SMGs
  tmp: { thumbnail: 1, detail: 1 },
  mac10: { thumbnail: 1, detail: 1 },
  mp5navy: { thumbnail: 1, detail: 1 },
  ump45: { thumbnail: 1, detail: 1 },
  p90: { thumbnail: 1, detail: 1 },

  // Rifles
  galil: { thumbnail: 1, detail: 1 },
  famas: { thumbnail: 1, detail: 1 },
  ak47: { thumbnail: 1, detail: 1 },
  m4a1: { thumbnail: 1, detail: 1 },
  aug: { thumbnail: 1, detail: 1 },
  sg552: { thumbnail: 1, detail: 1 },

  // Snipers
  scout: { thumbnail: 1, detail: 1 },
  awp: { thumbnail: 1, detail: 1 },
  sg550: { thumbnail: 1, detail: 1 },
  g3sg1: { thumbnail: 1, detail: 1 },

  // Heavy / shotguns
  m3: { thumbnail: 1.12, detail: 1 },
  xm1014: { thumbnail: 1, detail: 1 },
  m249: { thumbnail: 1, detail: 1 },

  // Melee
  knife: { thumbnail: 1, detail: 1 }
}

const getSkinPreviewZoom = (weaponKey: string, context: SkinPreviewContext): number =>
  SKIN_PREVIEW_ZOOM_BY_WEAPON[weaponKey]?.[context] ?? 1

export const getSkinCameraDistanceMultiplier = (
  weaponKey: string,
  base: number,
  context: SkinPreviewContext = 'thumbnail'
): number => base * getSkinPreviewZoom(weaponKey, context)

/** Fixed target used by the dual-wield Elite model to favor one pistol. */
export const getSkinCameraTarget = (
  weaponKey: string
): readonly [number, number, number] | undefined => (weaponKey === 'elite' ? [0, 0, 0] : undefined)

export const getSkinPresentationRotation = (weaponKey: string): SkinPresentationRotation => {
  switch (weaponKey) {
    case 'knife':
      return [120, 90, 120]
    case 'mp5navy':
    case 'mac10':
      return [90, 90, 90]
    default:
      return [90, 0, 190]
  }
}
