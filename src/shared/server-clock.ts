let serverEpochMs: number | null = null
let synchronizedAtMs = 0

export function syncServerClock(serverNow: string): boolean {
  const parsed = Date.parse(serverNow)
  if (!Number.isFinite(parsed)) return false
  serverEpochMs = parsed
  synchronizedAtMs = performance.now()
  return true
}

export function serverClockNow(): number {
  return serverEpochMs === null
    ? Date.now()
    : serverEpochMs + (performance.now() - synchronizedAtMs)
}
