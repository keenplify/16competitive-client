export const GAME_LAUNCH_PHASES = [
  'checking',
  'assets',
  'downloading',
  'stickers',
  'sticker_download',
  'sticker_bake',
  'starting',
  'ready',
  'error'
] as const

export type GameLaunchPhase = (typeof GAME_LAUNCH_PHASES)[number]
export interface GameLaunchProgress {
  phase: GameLaunchPhase
  completed: number
  total: number
}

export function parseGameLaunchProgress(value: unknown): GameLaunchProgress | null {
  if (!value || typeof value !== 'object') return null
  const { phase, completed, total } = value as Record<string, unknown>
  if (
    !GAME_LAUNCH_PHASES.includes(phase as GameLaunchPhase) ||
    typeof completed !== 'number' ||
    typeof total !== 'number' ||
    !Number.isSafeInteger(completed) ||
    !Number.isSafeInteger(total) ||
    completed < 0 ||
    total < completed ||
    total > 20000
  )
    return null
  return { phase: phase as GameLaunchPhase, completed, total }
}
