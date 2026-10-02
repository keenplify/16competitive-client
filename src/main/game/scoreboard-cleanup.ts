// Windows integrations reuse live-session. Keep old writes/restoration from
// crossing into the next match, including across the two installation types.
export class ScoreboardCleanupQueue {
  private pending: Promise<void> = Promise.resolve()

  enqueue(cleanup: () => Promise<void>): void {
    this.pending = this.pending.catch(() => undefined).then(cleanup)
    // Report failures immediately; wait() still rejects so callers cannot
    // start over incomplete restoration.
    void this.pending.catch((error: unknown) => {
      console.warn('[Scoreboard] session cleanup failed', error)
    })
  }

  async wait(): Promise<void> {
    const pending = this.pending
    try {
      await pending
    } finally {
      // A failed cleanup is reported to this launch. A later launch can retry
      // installation recovery rather than remaining blocked until app restart.
      if (this.pending === pending) this.pending = Promise.resolve()
    }
  }
}
