import { approvedPartnerReturnUrl } from '../shared/partner-return'
import { getWebPartnerLogin } from './browser-session'
import { hostedPartnerId } from './partner-runtime'

export function partnerReturnUrl(): string | null {
  const partner = getWebPartnerLogin()
  const partnerId = hostedPartnerId() ?? partner?.partnerId
  return partnerId ? approvedPartnerReturnUrl(partnerId) : null
}
