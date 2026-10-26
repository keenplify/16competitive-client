import { open, realpath, stat } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, normalize, relative } from 'node:path'
import type { LegacyGameError, LegacyInstallation } from '../../../shared/legacy-game'
import type { GameAdapter, GameLaunchPlan } from './game-adapter'
import { gameResolutionArgs } from '../../../shared/game-display'
import launchPattern from '../../../shared/web-game-launch-pattern.json' with { type: 'json' }

export class LegacyInstallationError extends Error {
  constructor(public readonly code: LegacyGameError) {
    super(code)
  }
}

const invalid = (): never => {
  throw new LegacyInstallationError('invalidInstallation')
}

export const cs13ConnectionArgs = (input: {
  host: string
  port: number
  password: string
  joinToken: string
}): string[] => {
  if (
    !/^[a-zA-Z0-9][a-zA-Z0-9.-]{0,252}$/.test(input.host) ||
    !Number.isInteger(input.port) ||
    input.port < 1 ||
    input.port > 65535 ||
    !/^[a-f0-9]{24}$/.test(input.password) ||
    !/^[a-zA-Z0-9_-]{32}$/.test(input.joinToken)
  )
    throw new Error('Invalid 1.3 connection')
  return [launchPattern.cs13.passwordArgument, input.password, launchPattern.cs13.connectArgument, `${input.host}:${input.port}`]
}

const containedFile = async (root: string, path: string): Promise<string> => {
  const resolved = await realpath(path)
  const child = relative(root, resolved)
  if (isAbsolute(child) || child === '..' || child.startsWith('../') || child.startsWith('..\\'))
    return invalid()
  if (!(await stat(resolved)).isFile()) return invalid()
  return resolved
}

/** liblist.gam is the only metadata read; never inspect player configuration. */
export const hasCs13VersionMetadata = (source: string): boolean => {
  const versions = [
    ...source.replace(/\/\/[^\r\n]*/g, '').matchAll(/^\s*version\s+"([^"]+)"\s*$/gim)
  ]
  return versions.length === 1 && versions[0][1] === '1.3'
}

export const cs13Adapter: GameAdapter<LegacyInstallation> = {
  id: 'cs13',
  async validateInstallation(folder, platform) {
    if (platform !== 'win32' && platform !== 'linux')
      throw new LegacyInstallationError('unsupportedPlatform')
    if (typeof folder !== 'string' || folder.includes('\0') || !isAbsolute(folder)) return invalid()
    let stage = 'folder'
    try {
      const selected = normalize(folder)
      const selectedName = basename(selected).toLowerCase()
      const selectedMod =
        selectedName === 'cstrike' || selectedName === 'cstrk13' ? selectedName : null
      const root = await realpath(selectedMod ? dirname(selected) : selected)
      if (!(await stat(root)).isDirectory()) return invalid()
      const modDirectory =
        selectedMod ??
        ((await stat(join(root, 'cstrk13', 'liblist.gam')).catch(() => null))?.isFile()
          ? 'cstrk13'
          : 'cstrike')
      const gameDirectory = join(root, modDirectory)
      stage = 'liblist.gam'
      const metadata = await containedFile(root, join(gameDirectory, 'liblist.gam'))
      const file = await open(metadata, 'r')
      let source: string
      try {
        if ((await file.stat()).size > 16_384) return invalid()
        const bytes = Buffer.alloc(16_385)
        const { bytesRead } = await file.read(bytes, 0, bytes.length, 0)
        if (bytesRead > 16_384) return invalid()
        source = bytes.subarray(0, bytesRead).toString('utf8')
      } finally {
        await file.close()
      }
      stage = 'version metadata (expected 1.3)'
      if (!hasCs13VersionMetadata(source)) return invalid()
      const nativeLinux =
        platform === 'linux' && (await stat(join(root, 'hl_linux')).catch(() => null))?.isFile()
      const runtime = platform === 'linux' && !nativeLinux ? 'wine' : 'native'
      const name = nativeLinux ? 'hl_linux' : 'hl.exe'
      stage = name
      const executablePath = await containedFile(root, join(root, name))
      if (nativeLinux && ((await stat(executablePath)).mode & 0o111) === 0) return invalid()
      stage = nativeLinux ? 'cl_dlls/client.so' : 'cl_dlls/client.dll'
      await containedFile(
        root,
        join(gameDirectory, 'cl_dlls', nativeLinux ? 'client.so' : 'client.dll')
      )
      return {
        game: 'cs13',
        folderPath: root,
        executablePath,
        gameDirectory,
        modDirectory,
        versionEvidence: 'liblist.gam',
        runtime
      }
    } catch (error) {
      console.warn('[LegacyGame] Installation validation failed', {
        stage,
        code:
          error instanceof LegacyInstallationError
            ? error.code
            : ((error as NodeJS.ErrnoException).code ?? 'unknown')
      })
      if (error instanceof LegacyInstallationError) throw error
      return invalid()
    }
  },
  buildMenuLaunchPlan(installation, options): GameLaunchPlan {
    const resolution = options?.resolution ?? { width: 1280, height: 960 }
    const display = installation.runtime === 'wine' ? options?.wineDisplay : undefined
    if (display) {
      if (
        !isAbsolute(display.gamescopeExecutable) ||
        ![display.width, display.height].every(
          (value) => Number.isInteger(value) && value >= 320 && value <= 16384
        )
      )
        throw new Error('Invalid Wine display options')
      // Keep Wine's desktop and Gamescope's input dimensions aligned with the
      // selected game mode. The older menu itself still draws at 640x480.
      return {
        executable: display.gamescopeExecutable,
        args: [
          '-w',
          String(resolution.width),
          '-h',
          String(resolution.height),
          '-W',
          String(display.width),
          '-H',
          String(display.height),
          '-f',
          '--',
          'wine',
          'explorer',
          options?.resolution
            ? `/desktop=16competitive-cs13,${resolution.width}x${resolution.height}`
            : '/desktop=16competitive-cs13,640x480',
          installation.executablePath,
          ...launchPattern.cs13.windowsFlags,
          '-full',
          ...(options?.resolution
            ? gameResolutionArgs(resolution, 'cs13')
            : ['-w', '1280', '-h', '960']),
          '-game',
          installation.modDirectory
        ],
        cwd: installation.folderPath
      }
    }
    // Direct, minimal GoldSrc mod launch. No Steam app 10, 1.6 flags,
    // credentials, configs, assets or native enhancements are inherited.
    return {
      executable: installation.runtime === 'wine' ? 'wine' : installation.executablePath,
      args: [
        ...(installation.runtime === 'wine' ? [installation.executablePath] : []),
        ...(installation.executablePath.toLowerCase().endsWith('.exe') ? launchPattern.cs13.windowsFlags : []),
        ...(options?.resolution ? gameResolutionArgs(options.resolution, 'cs13') : []),
        '-game',
        installation.modDirectory
      ],
      cwd: installation.folderPath
    }
  }
}
