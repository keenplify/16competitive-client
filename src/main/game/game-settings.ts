import { app, dialog } from 'electron'
import { chmod, mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, normalize, resolve } from 'node:path'
import type { GameSettings } from '../../shared/game-settings'
import { normalizeVoicePttKey, readVoicePttKey } from './voice-ptt'

interface StoredGameSettings {
  cs16ExecutablePath?: string
  voicePttKey?: string
  partyVoicePttKey?: string
}

const DEFAULT_TEAM_VOICE_PTT_KEY = 'K'
const DEFAULT_PARTY_VOICE_PTT_KEY = 'V'
const PARTY_VOICE_PTT_PREFIX = 'party:'
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
      ...(typeof settings.voicePttKey === 'string' ? { voicePttKey: settings.voicePttKey } : {}),
      ...(typeof settings.partyVoicePttKey === 'string'
        ? { partyVoicePttKey: settings.partyVoicePttKey }
        : {})
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

const resolveTeamVoicePttKey = async (
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

  return DEFAULT_TEAM_VOICE_PTT_KEY
}

const resolvePartyVoicePttKey = (
  storedSettings: StoredGameSettings,
  teamVoicePttKey: string
): string => {
  if (storedSettings.partyVoicePttKey) {
    try {
      const savedKey = normalizeVoicePttKey(storedSettings.partyVoicePttKey)
      if (savedKey.toLowerCase() !== teamVoicePttKey.toLowerCase()) return savedKey
    } catch {
      // Fall through to the launcher default.
    }
  }

  if (DEFAULT_PARTY_VOICE_PTT_KEY !== teamVoicePttKey) return DEFAULT_PARTY_VOICE_PTT_KEY
  return 'B'
}

const buildSettings = (
  cs16ExecutablePath: string | null,
  teamVoicePttKey: string,
  partyVoicePttKey: string
): GameSettings => ({
  cs16ExecutablePath,
  configFilePath: configPath(),
  // Keep voicePttKey as the team binding for compatibility with older renderer code.
  voicePttKey: teamVoicePttKey,
  // Index 0 is Team, index 1 is Party. This preserves the existing IPC contract.
  voicePttKeys: [teamVoicePttKey, partyVoicePttKey]
})

const persistResolvedSettings = async (
  cs16ExecutablePath: string | null,
  teamVoicePttKey: string,
  partyVoicePttKey: string
): Promise<void> => {
  await writeStoredSettings({
    ...(cs16ExecutablePath ? { cs16ExecutablePath } : {}),
    voicePttKey: teamVoicePttKey,
    partyVoicePttKey
  })
}

const resolveVoicePttKeys = async (
  storedSettings: StoredGameSettings,
  executablePath: string | null
): Promise<{ team: string; party: string }> => {
  const team = await resolveTeamVoicePttKey(storedSettings, executablePath)
  return { team, party: resolvePartyVoicePttKey(storedSettings, team) }
}

export const getGameSettings = async (): Promise<GameSettings> => {
  const storedSettings = await readStoredSettings()
  let cs16ExecutablePath = await validateStoredPath(storedSettings)
  if (!cs16ExecutablePath) cs16ExecutablePath = await detectCs16Executable()

  const keys = await resolveVoicePttKeys(storedSettings, cs16ExecutablePath)
  await persistResolvedSettings(cs16ExecutablePath, keys.team, keys.party)

  return buildSettings(cs16ExecutablePath, keys.team, keys.party)
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
  const keys = await resolveVoicePttKeys(storedSettings, cs16ExecutablePath)
  await persistResolvedSettings(cs16ExecutablePath, keys.team, keys.party)
  return buildSettings(cs16ExecutablePath, keys.team, keys.party)
}

export const saveVoicePttKey = async (untrustedKey: unknown): Promise<GameSettings> => {
  const storedSettings = await readStoredSettings()
  const cs16ExecutablePath = await validateStoredPath(storedSettings)
  const current = await resolveVoicePttKeys(storedSettings, cs16ExecutablePath)

  let teamVoicePttKey = current.team
  let partyVoicePttKey = current.party
  if (typeof untrustedKey === 'string' && untrustedKey.startsWith(PARTY_VOICE_PTT_PREFIX)) {
    partyVoicePttKey = normalizeVoicePttKey(untrustedKey.slice(PARTY_VOICE_PTT_PREFIX.length))
  } else {
    teamVoicePttKey = normalizeVoicePttKey(untrustedKey)
  }

  if (teamVoicePttKey.toLowerCase() === partyVoicePttKey.toLowerCase()) {
    throw new Error('Team and Party talk need different push-to-talk keys.')
  }

  await persistResolvedSettings(cs16ExecutablePath, teamVoicePttKey, partyVoicePttKey)
  return buildSettings(cs16ExecutablePath, teamVoicePttKey, partyVoicePttKey)
}

export const getSavedCs16Executable = async (): Promise<string | null> => {
  const storedSettings = await readStoredSettings()
  const cs16ExecutablePath = await validateStoredPath(storedSettings)
  if (!cs16ExecutablePath) return null

  const keys = await resolveVoicePttKeys(storedSettings, cs16ExecutablePath)
  if (
    storedSettings.voicePttKey !== keys.team ||
    storedSettings.partyVoicePttKey !== keys.party
  ) {
    await persistResolvedSettings(cs16ExecutablePath, keys.team, keys.party)
  }
  return cs16ExecutablePath
}

export const getSavedVoicePttKey = async (): Promise<string> => {
  const storedSettings = await readStoredSettings()
  const cs16ExecutablePath = await validateStoredPath(storedSettings)
  const keys = await resolveVoicePttKeys(storedSettings, cs16ExecutablePath)
  return `${keys.team}|${keys.party}`
}
