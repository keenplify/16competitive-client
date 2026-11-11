import { getSessionToken } from './auth'
import { matchmakingConnection } from './matchmaking'
import { resolvePreferredMatchmakingApiUrl } from './matchmaking-regions'
import { parseRewardInbox, validRewardIds, type RewardInbox } from '../shared/reward-inbox'

async function request(path: string, ids?: string[]): Promise<unknown> {
  const token = getSessionToken()
  if (!token) throw new Error('Not authenticated')
  const origin =
    matchmakingConnection.getActiveApiUrl() ?? (await resolvePreferredMatchmakingApiUrl())
  const response = await fetch(new URL(path, origin), {
    method: ids ? 'POST' : 'GET',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    ...(ids ? { body: JSON.stringify({ ids }) } : {}),
    signal: AbortSignal.timeout(10_000)
  })
  if (!response.ok) throw new Error('Reward request failed')
  return response.json()
}
export async function pendingRewards(): Promise<RewardInbox> {
  return parseRewardInbox(await request('/rewards/pending'))
}
export async function consumeRewards(ids: unknown): Promise<void> {
  if (!validRewardIds(ids)) throw new Error('Invalid reward receipts')
  const body = await request('/rewards/consume', ids)
  if (!body || typeof body !== 'object' || !('ok' in body) || body.ok !== true)
    throw new Error('Reward acknowledgment failed')
}
