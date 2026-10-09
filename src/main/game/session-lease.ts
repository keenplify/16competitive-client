import { rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { writeLiveSessionFile } from './live-session-file'

/** Separate from backend-feed freshness: cached Tab data is usable only while
 * this launcher still owns the live game session. */
export class SessionLease {
  private timer: ReturnType<typeof setInterval> | null = null
  private pending: Promise<void> = Promise.resolve()
  private readonly id = randomUUID()
  private stopped = false

  constructor(private readonly directory: string) {}

  async start(): Promise<void> {
    await this.refresh()
    if (this.stopped || this.timer) return
    this.timer = setInterval(() => {
      void this.refresh().catch((error: unknown) => {
        console.error('[Scoreboard] launcher lease refresh failed', error)
      })
    }, 1000)
    this.timer.unref()
  }

  private refresh(): Promise<void> {
    this.pending = this.pending
      .catch(() => undefined)
      .then(async () => {
        if (!this.stopped)
          await writeLiveSessionFile(join(this.directory, 'launcher.lease'), `${this.id}\n`)
      })
    return this.pending
  }

  async stop(): Promise<void> {
    this.stopped = true
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    await this.pending.catch(() => undefined)
    await writeFile(join(this.directory, 'launcher.stopped'), '1\n', { mode: 0o600 })
    await rm(join(this.directory, 'launcher.lease'), { force: true })
  }
}
