export type SkinPresentationRotation = readonly [number, number, number]

/**
 * Dual-wield models (notably Elite) have a much wider bounding box than a
 * single weapon. Move the camera closer so both pistols remain legible.
 */
export const getSkinCameraDistanceMultiplier = (weaponKey: string, base: number): number =>
  weaponKey === 'elite' ? base * 1 : base

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
