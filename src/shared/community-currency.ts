/**
 * Community-localized PCash display.
 *
 * A partner may peg PCash to a local currency (e.g. Philippine Peso) for their
 * community. Members then see converted local amounts everywhere PCash is
 * shown. Local amounts are integer minor units of a 2-decimal scale
 * (PHP 20.00 -> 2000) and the rate is carried as micro units
 * (1 PCash = 4.00 PHP -> 4_000_000), mirroring the backend conversion in
 * 16competitive/src/pcash/community-currency.ts.
 */

/** Member-facing currency config; null when the community has no peg. */
export interface CommunityCurrency {
  code: string
  symbol: string
  name: string
  prioritizeLocal: boolean
  localPerPcashMicros: number
}

export interface BetCurrencyPreset {
  localMinor: number
  pcash: number
}

/** Bet-window currency payload returned by the p-cash-bet snapshot. */
export interface PCashBetCurrency extends CommunityCurrency {
  presets: BetCurrencyPreset[]
  custom: { enabled: boolean }
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object'
const isInteger = (value: unknown, max: number): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0 && value <= max
const isText = (value: unknown, max = 32): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= max

/** Validate untrusted currency config payloads from IPC / the backend. */
export function parseCommunityCurrency(value: unknown): CommunityCurrency | null {
  if (value === null) return null
  if (
    !isObject(value) ||
    !isText(value.code, 3) ||
    !isText(value.symbol, 8) ||
    !isText(value.name, 64) ||
    typeof value.prioritizeLocal !== 'boolean' ||
    !isInteger(value.localPerPcashMicros, 1_000_000_000_000)
  )
    throw new Error('INVALID_CURRENCY_PAYLOAD')
  return value as unknown as CommunityCurrency
}

export function parsePCashBetCurrency(value: unknown): PCashBetCurrency | null {
  if (value === null) return null
  const base = parseCommunityCurrency(value)
  if (
    !base ||
    !isObject(value) ||
    !Array.isArray(value.presets) ||
    value.presets.length > 8 ||
    !isObject(value.custom) ||
    typeof value.custom.enabled !== 'boolean'
  )
    throw new Error('INVALID_CURRENCY_PAYLOAD')
  for (const preset of value.presets) {
    if (
      !isObject(preset) ||
      !isInteger(preset.localMinor, 100_000_000) ||
      !isInteger(preset.pcash, 1_000_000)
    )
      throw new Error('INVALID_CURRENCY_PAYLOAD')
  }
  return value as unknown as PCashBetCurrency
}

/** PCash -> local minor units, rounding half up. Mirrors the backend. */
export function pcashToLocalMinor(pcash: number, localPerPcashMicros: number): number {
  if (!Number.isSafeInteger(pcash) || pcash < 0) return 0
  const micros = BigInt(Math.round(localPerPcashMicros))
  if (micros <= 0n) return 0
  return Number((BigInt(pcash) * micros + 5000n) / 10_000n)
}

/** Local minor units -> PCash, rounding half up. Mirrors the backend. */
export function localMinorToPcash(localMinor: number, localPerPcashMicros: number): number {
  if (!Number.isSafeInteger(localMinor) || localMinor < 0) return 0
  const micros = BigInt(Math.round(localPerPcashMicros))
  if (micros <= 0n) return 0
  return Number((BigInt(localMinor) * 10_000n + micros / 2n) / micros)
}

/** Format a local minor-unit amount: ₱1,400.00 (always 2 decimals). */
export function formatLocalMinor(localMinor: number, symbol: string, locale = 'en'): string {
  const units = localMinor / 100
  const formatted = units.toLocaleString(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })
  return `${symbol}${formatted}`
}

/** Format a PCash amount the way the launcher shows it today. */
export function formatPCash(pcash: number, locale = 'en'): string {
  return pcash.toLocaleString(locale)
}

/**
 * Prioritized pair for a PCash amount: the local amount leads and the PCash
 * value follows in parentheses, e.g. { primary: '₱1,400.00', secondary: '350 PCash' }.
 */
export function formatPCashPair(
  pcash: number,
  currency: Pick<CommunityCurrency, 'symbol' | 'localPerPcashMicros'>,
  locale = 'en'
): { primary: string; secondary: string } {
  return {
    primary: formatLocalMinor(
      pcashToLocalMinor(pcash, currency.localPerPcashMicros),
      currency.symbol,
      locale
    ),
    secondary: `${formatPCash(pcash, locale)} PCash`
  }
}
