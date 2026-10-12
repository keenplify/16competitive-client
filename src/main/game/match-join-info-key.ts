import { createHash } from 'node:crypto'

/** Standard GoldSrc executes the managed cfg explicitly after startup.
 * NextClient must use its native/userconfig handoff because +exec can crash it.
 */
export const matchConfigLaunchArgs = (configName: string, nextClient: boolean): string[] =>
  nextClient ? [] : ['+exec', configName]

/** The match server derives the same key from competitive_match_id. */
export const matchJoinInfoKey = (matchId: string): string =>
  `_16c_${createHash('sha256').update(matchId, 'utf8').digest('hex').slice(0, 16)}`

export const matchJoinLaunchArgs = (
  matchId: string,
  token: string,
  handoff: 'userconfig' | 'native-nextclient' | 'startup-exec' = 'userconfig'
): string[] =>
  // The native host applies and verifies identity after profile loading.
  // NextClient executes command-line setinfo before that profile reload.
  // Standard clients apply credentials in the cfg, after clearing stale keys.
  // An early +setinfo can fill legacy clients' 256-byte userinfo buffer before
  // the server password is inserted.
  handoff === 'userconfig' ? ['+setinfo', matchJoinInfoKey(matchId), token] : []

/** Counter-Strike uses server-selected player models, not Half-Life's userinfo
 * model/color preferences. Remove only these unused fields from the running
 * session to leave room for the match token and password on legacy clients.
 * Never inspect or edit the player's saved configuration.
 */
export const matchJoinInfoCleanupCommands = (keys: readonly string[]): string[] =>
  [...new Set(['_16c', ...keys, 'model', 'topcolor', 'bottomcolor'])].map(
    (key) => `setinfo "${key}" ""`
  )

const MATCH_KEY_PATTERN = /\b_16c_[0-9a-f]{16}\b/g

/** Read only launcher-managed key names from the launcher-owned match cfg. */
export const matchJoinKeysInConfig = (contents: string): string[] => [
  ...new Set(contents.match(MATCH_KEY_PATTERN) ?? [])
]

export const matchJoinCleanupConfig = (keys: readonly string[]): string =>
  [...keys.map((key) => `setinfo "${key}" ""`), ''].join('\n')
