export const PCASH_PER_USDT = 100

export type PaymentStatus = 'CREATING' | 'PENDING' | 'CREDITED' | 'FAILED' | 'EXPIRED' | 'CANCELLED'

export interface PaymentOrder {
  id: string
  amount: number
  pCashAmount: number
  status: PaymentStatus
  providerStatus: string | null
  createdAt: string
  checkoutUrl: string | null
}

export interface PaymentSnapshot {
  enabled: boolean
  pCash: number
  orders: PaymentOrder[]
}

const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('INVALID_PAYMENT_RESPONSE')
  return value as Record<string, unknown>
}

export const validatePaymentId = (id: unknown): string => {
  if (typeof id !== 'string' || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id)) {
    throw new Error('INVALID_PAYMENT_REQUEST')
  }
  return id
}

export const validatePaymentAmount = (amount: unknown): number => {
  if (
    typeof amount !== 'number' ||
    !Number.isSafeInteger(amount) ||
    amount < 1 ||
    amount > 10_000
  ) {
    throw new Error('INVALID_PAYMENT_AMOUNT')
  }
  return amount
}

export const parsePaymentOrder = (value: unknown): PaymentOrder => {
  const data = object(value)
  const id = validatePaymentId(data.id)
  const amount = validatePaymentAmount(data.amount)
  if (
    typeof data.pCashAmount !== 'number' ||
    !Number.isSafeInteger(data.pCashAmount) ||
    data.pCashAmount < 1 ||
    data.pCashAmount > 1_000_000
  ) {
    throw new Error('INVALID_PAYMENT_RESPONSE')
  }
  if (
    !['CREATING', 'PENDING', 'CREDITED', 'FAILED', 'EXPIRED', 'CANCELLED'].includes(
      String(data.status)
    ) ||
    !(data.providerStatus === null || typeof data.providerStatus === 'string') ||
    typeof data.createdAt !== 'string' ||
    !Number.isFinite(Date.parse(data.createdAt))
  ) {
    throw new Error('INVALID_PAYMENT_RESPONSE')
  }
  if (data.checkoutUrl !== null) {
    if (typeof data.checkoutUrl !== 'string') throw new Error('INVALID_PAYMENT_RESPONSE')
    const url = new URL(data.checkoutUrl)
    if (
      url.origin !== 'https://app.paymento.io' ||
      url.pathname !== '/gateway' ||
      url.username ||
      url.password ||
      url.hash ||
      !/^[a-zA-Z0-9_-]{16,200}$/.test(url.searchParams.get('token') ?? '') ||
      [...url.searchParams.keys()].some((key) => key !== 'token') ||
      url.searchParams.getAll('token').length !== 1
    ) {
      throw new Error('INVALID_PAYMENT_RESPONSE')
    }
  }
  return {
    id,
    amount,
    pCashAmount: data.pCashAmount,
    status: data.status as PaymentStatus,
    providerStatus: data.providerStatus as string | null,
    createdAt: data.createdAt,
    checkoutUrl: data.checkoutUrl as string | null
  }
}

export const parsePaymentSnapshot = (value: unknown): PaymentSnapshot => {
  const data = object(value)
  if (
    typeof data.enabled !== 'boolean' ||
    typeof data.pCash !== 'number' ||
    !Number.isSafeInteger(data.pCash) ||
    data.pCash < 0 ||
    !Array.isArray(data.orders) ||
    data.orders.length > 10
  )
    throw new Error('INVALID_PAYMENT_RESPONSE')
  return { enabled: data.enabled, pCash: data.pCash, orders: data.orders.map(parsePaymentOrder) }
}
