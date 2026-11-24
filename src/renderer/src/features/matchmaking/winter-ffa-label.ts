import type { CustomGameMode } from '../../../../shared/custom-games'
import type { MatchmakingMap } from '../../../../shared/matchmaking'

export type RoomModeChoice = CustomGameMode | 'winter_ffa'
const winterMaps = new Set(['cs_office', 'aim_glacier', 'fy_iceworld2k', 'de_dust2_snow'])

export function backendMode(choice: RoomModeChoice): CustomGameMode {
  return choice === 'winter_ffa' ? 'ffa' : choice
}

export function roomModeChoice(mode: CustomGameMode, mapId: string): RoomModeChoice {
  return mode === 'ffa' && winterMaps.has(mapId) ? 'winter_ffa' : mode
}

export function supportsChoice(map: MatchmakingMap, choice: RoomModeChoice): boolean {
  const mode = backendMode(choice)
  return map.customModes.includes(mode) && roomModeChoice(mode, map.id) === choice
}

export function roomModeChoices(modes: CustomGameMode[], maps: MatchmakingMap[]): RoomModeChoice[] {
  return modes.flatMap((mode): RoomModeChoice[] => {
    if (mode !== 'ffa' || !maps.some((map) => supportsChoice(map, 'winter_ffa'))) return [mode]
    return maps.some((map) => supportsChoice(map, 'ffa')) ? ['winter_ffa', 'ffa'] : ['winter_ffa']
  })
}

export function customModeLabel(choice: RoomModeChoice) {
  return choice === 'winter_ffa' ? 'warmup.tab' : (`customRoom.mode.${choice}` as const)
}
