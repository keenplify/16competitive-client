import type { NativeHelperReadiness } from '../shared/native-helper-settings'

/** Share expensive runtime checks across Settings, setup and matchmaking. Keep
 * failures briefly too: focus events must not hammer a busy helper with 429s.
 */
export class NativeReadinessRequests {
  private pending: { token: string; promise: Promise<NativeHelperReadiness> } | null = null
  private recent: { token: string; until: number; promise: Promise<NativeHelperReadiness> } | null =
    null

  private readonly now: () => number

  constructor(now: () => number = Date.now) {
    this.now = now
  }

  run(token: string, check: () => Promise<NativeHelperReadiness>): Promise<NativeHelperReadiness> {
    // The bridge has one runtime worker even when accounts change.
    if (this.pending) {
      if (this.pending.token === token) return this.pending.promise
      return this.pending.promise.catch(() => undefined).then(() => this.run(token, check))
    }
    if (this.recent?.token === token && this.recent.until > this.now()) return this.recent.promise
    const promise = Promise.resolve().then(check)
    const pending = { token, promise }
    this.pending = pending
    void promise.then(
      () => this.finish(pending),
      () => this.finish(pending)
    )
    return promise
  }

  private finish(pending: { token: string; promise: Promise<NativeHelperReadiness> }): void {
    if (this.pending !== pending) return
    this.pending = null
    this.recent = { ...pending, until: this.now() + 10_000 }
  }
}
