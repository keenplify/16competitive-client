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

/** Both initial selection and menu ordering use the available checkout methods. */
export function topUpMethods(
  preferred: 'paymongo' | 'paymento',
  priority: string | null | undefined,
  snapshot: import('./payments').PaymentSnapshot | null
) {
  const providers = (
    preferred === 'paymongo' ? ['paymongo', 'paymento'] : ['paymento', 'paymongo']
  ).map((id) => ({
    id,
    label: id === 'paymongo' ? 'PayMongo · PHP' : 'Paymento · USDT',
    disabled: id === 'paymongo' ? !snapshot?.paymongo?.enabled : !snapshot?.enabled
  }))
  const methods = [
    ...providers,
    ...(snapshot?.manual?.methods ?? []).map((method) => ({
      id: method.id,
      label: method.name + ' · ' + method.currency,
      disabled: false
    }))
  ]
  const first = methods.find((method) => method.id === priority && !method.disabled)
  return first ? [first, ...methods.filter((method) => method !== first)] : methods
}
