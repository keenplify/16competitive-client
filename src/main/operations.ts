import { clearSessionToken, getSessionToken } from './auth'
import { matchmakingConnection } from './matchmaking'
import { resolvePreferredMatchmakingApiUrl } from './matchmaking-regions'
import type { Operation, OperationSnapshot, OperationViewedResult } from '../shared/operations'

type ApiError = Error & { code?: string }

const makeError = (message: string, code?: string): ApiError =>
  Object.assign(new Error(message), { code })

const operationApiBaseUrl = async (): Promise<string> =>
  matchmakingConnection.getActiveApiUrl() ?? (await resolvePreferredMatchmakingApiUrl())

const apiUrl = async (path: string): Promise<string> => {
  const baseUrl = await operationApiBaseUrl()
  return new URL(path, `${baseUrl.replace(/\/$/, '')}/`).toString()
}

const request = async (
  path: string,
  options: { authenticated?: boolean; init?: RequestInit } = {}
): Promise<unknown> => {
  const headers = new Headers(options.init?.headers)
  if (options.authenticated) {
    const token = getSessionToken()
    if (!token) throw makeError('Sign in to view Operation progress.', 'UNAUTHORIZED')
    headers.set('authorization', `Bearer ${token}`)
  }

  const response = await fetch(await apiUrl(path), {
    ...options.init,
    headers,
    signal: AbortSignal.timeout(10_000)
  }).catch(() => {
    throw makeError('Could not reach the Operation server.')
  })
  const body: unknown = await response.json().catch(() => null)
  if (response.status === 401) {
    clearSessionToken()
    throw makeError('Your session expired. Sign in again.', 'UNAUTHORIZED')
  }
  if (!response.ok) {
    const error = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {}
    throw makeError(
      typeof error.message === 'string' ? error.message : 'Operation request failed.',
      typeof error.error === 'string' ? error.error : undefined
    )
  }
  return body
}

const stringOrNull = (value: unknown): value is string | null =>
  typeof value === 'string' || value === null

const isTier = (value: unknown): boolean => {
  if (typeof value !== 'object' || value === null) return false
  const tier = value as Record<string, unknown>
  return (
    typeof tier.id === 'string' &&
    typeof tier.tier === 'number' &&
    Number.isInteger(tier.tier) &&
    typeof tier.requiredPoints === 'number' &&
    Number.isInteger(tier.requiredPoints) &&
    typeof tier.isMajor === 'boolean' &&
    typeof tier.rewardType === 'string' &&
    ['SKIN', 'POINTS', 'P_CASH', 'SHOWCASE'].includes(tier.rewardType) &&
    stringOrNull(tier.skinId) &&
    (typeof tier.amount === 'number' || tier.amount === null) &&
    stringOrNull(tier.showcaseKey) &&
    stringOrNull(tier.showcaseName)
  )
}

const isOperation = (value: unknown): value is Operation => {
  if (typeof value !== 'object' || value === null) return false
  const operation = value as Record<string, unknown>
  return (
    typeof operation.id === 'string' &&
    typeof operation.title === 'string' &&
    stringOrNull(operation.description) &&
    typeof operation.startsAt === 'string' &&
    typeof operation.endsAt === 'string' &&
    typeof operation.isActive === 'boolean' &&
    (operation.accessType === 'FREE' || operation.accessType === 'PREMIUM') &&
    (typeof operation.pricePCash === 'number' || operation.pricePCash === null) &&
    stringOrNull(operation.logoUrl) &&
    stringOrNull(operation.heroUrl) &&
    typeof operation.durationDays === 'number' &&
    ['SCHEDULED', 'RUNNING', 'ENDED'].includes(String(operation.phase)) &&
    Array.isArray(operation.tiers) &&
    operation.tiers.length <= 30 &&
    operation.tiers.every(isTier)
  )
}

export const getActiveOperation = async (): Promise<Operation | null> => {
  const body = await request('/operations/active')
  if (typeof body !== 'object' || body === null) {
    throw new Error('The server returned an invalid Operation response.')
  }
  const operation = (body as Record<string, unknown>).operation
  if (operation === null) return null
  if (!isOperation(operation)) throw new Error('The server returned an invalid Operation.')
  return operation
}

export const getMyOperation = async (): Promise<OperationSnapshot> => {
  const body = await request('/operations/me', { authenticated: true })
  if (typeof body !== 'object' || body === null) {
    throw new Error('The server returned an invalid Operation tracker.')
  }
  const snapshot = body as Record<string, unknown>
  if (snapshot.operation === null && snapshot.progress === null) {
    return { operation: null, progress: null }
  }
  if (!isOperation(snapshot.operation)) {
    throw new Error('The server returned an invalid Operation.')
  }
  if (typeof snapshot.progress !== 'object' || snapshot.progress === null) {
    throw new Error('The server returned invalid Operation progress.')
  }
  const progress = snapshot.progress as Record<string, unknown>
  if (
    typeof progress.points !== 'number' ||
    typeof progress.lastViewedPoints !== 'number' ||
    !(typeof progress.updatedAt === 'string' || progress.updatedAt === null)
  ) {
    throw new Error('The server returned invalid Operation progress.')
  }
  return {
    operation: snapshot.operation,
    progress: {
      points: progress.points,
      lastViewedPoints: progress.lastViewedPoints,
      updatedAt: progress.updatedAt
    }
  }
}

export const markOperationViewed = async (
  operationId: unknown,
  viewedPoints: unknown
): Promise<OperationViewedResult> => {
  if (typeof operationId !== 'string' || !/^[0-9a-f-]{36}$/i.test(operationId)) {
    throw new Error('Invalid Operation.')
  }
  if (typeof viewedPoints !== 'number' || !Number.isInteger(viewedPoints) || viewedPoints < 0) {
    throw new Error('Invalid Operation progress.')
  }
  const body = await request(`/operations/${operationId}/view`, {
    authenticated: true,
    init: {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ viewedPoints })
    }
  })
  if (
    typeof body !== 'object' ||
    body === null ||
    typeof (body as Record<string, unknown>).points !== 'number' ||
    typeof (body as Record<string, unknown>).lastViewedPoints !== 'number'
  ) {
    throw new Error('The server returned invalid Operation progress.')
  }
  return body as OperationViewedResult
}
