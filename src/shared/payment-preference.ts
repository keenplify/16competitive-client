/** Country/locale hints affect presentation only, never price or settlement. */
export function preferredPaymentProvider(
  country: string | null | undefined,
  timeZone: string,
  languages: readonly string[]
): 'paymongo' | 'paymento' {
  if (
    country?.toUpperCase() === 'PH' ||
    timeZone === 'Asia/Manila' ||
    languages.some(
      (language) => /(?:^|-)PH(?:-|$)/i.test(language) || /^(?:fil|tl)(?:-|$)/i.test(language)
    )
  )
    return 'paymongo'
  return 'paymento'
}
