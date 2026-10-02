export type ScoreboardHealth = {
  feedReady: boolean
  rendererCrashed: boolean
  frameAgeMs: number | null
  markersPresent: boolean
}

export class ScoreboardWatchdog {
  private timer: ReturnType<typeof setInterval> | null = null
  private stopped = true
  private checking: Promise<void> | null = null
  private startedAt = 0
  private lastRepair = -Infinity
  private readonly health: () => Promise<ScoreboardHealth>
  private readonly repair: (reason: string, health: ScoreboardHealth) => Promise<void>
  private readonly intervalMs: number
  private readonly now: () => number

  constructor(
    health: () => Promise<ScoreboardHealth>,
    repair: (reason: string, health: ScoreboardHealth) => Promise<void>,
    intervalMs = 2000,
    now = Date.now
  ) {
    this.health = health
    this.repair = repair
    this.intervalMs = intervalMs
    this.now = now
  }

  start(): void {
    if (!this.stopped) return
    this.stopped = false
    this.startedAt = this.now()
    this.timer = setInterval(() => {
      void this.check().catch((error: unknown) => {
        console.warn('[Scoreboard] watchdog check failed', error)
      })
    }, this.intervalMs)
    this.timer.unref()
  }

  check(): Promise<void> {
    if (this.stopped) return Promise.resolve()
    if (this.checking) return this.checking
    this.checking = this.inspect().finally(() => {
      this.checking = null
    })
    return this.checking
  }

  private async inspect(): Promise<void> {
    const health = await this.health()
    if (this.stopped || this.now() - this.lastRepair < 15000) return
    const reason = health.rendererCrashed
      ? 'renderer crashed'
      : !health.feedReady
        ? null
        : !health.markersPresent
          ? 'session markers missing'
          : this.now() - this.startedAt >= 8000 &&
              (health.frameAgeMs === null || health.frameAgeMs > 8000)
            ? 'scoreboard frame stalled'
            : null
    if (!reason) return
    this.lastRepair = this.now()
    await this.repair(reason, health)
  }

  stop(): Promise<void> {
    this.stopped = true
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    return this.checking ?? Promise.resolve()
  }
}
