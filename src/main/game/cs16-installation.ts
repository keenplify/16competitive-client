import { stat } from 'node:fs/promises'
import { basename, dirname, join, normalize } from 'node:path'
import { COMPETITIVE_GAME_DIR } from './competitive-game-directory'

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
        COMPETITIVE_GAME_DIR,
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
      executable,
      argumentPrefix: ['-game', COMPETITIVE_GAME_DIR, '-noforcemparms', '-noforcemaccel'],
      textureSize: '1024',
      usesLauncherHandoff: false
    }
  }

  // Steam launches Counter-Strike (app 10) with its own `-game cstrike` flag and
  // GoldSrc only honours the first `-game` argument, so `steam -applaunch 10
  // -game 16competitive` still runs the stock `cstrike` game directory.
  //
  // Launching the game binary directly instead is not an option for a Steam
  // install: the client needs Steam's runtime setup, and on hosts where Steam
  // itself runs inside an emulation VM (box64/FEX/muvm) the game must be started
  // by Steam or it crashes during graphics initialisation.
  //
  // So keep Steam's launch and expose `16competitive` through GoldSrc's addons
  // search path (`-addons` makes the engine search `<gamedir>_addon`, which
  // `ensureSteamAddonsDirectory` links to `16competitive`). The match
  // configuration, downloaded skins and sound overrides are then all found
  // without ever writing into the player's `cstrike` folder.
  return {
    distribution: 'steam',
    executable: 'steam',
    argumentPrefix: ['-applaunch', '10', '-addons', '-game', COMPETITIVE_GAME_DIR],
    textureSize: '1024',
    usesLauncherHandoff: true
  }
}
