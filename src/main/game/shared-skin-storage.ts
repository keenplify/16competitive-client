import { app } from 'electron'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { getSavedCs16Executable } from './game-settings'
import { ensureLauncherContentDirectory } from './game-directory'
import { LegacyGameService } from './legacy-game-service'
import { ensureSharedModelDirectory, managedAssetDestination } from './shared-model-directory'

let pending: Promise<void> = Promise.resolve()
let sharedAssetUserData: string | null = null

/** Share verified model bytes with the desktop client, without sharing its login or settings. */
export function configureNativeHelperSharedAssets(desktopUserData: string): void {
  if (!process.argv.includes('--native-helper-runtime') || !isAbsolute(desktopUserData))
    throw new Error('Invalid helper asset storage')
  sharedAssetUserData = desktopUserData
}

export async function prepareSkinStorage(game: 'cs16' | 'cs13' = 'cs16'): Promise<{
  contentRoot: string
  destination: (path: string) => Promise<string>
}> {
  const shared = join(
    sharedAssetUserData ?? app.getPath('userData'),
    'game-assets',
    'models',
    '16competitive'
  )
  const executable = (await getSavedCs16Executable()) ?? process.env.CS16_CLIENT_EXECUTABLE_PATH
  const cs16 =
    executable && isAbsolute(executable)
      ? await ensureLauncherContentDirectory(
          process.env.CS16_CLIENT_GAME_DIRECTORY
            ? resolve(process.env.CS16_CLIENT_GAME_DIRECTORY)
            : dirname(executable)
        ).catch((error: unknown) => {
          if (game === 'cs16') throw error
          return null
        })
      : null
  const profile = await new LegacyGameService({
    settingsPath: join(app.getPath('userData'), 'cs13-installation.json'),
    platform: process.platform,
    chooseFolder: async () => null,
    isBusy: () => false,
    launch: async () => {}
  }).get()
  const cs13 = profile.ok ? profile.value.installation?.gameDirectory : null
  const contentRoot = game === 'cs13' ? cs13 : cs16
  if (!contentRoot)
    throw new Error(
      game === 'cs13'
        ? !profile.ok
          ? 'legacy.error.settingsFailed'
          : profile.value.folderPath
            ? 'legacy.error.invalidInstallation'
            : 'legacy.error.installationRequired'
        : 'Choose your Counter-Strike folder in Settings before joining a match.'
    )
  // Catalog sync and match preparation may overlap; migrations must serialize.
  const task = pending
    .catch(() => undefined)
    .then(async () => {
      for (const root of new Set([cs16, cs13].filter((root): root is string => !!root)))
        await ensureSharedModelDirectory(root, shared)
    })
  pending = task
  await task
  return {
    contentRoot,
    destination: (path) =>
      path.startsWith('models/16competitive/')
        ? managedAssetDestination(shared, path.slice('models/16competitive/'.length))
        : managedAssetDestination(contentRoot, path)
  }
}
