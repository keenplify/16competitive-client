import { stat } from 'node:fs/promises'
import { basename, dirname, join, normalize } from 'node:path'

export type Cs16Distribution = 'steam' | 'standalone'

export interface Cs16LaunchTarget {
  distribution: Cs16Distribution
  executable: string
  argumentPrefix: string[]
  textureSize: '512' | '1024'
  usesLauncherHandoff: boolean
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

const firstExistingFile = async (candidates: string[]): Promise<string | null> => {
  for (const candidate of candidates) {
    const metadata = await stat(candidate).catch(() => null)
    if (metadata?.isFile()) return candidate
  }
  return null
}

export const classifyCs16Distribution = (executable: string): Cs16Distribution =>
  findSteamLibraryRoot(executable) ? 'steam' : 'standalone'

export const resolveCs16LaunchTarget = async (executable: string): Promise<Cs16LaunchTarget> => {
  const steamLibraryRoot = findSteamLibraryRoot(executable)
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
      executable,
      argumentPrefix: ['-game', 'cstrike', '-noforcemparms', '-noforcemaccel'],
      textureSize: '1024',
      usesLauncherHandoff: false
    }
  }

  if (process.platform === 'darwin') {
    const gameDirectory = dirname(executable)
    const macLauncher = await firstExistingFile([join(gameDirectory, 'hl.sh')])
    return {
      distribution: 'steam',
      // Steam's GoldSrc macOS launch configuration uses hl.sh. Prefer that
      // wrapper even if the player manually selected hl_osx because it sets up
      // the game runtime and working directory expected by the native binary.
      executable: macLauncher ?? executable,
      argumentPrefix: ['-steam', '-game', 'cstrike', '-noforcemparms', '-noforcemaccel'],
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
