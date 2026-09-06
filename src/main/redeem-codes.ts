import { clearSessionToken, getSessionToken } from './auth'
import { API_BASE_URL } from './config'
import type {
  RedeemCodeErrorCode,
  RedeemCodeResponse,
  RedeemCodeResult
} from '../shared/redeem-codes'

const codePattern = /^[A-Z0-9][A-Z0-9_-]{2,63}$/i
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const messages: Record<RedeemCodeErrorCode, string> = {
  UNAUTHORIZED: 'Your session expired. Sign in again.',
  INVALID_CODE: 'Enter a valid redeem code.',
  CODE_NOT_FOUND: 'That redeem code was not found.',
  CODE_EXPIRED: 'That redeem code has expired.',
  CODE_LIMIT_REACHED: 'That redeem code has reached its redemption limit.',
  CODE_ALREADY_REDEEMED: 'You have already redeemed that code.',
  INTERNAL_ERROR: 'Could not redeem the code. Please try again.'
}

const errorCodes = new Set<RedeemCodeErrorCode>(Object.keys(messages) as RedeemCodeErrorCode[])

const failure = (error: RedeemCodeErrorCode): RedeemCodeResponse => ({
  ok: false,
  error,
  message: messages[error]
})

const isRedeemResult = (value: unknown): value is RedeemCodeResult => {
  if (typeof value !== 'object' || value === null) return false
  const result = value as Record<string, unknown>
  return (
    typeof result.code === 'string' &&
    Number.isInteger(result.pointsGranted) &&
    (result.pointsGranted as number) >= 0 &&
    Number.isInteger(result.points) &&
    (result.points as number) >= 0 &&
    (result.skinId === null ||
      (typeof result.skinId === 'string' && uuidPattern.test(result.skinId))) &&
    typeof result.skinGranted === 'boolean'
  )
}

export const redeemCode = async (untrustedCode: unknown): Promise<RedeemCodeResponse> => {
  if (typeof untrustedCode !== 'string') return failure('INVALID_CODE')
  const code = untrustedCode.trim()
  if (!codePattern.test(code)) return failure('INVALID_CODE')

  const token = getSessionToken()
  if (!token) return failure('UNAUTHORIZED')

  let response: Response
  try {
    response = await fetch(`${API_BASE_URL}/redeem-codes/redeem`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({ code }),
      signal: AbortSignal.timeout(10_000)
    })
  } catch {
    return failure('INTERNAL_ERROR')
  }

  const body: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    if (response.status === 401) clearSessionToken()
    const remoteError =
      typeof body === 'object' && body !== null
        ? (body as Record<string, unknown>).error
        : undefined
    return failure(
      typeof remoteError === 'string' && errorCodes.has(remoteError as RedeemCodeErrorCode)
        ? (remoteError as RedeemCodeErrorCode)
        : 'INTERNAL_ERROR'
    )
  }

  return isRedeemResult(body) ? { ok: true, result: body } : failure('INTERNAL_ERROR')
}
