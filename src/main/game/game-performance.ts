import { lstat, open } from 'node:fs/promises'
import { join } from 'node:path'

type Sample = { frames: number; elapsedUs: number; worstUs: number; recordedAt: number }
type Session = {
  directory: string
  matchId: string
  owner: string
  lightweight: boolean
  ended: boolean
  sample: Sample | null
  lastRead: number
}
const sessions: Session[] = []
const RETAIN_MS = 10 * 60_000

export function parseGameFps(text: string, recordedAt: number, now = Date.now()): Sample | null {
  const match = /^#16c-fps-v1\n(\d{1,6}) (\d{1,8}) (\d{1,7})\n$/.exec(text)
  if (!match || !Number.isFinite(recordedAt) || recordedAt > now || now - recordedAt > 15_000)
    return null
  const [frames, elapsedUs, worstUs] = match.slice(1).map(Number)
  if (
    frames < 2 ||
    frames > 100_000 ||
    elapsedUs < 5_000_000 ||
    elapsedUs > 15_000_000 ||
    worstUs < elapsedUs / frames ||
    worstUs > 1_000_000
  )
    return null
  return { frames, elapsedUs, worstUs, recordedAt }
}

export function beginGamePerformance(
  directory: string,
  matchId: string,
  owner: string,
  lightweight: boolean
): void {
  sessions.unshift({
    directory,
    matchId,
    owner,
    lightweight,
    ended: false,
    sample: null,
    lastRead: 0
  })
  sessions.splice(3)
}

export async function captureGamePerformance(directory: string, end = false): Promise<void> {
  const session = sessions.find((entry) => entry.directory === directory && !entry.ended)
  if (!session) return
  const now = Date.now()
  if (!end && now - session.lastRead < 2000) return
  session.lastRead = now
  if (end) session.ended = true
  let file: Awaited<ReturnType<typeof open>> | undefined
  try {
    const path = join(directory, 'game-fps.state')
    const link = await lstat(path)
    if (!link.isFile() || link.isSymbolicLink() || link.size > 128) return
    file = await open(path, 'r')
    const stat = await file.stat()
    if (!stat.isFile() || stat.size > 128) return
    const bytes = Buffer.alloc(129)
    const { bytesRead } = await file.read(bytes, 0, bytes.length, 0)
    const sample = parseGameFps(bytes.subarray(0, bytesRead).toString('utf8'), stat.mtimeMs)
    if (sample && (!session.sample || sample.recordedAt > session.sample.recordedAt))
      session.sample = sample
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
      console.warn('[GameFPS] Sample unavailable', error)
  } finally {
    await file
      ?.close()
      .catch((error: unknown) => console.warn('[GameFPS] Could not close sample', error))
  }
}

export async function refreshGamePerformance(owner: string, matchId?: string): Promise<void> {
  const session = sessions.find(
    (entry) => entry.owner === owner && !entry.ended && (!matchId || entry.matchId === matchId)
  )
  if (session) await captureGamePerformance(session.directory)
}

export function gamePerformanceReport(owner: string, matchId?: string, now = Date.now()): string {
  const session = sessions.find(
    (entry) => entry.owner === owner && (!matchId || entry.matchId === matchId)
  )
  const sample = session?.sample
  const heading = '[In-game performance — native HUD callback estimate]'
  if (!session || !sample || now < sample.recordedAt || now - sample.recordedAt > RETAIN_MS)
    return `${heading}\nFPS: unavailable (no recent native sample; enhancements may be off or the helper may not support FPS).`
  return (
    `${heading}\nMatch: ${session.matchId}\nHUD mode: ${session.lightweight ? 'lightweight' : 'normal'}\n` +
    `Average FPS: ${((sample.frames * 1_000_000) / sample.elapsedUs).toFixed(1)}\n` +
    `Slowest frame: ${(sample.worstUs / 1000).toFixed(2)} ms\n` +
    `Sample: ${(sample.elapsedUs / 1_000_000).toFixed(2)} seconds, ${sample.frames} frame intervals\n` +
    `Recorded ${(Math.max(0, now - sample.recordedAt) / 1000).toFixed(0)} seconds ago; ${session.ended ? 'game session ended' : 'last recorded sample'}\n` +
    'Loading/suspension gaps over one second are excluded. This is game HUD cadence, not launcher FPS or GPU timing.'
  )
}
