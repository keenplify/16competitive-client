import { stat } from 'node:fs/promises'
import { basename, dirname, join, normalize } from 'node:path'

/**
 * The game directory Counter-Strike 1.6 always runs as.
 *
 * A separate overlay game directory cannot work for this launcher, for two
 * independent reasons:
 *
 *  - The match servers run `cstrike`, and GoldSrc drops any client whose `-game`
 *    differs - "Server is running game cstrike. Restart in that game to connect."
 *  - The Steam-backed `FileSystem_Steam.dll`, which `-steam` selects and which
 *    every Steam installation uses, only searches the application's own game
 *    directory. Starting the engine on another one makes it spin forever in
 *    `NtQueryInformationFile`, and GoldSrc's addons search path
 *    (`<basedir>/cstrike_addon`) is ignored outright.
 *
 * Both were verified against CS WaRzOnE, so every installation launches with
 * `-game cstrike` and all launcher-managed content - the match configuration,
 * downloaded skins and voice bindings - is written into `cstrike` itself.
 *
 * Asset paths stay namespaced (`models/16competitive/...`) and the match
 * configuration has a unique name, so nothing Valve ships is overwritten.
 */
export const STOCK_GAME_DIR = 'cstrike'

/**
 * Walks up from an executable looking for the `steamapps` directory that
 * identifies a Steam-managed installation.
 */
export const findSteamLibraryRoot = (executable: string): string | null => {
  let current = dirname(normalize(executable))

  for (let depth = 0; depth < 8; depth++) {
    if (basename(current).toLowerCase() === 'steamapps') return dirname(current)
    const parent = dirname(current)
    if (parent === current) break
    current = parent
  }

  return null
}

/**
 * A RevEmu-style Steam emulator drops `rev.ini` next to the game executable and
 * expects GoldSrc to be started with `-steam`.
 */
export const hasStandaloneSteamEmulator = async (gameDirectory: string): Promise<boolean> =>
  (await stat(join(gameDirectory, 'rev.ini')).catch(() => null))?.isFile() === true

/**
 * The directory the launcher writes its content to. The engine only ever
 * searches this directory, so it is the single source of truth for the match
 * configuration, downloaded assets and the voice bindings.
 */
export const getLauncherContentDirectory = (gameDirectory: string): string =>
  join(gameDirectory, STOCK_GAME_DIR)

/**
 * Resolves the launcher content directory and checks the installation really has
 * one. Nothing inside it is generated or copied wholesale - the game's own
 * `liblist.gam` and `config.cfg` are left exactly as they are, and the launcher
 * only ever writes its own namespaced files.
 */
export const ensureLauncherContentDirectory = async (gameDirectory: string): Promise<string> => {
  const directory = getLauncherContentDirectory(gameDirectory)
  if (!(await stat(directory).catch(() => null))?.isDirectory()) {
    throw new Error('The selected Counter-Strike installation does not contain a cstrike folder.')
  }
  return directory
}
