import { copyFile, mkdir, readFile, readlink, stat, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export const COMPETITIVE_GAME_DIR = '16competitive'

// GoldSrc searches `<basedir>/<gamedir>_addon` for extra content, but only when
// the game was started with `-addons`. Steam always launches Counter-Strike with
// its own `-game cstrike` flag, and GoldSrc only honours the first `-game`, so
// this bridge is what keeps every launcher-managed file inside `16competitive`
// instead of inside the player's `cstrike` folder.
const STEAM_COUNTER_STRIKE_GAME_DIR = 'cstrike'
const STEAM_ADDONS_DIR = `${STEAM_COUNTER_STRIKE_GAME_DIR}_addon`

const rewriteGameDllPath = (value: string): string => {
  const normalized = value.replaceAll('\\', '/')
  if (normalized.startsWith('../') || normalized.startsWith('/') || /^[a-z]:\//i.test(normalized)) {
    return normalized
  }
  return `../cstrike/${normalized.replace(/^\.\//, '')}`
}

const buildLiblist = (source: string): string => {
  const lines: string[] = []
  let hasGameDll = false
  let hasLinuxDll = false
  let hasOsxDll = false

  for (const rawLine of source.split(/\r?\n/)) {
    const trimmed = rawLine.trim()
    if (!trimmed) continue
    if (/^(?:\/\/|#)/.test(trimmed)) {
      lines.push(rawLine)
      continue
    }

    const pair = trimmed.match(/^(\S+)\s+"([^"]*)"\s*$/)
    if (!pair) {
      lines.push(rawLine)
      continue
    }

    const key = pair[1]!.toLowerCase()
    const value = pair[2]!

    if (key === 'game' || key === 'fallback_dir' || key === 'gamedir') continue

    if (key === 'gamedll') {
      hasGameDll = true
      lines.push(`gamedll "${rewriteGameDllPath(value)}"`)
      continue
    }
    if (key === 'gamedll_linux') {
      hasLinuxDll = true
      lines.push(`gamedll_linux "${rewriteGameDllPath(value)}"`)
      continue
    }
    if (key === 'gamedll_osx') {
      hasOsxDll = true
      lines.push(`gamedll_osx "${rewriteGameDllPath(value)}"`)
      continue
    }

    lines.push(rawLine)
  }

  if (!hasGameDll) lines.push('gamedll "../cstrike/dlls/mp.dll"')
  if (!hasLinuxDll) lines.push('gamedll_linux "../cstrike/dlls/cs.so"')
  if (!hasOsxDll) lines.push('gamedll_osx "../cstrike/dlls/cs.dylib"')

  return ['game "1.6 Competitive"', 'fallback_dir "cstrike"', ...lines, ''].join('\n')
}

const copyConfigIfMissing = async (source: string, destination: string): Promise<void> => {
  if ((await stat(destination).catch(() => null))?.isFile()) return
  if (!(await stat(source).catch(() => null))?.isFile()) return
  await copyFile(source, destination)
}

export const getCompetitiveGameDirectory = (gameDirectory: string): string =>
  join(gameDirectory, COMPETITIVE_GAME_DIR)

export const ensureCompetitiveGameDirectory = async (gameDirectory: string): Promise<string> => {
  const cstrikeDirectory = join(gameDirectory, 'cstrike')
  if (!(await stat(cstrikeDirectory).catch(() => null))?.isDirectory()) {
    throw new Error('The selected Half-Life installation does not contain cstrike.')
  }

  const directory = getCompetitiveGameDirectory(gameDirectory)
  await mkdir(directory, { recursive: true, mode: 0o700 })
  await Promise.all(
    ['models', 'sound', 'sprites', 'cfg'].map((name) =>
      mkdir(join(directory, name), { recursive: true, mode: 0o700 })
    )
  )

  const sourceLiblist = await readFile(join(cstrikeDirectory, 'liblist.gam'), 'utf8').catch(
    () => ''
  )
  const generated = buildLiblist(sourceLiblist)
  const liblistPath = join(directory, 'liblist.gam')
  const current = await readFile(liblistPath, 'utf8').catch(() => null)
  if (current !== generated) {
    await writeFile(liblistPath, generated, { encoding: 'utf8', mode: 0o600 })
  }

  await copyConfigIfMissing(join(cstrikeDirectory, 'config.cfg'), join(directory, 'config.cfg'))
  await copyConfigIfMissing(
    join(cstrikeDirectory, 'userconfig.cfg'),
    join(directory, 'userconfig.cfg')
  )

  return directory
}

/**
 * Points GoldSrc's addons search path (`<basedir>/cstrike_addon`) at the
 * competitive game directory. Steam launches Counter-Strike with its own
 * `-game cstrike`, so without this bridge the engine would never look inside
 * `16competitive` and the match configuration (password and join token) plus all
 * downloaded skins would be ignored.
 *
 * The bridge is a single symlink at the installation root. It never overwrites
 * player files, and any path the launcher does not own is left untouched.
 */
export const ensureSteamAddonsDirectory = async (gameDirectory: string): Promise<boolean> => {
  const addonsPath = join(gameDirectory, STEAM_ADDONS_DIR)
  const currentTarget = await readlink(addonsPath).catch(() => null)

  if (currentTarget === COMPETITIVE_GAME_DIR) return true

  if (currentTarget !== null) {
    console.warn('[GameDirectory] addons bridge points somewhere else; leaving it untouched', {
      addonsPath,
      currentTarget
    })
    return false
  }

  if ((await stat(addonsPath).catch(() => null)) !== null) {
    console.warn('[GameDirectory] addons bridge path already exists; leaving it untouched', {
      addonsPath
    })
    return false
  }

  try {
    await symlink(COMPETITIVE_GAME_DIR, addonsPath)
    console.info(
      '[GameDirectory] linked the GoldSrc addons directory to the competitive game directory',
      {
        addonsPath,
        target: COMPETITIVE_GAME_DIR
      }
    )
    return true
  } catch (error) {
    console.warn('[GameDirectory] could not create the GoldSrc addons bridge', {
      addonsPath,
      error
    })
    return false
  }
}
