import type { ScoreboardHealth } from './scoreboard-watchdog'

export type ScoreboardIncident = {
  matchId: string
  client: 'NextClient' | 'Windows GoldSrc (other/unknown)' | 'Linux GoldSrc'
  platform: string
  architecture: string
  osRelease?: string
  feedVersion?: string | null
  lastFeedAgeMs?: number | null
  rendererExitReason?: string | null
  matchState?: { map: string; round: number; mode: string; playerCount: number } | null
  reason: string
  health: Partial<ScoreboardHealth>
  recovery: 'request completed' | 'failed' | 'not attempted'
  error?: string
}

export function createScoreboardReporter(
  report: (description: string, logs: string[], key: string) => Promise<unknown>,
  wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))
): (incident: ScoreboardIncident) => Promise<void> {
  const submitted = new Set<string>()
  return async (incident) => {
    const key = `scoreboard:${incident.matchId}:${incident.reason}`
    if (submitted.has(key)) return
    submitted.add(key)
    const description = [
      'Automatic bug report: scoreboard watchdog detected a problem.',
      `Match ID: ${incident.matchId}`,
      `Game client: ${incident.client}`,
      `Platform: ${incident.platform} / ${incident.architecture}`,
      `Problem: ${incident.reason}`,
      `Recovery: ${incident.recovery}`,
      'Launcher observations only; native scoreboard visibility is not verified.'
    ].join('\n')
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await report(description, [JSON.stringify({ scoreboardIncident: incident })], key)
        console.info('[Scoreboard] automatic issue report submitted', { key })
        return
      } catch (error) {
        if (attempt < 2) await wait(1000 * (attempt + 1))
        else console.warn('[Scoreboard] automatic issue report failed', { key, error })
      }
    }
  }
}
