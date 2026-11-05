export const PCASH_BET_CHANNELS = { get: 'pcash-bets:get', place: 'pcash-bets:place' } as const
export const PCASH_BET_STAKES = [30, 60, 90, 120, 150] as const
export const PCASH_BET_MODES = ['5v5', '3v3', 'cs13_3v3'] as const
export interface PCashBetInput {
  stake: number
  partnerBps: number
  platformBps: number
}
export interface PCashBetSnapshot {
  matchId: string
  balance: number
  enabled: boolean
  open: boolean
  partnerBps: number
  platformBps: number
  bet: {
    stake: number
    status: 'PENDING' | 'WON' | 'LOST' | 'REFUNDED'
    payout: number | null
    expectedPayout: number
  } | null
}
export interface PCashBetsApi {
  get(matchId: string): Promise<PCashBetSnapshot>
  place(matchId: string, input: PCashBetInput): Promise<PCashBetSnapshot>
}
const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object'
const integer = (value: unknown, max = 2147483647): value is number =>
  Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= max
export function validateBetMatchId(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(value))
    throw new Error('INVALID_BET')
}
export function validateBetInput(value: unknown): asserts value is PCashBetInput {
  if (
    !object(value) ||
    !(PCASH_BET_STAKES as readonly unknown[]).includes(value.stake) ||
    !integer(value.partnerBps, 10000) ||
    !integer(value.platformBps, 10000) ||
    value.partnerBps + value.platformBps > 10000
  )
    throw new Error('INVALID_BET')
}
export function betPayout({ stake, partnerBps, platformBps }: PCashBetInput): number {
  return (
    stake * 2 -
    Math.floor((stake * 2 * partnerBps) / 10000) -
    Math.floor((stake * 2 * platformBps) / 10000)
  )
}
export function parsePCashBetSnapshot(value: unknown, matchId: string): PCashBetSnapshot {
  if (
    !object(value) ||
    value.matchId !== matchId ||
    !integer(value.balance) ||
    typeof value.enabled !== 'boolean' ||
    typeof value.open !== 'boolean' ||
    !integer(value.partnerBps, 10000) ||
    !integer(value.platformBps, 10000) ||
    value.partnerBps + value.platformBps > 10000
  )
    throw new Error('BET_INVALID_RESPONSE')
  if (value.bet !== null) {
    const bet = value.bet
    if (
      !object(bet) ||
      !integer(bet.stake, 1000000) ||
      bet.stake < 1 ||
      !['PENDING', 'WON', 'LOST', 'REFUNDED'].includes(String(bet.status)) ||
      !(bet.payout === null || integer(bet.payout, 2000000)) ||
      !integer(bet.expectedPayout, 2000000) ||
      bet.expectedPayout !==
        betPayout({
          stake: bet.stake,
          partnerBps: value.partnerBps,
          platformBps: value.platformBps
        }) ||
      (bet.status === 'PENDING'
        ? bet.payout !== null
        : bet.status === 'WON'
          ? bet.payout !== bet.expectedPayout
          : bet.status === 'LOST'
            ? bet.payout !== 0
            : bet.payout !== bet.stake)
    )
      throw new Error('BET_INVALID_RESPONSE')
  }
  return value as unknown as PCashBetSnapshot
}
