import { skinPreviewRotation } from '../../../../shared/skin-preview-rotation'
import { characterAnimationLabels } from '../party/character-animation'
import { isGrenadeWeapon } from './weapon-categories'

export const isCharacterModel = (key: string): boolean => key === 'player_ct' || key === 'player_t'

export const getSkinAnimation = (key: string): string | readonly string[] =>
  isCharacterModel(key) ? characterAnimationLabels(key === 'player_ct' ? 'm4a1' : 'ak47') : 'idle1'

export const characterWeaponAttachment = (key: string) =>
  isCharacterModel(key)
    ? {
        attachedModelPath: key === 'player_ct' ? 'p_m4a1.mdl' : 'p_ak47.mdl',
        attachedModelRotation: (key === 'player_ct' ? [0, -78, 90] : [0, 110, 90]) as readonly [
          number,
          number,
          number
        ],
        attachedModelHandRotation: [0, 180, 0] as const,
        attachedModelHandOffset: (key === 'player_ct' ? [11, 0, 2] : [21, 0, 0.5]) as readonly [
          number,
          number,
          number
        ]
      }
    : {}

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
  player_ct: 2.1,
  player_t: 2.1,
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

  // HE models need to fill more of the card than the older grenade framing.
  hegrenade: 2,

  // Melee
  knife: 1.2
}

export const getSkinCameraDistanceMultiplier = (weaponKey: string, base: number): number =>
  base *
  (SKIN_PREVIEW_ZOOM_BY_WEAPON[weaponKey] ??
    (isGrenadeWeapon(weaponKey) ? GRENADE_SKIN_PREVIEW.zoom : 1))

/** Fixed target used by the dual-wield Elite model to favor one pistol. */
export const getSkinCameraTarget = (
  weaponKey: string
): readonly [number, number, number] | undefined => (weaponKey === 'elite' ? [0, 0, 0] : undefined)

export const SKIN_PREVIEW_ROTATION_BY_WEAPON: Record<string, SkinPresentationRotation> = {
  player_ct: [0, 0, 0],
  player_t: [0, 0, 0],
  // Shotguns — intentionally separate so each can be tuned independently.
  m3: [90, 0, 190],
  m3super90: [0, 90, 90],
  xm1014: [90, 90, 90],

  knife: [120, 90, 120],
  mp5navy: [90, 90, 90],
  mac10: [90, 90, 90]
}

export const getSkinPresentationRotation = (
  weaponKey: string,
  offset?: unknown
): SkinPresentationRotation => {
  const base = isGrenadeWeapon(weaponKey)
    ? GRENADE_SKIN_PREVIEW.rotation
    : (SKIN_PREVIEW_ROTATION_BY_WEAPON[weaponKey] ?? [90, 0, 190])
  const rotation = skinPreviewRotation(offset)
  return [base[0] + rotation[0], base[1] + rotation[1], base[2] + rotation[2]]
}

/**
 * Stable signature for every setting that changes how a thumbnail is framed.
 * Including this in the thumbnail/model key makes presentation tweaks refresh
 * immediately instead of reusing an image captured with older camera values.
 */
export const getSkinPresentationRevision = (weaponKey: string, offset?: unknown): string => {
  const zoom = getSkinCameraDistanceMultiplier(weaponKey, 1)
  const rotation = getSkinPresentationRotation(weaponKey, offset).join('-')
  const target = getSkinCameraTarget(weaponKey)?.join('-') ?? 'auto'
  return `${isCharacterModel(weaponKey) ? 'character-armed-v3' : 'presentation-v5'}:${weaponKey}:z${zoom}:r${rotation}:t${target}`
}
