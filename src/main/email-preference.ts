import { getSessionToken } from './auth'
import { resolveServiceApiUrl } from './matchmaking-regions'
import { parseEmailPreference, validEmailAction, type EmailPreference } from '../shared/email-preference'

export async function emailPreference(action: unknown): Promise<EmailPreference> {
  const token = getSessionToken()
  if (!token || !validEmailAction(action)) throw new Error('UNAVAILABLE')
  const base = await resolveServiceApiUrl()
  const response = await fetch(`${base}/auth/email-preference`, {
    method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(action), signal: AbortSignal.timeout(15_000)
  })
  const result: unknown = await response.json()
  if (!response.ok) {
    const code = result && typeof result === 'object' && 'error' in result ? result.error : ''
    throw new Error(typeof code === 'string' && /^[A-Z_]{1,24}$/.test(code) ? code : 'UNAVAILABLE')
  }
  return parseEmailPreference(result)
}
