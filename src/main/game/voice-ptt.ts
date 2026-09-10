import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

const VOICE_BIND_COMMAND = '+voicerecord'

const SPECIAL_VOICE_KEYS = new Set([
  'SPACE',
  'CTRL',
  'SHIFT',
  'ALT',
  'ENTER',
  'TAB',
  'ESCAPE',
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

export interface VoicePttSession {
  enabled: boolean
  keys: string[]
  configCommands: string[]
  launchArguments: string[]
  restoreBindings(): Promise<void>
}

export const normalizeVoicePttKey = (value: unknown): string => {
  if (typeof value !== 'string') throw new Error('Choose a valid push-to-talk key.')
  const key = value.trim()
  if (/^[a-z0-9]$/i.test(key)) return key.toUpperCase()
  if (/^F(?:[1-9]|1[0-2])$/i.test(key)) return key.toUpperCase()
  const upper = key.toUpperCase()
  if (SPECIAL_VOICE_KEYS.has(upper)) return upper
  throw new Error('That key cannot be used for push-to-talk.')
}

const voiceKeysFromConfig = (contents: string): string[] =>
  contents
    .split(/\r?\n/)
    .map((line) => line.match(/^\s*bind\s+"([^"\r\n]+)"\s+"([^"\r\n]*)"\s*$/i))
    .filter((match): match is RegExpMatchArray => Boolean(match))
    .filter((match) => match[2].trim().toLowerCase() === VOICE_BIND_COMMAND)
    .map((match) => match[1])
    .filter((key) => !/["\r\n;]/.test(key))

export const readVoicePttKeys = async (gameDirectory: string): Promise<string[]> => {
  const configPath = join(gameDirectory, 'cstrike', 'config.cfg')
  const existing = await readFile(configPath, 'utf8').catch(() => '')
  return [...new Set(voiceKeysFromConfig(existing))]
}

export const readVoicePttKey = async (gameDirectory: string): Promise<string | null> => {
  const keys = await readVoicePttKeys(gameDirectory)
  for (const key of keys) {
    try {
      return normalizeVoicePttKey(key)
    } catch {
      // Ignore GoldSrc keys that the launcher cannot represent.
    }
  }
  return null
}

/**
 * The launcher deliberately never changes cstrike/config.cfg. GoldSrc saves
 * that file itself, so editing it around process startup/exit can race its
 * save and remove unrelated user binds.
 */
export const prepareVoicePtt = async (
  _gameDirectory: string,
  _onPtt: (active: boolean) => void = () => undefined
): Promise<VoicePttSession> => {
  void _gameDirectory
  void _onPtt
  console.info('[VoicePTT] native bridge disabled; preserving GoldSrc config')
  return {
    enabled: false,
    keys: [],
    configCommands: [],
    launchArguments: [],
    restoreBindings: async () => undefined
  }
}
