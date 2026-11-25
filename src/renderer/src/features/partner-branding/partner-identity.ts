import { usePartnerBrandingStore } from './partner-branding.store'

export const hostedCommunityBrand = (): {id:string; name:string} | null => {
  if (typeof document === 'undefined') return null
  const name = document.querySelector<HTMLMetaElement>('meta[name="16c-brand-only"]')?.content
  const id = document.querySelector<HTMLMetaElement>('meta[name="16c-partner-id"]')?.content
  return name && id ? {id,name} : null
}

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
    : text.replace(
        /Papamo का 1\.6 Competitive|1\.6 Competitive(?: (?:by|от|ng|dari) Papamo)?/g,
        () => name
      )

export function useAppName(): string | null {
  return usePartnerBrandingStore(
    (state) =>
      state.branding?.communityName ??
      state.branding?.appName ??
      hostedCommunityBrand()?.name ??
      (hasPartnerPageContext() || !state.resolved ? '' : null)
  )
}
