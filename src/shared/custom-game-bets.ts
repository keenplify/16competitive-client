import { parseCommunityCurrency, type CommunityCurrency } from './community-currency'

/**
 * Per-team betting config for custom games, as offered to a member of a
 * community that enabled it. Null means the player's community does not offer
 * custom-game betting, or the player has no community at all.
 */
export interface CustomGameBetting {
  enabled: true
  currency: CommunityCurrency
  presets: { localMinor: number; pcash: number }[]
  custom: { enabled: boolean }
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object'
const isInteger = (value: unknown, max: number): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0 && value <= max

/** Validate the untrusted betting payload from the room list endpoint. */
export function parseCustomGameBetting(value: unknown): CustomGameBetting | null {
  if (value === null) return null
  if (
    !isObject(value) ||
    value.enabled !== true ||
    !Array.isArray(value.presets) ||
    value.presets.length > 8 ||
    !isObject(value.custom) ||
    typeof value.custom.enabled !== 'boolean'
  )
    throw new Error('INVALID_CUSTOM_GAME_BETTING')
  const currency = parseCommunityCurrency(value.currency)
  if (!currency) throw new Error('INVALID_CUSTOM_GAME_BETTING')
  for (const preset of value.presets) {
    if (
      !isObject(preset) ||
      !isInteger(preset.localMinor, 100_000_000) ||
      !isInteger(preset.pcash, 1_000_000)
    )
      throw new Error('INVALID_CUSTOM_GAME_BETTING')
  }
  return value as unknown as CustomGameBetting
}

/** A player's rounded share of a team stake; 0 means they do not bet. */
export function teamShareFor(teamStakePCash: number, teamSize: number): number {
  if (!Number.isSafeInteger(teamStakePCash) || teamStakePCash < 1) return 0
  if (!Number.isSafeInteger(teamSize) || teamSize < 1) return 0
  return Math.round(teamStakePCash / teamSize)
}
