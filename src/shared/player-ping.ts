export const PLAYER_PING_KEYS = [
  'MOUSE3',
  'MOUSE4',
  'MOUSE5',
  'B',
  'F',
  'G',
  'H',
  'J',
  'L',
  'N',
  'P',
  'X',
  'Z',
  'NONE'
] as const
export type PlayerPingKey = (typeof PLAYER_PING_KEYS)[number]
export const DEFAULT_PLAYER_PING_KEY: PlayerPingKey = 'MOUSE3'

export function parsePlayerPingKey(value: unknown): PlayerPingKey {
  if (typeof value === 'string' && PLAYER_PING_KEYS.includes(value as PlayerPingKey))
    return value as PlayerPingKey
  throw new Error('Invalid player ping key')
}

export function playerPingCommands(value: unknown): string[] {
  const key = parsePlayerPingKey(value)
  return key === 'NONE' ? [] : [`bind "${key}" "cmd 16competitive_ping"`]
}
