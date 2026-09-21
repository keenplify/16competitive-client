import { stat } from 'node:fs/promises'
import { basename, dirname, join, normalize } from 'node:path'
import { COMPETITIVE_GAME_DIR } from './competitive-game-directory'

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
  /**
   * The engine is started in a way that forces the stock `cstrike` game
   * directory, so `16competitive` has to be exposed through GoldSrc's addons
   * search path instead of through `-game`.
   */
  requiresAddonsBridge: boolean
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

export const classifyCs16Distribution = (executable: string): Cs16Distribution =>
  findSteamLibraryRoot(executable) ? 'steam' : 'standalone'

const hasStandaloneSteamEmulator = async (executable: string): Promise<boolean> =>
  (await stat(join(dirname(executable), 'rev.ini')).catch(() => null))?.isFile() === true

const buildArgumentPrefix = (usesSteamEmulation: boolean): string[] => [
  // RevEmu installations load their local Steam emulator only when GoldSrc is
  // told to talk to Steam. This is the same flag the distribution's own
  // CS16Launcher.exe passes to hl.exe by default.
  ...(usesSteamEmulation ? ['-steam'] : []),
  '-game',
  COMPETITIVE_GAME_DIR,
  '-noforcemparms',
  '-noforcemaccel',
  // Older RevEmu/GoldSrc builds can start with no visible window on current
  // Windows display stacks when their saved fullscreen mode is invalid. A
  // conservative windowed mode lets the game initialize; players can change
  // video settings in-game afterwards.
  ...(usesSteamEmulation ? ['-window', '-w', '1280', '-h', '720'] : [])
]

export const resolveCs16LaunchTarget = async (executable: string): Promise<Cs16LaunchTarget> => {
  const steamLibraryRoot = findSteamLibraryRoot(executable)
  if (!steamLibraryRoot) {
    const usesSteamEmulation = await hasStandaloneSteamEmulator(executable)
    const isWrapper = STANDALONE_WRAPPER_EXECUTABLES.has(basename(executable).toLowerCase())
    const gameExecutable = isWrapper
      ? join(dirname(executable), GOLD_SRC_WINDOWS_EXECUTABLE)
      : executable

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
      usesSteamEmulation,
      requiresAddonsBridge: false
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
      argumentPrefix: ['-game', COMPETITIVE_GAME_DIR, '-noforcemparms', '-noforcemaccel'],
      textureSize: '1024',
      usesLauncherHandoff: false,
      usesSteamEmulation: false,
      requiresAddonsBridge: false
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
    gameExecutable: executable,
    argumentPrefix: ['-applaunch', '10', '-addons', '-game', COMPETITIVE_GAME_DIR],
    textureSize: '1024',
    usesLauncherHandoff: true,
    usesSteamEmulation: false,
    requiresAddonsBridge: true
  }
}
