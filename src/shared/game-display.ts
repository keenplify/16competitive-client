export interface GameResolution {
  width: number
  height: number
}

export const GAME_RESOLUTION_PRESETS = [
  [640, 480],
  [800, 600],
  [1024, 768],
  [1152, 864],
  [1280, 960],
  [1280, 1024],
  [1600, 1200],
  [1280, 720],
  [1366, 768],
  [1440, 900],
  [1600, 900],
  [1680, 1050],
  [1920, 1080],
  [1920, 1200],
  [2560, 1440],
  [2560, 1600],
  [3840, 2160]
] as const

export interface GameDisplayPreferences {
  resolution: string
  widescreen: boolean
}

export function isWidescreen(resolution: GameResolution): boolean {
  return resolution.width / resolution.height > 1.5
}

export function defaultGameDisplayPreferences(current: GameResolution): GameDisplayPreferences {
  return { resolution: 'current', widescreen: isWidescreen(current) }
}

export function parseGameDisplayPreferences(value: unknown): GameDisplayPreferences {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error('Invalid game display preferences')
  const input = value as Record<string, unknown>
  if (typeof input.widescreen !== 'boolean' || typeof input.resolution !== 'string')
    throw new Error('Invalid game display preferences')
  if (input.resolution !== 'current') {
    const mode = GAME_RESOLUTION_PRESETS.find(
      ([width, height]) => `${width}x${height}` === input.resolution
    )
    if (!mode || isWidescreen({ width: mode[0], height: mode[1] }) !== input.widescreen)
      throw new Error('Invalid game resolution')
  }
  return { resolution: input.resolution, widescreen: input.widescreen }
}

export function resolveGameResolution(
  preferences: GameDisplayPreferences,
  current: GameResolution,
  game: 'cs13' | 'cs16' = 'cs16'
): GameResolution {
  const settings = parseGameDisplayPreferences(preferences)
  if (
    ![current.width, current.height].every(
      (value) => Number.isInteger(value) && value >= 320 && value <= 16384
    )
  )
    throw new Error('Invalid display resolution')
  let requested: GameResolution
  if (settings.resolution !== 'current') {
    const [width, height] = settings.resolution.split('x').map(Number)
    requested = { width, height }
  } else if (settings.widescreen || !isWidescreen(current)) {
    requested = { ...current }
  } else {
    // Fit a normal 4:3 viewport inside the current display when widescreen is off.
    requested = { width: Math.floor((current.height * 4) / 3 / 2) * 2, height: current.height }
  }
  if (game === 'cs16') return requested
  // The inspected WON launcher has a fixed 4:3 mode table. Unsupported widths
  // fall back to 400x300; a matching width can ignore a widescreen height.
  const compatible = [
    { width: 640, height: 480 },
    { width: 800, height: 600 },
    { width: 1024, height: 768 },
    { width: 1152, height: 864 },
    { width: 1280, height: 960 }
  ]
  return (
    compatible
      .filter((mode) => mode.width <= requested.width && mode.height <= requested.height)
      .at(-1) ?? compatible[0]
  )
}

export function gameResolutionArgs(resolution: GameResolution, game: 'cs13' | 'cs16'): string[] {
  if (
    ![resolution.width, resolution.height].every(
      (value) => Number.isInteger(value) && value >= 320 && value <= 16384
    )
  )
    throw new Error('Invalid game resolution')
  // Use explicit dimensions. WON also accepts the short switches, but its
  // substring parser can confuse -w with an earlier -windowed argument.
  return game === 'cs13'
    ? ['-width', String(resolution.width), '-height', String(resolution.height)]
    : ['-w', String(resolution.width), '-h', String(resolution.height)]
}
