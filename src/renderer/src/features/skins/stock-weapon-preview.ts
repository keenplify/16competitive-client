import { stockStickerModelPath } from '../../../../shared/stock-sticker-models'
import type { Skin } from '../../../../shared/skins'

export function stockWeaponPreview(
  weaponKey: string,
  name: string,
  gameVersion: 'cs16' | 'cs13' = 'cs16'
): Skin {
  const model = weaponKey === 'mp5navy' ? 'mp5' : weaponKey
  return {
    id: `stock:${weaponKey}`,
    weaponKey,
    name,
    gameVersion,
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
    viewModelPath:
      gameVersion === 'cs13' ? stockStickerModelPath(weaponKey, gameVersion) : `v_${model}.mdl`,
    playerModelPath: `p_${model}.mdl`,
    worldModelPath: `w_${model}.mdl`,
    actionSoundPath: null,
    explosionSpritePath: null
  }
}
