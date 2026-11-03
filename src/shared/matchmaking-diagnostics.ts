// Deliberate projection: never serialize socket messages or connection credentials.
const FIELDS = new Set([
  'type',
  'matchId',
  'mode',
  'state',
  'status',
  'code',
  'reason',
  'deadline',
  'serverNow',
  'declineAvailableAt',
  'playersRequired',
  'accepted',
  'completedFiles',
  'totalFiles',
  'whileQueued',
  'authenticated',
  'socketState',
  'socketOpening',
  'reconnectAttempt',
  'recoveryStatusPending',
  'hasConnection',
  'connectionStatus',
  'queueStatus',
  'readyResponse',
  'readyDeadline',
  'readyWarningOpen',
  'gameExited',
  'gameExitCount',
  'copyConnectionStatus',
  'acceptedCount',
  'readyPlayersRequired',
  'remainingMs',
  'clockOffsetMs',
  'rendererAvailable',
  'closeCode',
  'wasClean'
])
const ORIGINS = new Set(['activeApiUrl', 'hostApiUrl', 'websocketUrl'])
const TTL_MS = 30 * 60_000

export function projectMatchDiagnostics(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object') return {}
  const output: Record<string, unknown> = {}
  for (const [key, field] of Object.entries(value)) {
    if (ORIGINS.has(key) && typeof field === 'string') {
      try {
        const url = new URL(field)
        if (['https:', 'http:', 'wss:', 'ws:'].includes(url.protocol)) output[key] = url.origin
      } catch {
        /* Invalid endpoints are not copied into reports. */
      }
    } else if (FIELDS.has(key)) {
      if (
        field === null ||
        typeof field === 'boolean' ||
        (typeof field === 'number' && Number.isFinite(field))
      )
        output[key] = field
      else if (
        typeof field === 'string' &&
        field.length <= 100 &&
        /^[a-zA-Z0-9_.:+ /-]*$/.test(field)
      )
        output[key] = field
    }
  }
  const accepted = (value as { acceptedPlayerIds?: unknown }).acceptedPlayerIds
  if (Array.isArray(accepted)) output.acceptedCount = accepted.length
  return output
}

export class MatchmakingDiagnostics {
  private owner: string | null = null
  private timeline: Array<{ at: number; stage: string; data: Record<string, unknown> }> = []
  private progress: { at: number; data: Record<string, unknown> } | null = null
  private snapshot: (() => unknown) | null = null

  private readonly now: () => number

  constructor(now: () => number = Date.now) {
    this.now = now
  }

  setOwner(owner: string | null): void {
    if (owner === this.owner) return
    this.owner = owner
    this.timeline = []
    this.progress = null
  }

  setSnapshot(snapshot: () => unknown): void {
    this.snapshot = snapshot
  }

  record(stage: string, event: unknown): void {
    const data = projectMatchDiagnostics(event)
    const type = typeof data.type === 'string' ? data.type : ''
    if (
      !/^(match_|connection_|game_process_|authenticated$|error$|get_queue_status$|invalid_message$|socket_closed$)/.test(
        type
      )
    )
      return
    const at = this.now()
    if (type === 'match_assets_progress') {
      this.progress = { at, data }
      return
    }
    this.timeline = this.timeline.filter((entry) => at - entry.at <= TTL_MS).slice(-63)
    this.timeline.push({ at, stage, data })
  }

  report(): string {
    const now = this.now()
    const snapshot = projectMatchDiagnostics(this.snapshot?.())
    const timeline = this.timeline.filter((entry) => now - entry.at <= TTL_MS)
    return JSON.stringify({
      capturedAt: new Date(now).toISOString(),
      snapshot,
      assetProgress: this.progress && now - this.progress.at <= TTL_MS ? this.progress : null,
      timeline
    })
  }
}
