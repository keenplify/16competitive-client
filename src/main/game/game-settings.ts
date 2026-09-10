import { app, dialog } from 'electron'
import { chmod, mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, normalize, resolve } from 'node:path'
import type { GameSettings } from '../../shared/game-settings'
import { readVoicePttKeys } from './voice-ptt'

interface StoredGameSettings {
  cs16ExecutablePath: string
}

const configPath = (): string => join(app.getPath('userData'), 'game-settings.json')

const detectCs16Executable = async (): Promise<string | null> => {
  const home = process.env.HOME ?? ''
  const candidates =
    process.platform === 'win32'
      ? [
          join(
            process.env.LOCALAPPDATA ?? '',
            'Steam',
            'steamapps',
            'common',
            'Half-Life',
            'hl.exe'
          ),
          join(
            process.env.PROGRAMFILES ?? '',
            'Steam',
            'steamapps',
            'common',
            'Half-Life',
            'hl.exe'
          ),
          join(
            process.env.PROGRAMFILES ?? '',
            'Steam',
            'steamapps',
            'common',
            'Half-Life',
            'hl.exe'
          ),
          join(
            process.env['PROGRAMFILES(X86)'] ?? '',
            'Steam',
            'steamapps',
            'common',
            'Half-Life',
            'hl.exe'
          )
        ]
      : [
          join(home, '.steam', 'steam', 'steamapps', 'common', 'Half-Life', 'hl_linux'),
          join(home, '.local', 'share', 'Steam', 'steamapps', 'common', 'Half-Life', 'hl_linux'),
          join(home, '.steam', 'steam', 'steamapps', 'common', 'Half-Life', 'hl.sh')
        ]
  for (const candidate of candidates) {
    if (!isAbsolute(candidate)) continue
    const metadata = await stat(candidate).catch(() => null)
    if (metadata?.isFile()) return validateExecutable(candidate, true)
  }
  return null
}

const validateExecutable = async (
  untrustedPath: unknown,
  ensureExecutable = false
): Promise<string> => {
  if (typeof untrustedPath !== 'string' || !isAbsolute(untrustedPath)) {
    throw new Error('Choose an absolute Counter-Strike executable path.')
  }
  const executablePath = normalize(untrustedPath)
  const metadata = await stat(executablePath).catch(() => null)
  if (!metadata?.isFile()) throw new Error('The selected Counter-Strike executable was not found.')
  if (ensureExecutable && process.platform !== 'win32' && (metadata.mode & 0o111) === 0) {
    await chmod(executablePath, metadata.mode | 0o111)
  }
  return executablePath
}

const readStoredPath = async (): Promise<string | null> => {
  try {
    const parsed = JSON.parse(await readFile(configPath(), 'utf8')) as unknown
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      typeof (parsed as Partial<StoredGameSettings>).cs16ExecutablePath !== 'string'
    ) {
      return null
    }
    return await validateExecutable((parsed as StoredGameSettings).cs16ExecutablePath)
  } catch {
    return null
  }
}

const gameDirectoryForExecutable = (executablePath: string): string => {
  const configuredDirectory = process.env.CS16_CLIENT_GAME_DIRECTORY
  return configuredDirectory ? resolve(configuredDirectory) : dirname(executablePath)
}

const settingsForExecutable = async (cs16ExecutablePath: string): Promise<GameSettings> => ({
  cs16ExecutablePath,
  configFilePath: configPath(),
  voicePttKeys: await readVoicePttKeys(gameDirectoryForExecutable(cs16ExecutablePath))
})

export const getGameSettings = async (): Promise<GameSettings> => {
  const stored = await readStoredPath()
  if (stored) return settingsForExecutable(stored)
  const detected = await detectCs16Executable()
  if (detected) {
    await saveGameSettings(detected)
    return settingsForExecutable(detected)
  }
  return { cs16ExecutablePath: null, configFilePath: configPath(), voicePttKeys: [] }
}

export const chooseCs16Executable = async (): Promise<string | null> => {
  const result = await dialog.showOpenDialog({
    title: 'Choose Counter-Strike 1.6 executable',
    properties: ['openFile'],
    filters:
      process.platform === 'win32'
        ? [{ name: 'Counter-Strike executable', extensions: ['exe'] }]
        : [{ name: 'Counter-Strike executable', extensions: ['*'] }]
  })
  if (result.canceled || !result.filePaths[0]) return null
  return validateExecutable(result.filePaths[0], true)
}

export const saveGameSettings = async (untrustedPath: unknown): Promise<GameSettings> => {
  const cs16ExecutablePath = await validateExecutable(untrustedPath, true)
  const destination = configPath()
  const temporary = `${destination}.tmp`
  await mkdir(dirname(destination), { recursive: true })
  await writeFile(temporary, `${JSON.stringify({ cs16ExecutablePath }, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600
  })
  await rename(temporary, destination)
  if (process.platform !== 'win32') await chmod(destination, 0o600)
  return settingsForExecutable(cs16ExecutablePath)
}

export const getSavedCs16Executable = readStoredPath
