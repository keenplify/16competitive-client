import { createHash } from 'node:crypto'

/** The match server derives the same key from competitive_match_id. */
export const matchJoinInfoKey = (matchId: string): string =>
  `_16c_${createHash('sha256').update(matchId, 'utf8').digest('hex').slice(0, 16)}`

export const matchJoinLaunchArgs = (matchId: string, token: string): string[] => [
  '+setinfo',
  matchJoinInfoKey(matchId),
  token
]

const MATCH_KEY_PATTERN = /\b_16c_[0-9a-f]{16}\b/g

/** Read only launcher-managed key names from the launcher-owned match cfg. */
export const matchJoinKeysInConfig = (contents: string): string[] => [
  ...new Set(contents.match(MATCH_KEY_PATTERN) ?? [])
]

export const matchJoinCleanupConfig = (keys: readonly string[]): string =>
  [...keys.map((key) => `setinfo "${key}" ""`), ''].join('\n')
