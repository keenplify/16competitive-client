import { app, dialog } from 'electron'
import { chmod, mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, normalize, resolve } from 'node:path'
import type { GameSettings } from '../../shared/game-settings'

interface StoredGameSettings {
  cs16ExecutablePath?: string
  voicePttKey?: string
}

const DEFAULT_VOICE_PTT_KEY = 'k'
const VOICE_COMMAND = '+voicerecord'
const VOICE_WRAPPER_COMMAND = '+16competitive_voicerecord'
const VOICE_CONFIG_NAME = '16competitive_voice.cfg'
const SPECIAL_VOICE_KEYS = new Set([
  'SPACE',
  'CTRL',
  'SHIFT',
  'ALT',
  'ENTER',
  'TAB',
  'BACKSPACE',
  'UPARROW',
  'DOWNARROW',
  'LEFTARROW',
  'RIGHTARROW',
  'INS',
  'DEL',
  'HOME',
  'END',
  'PGUP',
  'PGDN',
  'MOUSE1',
  'MOUSE2',
  'MOUSE3',
  'MOUSE4',
  'MOUSE5'
])

const configPath = (): string => join(app.getPath('userData'), 'game-settings.json')

const normalizeVoicePttKey = (untrustedKey: unknown): string => {
  if (typeof untrustedKey !== 'string') throw new Error('Choose a valid push-to-talk key.')
  const key = untrustedKey.trim()
  if (/^[a-z0-9]$/i.test(key)) return key.toLowerCase()
  if (/^F(?:[1-9]|1[0-2])$/i.test(key)) return key.toUpperCase()
  const upper = key.toUpperCase()
  if (SPECIAL_VOICE_KEYS.has(upper)) return upper
  throw new Error('That key cannot be used for push-to-talk.')
}

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
    const value = parsed as Partial<StoredGameSettings>
    return {
      ...(typeof value.cs16ExecutablePath === 'string'
        ? { cs16ExecutablePath: value.cs16ExecutablePath }
        : {}),
      ...(typeof value.voicePttKey === 'string' ? { voicePttKey: value.voicePttKey } : {})
    }
  } catch {
    return {}
  }
}

const writeStoredSettings = async (settings: StoredGameSettings): Promise<void> => {
  const destination = configPath()
  const temporary = `${destination}.tmp`
  await mkdir(dirname(destination), { recursive: true })
  await writeFile(temporary, `${JSON.stringify(settings, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600
  })
  await rename(temporary, destination)
  if (process.platform !== 'win32') await chmod(destination, 0o600)
}

const readStoredPath = async (): Promise<string | null> => {
  const stored = await readStoredSettings()
  if (!stored.cs16ExecutablePath) return null
  try {
    return await validateExecutable(stored.cs16ExecutablePath)
  } catch {
    return null
  }
}

const gameDirectoryForExecutable = (executablePath: string): string => {
  const configuredDirectory = process.env.CS16_CLIENT_GAME_DIRECTORY
  if (configuredDirectory && isAbsolute(configuredDirectory)) return resolve(configuredDirectory)
  return dirname(executablePath)
}

interface ParsedBind {
  key: string
  command: string
}

const parseBind = (line: string): ParsedBind | null => {
  const match = line.match(/^\s*bind\s+(?:"([^"]+)"|(\S+))\s+(?:"([^"]*)"|(.+?))\s*$/i)
  if (!match) return null
  const key = match[1] ?? match[2]
  const command = (match[3] ?? match[4] ?? '').trim()
  return key ? { key, command } : null
}

const readGoldSrcVoicePttKey = async (executablePath: string): Promise<string | null> => {
  const path = join(gameDirectoryForExecutable(executablePath), 'cstrike', 'config.cfg')
  const config = await readFile(path, 'utf8').catch(() => '')
  for (const line of config.split(/\r?\n/)) {
    const bind = parseBind(line)
    if (!bind) continue
    const command = bind.command.toLowerCase()
    if (command !== VOICE_COMMAND && command !== VOICE_WRAPPER_COMMAND) continue
    try {
      return normalizeVoicePttKey(bind.key)
    } catch {
      // Ignore unsupported GoldSrc keys and fall back to the stored/default key.
    }
  }
  return null
}

const appendSingleExec = (existing: string, command: string): string => {
  const eol = existing.includes('\r\n') ? '\r\n' : '\n'
  const lines = existing
    .split(/\r?\n/)
    .filter((line) => !/^\s*exec\s+"?16competitive_voice\.cfg"?\s*$/i.test(line))
  while (lines.length > 0 && lines.at(-1)?.trim() === '') lines.pop()
  lines.push(command, '')
  return lines.join(eol)
}

export const synchronizeGoldSrcVoicePtt = async (
  executablePath: string,
  untrustedKey: unknown
): Promise<string> => {
  const voicePttKey = normalizeVoicePttKey(untrustedKey)
  const cstrikeDirectory = join(gameDirectoryForExecutable(executablePath), 'cstrike')
  const configFile = join(cstrikeDirectory, 'config.cfg')
  const autoexecFile = join(cstrikeDirectory, 'autoexec.cfg')
  const voiceConfigFile = join(cstrikeDirectory, VOICE_CONFIG_NAME)
  const existingConfig = await readFile(configFile, 'utf8').catch(() => '')
  const configEol = existingConfig.includes('\r\n') ? '\r\n' : '\n'
  const normalizedKey = voicePttKey.toLowerCase()
  const configLines = existingConfig.split(/\r?\n/).filter((line) => {
    const bind = parseBind(line)
    if (!bind) return true
    const command = bind.command.toLowerCase()
    return (
      bind.key.toLowerCase() !== normalizedKey &&
      command !== VOICE_COMMAND &&
      command !== VOICE_WRAPPER_COMMAND
    )
  })
  while (configLines.length > 0 && configLines.at(-1)?.trim() === '') configLines.pop()
  configLines.push(`bind "${voicePttKey}" "${VOICE_COMMAND}"`, '')

  await mkdir(cstrikeDirectory, { recursive: true })
  await writeFile(configFile, configLines.join(configEol), { encoding: 'utf8' })
  await writeFile(
    voiceConfigFile,
    [
      '// Managed by 1.6 Competitive. Change the key from the launcher.',
      `alias "+16competitive_voicerecord" "+voicerecord; cmd 16competitive_ptt 1"`,
      `alias "-16competitive_voicerecord" "-voicerecord; cmd 16competitive_ptt 0"`,
      `bind "${voicePttKey}" "+16competitive_voicerecord"`,
      ''
    ].join('\n'),
    { encoding: 'utf8' }
  )
  const existingAutoexec = await readFile(autoexecFile, 'utf8').catch(() => '')
  await writeFile(
    autoexecFile,
    appendSingleExec(existingAutoexec, `exec ${VOICE_CONFIG_NAME}`),
    { encoding: 'utf8' }
  )
  return voicePttKey
}

const resolveVoicePttKey = async (
  stored: StoredGameSettings,
  executablePath: string | null
): Promise<string> => {
  if (stored.voicePttKey) {
    try {
      return normalizeVoicePttKey(stored.voicePttKey)
    } catch {
      // Fall through to the user's current GoldSrc bind or the default.
    }
  }
  if (executablePath) {
    const existingBind = await readGoldSrcVoicePttKey(executablePath)
    if (existingBind) return existingBind
  }
  return DEFAULT_VOICE_PTT_KEY
}

const buildSettings = (
  cs16ExecutablePath: string | null,
  voicePttKey: string
): GameSettings => ({
  cs16ExecutablePath,
  configFilePath: configPath(),
  voicePttKey
})

export const getGameSettings = async (): Promise<GameSettings> => {
  const storedSettings = await readStoredSettings()
  let cs16ExecutablePath = await readStoredPath()
  if (!cs16ExecutablePath) cs16ExecutablePath = await detectCs16Executable()
  const voicePttKey = await resolveVoicePttKey(storedSettings, cs16ExecutablePath)

  if (
    storedSettings.cs16ExecutablePath !== cs16ExecutablePath ||
    storedSettings.voicePttKey !== voicePttKey
  ) {
    await writeStoredSettings({
      ...(cs16ExecutablePath ? { cs16ExecutablePath } : {}),
      voicePttKey
    })
  }

  if (cs16ExecutablePath) {
    await synchronizeGoldSrcVoicePtt(cs16ExecutablePath, voicePttKey).catch((error: unknown) => {
      console.warn(
        '[GameSettings] could not synchronize Counter-Strike push-to-talk bind',
        error instanceof Error ? error.message : String(error)
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
  await writeStoredSettings({ cs16ExecutablePath, voicePttKey })
  await synchronizeGoldSrcVoicePtt(cs16ExecutablePath, voicePttKey).catch((error: unknown) => {
    console.warn(
      '[GameSettings] could not synchronize Counter-Strike push-to-talk bind',
      error instanceof Error ? error.message : String(error)
    )
  })
  return buildSettings(cs16ExecutablePath, voicePttKey)
}

export const saveVoicePttKey = async (untrustedKey: unknown): Promise<GameSettings> => {
  const voicePttKey = normalizeVoicePttKey(untrustedKey)
  const storedSettings = await readStoredSettings()
  const cs16ExecutablePath = await readStoredPath()
  await writeStoredSettings({
    ...(cs16ExecutablePath
      ? { cs16ExecutablePath }
      : storedSettings.cs16ExecutablePath
        ? { cs16ExecutablePath: storedSettings.cs16ExecutablePath }
        : {}),
    voicePttKey
  })
  if (cs16ExecutablePath) await synchronizeGoldSrcVoicePtt(cs16ExecutablePath, voicePttKey)
  return buildSettings(cs16ExecutablePath, voicePttKey)
}

export const getSavedCs16Executable = readStoredPath
