import { isPartnerId } from '../shared/partner-attribution'
import { requestJson } from './browser-session'
const key = '16competitive.web.partner-referral'
const brandingKey = '16competitive.web.partner-branding'
const lifetime = 30 * 24 * 60 * 60 * 1000
export const capturePartnerReferral = (): void => {
  const params = new URL(location.href).searchParams
  const partnerId = params.get('partnerId') ?? params.get('parnerId')
  if (isPartnerId(partnerId)) {
    try {
      localStorage.setItem(key, JSON.stringify({ partnerId, capturedAt: Date.now() }))
      localStorage.setItem(brandingKey, JSON.stringify({ partnerId, capturedAt: Date.now() }))
    } catch {
      /* Storage may be disabled. */
    }
  }
}
export const getBrowserPartnerId = (): string | null => {
  const params = new URL(location.href).searchParams
  const direct = params.get('partnerId') ?? params.get('parnerId')
  if (isPartnerId(direct)) return direct
  try {
    const raw: unknown = JSON.parse(
      localStorage.getItem(brandingKey) ?? localStorage.getItem(key) ?? 'null'
    )
    if (!raw || typeof raw !== 'object') return null
    const record = raw as { partnerId?: unknown; capturedAt?: unknown }
    return isPartnerId(record.partnerId) &&
      typeof record.capturedAt === 'number' &&
      record.capturedAt <= Date.now() &&
      Date.now() - record.capturedAt <= lifetime
      ? record.partnerId
      : null
  } catch {
    return null
  }
}
export const linkBrowserPartner = async (playerId?: string): Promise<void> => {
  try {
    capturePartnerReferral()
    const partnerId = getBrowserPartnerId()
    if (!partnerId) return
    const consideredKey = isPartnerId(playerId)
      ? `16competitive.web.partner-considered.${playerId}`
      : null
    try {
      if (consideredKey && localStorage.getItem(consideredKey) === partnerId) return
    } catch {
      /* Use backend decisions when storage is unavailable. */
    }
    await requestJson('/partners/referral', {
      authenticated: true,
      init: { method: 'POST', body: JSON.stringify({ partnerId }) }
    })
    try {
      if (consideredKey) localStorage.setItem(consideredKey, partnerId)
      localStorage.removeItem(key)
    } catch {
      /* The direct URL works without storage. */
    }
  } catch (error) {
    console.warn(
      '[Partner] browser referral remains pending',
      error instanceof Error ? error.message : String(error)
    )
  }
}
capturePartnerReferral()
