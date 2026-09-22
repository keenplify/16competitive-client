import { isGrenadeWeapon } from './weapon-categories'

export type SkinPresentationRotation = readonly [number, number, number]

/** Shared framing for HE, flash, and smoke grenade model previews. */
export const GRENADE_SKIN_PREVIEW = {
  zoom: 2.5,
  rotation: [15, 0, 0] as SkinPresentationRotation
} as const

/**
 * Central per-weapon preview framing controls.
 *
 * These values are applied to Store cards, Loadout cards, and the large Store
 * preview so a weapon keeps consistent framing everywhere.
 *
 * 1.00 = current/default framing
 * 1.20 = move the camera 20% farther away (zoom out)
 * 0.85 = move the camera 15% closer (zoom in)
 */
export const SKIN_PREVIEW_ZOOM_BY_WEAPON: Record<string, number> = {
  // Pistols
  glock18: 1.5,
  usp: 1.5,
  p228: 1.5,
  deagle: 1.5,
  elite: 1,
  fiveseven: 1.5,

  // SMGs
  tmp: 1.4,
  mac10: 1.4,
  mp5navy: 1.4,
  ump45: 1.4,
  p90: 1.4,

  // Rifles
  galil: 1.2,
  famas: 1.2,
  ak47: 1.3,
  m4a1: 1.3,
  aug: 1.2,
  sg552: 1.2,

  // Snipers
  scout: 1,
  awp: 1.25,
  sg550: 1,
  g3sg1: 1,

  // Heavy / shotguns
  m3: 1.3,
  xm1014: 1.3,
  m249: 1.3,

  // Melee
  knife: 1.2
}

export const getSkinCameraDistanceMultiplier = (weaponKey: string, base: number): number =>
  base *
  (isGrenadeWeapon(weaponKey)
    ? GRENADE_SKIN_PREVIEW.zoom
    : (SKIN_PREVIEW_ZOOM_BY_WEAPON[weaponKey] ?? 1))

/** Fixed target used by the dual-wield Elite model to favor one pistol. */
export const getSkinCameraTarget = (
  weaponKey: string
): readonly [number, number, number] | undefined => (weaponKey === 'elite' ? [0, 0, 0] : undefined)

export const SKIN_PREVIEW_ROTATION_BY_WEAPON: Record<string, SkinPresentationRotation> = {
  // Shotguns — intentionally separate so each can be tuned independently.
  m3: [90, 0, 190],
  xm1014: [90, 0, 190],

  knife: [120, 90, 120],
  mp5navy: [90, 90, 90],
  mac10: [90, 90, 90]
}

export const getSkinPresentationRotation = (weaponKey: string): SkinPresentationRotation =>
  isGrenadeWeapon(weaponKey)
    ? GRENADE_SKIN_PREVIEW.rotation
    : (SKIN_PREVIEW_ROTATION_BY_WEAPON[weaponKey] ?? [90, 0, 190])

/**
 * Stable signature for every setting that changes how a thumbnail is framed.
 * Including this in the thumbnail/model key makes presentation tweaks refresh
 * immediately instead of reusing an image captured with older camera values.
 */
export const getSkinPresentationRevision = (weaponKey: string): string => {
  const zoom = isGrenadeWeapon(weaponKey)
    ? GRENADE_SKIN_PREVIEW.zoom
    : (SKIN_PREVIEW_ZOOM_BY_WEAPON[weaponKey] ?? 1)
  const rotation = getSkinPresentationRotation(weaponKey).join('-')
  const target = getSkinCameraTarget(weaponKey)?.join('-') ?? 'auto'
  return `presentation-v2:${weaponKey}:z${zoom}:r${rotation}:t${target}`
}
