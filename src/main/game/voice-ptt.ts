import { readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const VOICE_BIND_COMMAND = '+voicerecord'
const VOICE_WRAPPER_COMMAND = '+16competitive_voicerecord'
const VOICE_WRAPPER_RELEASE_COMMAND = '-16competitive_voicerecord'
const PTT_DOWN_MARKER = '__16COMPETITIVE_PTT_DOWN__'
const PTT_UP_MARKER = '__16COMPETITIVE_PTT_UP__'
const RESTORE_SETTLE_MS = 250

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
    .filter((match) => {
      const command = match[2].trim().toLowerCase()
      return command === VOICE_BIND_COMMAND || command === VOICE_WRAPPER_COMMAND
    })
    .map((match) => match[1])
    .filter((key) => !/["\r\n;]/.test(key))

const restoreWrapperBindings = (contents: string): string => {
  const eol = contents.includes('\r\n') ? '\r\n' : '\n'
  return contents
    .split(/\r?\n/)
    .map((line) =>
      line.replace(
        /^(\s*bind\s+"[^"\r\n]+"\s+")\+16competitive_voicerecord("\s*)$/i,
        `$1${VOICE_BIND_COMMAND}$2`
      )
    )
    .join(eol)
}

const delay = (milliseconds: number): Promise<void> =>
  new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds))

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
 * Match-time aliases live only in the generated match config. After GoldSrc
 * exits, its temporary wrapper bind is changed back atomically without
 * touching any unrelated config lines.
 */
export const prepareVoicePtt = async (
  gameDirectory: string,
  _onPtt: (active: boolean) => void = () => undefined,
  configuredKey?: string
): Promise<VoicePttSession> => {
  void _onPtt
  const keys = [
    ...new Set([
      ...(await readVoicePttKeys(gameDirectory)),
      ...(configuredKey ? [normalizeVoicePttKey(configuredKey)] : [])
    ])
  ]
  const configPath = join(gameDirectory, 'cstrike', 'config.cfg')

  if (keys.length === 0) {
    console.warn('[VoicePTT] no +voicerecord bind found; native PTT bridge disabled')
  } else {
    console.info('[VoicePTT] prepared native Counter-Strike PTT bridge', { keys })
  }

  return {
    enabled: keys.length > 0,
    keys,
    configCommands:
      keys.length > 0
        ? [
            `alias "${VOICE_WRAPPER_COMMAND}" "+voicerecord; echo ${PTT_DOWN_MARKER}; cmd 16competitive_ptt 1"`,
            `alias "${VOICE_WRAPPER_RELEASE_COMMAND}" "-voicerecord; echo ${PTT_UP_MARKER}; cmd 16competitive_ptt 0"`,
            ...keys.map((key) => `bind "${key}" "${VOICE_WRAPPER_COMMAND}"`)
          ]
        : [],
    launchArguments: [],
    restoreBindings: async () => {
      // This is called only from the tracked game process exit path. Give
      // GoldSrc a small window to finish its own config.cfg write first.
      await delay(RESTORE_SETTLE_MS)
      const current = await readFile(configPath, 'utf8').catch(() => '')
      if (!current) return
      const restored = restoreWrapperBindings(current)
      if (restored === current) return

      const temporary = `${configPath}.${process.pid}.16competitive.tmp`
      await writeFile(temporary, restored, { encoding: 'utf8', mode: 0o600 })
      await rename(temporary, configPath)
      console.info('[VoicePTT] restored Counter-Strike voice binding after exit')
    }
  }
}
