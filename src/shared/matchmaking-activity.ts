export interface MatchmakingActivity {
  region: string
  inGamePlayers: number
  queuedPlayers: number
}

export function parseMatchmakingActivity(value: unknown): MatchmakingActivity {
  if (!value || typeof value !== 'object') throw new Error('Invalid matchmaking activity')
  const data = value as Record<string, unknown>
  if (
    typeof data.region !== 'string' ||
    !/^[a-z0-9-]{1,32}$/.test(data.region) ||
    typeof data.inGamePlayers !== 'number' ||
    !Number.isSafeInteger(data.inGamePlayers) ||
    data.inGamePlayers < 0 ||
    typeof data.queuedPlayers !== 'number' ||
    !Number.isSafeInteger(data.queuedPlayers) ||
    data.queuedPlayers < 0
  )
    throw new Error('Invalid matchmaking activity')
  return {
    region: data.region,
    inGamePlayers: data.inGamePlayers,
    queuedPlayers: data.queuedPlayers
  }
}
