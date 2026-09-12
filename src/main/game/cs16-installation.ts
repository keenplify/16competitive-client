import { stat } from 'node:fs/promises'
import { basename, delimiter, dirname, join, normalize } from 'node:path'

export type Cs16Distribution = 'steam' | 'standalone'

export interface Cs16LaunchTarget {
  distribution: Cs16Distribution
  executable: string
  argumentPrefix: string[]
  textureSize: '512' | '1024'
  usesLauncherHandoff: boolean
  environment?: Record<string, string>
}

const findSteamLibraryRoot = (executable: string): string | null => {
  let current = dirname(normalize(executable))

  for (let depth = 0; depth < 8; depth++) {
    if (basename(current).toLowerCase() === 'steamapps') return dirname(current)
    const parent = dirname(current)
    if (parent === current) break
    current = parent
  }

  return null
}

const findWinePrefix = (executable: string): string | null => {
  let current = dirname(normalize(executable))

  for (let depth = 0; depth < 16; depth++) {
    if (basename(current).toLowerCase() === 'drive_c') return dirname(current)
    const parent = dirname(current)
    if (parent === current) break
    current = parent
  }

  return null
}

const firstExistingFile = async (candidates: string[]): Promise<string | null> => {
  for (const candidate of candidates) {
    const metadata = await stat(candidate).catch(() => null)
    if (metadata?.isFile()) return candidate
  }
  return null
}

const resolveMacWineExecutable = async (): Promise<string> => {
  const configured = process.env.CS16_WINE_EXECUTABLE?.trim()
  const pathCandidates = (process.env.PATH ?? '')
    .split(delimiter)
    .filter(Boolean)
    .flatMap((directory) => [join(directory, 'wine'), join(directory, 'wine64')])
  const candidates = [
    ...(configured ? [configured] : []),
    '/opt/homebrew/bin/wine',
    '/opt/homebrew/bin/wine64',
    '/usr/local/bin/wine',
    '/usr/local/bin/wine64',
    '/opt/local/bin/wine',
    '/opt/local/bin/wine64',
    '/Applications/Wine Stable.app/Contents/Resources/wine/bin/wine',
    '/Applications/Wine Stable.app/Contents/Resources/wine/bin/wine64',
    '/Applications/Wine Devel.app/Contents/Resources/wine/bin/wine',
    '/Applications/Wine Staging.app/Contents/Resources/wine/bin/wine',
    ...pathCandidates
  ]

  const wineExecutable = await firstExistingFile(candidates)
  if (!wineExecutable) {
    throw new Error(
      'Wine was not found on macOS. Install Wine or set CS16_WINE_EXECUTABLE to the Wine binary.'
    )
  }
  return wineExecutable
}

const macWineLaunchTarget = async (
  executable: string,
  distribution: Cs16Distribution
): Promise<Cs16LaunchTarget> => {
  const wineExecutable = await resolveMacWineExecutable()
  const winePrefix = findWinePrefix(executable)
  if (!winePrefix) {
    throw new Error('The selected hl.exe must be inside a Wine prefix containing drive_c.')
  }

  return {
    distribution,
    executable: wineExecutable,
    argumentPrefix: [executable, '-game', 'cstrike', '-noforcemparms', '-noforcemaccel'],
    textureSize: distribution === 'steam' ? '1024' : '512',
    usesLauncherHandoff: false,
    environment: { WINEPREFIX: winePrefix }
  }
}

export const classifyCs16Distribution = (executable: string): Cs16Distribution =>
  findSteamLibraryRoot(executable) ? 'steam' : 'standalone'

export const resolveCs16LaunchTarget = async (executable: string): Promise<Cs16LaunchTarget> => {
  const steamLibraryRoot = findSteamLibraryRoot(executable)

  if (process.platform === 'darwin') {
    return macWineLaunchTarget(executable, steamLibraryRoot ? 'steam' : 'standalone')
  }

  if (!steamLibraryRoot) {
    const standaloneLauncher =
      process.platform === 'win32'
        ? await firstExistingFile([join(dirname(executable), 'CS16Launcher.exe')])
        : null
    return {
      distribution: 'standalone',
      // Some standalone distributions ship a launcher that installs their
      // Steam-emulation layer before loading GoldSrc. Bypassing it and running
      // hl.exe directly makes those clients crash during Steam initialization.
      executable: standaloneLauncher ?? executable,
      argumentPrefix: [
        ...(standaloneLauncher ? ['-steam'] : []),
        '-game',
        'cstrike',
        '-noforcemparms',
        '-noforcemaccel'
      ],
      // Older standalone GoldSrc clients can terminate during initialization
      // when forced above their supported 512px texture limit.
      textureSize: '512',
      usesLauncherHandoff: standaloneLauncher !== null
    }
  }

  if (process.platform === 'win32') {
    return {
      distribution: 'steam',
      // The selected Steam installation's hl.exe is a stable child process on
      // Windows. Launch it directly so duplicate match status events can be
      // ignored and reconnects can terminate the exact installation safely.
      // The Linux binary needs Steam's runtime setup and therefore retains the
      // launcher handoff below.
      executable,
      argumentPrefix: ['-game', 'cstrike', '-noforcemparms', '-noforcemaccel'],
      textureSize: '1024',
      usesLauncherHandoff: false
    }
  }

  return {
    distribution: 'steam',
    executable: 'steam',
    argumentPrefix: ['-applaunch', '10'],
    textureSize: '1024',
    usesLauncherHandoff: true
  }
}
