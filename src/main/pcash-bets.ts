import { getSessionToken } from './auth'
import { resolveServiceApiUrl } from './matchmaking-regions'
import {
  parsePCashBetSnapshot,
  validateBetInput,
  validateBetMatchId,
  type PCashBetInput,
  type PCashBetSnapshot
} from '../shared/pcash-bets'

export async function requestPCashBet(
  matchId: unknown,
  input?: unknown
): Promise<PCashBetSnapshot> {
  validateBetMatchId(matchId)
  if (input !== undefined) validateBetInput(input)
  const token = getSessionToken()
  if (!token) throw new Error('BET_SESSION_CHANGED')
  const base = await resolveServiceApiUrl()
  const response = await fetch(new URL(`/matches/${matchId}/p-cash-bet`, base), {
    method: input === undefined ? 'GET' : 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      ...(input === undefined ? {} : { 'content-type': 'application/json' })
    },
    ...(input === undefined ? {} : { body: JSON.stringify(input as PCashBetInput) }),
    redirect: 'error',
    signal: AbortSignal.timeout(15000)
  })
  const data: unknown = await response.json()
  if (getSessionToken() !== token) throw new Error('BET_SESSION_CHANGED')
  if (!response.ok) {
    const code =
      data &&
      typeof data === 'object' &&
      'error' in data &&
      typeof data.error === 'string' &&
      /^(BET_[A-Z_]+|INVALID_BET)$/.test(data.error)
        ? data.error
        : 'BET_REQUEST_FAILED'
    throw new Error(code)
  }
  return parsePCashBetSnapshot(data, matchId)
}
