import { rm } from 'node:fs/promises'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { getSavedCs16Executable } from './game-settings'
import { startSkinAssetSync, type SkinAssetSyncProgress } from './match-assets'

const getManagedSkinAssetRoot = async (): Promise<string> => {
  const executable = (await getSavedCs16Executable()) ?? process.env.CS16_CLIENT_EXECUTABLE_PATH
  if (!executable || !isAbsolute(executable)) {
    throw new Error('Choose your Counter-Strike executable in Settings before repairing assets.')
  }
  return join(dirname(resolve(executable)), 'cstrike', 'models', '16competitive')
}

export const repairSkinAssets = async (
  apiUrl: string,
  onProgress: (progress: SkinAssetSyncProgress) => void
): Promise<void> => {
  const managedAssetRoot = await getManagedSkinAssetRoot()
  await rm(managedAssetRoot, { recursive: true, force: true })
  await startSkinAssetSync(apiUrl, onProgress)
}
