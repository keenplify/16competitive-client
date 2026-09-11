import { readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const VOICE_BIND_COMMAND = '+voicerecord'
const VOICE_WRAPPER_COMMAND = '+16competitive_voice'
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

interface VoiceBindingSnapshot {
  key: string
  command: string | null
}

const parseVoiceBind = (line: string): { key: string; command: string } | null => {
  const match = line.match(/^\s*bind\s+"([^"\r\n]+)"\s+"([^"\r\n]*)"\s*$/i)
  return match ? { key: match[1], command: match[2] } : null
}

const normalizeVoicePttKeys = (keys: string[]): string[] => {
  const normalized: string[] = []
  for (const key of keys) {
    try {
      const candidate = normalizeVoicePttKey(key)
      if (!normalized.some((existing) => existing.toLowerCase() === candidate.toLowerCase())) {
        normalized.push(candidate)
      }
    } catch {
      // Ignore an existing GoldSrc key that the launcher cannot represent.
    }
  }
  return normalized
}

const installVoiceBindings = (
  contents: string,
  keys: string[]
): { contents: string; snapshots: VoiceBindingSnapshot[] } => {
  const eol = contents.includes('\r\n') ? '\r\n' : '\n'
  const snapshots = keys.map((key) => ({ key, command: null }) satisfies VoiceBindingSnapshot)
  const snapshotByKey = new Map(snapshots.map((snapshot) => [snapshot.key.toLowerCase(), snapshot]))
  const lines: string[] = []

  for (const line of contents.split(/\r?\n/)) {
    const binding = parseVoiceBind(line)
    const snapshot = binding ? snapshotByKey.get(binding.key.toLowerCase()) : undefined
    if (!binding || !snapshot) {
      lines.push(line)
      continue
    }

    snapshot.command =
      binding.command.toLowerCase() === VOICE_WRAPPER_COMMAND
        ? VOICE_BIND_COMMAND
        : binding.command
  }

  while (lines.at(-1)?.trim() === '') lines.pop()
  lines.push(...keys.map((key) => `bind "${key}" "${VOICE_WRAPPER_COMMAND}"`), '')

  return { contents: lines.join(eol), snapshots }
}

const restoreVoiceBindings = (
  contents: string,
  snapshots: VoiceBindingSnapshot[]
): string => {
  const eol = contents.includes('\r\n') ? '\r\n' : '\n'
  const snapshotByKey = new Map(snapshots.map((snapshot) => [snapshot.key.toLowerCase(), snapshot]))
  const effectiveBindings = new Map<string, string>()

  for (const line of contents.split(/\r?\n/)) {
    const binding = parseVoiceBind(line)
    if (binding && snapshotByKey.has(binding.key.toLowerCase())) {
      effectiveBindings.set(binding.key.toLowerCase(), binding.command)
    }
  }

  const keysToRestore = new Set(
    snapshots
      .filter(
        ({ key }) =>
          effectiveBindings.get(key.toLowerCase())?.toLowerCase() === VOICE_WRAPPER_COMMAND
      )
      .map(({ key }) => key.toLowerCase())
  )
  if (keysToRestore.size === 0) return contents

  const lines = contents.split(/\r?\n/).filter((line) => {
    const binding = parseVoiceBind(line)
    return !binding || !keysToRestore.has(binding.key.toLowerCase())
  })
  while (lines.at(-1)?.trim() === '') lines.pop()

  for (const snapshot of snapshots) {
    if (keysToRestore.has(snapshot.key.toLowerCase()) && snapshot.command !== null) {
      lines.push(`bind "${snapshot.key}" "${snapshot.command}"`)
    }
  }
  lines.push('')
  return lines.join(eol)
}

const writeConfigAtomically = async (configPath: string, contents: string): Promise<void> => {
  const temporary = `${configPath}.${process.pid}.16competitive.tmp`
  await writeFile(temporary, contents, { encoding: 'utf8', mode: 0o600 })
  await rename(temporary, configPath)
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
 * The match config binds a private server command instead of native voice.
 * After GoldSrc exits, its temporary bind is changed back atomically without
 * touching any unrelated config lines.
 */
export const prepareVoicePtt = async (
  gameDirectory: string,
  _onPtt: (active: boolean) => void = () => undefined,
  configuredKey?: string
): Promise<VoicePttSession> => {
  void _onPtt
  const keys = normalizeVoicePttKeys([
    ...(await readVoicePttKeys(gameDirectory)),
    ...(configuredKey ? [configuredKey] : [])
  ])
  const configPath = join(gameDirectory, 'cstrike', 'config.cfg')
  const originalConfig = await readFile(configPath, 'utf8').catch(() => '')
  const installedBindings = installVoiceBindings(originalConfig, keys)

  if (keys.length > 0 && installedBindings.contents !== originalConfig) {
    await writeConfigAtomically(configPath, installedBindings.contents)
    console.info('[VoicePTT] installed temporary Counter-Strike voice binding', { keys })
  }

  if (keys.length === 0) {
    console.warn('[VoicePTT] no push-to-talk key is configured; voice bridge disabled')
  } else {
    console.info('[VoicePTT] prepared private Counter-Strike PTT bridge', { keys })
  }

  return {
    enabled: keys.length > 0,
    keys,
    configCommands:
      keys.length > 0
        ? [
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
      const restored = restoreVoiceBindings(current, installedBindings.snapshots)
      if (restored === current) return

      await writeConfigAtomically(configPath, restored)
      console.info('[VoicePTT] restored Counter-Strike voice binding after exit')
    }
  }
}
