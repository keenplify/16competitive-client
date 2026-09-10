import { readFile, readdir, readlink, unlink, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'

const VOICE_BIND_COMMAND = '+voicerecord'
const VOICE_WRAPPER_COMMAND = '+16competitive_voicerecord'
const VOICE_WRAPPER_RELEASE_COMMAND = '-16competitive_voicerecord'
const VOICE_BACKUP_FILE = '16competitive_voice_restore.json'
const DEFAULT_VOICE_SCALE = '1'
const LINUX_RESTORE_WAIT_TIMEOUT_MS = 5_000
const LINUX_RESTORE_POLL_MS = 50

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

interface ParsedBind {
  key: string
  command: string
  prefix: string
  suffix: string
}

interface VoiceRestoreBackup {
  voiceScale: string
}

export interface VoicePttSession {
  enabled: boolean
  keys: string[]
  configCommands: string[]
  restoreBindings(): Promise<void>
}

const delay = (milliseconds: number): Promise<void> =>
  new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds))

const hasRunningLinuxGoldSrc = async (gameDirectory: string): Promise<boolean> => {
  if (process.platform !== 'linux') return false
  const entries = await readdir('/proc', { withFileTypes: true }).catch(() => [])
  const running = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory() && /^\d+$/.test(entry.name))
      .map(async (entry) => {
        const [cwd, executable] = await Promise.all([
          readlink(`/proc/${entry.name}/cwd`).catch(() => ''),
          readlink(`/proc/${entry.name}/exe`).catch(() => '')
        ])
        return cwd === gameDirectory && basename(executable) === 'hl_linux'
      })
  )
  return running.some(Boolean)
}

const waitForLinuxGoldSrcExit = async (gameDirectory: string): Promise<void> => {
  if (process.platform !== 'linux') return
  const deadline = Date.now() + LINUX_RESTORE_WAIT_TIMEOUT_MS
  while (await hasRunningLinuxGoldSrc(gameDirectory)) {
    if (Date.now() >= deadline) {
      console.warn('[VoicePTT] GoldSrc was still running when voice settings were restored', {
        gameDirectory
      })
      return
    }
    await delay(LINUX_RESTORE_POLL_MS)
  }
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

const parseBind = (line: string): ParsedBind | null => {
  const match = line.match(/^(\s*bind\s+"([^"\r\n]+)"\s+")([^"\r\n]*)("\s*)$/i)
  if (!match) return null
  return {
    key: match[2],
    command: match[3],
    prefix: match[1],
    suffix: match[4]
  }
}

const replaceWrapperBindings = (contents: string): { contents: string; changed: boolean } => {
  let changed = false
  const eol = contents.includes('\r\n') ? '\r\n' : '\n'
  const lines = contents.split(/\r?\n/).map((line) => {
    const bind = parseBind(line)
    if (!bind || bind.command.trim().toLowerCase() !== VOICE_WRAPPER_COMMAND) return line
    changed = true
    return `${bind.prefix}${VOICE_BIND_COMMAND}${bind.suffix}`
  })
  return { contents: lines.join(eol), changed }
}

const findVoiceScale = (contents: string): string => {
  for (const line of contents.split(/\r?\n/)) {
    const match = line.match(/^\s*voice_scale\s+"?([^"\s]+)"?\s*$/i)
    if (match?.[1]) return match[1]
  }
  return DEFAULT_VOICE_SCALE
}

const restoreVoiceScale = (contents: string, originalVoiceScale: string): string => {
  const eol = contents.includes('\r\n') ? '\r\n' : '\n'
  let found = false
  const lines = contents.split(/\r?\n/).map((line) => {
    if (!/^\s*voice_scale(?:\s|$)/i.test(line)) return line
    found = true
    return `voice_scale "${originalVoiceScale}"`
  })
  if (!found) lines.push(`voice_scale "${originalVoiceScale}"`)
  return lines.join(eol)
}

const voiceKeysFromConfig = (contents: string): string[] =>
  contents
    .split(/\r?\n/)
    .map(parseBind)
    .filter((bind): bind is ParsedBind => Boolean(bind))
    .filter((bind) => {
      const command = bind.command.trim().toLowerCase()
      return command === VOICE_BIND_COMMAND || command === VOICE_WRAPPER_COMMAND
    })
    .map((bind) => bind.key)
    .filter((key) => !/["\r\n;]/.test(key))

const readRestoreBackup = async (gameDirectory: string): Promise<VoiceRestoreBackup | null> => {
  try {
    const parsed = JSON.parse(
      await readFile(join(gameDirectory, 'cstrike', VOICE_BACKUP_FILE), 'utf8')
    ) as unknown
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      typeof (parsed as Partial<VoiceRestoreBackup>).voiceScale !== 'string' ||
      !/^[0-9]+(?:\.[0-9]+)?$/.test((parsed as VoiceRestoreBackup).voiceScale)
    ) {
      return null
    }
    return parsed as VoiceRestoreBackup
  } catch {
    return null
  }
}

const restorePendingVoiceSettings = async (gameDirectory: string): Promise<void> => {
  const backupPath = join(gameDirectory, 'cstrike', VOICE_BACKUP_FILE)
  const backup = await readRestoreBackup(gameDirectory)
  if (!backup) return

  const configPath = join(gameDirectory, 'cstrike', 'config.cfg')
  const current = await readFile(configPath, 'utf8').catch(() => '')
  if (current) {
    const restoredBindings = replaceWrapperBindings(current)
    const restored = restoreVoiceScale(restoredBindings.contents, backup.voiceScale)
    if (restored !== current) await writeFile(configPath, restored, { encoding: 'utf8' })
  }
  await unlink(backupPath).catch(() => undefined)
  console.info('[VoicePTT] recovered Counter-Strike voice settings from previous session')
}

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
      // Ignore GoldSrc keys that the launcher cannot reproduce reliably.
    }
  }
  return null
}

export const writeVoicePttKey = async (
  gameDirectory: string,
  untrustedKey: unknown
): Promise<string> => {
  const key = normalizeVoicePttKey(untrustedKey)
  const configPath = join(gameDirectory, 'cstrike', 'config.cfg')
  const existing = await readFile(configPath, 'utf8').catch(() => '')
  const restored = replaceWrapperBindings(existing).contents
  const eol = restored.includes('\r\n') ? '\r\n' : '\n'
  const normalizedKey = key.toUpperCase()
  const lines = restored.split(/\r?\n/).filter((line) => {
    const bind = parseBind(line)
    if (!bind) return true
    const command = bind.command.trim().toLowerCase()
    if (command === VOICE_BIND_COMMAND || command === VOICE_WRAPPER_COMMAND) return false
    return bind.key.trim().toUpperCase() !== normalizedKey
  })
  while (lines.length > 0 && lines.at(-1)?.trim() === '') lines.pop()
  lines.push(`bind "${key}" "${VOICE_BIND_COMMAND}"`, '')
  await writeFile(configPath, lines.join(eol), { encoding: 'utf8' })
  console.info('[VoicePTT] synchronized Counter-Strike push-to-talk key', { key })
  return key
}

export const prepareVoicePtt = async (gameDirectory: string): Promise<VoicePttSession> => {
  await restorePendingVoiceSettings(gameDirectory)

  const cstrikeDirectory = join(gameDirectory, 'cstrike')
  const configPath = join(cstrikeDirectory, 'config.cfg')
  const backupPath = join(cstrikeDirectory, VOICE_BACKUP_FILE)
  const existing = await readFile(configPath, 'utf8').catch(() => '')
  const recovered = replaceWrapperBindings(existing)
  const originalVoiceScale = findVoiceScale(recovered.contents)

  if (recovered.changed) {
    await writeFile(configPath, recovered.contents, { encoding: 'utf8' })
    console.info('[VoicePTT] recovered stale Counter-Strike voice binding')
  }

  const keys = [...new Set(voiceKeysFromConfig(recovered.contents))]

  if (keys.length === 0) {
    console.warn('[VoicePTT] no +voicerecord bind found; native PTT bridge disabled')
  } else {
    console.info('[VoicePTT] prepared native Counter-Strike PTT bridge', { keys })
  }

  await writeFile(backupPath, `${JSON.stringify({ voiceScale: originalVoiceScale })}\n`, {
    encoding: 'utf8',
    mode: 0o600
  })

  const restoreBindings = async (): Promise<void> => {
    await waitForLinuxGoldSrcExit(gameDirectory)
    const backup = (await readRestoreBackup(gameDirectory)) ?? { voiceScale: originalVoiceScale }
    const current = await readFile(configPath, 'utf8').catch(() => '')
    if (current) {
      const restoredBindings = replaceWrapperBindings(current)
      const restored = restoreVoiceScale(restoredBindings.contents, backup.voiceScale)
      if (restored !== current) await writeFile(configPath, restored, { encoding: 'utf8' })
    }
    await unlink(backupPath).catch(() => undefined)
    console.info('[VoicePTT] restored Counter-Strike voice settings')
  }

  return {
    enabled: keys.length > 0,
    keys,
    configCommands: [
      ...(keys.length > 0
        ? [
            `alias "${VOICE_WRAPPER_COMMAND}" "+voicerecord; cmd 16competitive_ptt 1"`,
            `alias "${VOICE_WRAPPER_RELEASE_COMMAND}" "-voicerecord; cmd 16competitive_ptt 0"`,
            ...keys.map((key) => `bind "${key}" "${VOICE_WRAPPER_COMMAND}"`)
          ]
        : []),
      // Keep native GoldSrc voice packets available for the built-in HUD,
      // but make their playback silent. Electron/WebRTC carries real audio.
      'voice_scale "0"'
    ],
    restoreBindings
  }
}
