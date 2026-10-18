export type MatchReadyResponse = 'pending' | 'sending' | 'accepted' | 'declined'

export function readyResponseFromServer(
  current: MatchReadyResponse,
  acceptedPlayerIds: readonly string[],
  playerId: string | undefined
): MatchReadyResponse {
  return playerId && acceptedPlayerIds.includes(playerId) ? 'accepted' : current
}
