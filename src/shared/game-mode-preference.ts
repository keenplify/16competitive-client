import { gameForMode, type GameVersion } from './game-version'

/** Keep an explicit game selected while its maps/helper are unavailable. */
export function gameModeFallback<T extends string>(
  modes: readonly T[],
  available: readonly T[],
  preferred: GameVersion | null
): T | undefined {
  return (
    available.find((mode) => !preferred || gameForMode(mode) === preferred) ??
    (preferred ? modes.find((mode) => gameForMode(mode) === preferred) : undefined)
  )
}
