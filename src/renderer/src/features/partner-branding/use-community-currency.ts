import { usePartnerBrandingStore } from './partner-branding.store'
import { formatPCashPair, type CommunityCurrency } from '../../../../shared/community-currency'

/** The signed-in account's community currency peg, or null. */
export function useCommunityCurrency(): CommunityCurrency | null {
  return usePartnerBrandingStore((state) => state.currency)
}

/**
 * Inline PCash text for prose contexts. Prioritized communities show the
 * local amount first: '₱1,400.00 (350 PCash)'; everyone else keeps the plain
 * PCash number.
 */
export function formatPCashText(
  pcash: number,
  currency: CommunityCurrency | null,
  locale?: string
): string {
  if (!currency?.prioritizeLocal) return pcash.toLocaleString(locale)
  const { primary, secondary } = formatPCashPair(pcash, currency, locale)
  return `${primary} (${secondary})`
}
