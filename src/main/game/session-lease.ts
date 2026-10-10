import { rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { writeLiveSessionFile } from './live-session-file'

export const SESSION_TICKET_LIFETIME_MS = 2 * 60 * 60 * 1000

/** Separate from backend-feed freshness: cached Tab data is usable only while
 * this launcher still owns the live game session. */
export class SessionLease {
  private timer: ReturnType<typeof setInterval> | null = null
  private pending: Promise<void> = Promise.resolve()
  private readonly id = randomUUID()
  private stopped = false
  private ticketWritten = false
  private revoked = false
  private readonly issuedAt: number
  private readonly expiresAt: number

  constructor(
    private readonly directory: string,
    private readonly now: () => number = Date.now
  ) {
    this.issuedAt = now()
    this.expiresAt = this.issuedAt + SESSION_TICKET_LIFETIME_MS
  }

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
        if (this.stopped) return
        if (this.now() < this.issuedAt || this.now() >= this.expiresAt) {
          this.stopped = true
          if (this.timer) clearInterval(this.timer)
          this.timer = null
          await this.revoke()
          return
        }
        if (!this.ticketWritten) {
          await rm(join(this.directory, 'launcher.stopped'), { force: true })
          await writeLiveSessionFile(
            join(this.directory, 'session.ticket'),
            `v1\n${this.id}\n${this.issuedAt}\n${this.expiresAt}\n`
          )
          this.ticketWritten = true
        }
        await writeLiveSessionFile(join(this.directory, 'launcher.lease'), `${this.id}\n`)
      })
    return this.pending
  }

  async stop(): Promise<void> {
    this.stopped = true
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    await this.pending.catch(() => undefined)
    await this.revoke()
  }

  private async revoke(): Promise<void> {
    if (this.revoked) return
    await writeFile(join(this.directory, 'launcher.stopped'), '1\n', { mode: 0o600 })
    await Promise.all(
      ['launcher.lease', 'session.ticket'].map((name) =>
        rm(join(this.directory, name), { force: true })
      )
    )
    this.revoked = true
  }
}
