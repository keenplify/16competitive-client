export type EmailPreferenceAction =
  | { action: 'status' }
  | { action: 'send'; email: string }
  | { action: 'verify'; email: string; code: string; marketing: boolean }
  | { action: 'marketing'; enabled: boolean }

export interface EmailPreference {
  email: string | null
  verified: boolean
  marketing: boolean | null
  googleReward: boolean
  points: number
}

export function validEmailAction(value: unknown): value is EmailPreferenceAction {
  if (!value || typeof value !== 'object' || !('action' in value)) return false
  if (value.action === 'status') return true
  if (value.action === 'marketing') return 'enabled' in value && typeof value.enabled === 'boolean'
  if (!('email' in value) || typeof value.email !== 'string' || value.email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email)) return false
  return value.action === 'send' || (value.action === 'verify' && 'code' in value && typeof value.code === 'string' &&
    /^\d{6}$/.test(value.code) && 'marketing' in value && typeof value.marketing === 'boolean')
}

export function parseEmailPreference(value: unknown): EmailPreference {
  if (!value || typeof value !== 'object' || !('email' in value) || (value.email !== null && typeof value.email !== 'string') ||
    !('verified' in value) || typeof value.verified !== 'boolean' || !('marketing' in value) || (value.marketing !== null && typeof value.marketing !== 'boolean') ||
    !('points' in value) || typeof value.points !== 'number' || !Number.isSafeInteger(value.points) || value.points < 0)
    throw new Error('UNAVAILABLE')
  return { googleReward: "googleReward" in value && value.googleReward === true, email: value.email, verified: value.verified, marketing: value.marketing, points: value.points }
}
