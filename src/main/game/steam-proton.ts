import { readFile, readdir, realpath, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, dirname, isAbsolute, join, normalize } from 'node:path'

export interface SteamProtonRuntime {
  protonPath: string
  steamRoot: string
  compatibilityDataPath: string
}

type Vdf = { [key: string]: string | Vdf }
/** Bounded Valve KeyValues parser; reads only installation/runtime metadata. */
export function parseSteamVdf(source: string): Vdf {
  if (source.length > 2 * 1024 * 1024) throw new Error('Steam metadata exceeds its size limit')
  const tokens = (source.match(/\/\/[^\r\n]*|"(?:\\.|[^"\\])*"|[{}]|[^\s{}"]+/g) ?? []).filter(
    (token) => !token.startsWith('//')
  )
  if (tokens.length > 100_000) throw new Error('Steam metadata exceeds its token limit')
  let index = 0
  const text = (token: string): string =>
    token.startsWith('"') ? token.slice(1, -1).replace(/\\([\\"])/g, '$1') : token
  const block = (depth: number): Vdf => {
    if (depth > 32) throw new Error('Steam metadata nesting exceeds its limit')
    const result: Vdf = Object.create(null)
    while (index < tokens.length) {
      const key = tokens[index++]!
      if (key === '}') {
        if (!depth) throw new Error('Invalid Steam metadata')
        return result
      }
      const value = tokens[index++]
      if (key === '{' || !value || value === '}') throw new Error('Invalid Steam metadata')
      result[text(key).toLowerCase()] = value === '{' ? block(depth + 1) : text(value)
    }
    if (depth) throw new Error('Truncated Steam metadata')
    return result
  }
  return block(0)
}
const section = (value: string | Vdf | undefined): Vdf =>
  typeof value === 'object' && value !== null ? value : Object.create(null)
const metadata = async (path: string): Promise<Vdf> => {
  const info = await stat(path).catch(() => null)
  if (!info?.isFile() || info.size > 2 * 1024 * 1024) return Object.create(null)
  return parseSteamVdf(await readFile(path, 'utf8'))
}

export function validateSteamProtonRuntime(value: unknown): value is SteamProtonRuntime {
  if (!value || typeof value !== 'object') return false
  const runtime = value as Record<string, unknown>
  const validPath = (path: unknown): path is string =>
    typeof path === 'string' &&
    isAbsolute(path) &&
    path.length <= 4096 &&
    !/[\0\r\n]/.test(path) &&
    normalize(path) === path
  return (
    validPath(runtime.protonPath) &&
    basename(runtime.protonPath) === 'proton' &&
    validPath(runtime.steamRoot) &&
    validPath(runtime.compatibilityDataPath) &&
    runtime.compatibilityDataPath.endsWith('/steamapps/compatdata/10')
  )
}

/** Resolve only Steam's selected tool; never probe arbitrary Wine/Proton versions. */
export async function resolveSteamProtonRuntime(
  gameRoot: string,
  home = homedir()
): Promise<SteamProtonRuntime | null> {
  let library = gameRoot
  for (let depth = 0; depth < 8 && basename(library) !== 'steamapps'; depth++)
    library = dirname(library)
  if (basename(library) !== 'steamapps') return null
  library = dirname(library)
  const roots = [
    ...new Set(
      await Promise.all(
        [join(home, '.steam/steam'), join(home, '.local/share/Steam'), library].map((path) =>
          realpath(path).catch(() => path)
        )
      )
    )
  ]
  for (const steamRoot of roots) {
    const config = await metadata(join(steamRoot, 'config/config.vdf'))
    const steam = section(section(section(section(config.installconfigstore).software).valve).steam)
    const mapping = section(steam.compattoolmapping)
    const explicit = section(mapping['10']).name
    const selected = typeof explicit === 'string' ? explicit : undefined
    // A global default does not force a Linux-capable app through Proton.
    if (!selected || /^steamlinuxruntime/i.test(selected)) continue
    const libraries = [library, steamRoot]
    const libraryMetadata = section(
      (await metadata(join(steamRoot, 'steamapps/libraryfolders.vdf'))).libraryfolders
    )
    for (const entry of Object.values(libraryMetadata)) {
      const path = typeof entry === 'string' ? entry : entry.path
      if (typeof path === 'string' && isAbsolute(path) && !/[\0\r\n]/.test(path))
        libraries.push(path)
    }
    const candidates: string[] = []
    for (const root of [...new Set(libraries)]) {
      const common = join(root, 'steamapps/common')
      for (const entry of (await readdir(common, { withFileTypes: true }).catch(() => [])).slice(
        0,
        256
      )) {
        if (entry.isDirectory() && /^Proton(?: |-|$)/i.test(entry.name)) {
          const version = await readFile(join(common, entry.name, 'version'), 'utf8').catch(
            () => ''
          )
          const official = /^proton_(\d+)$/.exec(selected)
          const matches = official
            ? new RegExp(`\\bproton-${official[1]}[.]`).test(version)
            : selected === 'proton_experimental'
              ? /experimental/i.test(entry.name)
              : selected === 'proton_hotfix' && /hotfix/i.test(entry.name)
          if (matches) candidates.push(join(common, entry.name, 'proton'))
        }
      }
    }
    for (const tools of [
      join(steamRoot, 'compatibilitytools.d'),
      join(home, '.steam/root/compatibilitytools.d')
    ]) {
      for (const entry of (await readdir(tools, { withFileTypes: true }).catch(() => [])).slice(
        0,
        128
      )) {
        if (!entry.isDirectory()) continue
        const folder = join(tools, entry.name)
        const toolMetadata = section(
          section((await metadata(join(folder, 'compatibilitytool.vdf'))).compatibilitytools)
            .compat_tools
        )
        const tool = section(toolMetadata[selected.toLowerCase()])
        if (Object.keys(tool).length) {
          const install = typeof tool.install_path === 'string' ? tool.install_path : '.'
          const toolRoot = join(folder, install)
          if (toolRoot === folder || toolRoot.startsWith(folder + '/'))
            candidates.push(join(toolRoot, 'proton'))
        }
      }
    }
    for (const protonPath of [...new Set(candidates)]) {
      const info = await stat(protonPath).catch(() => null)
      if (!info?.isFile() || !(info.mode & 0o111)) continue
      const runtime = {
        protonPath,
        steamRoot,
        compatibilityDataPath: join(library, 'steamapps/compatdata/10')
      }
      if (validateSteamProtonRuntime(runtime)) return runtime
    }
    throw new Error('match.proton.runtimeUnavailable')
  }
  return null
}

export function protonRecoveryCommand(
  runtime: SteamProtonRuntime,
  helperPath: string,
  args: string[],
  environment: NodeJS.ProcessEnv = process.env
): { executable: string; args: string[]; env: NodeJS.ProcessEnv } {
  if (!validateSteamProtonRuntime(runtime)) throw new Error('Invalid Steam Proton runtime')
  return {
    executable: runtime.protonPath,
    args: ['runinprefix', helperPath, ...args],
    env: {
      ...environment,
      STEAM_COMPAT_DATA_PATH: runtime.compatibilityDataPath,
      STEAM_COMPAT_CLIENT_INSTALL_PATH: runtime.steamRoot,
      // The maintenance handshake must stay on stdout, not Proton's game log.
      PROTON_LOG: '0',
      SteamAppId: '10',
      SteamGameId: '10'
    }
  }
}
