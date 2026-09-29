import { stat } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'

// These exact 32-bit client builds have the 87-name/ordinal ABI verified by
// the private helper's Windows cosmetic probe. Other builds must use stock HUD.
const VERIFIED_CLIENT_SHA256 = new Set([
  'ef7a0f40989cb79ba95d40f528534da36866892ee871147ca82e133b7a5edc3d',
  '733d4b48a64991d2cd2a60c20d99f72b6533cc401c47f97cc0e6073bd482b6dc'
])

export const WINDOWS_STANDALONE_EXECUTABLE_NAMES = [
  'CS16Launcher.exe',
  'cstrike.exe',
  'hl.exe'
] as const

export const supportsWindowsCosmeticClient = (sha256: string): boolean =>
  VERIFIED_CLIENT_SHA256.has(sha256)

const optionalFile = async (path: string): Promise<boolean> => {
  try {
    return (await stat(path)).isFile()
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw error
  }
}

/**
 * NextClient scans and patches byte patterns in client.dll. In an isolated
 * 2.5.3 test, replacing that DLL with our proxy made client_mini.dll's lookup
 * return null, then crash at RVA 0xC0BC (0xC0000005). The stock DLL hash being
 * allowlisted for other games does not make this installation compatible.
 */
export const isNextClientInstallation = async (gameRoot: string): Promise<boolean> => {
  const [clientMini, nitroApi] = await Promise.all([
    optionalFile(join(gameRoot, 'cstrike', 'cl_dlls', 'client_mini.dll')),
    optionalFile(join(gameRoot, 'nitro_api2.dll'))
  ])
  return clientMini && nitroApi
}

/** Official NextClient builds are launched through cstrike.exe, not hl.exe. */
export const isNextClientExecutable = async (executable: string): Promise<boolean> =>
  basename(executable).toLowerCase() === 'cstrike.exe' &&
  (await isNextClientInstallation(dirname(executable)))
