import type { CustomGameMode } from '../../../../shared/custom-games'

const winterMaps = new Set(['cs_office', 'aim_glacier', 'fy_iceworld2k'])

export function customModeLabel(mode: CustomGameMode, mapId: string) {
  return mode === 'ffa' && winterMaps.has(mapId)
    ? 'warmup.tab'
    : (`customRoom.mode.${mode}` as const)
}
