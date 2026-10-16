export const PCASH_PER_USDT = 100

/** Whole-dollar purchases, entered in P-Cash in the renderer. */
export const usdFromPCash = (value: string): number | null => {
  if (!/^\d+$/.test(value)) return null
  const amount = Number(value)
  return Number.isSafeInteger(amount) &&
    amount >= 100 &&
    amount <= 1_000_000 &&
    amount % PCASH_PER_USDT === 0
    ? amount / PCASH_PER_USDT
    : null
}

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
  manual?: ManualSnapshot
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
  return {
    enabled: data.enabled,
    pCash: data.pCash,
    orders: data.orders.map(parsePaymentOrder),
    ...(data.manual === undefined ? {} : { manual: parseManualSnapshot(data.manual) })
  }
}

export interface ManualMethod {
  id: string
  name: string
  currency: string
  minorPerUsd: number
  accountName: string
  accountNumber: string
  instructions: string
  qrImage: string | null
}
export interface ManualOrder {
  id: string
  methodId: string
  method: Omit<ManualMethod, 'id'>
  amount: number
  pCashAmount: number
  transferMinor: number
  status: 'AWAITING_TRANSFER' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'CANCELLED'
  reference: string | null
  senderName: string | null
  reviewNote: string | null
  createdAt: string
}
export interface ManualSnapshot {
  methods: ManualMethod[]
  orders: ManualOrder[]
}
const text = (value: unknown, max: number): string => {
  if (typeof value !== 'string' || value.length > max) throw new Error('INVALID_PAYMENT_RESPONSE')
  return value
}
const integer = (value: unknown, max: number): number => {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1 || value > max)
    throw new Error('INVALID_PAYMENT_RESPONSE')
  return value
}
const instructions = (value: unknown): Omit<ManualMethod, 'id'> => {
  const m = object(value)
  if (!['USD', 'PHP', 'EUR', 'GBP', 'SGD', 'MYR', 'THB', 'AUD', 'CAD'].includes(String(m.currency)))
    throw new Error('INVALID_PAYMENT_RESPONSE')
  if (
    m.qrImage !== null &&
    (typeof m.qrImage !== 'string' ||
      m.qrImage.length > 350000 ||
      !/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/.test(m.qrImage))
  )
    throw new Error('INVALID_PAYMENT_RESPONSE')
  return {
    name: text(m.name, 60),
    currency: String(m.currency),
    minorPerUsd: integer(m.minorPerUsd, 100000),
    accountName: text(m.accountName, 120),
    accountNumber: text(m.accountNumber, 160),
    instructions: text(m.instructions, 1000),
    qrImage: m.qrImage as string | null
  }
}
export const parseManualOrder = (value: unknown): ManualOrder => {
  const o = object(value)
  if (
    !['AWAITING_TRANSFER', 'SUBMITTED', 'APPROVED', 'REJECTED', 'CANCELLED'].includes(
      String(o.status)
    ) ||
    typeof o.createdAt !== 'string' ||
    !Number.isFinite(Date.parse(o.createdAt))
  )
    throw new Error('INVALID_PAYMENT_RESPONSE')
  const method = instructions(o.method),
    amount = validatePaymentAmount(o.amount)
  if (o.pCashAmount !== amount * PCASH_PER_USDT || o.transferMinor !== amount * method.minorPerUsd)
    throw new Error('INVALID_PAYMENT_RESPONSE')
  return {
    id: validatePaymentId(o.id),
    methodId: validatePaymentId(o.methodId),
    method,
    amount,
    pCashAmount: integer(o.pCashAmount, 1000000),
    transferMinor: integer(o.transferMinor, 1000000000),
    status: o.status as ManualOrder['status'],
    reference: o.reference === null ? null : text(o.reference, 120),
    senderName: o.senderName === null ? null : text(o.senderName, 120),
    reviewNote: o.reviewNote === null ? null : text(o.reviewNote, 500),
    createdAt: o.createdAt
  }
}
export const parseManualSnapshot = (value: unknown): ManualSnapshot => {
  const data = object(value)
  if (
    !Array.isArray(data.methods) ||
    data.methods.length > 20 ||
    !Array.isArray(data.orders) ||
    data.orders.length > 10
  )
    throw new Error('INVALID_PAYMENT_RESPONSE')
  return {
    methods: data.methods.map((value) => {
      const m = object(value)
      return { id: validatePaymentId(m.id), ...instructions(m) }
    }),
    orders: data.orders.map(parseManualOrder)
  }
}
export const validateTransferDetails = (senderName: unknown, reference: unknown) => {
  const sender = text(senderName, 120).trim(),
    ref = text(reference, 120).trim()
  if (!sender || ref.length < 3) throw new Error('INVALID_PAYMENT_DETAILS')
  return { senderName: sender, reference: ref }
}
