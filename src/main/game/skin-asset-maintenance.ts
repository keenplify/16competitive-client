import { startSkinAssetSync, type SkinAssetSyncProgress } from './match-assets'

export const repairSkinAssets = async (
  apiUrl: string,
  onProgress: (progress: SkinAssetSyncProgress) => void,
  game: 'cs16' | 'cs13' = 'cs16'
): Promise<void> => {
  // The normal sync now SHA-256 checks every managed asset. Repair therefore
  // only re-downloads missing or mismatched files instead of deleting the
  // entire managed asset tree first.
  await startSkinAssetSync(apiUrl, onProgress, game)
}
