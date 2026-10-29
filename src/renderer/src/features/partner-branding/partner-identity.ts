import { usePartnerBrandingStore } from './partner-branding.store'

export const hasPartnerPageContext = (): boolean => {
  if (typeof document === 'undefined') return false
  const id =
    document.querySelector<HTMLMetaElement>('meta[name="16c-partner-id"]')?.content ??
    new URL(window.location.href).searchParams.get('partnerId')
  return !!id && /^[a-f0-9-]{36}$/i.test(id)
}

export const brandAppText = (text: string, name: string | null): string =>
  name === null
    ? text
    : text.replaceAll('1.6 Competitive by Papamo', name).replaceAll('1.6 Competitive', name)

export function useAppName(): string | null {
  return usePartnerBrandingStore(
    (state) =>
      state.branding?.communityName ??
      state.branding?.appName ??
      (hasPartnerPageContext() || !state.resolved ? '' : null)
  )
}
