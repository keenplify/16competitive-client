export type SkinPresentationRotation = readonly [number, number, number]

const FIREARM_ROTATION: SkinPresentationRotation = [90, 0, 190]
const KNIFE_ROTATION: SkinPresentationRotation = [120, 90, 120]

export const getSkinPresentationRotation = (weaponKey: string): SkinPresentationRotation =>
  weaponKey === 'knife' ? KNIFE_ROTATION : FIREARM_ROTATION
