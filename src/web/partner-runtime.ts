/** Hosting metadata is inserted by our verified partner-app endpoint. */
const meta = (name: string): string | null =>
  document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`)?.content ?? null
export const partnerBasePath = (): string => {
  const value = meta('16c-base-path')
  return value && /^\/(?:[A-Za-z0-9_-]+\/)*$/.test(value) ? value : '/pwa/'
}
export const partnerAssetPath = (file: string): string => `${partnerBasePath()}${file}`
export const hostedPartnerId = (): string | null => meta('16c-partner-id')
export const isPartnerHost = (): boolean => Boolean(meta('16c-api-origin'))
const endpointKey = '16competitive.web.partner-api-origin'
export const partnerApiOrigin = (): string => {
  const configured = meta('16c-api-origin')
  if (!configured) return window.location.origin
  try {
    const selected = sessionStorage.getItem(endpointKey) ?? configured
    const url = new URL(selected)
    if (url.protocol === 'https:' && !url.username && !url.password) return url.origin
  } catch {
    /* Use the configured origin when storage is unavailable. */
  }
  return configured
}
export const setPartnerApiOrigin = (origin: string): void => {
  const url = new URL(origin)
  if (url.protocol !== 'https:' || url.username || url.password)
    throw new Error('INVALID_API_ORIGIN')
  sessionStorage.setItem(endpointKey, url.origin)
}
