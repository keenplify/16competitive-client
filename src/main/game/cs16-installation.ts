import { stat } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { STOCK_GAME_DIR, findSteamLibraryRoot, hasStandaloneSteamEmulator } from './game-directory'

export type Cs16Distribution = 'steam' | 'standalone'

export interface Cs16LaunchTarget {
  distribution: Cs16Distribution
  /** The process this launcher spawns. */
  executable: string
  /**
   * The GoldSrc binary the player actually ends up inside.
   *
   * This equals `executable` for a direct launch. Some non-Steam distributions
   * ship a *wrapper* instead (see `STANDALONE_WRAPPER_EXECUTABLES`): the wrapper
   * spawns `hl.exe` from its own directory and then exits, so the game watchdog
   * and the anti-cheat process tracking must follow this path rather than the
   * wrapper, which is already gone.
   */
  gameExecutable: string
  argumentPrefix: string[]
  textureSize: '512' | '1024'
  /** The spawned process exits on its own; the game keeps running separately. */
  usesLauncherHandoff: boolean
  /** The installation ships a rev.ini RevEmu layer and needs GoldSrc's `-steam`. */
  usesSteamEmulation: boolean
}

const GOLD_SRC_WINDOWS_EXECUTABLE = 'hl.exe'

/**
 * Launcher wrappers shipped by non-Steam repacks.
 *
 * `CS WaRzOnE`'s `CS16Launcher.exe` (PE timestamp 2017-10-12) was reverse
 * engineered rather than assumed. It checks a single-instance mutex, prepares an
 * application-data folder, may self-update over the network, and then calls:
 *
 *   CreateProcessW(L"hl.exe", lpCommandLine, ..., lpCurrentDirectory = <its own cwd>)
 *
 * `lpCommandLine` is its *own* raw command line whenever it was started with
 * arguments (`CommandLineToArgvW` result count > 1), and only falls back to the
 * hard-coded `" -steam -game cstrike -noforcemparms -noforcemaccel"` when it is
 * started with none. Arguments therefore reach `hl.exe` intact, including the
 * match `-game`, `+exec` and `+connect` switches.
 *
 * Wrappers are still treated as a handoff rather than as the game, because the
 * wrapper process exits as soon as `hl.exe` is running.
 */
const STANDALONE_WRAPPER_EXECUTABLES = new Set(['cs16launcher.exe'])

export const classifyCs16Distribution = (executable: string): Cs16Distribution =>
  findSteamLibraryRoot(executable) ? 'steam' : 'standalone'

/**
 * Every installation is started on the stock `cstrike` game directory. The match
 * servers run `cstrike` and GoldSrc refuses a mismatched client, and the Steam
 * filesystem only searches that directory - see `game-directory.ts`.
 */
const buildArgumentPrefix = (usesSteamEmulation: boolean): string[] => [
  // RevEmu installations load their local Steam emulator only when GoldSrc is
  // told to talk to Steam. This is the same flag the distribution's own
  // CS16Launcher.exe passes to hl.exe by default.
  ...(usesSteamEmulation ? ['-steam'] : []),
  '-game',
  STOCK_GAME_DIR,
  '-noforcemparms',
  '-noforcemaccel'
]

export const resolveCs16LaunchTarget = async (executable: string): Promise<Cs16LaunchTarget> => {
  const steamLibraryRoot = findSteamLibraryRoot(executable)
  if (!steamLibraryRoot) {
    const installRoot = dirname(executable)
    const usesSteamEmulation = await hasStandaloneSteamEmulator(installRoot)
    const isWrapper = STANDALONE_WRAPPER_EXECUTABLES.has(basename(executable).toLowerCase())
    const gameExecutable = isWrapper ? join(installRoot, GOLD_SRC_WINDOWS_EXECUTABLE) : executable

    if (isWrapper && !(await stat(gameExecutable).catch(() => null))?.isFile()) {
      throw new Error(
        `${basename(executable)} is a launcher wrapper, but ${GOLD_SRC_WINDOWS_EXECUTABLE} was not found next to it. Choose ${GOLD_SRC_WINDOWS_EXECUTABLE} or the installation folder instead.`
      )
    }

    return {
      distribution: 'standalone',
      // Wrappers receive the match command line and forward it to hl.exe, but
      // they exit immediately, so the game process has to be discovered
      // separately (see `gameExecutable`).
      executable,
      gameExecutable,
      argumentPrefix: buildArgumentPrefix(usesSteamEmulation),
      // Older standalone GoldSrc clients can terminate during initialization
      // when forced above their supported 512px texture limit.
      textureSize: '512',
      usesLauncherHandoff: isWrapper,
      usesSteamEmulation
    }
  }

  if (process.platform === 'win32') {
    return {
      distribution: 'steam',
      // The selected Steam installation's hl.exe is a stable child process on
      // Windows. Launch it directly so duplicate match status events can be
      // ignored and reconnects can terminate the exact installation safely.
      executable,
      gameExecutable: executable,
      argumentPrefix: ['-game', STOCK_GAME_DIR, '-noforcemparms', '-noforcemaccel'],
      textureSize: '1024',
      usesLauncherHandoff: false,
      usesSteamEmulation: false
    }
  }

  // Steam launches Counter-Strike (app 10) with its own `-game cstrike`, and
  // GoldSrc only honours the first `-game`, so the game directory is `cstrike`
  // either way; it is passed explicitly to state the requirement.
  //
  // Launching the game binary directly instead is not an option for a Steam
  // install: the client needs Steam's runtime setup, and on hosts where Steam
  // itself runs inside an emulation VM (box64/FEX/muvm) the game must be started
  // by Steam or it crashes during graphics initialisation.
  return {
    distribution: 'steam',
    executable: 'steam',
    gameExecutable: executable,
    argumentPrefix: ['-applaunch', '10', '-game', STOCK_GAME_DIR],
    textureSize: '1024',
    usesLauncherHandoff: true,
    usesSteamEmulation: false
  }
}
