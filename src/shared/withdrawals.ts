export type WithdrawalField = {
  key: string
  label: string
  required: boolean
  maxLength: number
  placeholder?: string
}

export type WithdrawalChannel = {
  id: string
  name: string
  iconDataUrl: string | null
  instructions: string
  fields: WithdrawalField[]
}

export type WithdrawalAccount = {
  channelId: string
  details: Record<string, string>
}

export type WithdrawalOptions = {
  enabled: boolean
  balancePCash: number
  pCashPerUsd: number
  channels: WithdrawalChannel[]
  account: WithdrawalAccount | null
}

export type WithdrawalStatus = 'REQUESTED' | 'PENDING' | 'SENT' | 'PAID' | 'CANCELLED'

export type WithdrawalRequest = {
  id: string
  amountUsdCents: number
  status: WithdrawalStatus
  channel: string
  destination: string
  reference: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
}

export type CreateWithdrawalInput = {
  amountPCash: number
  channelId: string
  details: Record<string, string>
  requestKey: string
}

export type WithdrawalResult = {
  payout: WithdrawalRequest
  account: WithdrawalAccount
  balancePCash: number
}

const uuidPattern = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i
const statuses: readonly WithdrawalStatus[] = ['REQUESTED', 'PENDING', 'SENT', 'PAID', 'CANCELLED']
const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('INVALID_WITHDRAWAL_RESPONSE')
  return value as Record<string, unknown>
}
const safeInteger = (value: unknown, min: number, max: number): number => {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max)
    throw new Error('INVALID_WITHDRAWAL_RESPONSE')
  return value
}
const text = (value: unknown, max: number): string => {
  if (typeof value !== 'string' || value.length > max) throw new Error('INVALID_WITHDRAWAL_RESPONSE')
  return value
}
const optionalText = (value: unknown): string | null => {
  if (value === null || value === undefined) return null
  if (typeof value !== 'string') throw new Error('INVALID_WITHDRAWAL_RESPONSE')
  return value
}
export const validateWithdrawalId = (value: unknown): string => {
  if (typeof value !== 'string' || !uuidPattern.test(value)) throw new Error('INVALID_WITHDRAWAL_REQUEST')
  return value
}
export const validateWithdrawalAmount = (value: unknown): number => {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1 || value > 2_147_483_647)
    throw new Error('INVALID_WITHDRAWAL_AMOUNT')
  return value
}
export const validateWithdrawalDetails = (value: unknown): Record<string, string> => {
  const data = object(value)
  const entries = Object.entries(data)
  if (entries.length > 20) throw new Error('INVALID_WITHDRAWAL_ACCOUNT')
  const details: Record<string, string> = {}
  for (const [key, raw] of entries) {
    if (!/^[a-zA-Z][a-zA-Z0-9_]{0,39}$/.test(key) || typeof raw !== 'string' || raw.length > 200)
      throw new Error('INVALID_WITHDRAWAL_ACCOUNT')
    details[key] = raw
  }
  return details
}
export const validateCreateWithdrawal = (value: unknown): CreateWithdrawalInput => {
  const data = object(value)
  return {
    amountPCash: validateWithdrawalAmount(data.amountPCash),
    channelId: validateWithdrawalId(data.channelId),
    details: validateWithdrawalDetails(data.details),
    requestKey: validateWithdrawalId(data.requestKey)
  }
}

const parseField = (value: unknown): WithdrawalField => {
  const field = object(value)
  return {
    key: text(field.key, 40),
    label: text(field.label, 80),
    required: field.required !== false,
    maxLength: safeInteger(field.maxLength ?? 120, 1, 200),
    ...(typeof field.placeholder === 'string' ? { placeholder: text(field.placeholder, 120) } : {})
  }
}
const parseChannel = (value: unknown): WithdrawalChannel => {
  const channel = object(value)
  if (!Array.isArray(channel.fields)) throw new Error('INVALID_WITHDRAWAL_RESPONSE')
  if (channel.iconDataUrl !== null && channel.iconDataUrl !== undefined && typeof channel.iconDataUrl !== 'string')
    throw new Error('INVALID_WITHDRAWAL_RESPONSE')
  return {
    id: validateWithdrawalId(channel.id),
    name: text(channel.name, 80),
    iconDataUrl: typeof channel.iconDataUrl === 'string' ? text(channel.iconDataUrl, 360000) : null,
    instructions: typeof channel.instructions === 'string' ? text(channel.instructions, 1000) : '',
    fields: channel.fields.map(parseField)
  }
}
const parseAccount = (value: unknown): WithdrawalAccount => {
  const account = object(value)
  return {
    channelId: validateWithdrawalId(account.channelId),
    details: validateWithdrawalDetails(account.details)
  }
}
const parseRequest = (value: unknown): WithdrawalRequest => {
  const request = object(value)
  if (!statuses.includes(request.status as WithdrawalStatus)) throw new Error('INVALID_WITHDRAWAL_RESPONSE')
  return {
    id: validateWithdrawalId(request.id),
    amountUsdCents: safeInteger(request.amountUsdCents, 1, 2_147_483_647),
    status: request.status as WithdrawalStatus,
    channel: text(request.channel, 80),
    destination: text(request.destination, 2000),
    reference: optionalText(request.reference),
    notes: optionalText(request.notes),
    createdAt: text(request.createdAt, 64),
    updatedAt: text(request.updatedAt, 64)
  }
}
export const parseWithdrawalOptions = (value: unknown): WithdrawalOptions => {
  const options = object(value)
  if (!Array.isArray(options.channels)) throw new Error('INVALID_WITHDRAWAL_RESPONSE')
  return {
    enabled: options.enabled === true,
    balancePCash: safeInteger(options.balancePCash, -2_147_483_648, 2_147_483_647),
    pCashPerUsd: safeInteger(options.pCashPerUsd, 1, 1_000_000),
    channels: options.channels.map(parseChannel),
    account: options.account === null || options.account === undefined ? null : parseAccount(options.account)
  }
}
export const parseWithdrawalHistory = (value: unknown): WithdrawalRequest[] => {
  const data = object(value)
  if (!Array.isArray(data.requests)) throw new Error('INVALID_WITHDRAWAL_RESPONSE')
  return data.requests.map(parseRequest)
}
export const parseWithdrawalResult = (value: unknown): WithdrawalResult => {
  const data = object(value)
  return {
    payout: parseRequest(data.payout),
    account: parseAccount(data.account),
    balancePCash: safeInteger(data.balancePCash, -2_147_483_648, 2_147_483_647)
  }
}
