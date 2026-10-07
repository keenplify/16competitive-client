export type FailureReport = {
  key: string
  at: number
  owner: string | null
  description: string
  details: string
  matchId?: string
  submitted?: boolean
}
const MAX_REPORTS = 32
const MAX_AGE = 7 * 24 * 60 * 60 * 1000

export function parseFailureReports(text: string, now: number): FailureReport[] {
  if (Buffer.byteLength(text) > 256_000) return []
  const value: unknown = JSON.parse(text)
  if (!Array.isArray(value)) return []
  return value
    .filter((entry): entry is FailureReport => {
      if (!entry || typeof entry !== 'object') return false
      const row = entry as Record<string, unknown>
      return (
        typeof row.key === 'string' &&
        /^anticheat:[a-f0-9]{64}$/.test(row.key) &&
        typeof row.at === 'number' &&
        row.at <= now &&
        now - row.at < MAX_AGE &&
        (row.owner === null || (typeof row.owner === 'string' && row.owner.length <= 32)) &&
        typeof row.description === 'string' &&
        row.description.length <= 2000 &&
        typeof row.details === 'string' &&
        row.details.length <= 4000 &&
        (row.matchId === undefined ||
          (typeof row.matchId === 'string' && /^[a-f0-9-]{36}$/i.test(row.matchId))) &&
        (row.submitted === undefined || typeof row.submitted === 'boolean')
      )
    })
    .slice(-MAX_REPORTS)
}

export class FailureReportQueue {
  private task: Promise<void> = Promise.resolve()
  private flushing = false
  private readonly storage: {
    read: () => Promise<FailureReport[]>
    write: (reports: FailureReport[]) => Promise<void>
  }
  constructor(storage: FailureReportQueue['storage']) {
    this.storage = storage
  }

  private change(update: (reports: FailureReport[]) => FailureReport[]): Promise<void> {
    const task = this.task.then(async () => {
      const reports = await this.storage.read()
      await this.storage.write(update(reports).slice(-MAX_REPORTS))
    })
    this.task = task.catch(() => undefined)
    return task
  }

  enqueue(report: FailureReport): Promise<void> {
    return this.change((reports) =>
      reports.some((row) => row.key === report.key) ? reports : [...reports, report]
    )
  }

  async flush(
    owner: () => string | null,
    send: (report: FailureReport) => Promise<unknown>
  ): Promise<void> {
    if (this.flushing || !owner()) return
    this.flushing = true
    try {
      await this.task
      for (const report of await this.storage.read()) {
        const current = owner()
        if (!current) break
        if (report.submitted || (report.owner !== null && report.owner !== current)) continue
        // Bind pre-login failures to the first account attempting submission.
        const claimed = { ...report, owner: current }
        await this.change((reports) =>
          reports.map((row) => (row.key === report.key ? claimed : row))
        )
        if (owner() !== current) break
        await send(claimed)
        await this.change((reports) =>
          reports.map((row) => (row.key === report.key ? { ...row, submitted: true } : row))
        )
      }
    } finally {
      this.flushing = false
    }
  }
}
