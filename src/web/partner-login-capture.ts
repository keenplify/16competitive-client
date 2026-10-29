import { isPartnerId } from '../shared/partner-attribution'

type Incoming = { partnerId: string; token: string } | 'invalid' | null
let incoming: Incoming = null
const url = new URL(window.location.href)
const receivedPartnerLogin = url.searchParams.has('token')
if (url.searchParams.has('token')) {
  const token = url.searchParams.get('token')
  const partnerId = url.searchParams.get('partnerId')
  incoming =
    !url.searchParams.has('handoff') &&
    url.searchParams.getAll('token').length === 1 &&
    url.searchParams.getAll('partnerId').length === 1 &&
    isPartnerId(partnerId) &&
    token !== null &&
    /^[A-Za-z0-9_-]{43}$/.test(token)
      ? { partnerId, token }
      : 'invalid'
  url.searchParams.delete('token')
  url.searchParams.delete('handoff')
  url.searchParams.delete('validate-url')
  history.replaceState(null, '', url.pathname + url.search + url.hash)
}
export const hasIncomingPartnerLogin = (): boolean => receivedPartnerLogin

// Imported first by the web entry point. Raw credentials never enter Zustand,
// storage, diagnostics, or the normal shared renderer.
export const takePartnerLogin = (): Incoming => {
  const value = incoming
  incoming = null
  return value
}
