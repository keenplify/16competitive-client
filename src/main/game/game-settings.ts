import { app, dialog } from 'electron'
import { chmod, mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, normalize, resolve } from 'node:path'
import type { GameSettings } from '../../shared/game-settings'
import { normalizeVoicePttKey, readVoicePttKey, writeVoicePttKey } from './voice-ptt'

interface StoredGameSettings {
  cs16ExecutablePath?: string
  voicePttKey?: string
}

const DEFAULT_VOICE_PTT_KEY = 'K'
const configPath = (): string => join(app.getPath('userData'), 'game-settings.json')
let settingsWriteQueue: Promise<void> = Promise.resolve()

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

const readStoredSettings = async (): Promise<StoredGameSettings> => {
  try {
    const parsed = JSON.parse(await readFile(configPath(), 'utf8')) as unknown
    if (typeof parsed !== 'object' || parsed === null) return {}
    const settings = parsed as Partial<StoredGameSettings>
    return {
      ...(typeof settings.cs16ExecutablePath === 'string'
        ? { cs16ExecutablePath: settings.cs16ExecutablePath }
        : {}),
      ...(typeof settings.voicePttKey === 'string' ? { voicePttKey: settings.voicePttKey } : {})
    }
  } catch {
    return {}
  }
}

const writeStoredSettings = (settings: StoredGameSettings): Promise<void> => {
  const write = async (): Promise<void> => {
    const destination = configPath()
    const temporary = `${destination}.${process.pid}.tmp`
    await mkdir(dirname(destination), { recursive: true })
    await writeFile(temporary, `${JSON.stringify(settings, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600
    })
    await rename(temporary, destination)
    if (process.platform !== 'win32') await chmod(destination, 0o600)
  }
  const pending = settingsWriteQueue.then(write, write)
  settingsWriteQueue = pending.catch(() => undefined)
  return pending
}

const validateStoredPath = async (settings: StoredGameSettings): Promise<string | null> => {
  if (!settings.cs16ExecutablePath) return null
  try {
    return await validateExecutable(settings.cs16ExecutablePath)
  } catch {
    return null
  }
}

const gameDirectoryForExecutable = (executablePath: string): string => {
  const configuredDirectory = process.env.CS16_CLIENT_GAME_DIRECTORY
  return configuredDirectory ? resolve(configuredDirectory) : dirname(executablePath)
}

const resolveVoicePttKey = async (
  storedSettings: StoredGameSettings,
  executablePath: string | null
): Promise<string> => {
  if (storedSettings.voicePttKey) {
    try {
      return normalizeVoicePttKey(storedSettings.voicePttKey)
    } catch {
      // Fall through to the player's current GoldSrc bind or the launcher default.
    }
  }

  if (executablePath) {
    const currentGoldSrcKey = await readVoicePttKey(gameDirectoryForExecutable(executablePath))
    if (currentGoldSrcKey) return currentGoldSrcKey
  }

  return DEFAULT_VOICE_PTT_KEY
}

const buildSettings = (cs16ExecutablePath: string | null, voicePttKey: string): GameSettings => ({
  cs16ExecutablePath,
  configFilePath: configPath(),
  voicePttKey,
  // Keep the array during the voice feature rollout so existing lobby PTT code
  // consumes the same single launcher-owned key.
  voicePttKeys: [voicePttKey]
})

const persistResolvedSettings = async (
  cs16ExecutablePath: string | null,
  voicePttKey: string
): Promise<void> => {
  await writeStoredSettings({
    ...(cs16ExecutablePath ? { cs16ExecutablePath } : {}),
    voicePttKey
  })
}

const synchronizeConfiguredVoiceKey = async (
  cs16ExecutablePath: string,
  voicePttKey: string
): Promise<void> => {
  await writeVoicePttKey(gameDirectoryForExecutable(cs16ExecutablePath), voicePttKey)
}

export const getGameSettings = async (): Promise<GameSettings> => {
  const storedSettings = await readStoredSettings()
  let cs16ExecutablePath = await validateStoredPath(storedSettings)
  if (!cs16ExecutablePath) cs16ExecutablePath = await detectCs16Executable()

  const voicePttKey = await resolveVoicePttKey(storedSettings, cs16ExecutablePath)
  await persistResolvedSettings(cs16ExecutablePath, voicePttKey)

  if (cs16ExecutablePath) {
    await synchronizeConfiguredVoiceKey(cs16ExecutablePath, voicePttKey).catch((syncError: unknown) => {
      console.warn(
        '[GameSettings] could not synchronize Counter-Strike push-to-talk key',
        syncError instanceof Error ? syncError.message : String(syncError)
      )
    })
  }

  return buildSettings(cs16ExecutablePath, voicePttKey)
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
  const storedSettings = await readStoredSettings()
  const voicePttKey = await resolveVoicePttKey(storedSettings, cs16ExecutablePath)
  await persistResolvedSettings(cs16ExecutablePath, voicePttKey)
  await synchronizeConfiguredVoiceKey(cs16ExecutablePath, voicePttKey)
  return buildSettings(cs16ExecutablePath, voicePttKey)
}

export const saveVoicePttKey = async (untrustedKey: unknown): Promise<GameSettings> => {
  const voicePttKey = normalizeVoicePttKey(untrustedKey)
  const storedSettings = await readStoredSettings()
  const cs16ExecutablePath = await validateStoredPath(storedSettings)
  await persistResolvedSettings(cs16ExecutablePath, voicePttKey)
  if (cs16ExecutablePath) await synchronizeConfiguredVoiceKey(cs16ExecutablePath, voicePttKey)
  return buildSettings(cs16ExecutablePath, voicePttKey)
}

export const getSavedCs16Executable = async (): Promise<string | null> => {
  const storedSettings = await readStoredSettings()
  const cs16ExecutablePath = await validateStoredPath(storedSettings)
  if (!cs16ExecutablePath) return null

  const voicePttKey = await resolveVoicePttKey(storedSettings, cs16ExecutablePath)
  if (storedSettings.voicePttKey !== voicePttKey) {
    await persistResolvedSettings(cs16ExecutablePath, voicePttKey)
  }
  await synchronizeConfiguredVoiceKey(cs16ExecutablePath, voicePttKey).catch((syncError: unknown) => {
    console.warn(
      '[GameSettings] could not synchronize Counter-Strike push-to-talk key before launch',
      syncError instanceof Error ? syncError.message : String(syncError)
    )
  })
  return cs16ExecutablePath
}
