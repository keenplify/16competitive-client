export type GameVersion = 'cs16' | 'cs13'

export function parseGameVersion(value: unknown = 'cs16'): GameVersion {
  if (value !== 'cs16' && value !== 'cs13') throw new Error('Invalid game version')
  return value
}

export function gameForMode(mode: string | null | undefined): GameVersion {
  return mode === 'cs13_3v3' || mode === 'cs13_1v1' ? 'cs13' : 'cs16'
}

export function supportsWeapon(game: GameVersion, weapon: string): boolean {
  return game === 'cs16' || !['famas', 'galil', 'shield', 'player_ct', 'player_t'].includes(weapon)
}
