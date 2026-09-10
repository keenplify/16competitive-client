import { watch, type FSWatcher } from 'node:fs'
import { open, readFile, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const VOICE_BIND_COMMAND = '+voicerecord'
const VOICE_WRAPPER_COMMAND = '+16competitive_voicerecord'
const VOICE_WRAPPER_RELEASE_COMMAND = '-16competitive_voicerecord'
const PTT_DOWN_MARKER = '__16COMPETITIVE_PTT_DOWN__'
const PTT_UP_MARKER = '__16COMPETITIVE_PTT_UP__'
const QCONSOLE_POLL_MS = 250
const MAX_LOG_READ_BYTES = 64 * 1024

interface ParsedBind {
  key: string
  command: string
  prefix: string
  suffix: string
}

export interface VoicePttSession {
  enabled: boolean
  keys: string[]
  configCommands: string[]
  launchArguments: string[]
  stopMonitoring(): void
  restoreBindings(): Promise<void>
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
    if (!bind || bind.command.toLowerCase() !== VOICE_WRAPPER_COMMAND) return line
    changed = true
    return `${bind.prefix}${VOICE_BIND_COMMAND}${bind.suffix}`
  })
  return { contents: lines.join(eol), changed }
}

const recoverAndFindVoiceBindings = async (configPath: string): Promise<string[]> => {
  const existing = await readFile(configPath, 'utf8').catch(() => '')
  if (!existing) return []

  const recovered = replaceWrapperBindings(existing)
  if (recovered.changed) {
    await writeFile(configPath, recovered.contents, { encoding: 'utf8' })
    console.info('[VoicePTT] recovered stale Counter-Strike voice binding')
  }

  return recovered.contents
    .split(/\r?\n/)
    .map(parseBind)
    .filter((bind): bind is ParsedBind => Boolean(bind))
    .filter((bind) => bind.command.trim().toLowerCase() === VOICE_BIND_COMMAND)
    .map((bind) => bind.key)
}

const restoreVoiceBindings = async (configPath: string): Promise<void> => {
  const existing = await readFile(configPath, 'utf8').catch(() => '')
  if (!existing) return
  const restored = replaceWrapperBindings(existing)
  if (!restored.changed) return
  await writeFile(configPath, restored.contents, { encoding: 'utf8' })
  console.info('[VoicePTT] restored Counter-Strike voice binding')
}

export const prepareVoicePtt = async (
  gameDirectory: string,
  onPtt: (active: boolean) => void
): Promise<VoicePttSession> => {
  const configPath = join(gameDirectory, 'cstrike', 'config.cfg')
  const keys = await recoverAndFindVoiceBindings(configPath)

  if (keys.length === 0) {
    console.warn('[VoicePTT] no +voicerecord bind found; native PTT bridge disabled')
    return {
      enabled: false,
      keys: [],
      configCommands: [],
      launchArguments: [],
      stopMonitoring: () => undefined,
      restoreBindings: () => Promise.resolve()
    }
  }

  const logPath = join(gameDirectory, 'qconsole.log')
  let logOffset = (await stat(logPath).catch(() => null))?.size ?? 0
  let partialLine = ''
  let stopped = false
  let watcher: FSWatcher | null = null
  let lastPttState = false
  let readQueue = Promise.resolve()

  const publishPtt = (active: boolean): void => {
    if (active === lastPttState) return
    lastPttState = active
    onPtt(active)
  }

  const consumeText = (text: string): void => {
    const combined = partialLine + text
    const lines = combined.split(/\r?\n/)
    partialLine = lines.pop() ?? ''
    for (const line of lines) {
      if (line.includes(PTT_DOWN_MARKER)) publishPtt(true)
      if (line.includes(PTT_UP_MARKER)) publishPtt(false)
    }
    if (partialLine.includes(PTT_DOWN_MARKER)) {
      publishPtt(true)
      partialLine = ''
    } else if (partialLine.includes(PTT_UP_MARKER)) {
      publishPtt(false)
      partialLine = ''
    }
  }

  const readNewLogData = async (): Promise<void> => {
    if (stopped) return
    const metadata = await stat(logPath).catch(() => null)
    if (!metadata?.isFile()) return
    if (metadata.size < logOffset) {
      logOffset = 0
      partialLine = ''
    }
    if (metadata.size === logOffset) return

    const handle = await open(logPath, 'r')
    try {
      while (!stopped && logOffset < metadata.size) {
        const bytesToRead = Math.min(MAX_LOG_READ_BYTES, metadata.size - logOffset)
        const buffer = Buffer.allocUnsafe(bytesToRead)
        const { bytesRead } = await handle.read(buffer, 0, bytesToRead, logOffset)
        if (bytesRead <= 0) break
        logOffset += bytesRead
        consumeText(buffer.subarray(0, bytesRead).toString('utf8'))
      }
    } finally {
      await handle.close()
    }
  }

  const queueRead = (): void => {
    readQueue = readQueue.then(readNewLogData).catch((error: unknown) => {
      console.warn('[VoicePTT] could not read GoldSrc console markers', error)
    })
  }

  try {
    watcher = watch(gameDirectory, (_eventType, filename) => {
      if (!filename || filename.toString().toLowerCase() === 'qconsole.log') queueRead()
    })
    watcher.on('error', (error) => {
      console.warn('[VoicePTT] GoldSrc console watcher error', error)
    })
  } catch (error) {
    console.warn('[VoicePTT] GoldSrc console watcher unavailable; using polling fallback', error)
  }

  const pollTimer = setInterval(queueRead, QCONSOLE_POLL_MS)
  pollTimer.unref?.()

  const safeKeys = keys.filter((key) => !/["\r\n;]/.test(key))
  const configCommands = [
    `alias "${VOICE_WRAPPER_COMMAND}" "+voicerecord; echo ${PTT_DOWN_MARKER}"`,
    `alias "${VOICE_WRAPPER_RELEASE_COMMAND}" "-voicerecord; echo ${PTT_UP_MARKER}"`,
    ...safeKeys.map((key) => `bind "${key}" "${VOICE_WRAPPER_COMMAND}"`)
  ]

  console.info('[VoicePTT] prepared native Counter-Strike PTT bridge', { keys: safeKeys })

  return {
    enabled: safeKeys.length > 0,
    keys: safeKeys,
    configCommands,
    // -condebug writes GoldSrc console output to qconsole.log. The PTT bridge
    // watches only two unique marker strings and never needs global keyboard access.
    launchArguments: safeKeys.length > 0 ? ['-condebug'] : [],
    stopMonitoring: () => {
      if (stopped) return
      stopped = true
      clearInterval(pollTimer)
      watcher?.close()
      watcher = null
      if (lastPttState) onPtt(false)
      lastPttState = false
    },
    restoreBindings: () => restoreVoiceBindings(configPath)
  }
}
