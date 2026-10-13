import { isPartnerId } from '../shared/partner-attribution'
import { requestJson } from './browser-session'
const key = '16competitive.web.partner-referral'
const lifetime = 30 * 24 * 60 * 60 * 1000
export const capturePartnerReferral = (): void => {
  const params = new URL(location.href).searchParams
  const partnerId = params.get('partnerId') ?? params.get('parnerId')
  if (isPartnerId(partnerId)) {
    try {
      localStorage.setItem(key, JSON.stringify({ partnerId, capturedAt: Date.now() }))
    } catch {
      /* Storage may be disabled. */
    }
  }
}
export const linkBrowserPartner = async (): Promise<void> => {
  try {
    capturePartnerReferral()
    const raw: unknown = JSON.parse(localStorage.getItem(key) ?? 'null')
    if (!raw || typeof raw !== 'object') return
    const record = raw as { partnerId?: unknown; capturedAt?: unknown }
    if (
      !isPartnerId(record.partnerId) ||
      typeof record.capturedAt !== 'number' ||
      Date.now() - record.capturedAt > lifetime
    ) {
      localStorage.removeItem(key)
      return
    }
    await requestJson('/partners/referral', {
      authenticated: true,
      init: { method: 'POST', body: JSON.stringify({ partnerId: record.partnerId }) }
    })
    localStorage.removeItem(key)
  } catch (error) {
    console.warn(
      '[Partner] browser referral remains pending',
      error instanceof Error ? error.message : String(error)
    )
  }
}
capturePartnerReferral()
