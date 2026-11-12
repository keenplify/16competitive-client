import type { MatchmakingApi } from './matchmaking'

/** Sending a socket message is not success: wait for the server's invitation. */
export function requestBotMatch(
  api: Pick<MatchmakingApi, 'onEvent' | 'playWithBots'>,
  timeoutMs = 30_000
): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false
    let unsubscribe = (): void => {}
    const finish = (error?: Error): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      unsubscribe()
      if (error) reject(error)
      else resolve()
    }
    const timer = setTimeout(() => finish(new Error('BOT_MATCH_TIMEOUT')), timeoutMs)
    try {
      unsubscribe = api.onEvent((event) => {
        if (event.type === 'error') finish(new Error(event.code))
        else if (
          event.type === 'queue_left' ||
          event.type === 'server_restarting' ||
          (event.type === 'connection_state' && event.state === 'disconnected')
        )
          finish(new Error('BOT_MATCH_INTERRUPTED'))
        else if (
          !event.whileQueued &&
          (event.type === 'match_found' || event.type === 'match_ready_check')
        )
          finish()
      })
      Promise.resolve(api.playWithBots()).catch((error: unknown) =>
        finish(error instanceof Error ? error : new Error('BOT_MATCH_FAILED'))
      )
    } catch (error) {
      finish(error instanceof Error ? error : new Error('BOT_MATCH_FAILED'))
    }
  })
}
