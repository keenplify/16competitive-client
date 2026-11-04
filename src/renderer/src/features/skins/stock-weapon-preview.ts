import type { Skin } from '../../../../shared/skins'

export function stockWeaponPreview(weaponKey: string, name: string): Skin {
  const model = weaponKey === 'mp5navy' ? 'mp5' : weaponKey
  return {
    id: `stock:${weaponKey}`,
    weaponKey,
    name,
    gameVersion: 'cs16',
    status: 'ACTIVE',
    description: null,
    pricePoints: 0,
    pointsEnabled: false,
    pricePCash: null,
    viewerPCash: 0,
    availableFrom: null,
    availableUntil: null,
    creatorName: 'Valve',
    creatorUrl: null,
    sourceUrl: '',
    licenseName: '',
    licenseUrl: null,
    attributionText: '',
    viewModelPath: `v_${model}.mdl`,
    playerModelPath: `p_${model}.mdl`,
    worldModelPath: `w_${model}.mdl`,
    actionSoundPath: null,
    explosionSpritePath: null
  }
}
