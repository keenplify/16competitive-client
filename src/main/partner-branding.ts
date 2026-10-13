import { getSessionToken } from './auth'
import { API_BASE_URL } from './config'
import { getVerifiedBranchPartnerId } from './icafe-branch'
import { detectDownloadPartner } from './partner-attribution'
import { parsePartnerBranding, type PartnerBrandingResponse } from '../shared/partner-branding'

export const getPartnerBranding = async (): Promise<PartnerBrandingResponse> => {
  const token = getSessionToken()
  const partnerId = token
    ? null
    : ((await getVerifiedBranchPartnerId()) ?? (await detectDownloadPartner()))
  if (!token && !partnerId) return { branding: null }
  const path = token ? '/partners/branding/me' : `/partners/branding/public/${partnerId}`
  const response = await fetch(new URL(path, API_BASE_URL), {
    headers: token ? { authorization: `Bearer ${token}` } : {},
    signal: AbortSignal.timeout(10_000)
  })
  if (!response.ok) throw new Error(`Partner branding request failed (${response.status}).`)
  const body: unknown = await response.json()
  if (getSessionToken() !== token) throw new Error('Session changed.')
  return parsePartnerBranding(body, API_BASE_URL)
}
