type Cancellation = {
  matchId: string
  reason: string
  connectionFailed?: boolean
}

export function createAutomaticMatchReporter(
  report: (description: string, logs: string[], deduplicationKey: string) => Promise<unknown>,
  wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))
): (event: Cancellation) => Promise<void> {
  const submitted = new Set<string>()
  return async (event) => {
    if (event.reason !== 'PLAYER_DID_NOT_CONNECT' || event.connectionFailed !== true) return
    if (submitted.has(event.matchId)) return
    submitted.add(event.matchId)
    const description = [
      'Automatic bug report: match connection/reconnection deadline exceeded.',
      `Match ID: ${event.matchId}`,
      'The server terminated the match after the five-minute connection window.',
      'The server identified this player as not connected. This report does not establish the cause.',
      'Launcher diagnostics are attached.'
    ].join('\n')
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await report(description, [], `match-connect-timeout:${event.matchId}`)
        console.info('[IssueReport] automatic connection failure report submitted', {
          matchId: event.matchId
        })
        return
      } catch (error) {
        if (attempt < 2) await wait(1000 * (attempt + 1))
        else {
          submitted.delete(event.matchId)
          console.warn('[IssueReport] automatic connection failure report failed', error)
        }
      }
    }
  }
}
