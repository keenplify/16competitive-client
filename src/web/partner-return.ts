import { approvedPartnerReturnUrl } from '../shared/partner-return'
import { getWebPartnerLogin } from './browser-session'

export function partnerReturnUrl(): string | null {
  const partner = getWebPartnerLogin()
  return partner ? approvedPartnerReturnUrl(partner.partnerId) : null
}
