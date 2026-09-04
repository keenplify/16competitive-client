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

const findWindowsSteamExecutable = async (libraryRoot: string): Promise<string | null> =>
  firstExistingFile(
    [
      join(libraryRoot, 'steam.exe'),
      process.env['PROGRAMFILES(X86)']
        ? join(process.env['PROGRAMFILES(X86)'], 'Steam', 'steam.exe')
        : '',
      process.env.PROGRAMFILES ? join(process.env.PROGRAMFILES, 'Steam', 'steam.exe') : '',
      process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, 'Steam', 'steam.exe') : ''
    ].filter(Boolean)
  )

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
      argumentPrefix: standaloneLauncher ? ['-steam'] : [],
      // Older standalone GoldSrc clients can terminate during initialization
      // when forced above their supported 512px texture limit.
      textureSize: '512',
      usesLauncherHandoff: standaloneLauncher !== null
    }
  }

  if (process.platform === 'win32') {
    const steamExecutable = await findWindowsSteamExecutable(steamLibraryRoot)
    if (!steamExecutable) {
      throw new Error('Steam Counter-Strike was detected, but Steam could not be found.')
    }
    return {
      distribution: 'steam',
      executable: steamExecutable,
      argumentPrefix: ['-applaunch', '10'],
      textureSize: '1024',
      usesLauncherHandoff: true
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
