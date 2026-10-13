import { getSessionToken } from './auth'
import { API_BASE_URL } from './config'
import { parsePartnerBranding, type PartnerBrandingResponse } from '../shared/partner-branding'

export const getPartnerBranding = async (): Promise<PartnerBrandingResponse> => {
  const token = getSessionToken()
  if (!token) throw new Error('Authentication required.')
  const response = await fetch(new URL('/partners/branding/me', API_BASE_URL), {
    headers: { authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10_000)
  })
  if (!response.ok) throw new Error(`Partner branding request failed (${response.status}).`)
  const body: unknown = await response.json()
  if (getSessionToken() !== token) throw new Error('Session changed.')
  return parsePartnerBranding(body, API_BASE_URL)
}
