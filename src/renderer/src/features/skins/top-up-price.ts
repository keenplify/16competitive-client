import type { ManualMethod } from '../../../../shared/payments'

export function topUpPrice(
  usd: number,
  method: ManualMethod | undefined,
  language: string
): string {
  return method
    ? new Intl.NumberFormat(language, { style: 'currency', currency: method.currency }).format(
        (usd * method.minorPerUsd) / 100
      )
    : `${usd.toLocaleString(language)} USDT`
}
