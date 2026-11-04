import { constants } from 'node:fs'
import { open } from 'node:fs/promises'
import { join } from 'node:path'

const ERROR_TEXT = 'Info string length exceeded'
const MAX_READ = 64 * 1024
const WINDOW_MS = 5 * 60 * 1000

type Cursor = { offset: number; identity: string; suffix: string }
type Report = (
  description: string,
  logs: string[],
  key: string,
  matchId: string
) => Promise<unknown>

/** Only fixed filenames and new bytes from the managed launch are inspected. */
export async function createConnectionErrorMonitor(input: {
  directory: string
  matchId: string
  isCurrent: () => boolean
  report: Report
  wait?: (ms: number) => Promise<void>
}): Promise<{ poll: () => Promise<void>; stop: () => void }> {
  const files = ['qconsole.log', join('cstrike', 'qconsole.log')]
  const cursors = new Map<string, Cursor>()
  let stopped = false
  let detected = false
  let pending: Promise<void> | null = null
  const deadline = Date.now() + WINDOW_MS
  const wait =
    input.wait ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)))

  async function read(relative: string, baseline: boolean): Promise<boolean> {
    let file
    try {
      file = await open(
        join(input.directory, relative),
        constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0)
      )
      const info = await file.stat()
      if (!info.isFile()) return false
      const identity = `${info.dev}:${info.ino}`
      const previous = cursors.get(relative)
      if (baseline) {
        cursors.set(relative, { offset: info.size, identity, suffix: '' })
        return false
      }
      const reset = !previous || previous.identity !== identity || info.size < previous.offset
      const offset = reset ? 0 : previous.offset
      const start = Math.max(offset, info.size - MAX_READ)
      const bytes = Buffer.alloc(info.size - start)
      const { bytesRead } = await file.read(bytes, 0, bytes.length, start)
      const text =
        (reset || start !== offset ? '' : previous.suffix) +
        bytes.subarray(0, bytesRead).toString('utf8')
      cursors.set(relative, {
        offset: start + bytesRead,
        identity,
        suffix: text.slice(-(ERROR_TEXT.length - 1))
      })
      return text.includes(ERROR_TEXT)
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (!['ENOENT', 'ELOOP'].includes(code ?? '')) {
        console.warn('[ConnectionReport] console read unavailable', { code: code ?? 'unknown' })
      }
      return false
    } finally {
      await file?.close()
    }
  }

  await Promise.all(files.map((file) => read(file, true)))

  async function inspect(): Promise<void> {
    if (detected || !input.isCurrent() || Date.now() > deadline) return
    const matches = await Promise.all(files.map((file) => read(file, false)))
    if (!matches.some(Boolean) || !input.isCurrent()) return
    detected = true
    const key = `game-info-string-overflow:${input.matchId}`
    for (let attempt = 0; attempt < 3 && input.isCurrent(); attempt++) {
      try {
        await input.report(
          `Automatic bug report: game connection info string length exceeded.\nMatch ID: ${input.matchId}\nThe game logged "${ERROR_TEXT}" during the managed launch. Connection credentials may not have been accepted.`,
          ['[Connection diagnostic] info-string-length-exceeded'],
          key,
          input.matchId
        )
        console.info('[ConnectionReport] automatic report submitted', { matchId: input.matchId })
        return
      } catch {
        if (attempt < 2) await wait(1000 * (attempt + 1))
        else console.warn('[ConnectionReport] automatic report failed', { matchId: input.matchId })
      }
    }
  }
  const poll = (): Promise<void> => {
    if (stopped) return Promise.resolve()
    if (!pending)
      pending = inspect().finally(() => {
        pending = null
      })
    return pending
  }
  const timer = setInterval(() => {
    if (!input.isCurrent() || Date.now() > deadline || detected) {
      clearInterval(timer)
      return
    }
    void poll().catch(() => console.warn('[ConnectionReport] console check failed'))
  }, 1000)
  timer.unref()
  return {
    poll,
    stop: () => {
      clearInterval(timer)
      // Capture a final error written immediately before game exit.
      void poll().catch(() => console.warn('[ConnectionReport] final console check failed'))
      stopped = true
    }
  }
}
