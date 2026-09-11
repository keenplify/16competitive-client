import { readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const VOICE_BIND_COMMAND = '+voicerecord'
const LEGACY_VOICE_WRAPPER_COMMAND = '+16competitive_voice'
const TEAM_VOICE_WRAPPER_COMMAND = '+16competitive_team_voice'
const PARTY_VOICE_WRAPPER_COMMAND = '+16competitive_party_voice'
const DEFAULT_TEAM_VOICE_PTT_KEY = 'K'
const DEFAULT_PARTY_VOICE_PTT_KEY = 'V'
const RESTORE_SETTLE_MS = 250

const MANAGED_VOICE_WRAPPERS = new Set([
  LEGACY_VOICE_WRAPPER_COMMAND,
  TEAM_VOICE_WRAPPER_COMMAND,
  PARTY_VOICE_WRAPPER_COMMAND
])

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

const goldSrcBindKey = (key: string): string => (/^[A-Z]$/.test(key) ? key.toLowerCase() : key)

const parseVoiceBind = (line: string): { key: string; command: string } | null => {
  const match = line.match(/^\s*bind\s+"([^"\r\n]+)"\s+"([^"\r\n]*)"\s*$/i)
  return match ? { key: match[1], command: match[2] } : null
}

const teamVoiceKeysFromConfig = (contents: string): string[] =>
  contents
    .split(/\r?\n/)
    .map(parseVoiceBind)
    .filter((binding): binding is { key: string; command: string } => Boolean(binding))
    .filter(({ command }) => {
      const normalized = command.trim().toLowerCase()
      return (
        normalized === VOICE_BIND_COMMAND ||
        normalized === LEGACY_VOICE_WRAPPER_COMMAND ||
        normalized === TEAM_VOICE_WRAPPER_COMMAND
      )
    })
    .map(({ key }) => key)
    .filter((key) => !/["\r\n;]/.test(key))

interface VoiceBindingSnapshot {
  key: string
  command: string | null
}

interface VoiceBinding {
  key: string
  command: string
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

const parseConfiguredVoiceKeys = (
  configuredKeys?: string
): { teamKey: string; partyKey: string } => {
  const [rawTeamKey, rawPartyKey] = configuredKeys?.split('|', 2) ?? []
  const teamKey = normalizeVoicePttKey(rawTeamKey || DEFAULT_TEAM_VOICE_PTT_KEY)
  let partyKey = normalizeVoicePttKey(rawPartyKey || DEFAULT_PARTY_VOICE_PTT_KEY)
  if (partyKey.toLowerCase() === teamKey.toLowerCase()) {
    partyKey = teamKey === 'B' ? 'N' : 'B'
  }
  return { teamKey, partyKey }
}

const installVoiceBindings = (
  contents: string,
  bindings: VoiceBinding[]
): { contents: string; snapshots: VoiceBindingSnapshot[] } => {
  const eol = contents.includes('\r\n') ? '\r\n' : '\n'
  const snapshots: VoiceBindingSnapshot[] = bindings.map(({ key }) => ({ key, command: null }))
  const snapshotByKey = new Map(snapshots.map((snapshot) => [snapshot.key.toLowerCase(), snapshot]))
  const lines: string[] = []

  for (const line of contents.split(/\r?\n/)) {
    const binding = parseVoiceBind(line)
    const snapshot = binding ? snapshotByKey.get(binding.key.toLowerCase()) : undefined
    if (!binding || !snapshot) {
      lines.push(line)
      continue
    }

    const previousCommand = binding.command.trim().toLowerCase()
    if (
      previousCommand === LEGACY_VOICE_WRAPPER_COMMAND ||
      previousCommand === TEAM_VOICE_WRAPPER_COMMAND
    ) {
      snapshot.command = VOICE_BIND_COMMAND
    } else if (previousCommand === PARTY_VOICE_WRAPPER_COMMAND) {
      snapshot.command = null
    } else {
      snapshot.command = binding.command
    }
  }

  while (lines.at(-1)?.trim() === '') lines.pop()
  lines.push(
    ...bindings.map(({ key, command }) => `bind "${goldSrcBindKey(key)}" "${command}"`),
    ''
  )

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
      .filter(({ key }) => {
        const command = effectiveBindings.get(key.toLowerCase())?.toLowerCase()
        return Boolean(command && MANAGED_VOICE_WRAPPERS.has(command))
      })
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
      lines.push(`bind "${goldSrcBindKey(snapshot.key)}" "${snapshot.command}"`)
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
  return [...new Set(teamVoiceKeysFromConfig(existing))]
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

export const prepareVoicePtt = async (
  gameDirectory: string,
  _onPtt: (active: boolean) => void = () => undefined,
  configuredKeys?: string
): Promise<VoicePttSession> => {
  void _onPtt
  const { teamKey, partyKey } = parseConfiguredVoiceKeys(configuredKeys)
  const partyKeyLower = partyKey.toLowerCase()
  const teamKeys = normalizeVoicePttKeys([
    ...(await readVoicePttKeys(gameDirectory)).filter(
      (key) => key.toLowerCase() !== partyKeyLower
    ),
    teamKey
  ])
  const bindings: VoiceBinding[] = [
    ...teamKeys.map((key) => ({ key, command: TEAM_VOICE_WRAPPER_COMMAND })),
    { key: partyKey, command: PARTY_VOICE_WRAPPER_COMMAND }
  ]
  const keys = [...new Set(bindings.map(({ key }) => key))]
  const configPath = join(gameDirectory, 'cstrike', 'config.cfg')
  const originalConfig = await readFile(configPath, 'utf8').catch(() => '')
  const installedBindings = installVoiceBindings(originalConfig, bindings)

  if (installedBindings.contents !== originalConfig) {
    await writeConfigAtomically(configPath, installedBindings.contents)
    console.info('[VoicePTT] installed temporary Counter-Strike voice bindings', {
      teamKeys,
      partyKey
    })
  }

  console.info('[VoicePTT] prepared private Counter-Strike PTT bridge', {
    teamKeys,
    partyKey
  })

  return {
    enabled: keys.length > 0,
    keys,
    configCommands: bindings.map(
      ({ key, command }) => `bind "${goldSrcBindKey(key)}" "${command}"`
    ),
    launchArguments: [],
    restoreBindings: async () => {
      await delay(RESTORE_SETTLE_MS)
      const current = await readFile(configPath, 'utf8').catch(() => '')
      if (!current) return
      const restored = restoreVoiceBindings(current, installedBindings.snapshots)
      if (restored === current) return

      await writeConfigAtomically(configPath, restored)
      console.info('[VoicePTT] restored Counter-Strike voice bindings after exit')
    }
  }
}
