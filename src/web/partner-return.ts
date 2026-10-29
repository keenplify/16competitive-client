import { getBrowserPartnerId } from './partner-attribution'

// Approved integration destinations only; never redirect to a URL supplied in
// query parameters, a referrer, or a stored arbitrary URL.
const destinations: Readonly<Record<string, string>> = {
  '583704ab-6fc5-4b58-8fc2-d91cf1d7c051': 'https://www.olaguergeyming.com/gamehub/'
}
export function partnerReturnUrl(): string | null {
  const partnerId = getBrowserPartnerId()
  return partnerId ? (destinations[partnerId] ?? null) : null
}
