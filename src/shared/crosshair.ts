export interface CrosshairProfile {
  version: 1
  color: string
  size: number
  gap: number
  thickness: number
  outline: number
  opacity: number
  dot: boolean
  dynamic: boolean
}

export const DEFAULT_CROSSHAIR: CrosshairProfile = {
  version: 1,
  color: '#50FF62',
  size: 8,
  gap: 4,
  thickness: 2,
  outline: 1,
  opacity: 100,
  dot: false,
  dynamic: false
}

export function parseCrosshairProfile(input: unknown): CrosshairProfile {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new Error('Crosshair file must contain a profile object.')
  }
  const value = input as Record<string, unknown>
  const boundedInteger = (key: string, minimum: number, maximum: number): number => {
    const number = value[key]
    if (
      typeof number !== 'number' ||
      !Number.isInteger(number) ||
      number < minimum ||
      number > maximum
    ) {
      throw new Error(`Crosshair ${key} must be between ${minimum} and ${maximum}.`)
    }
    return number
  }
  if (value.version !== 1) throw new Error('Unsupported crosshair file version.')
  if (typeof value.color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(value.color)) {
    throw new Error('Crosshair color must be a six-digit hex value.')
  }
  if (typeof value.dot !== 'boolean' || typeof value.dynamic !== 'boolean') {
    throw new Error('Crosshair dot and dynamic values must be true or false.')
  }
  return {
    version: 1,
    color: value.color.toUpperCase(),
    size: boundedInteger('size', 1, 24),
    gap: boundedInteger('gap', 0, 24),
    thickness: boundedInteger('thickness', 1, 8),
    outline: boundedInteger('outline', 0, 4),
    opacity: boundedInteger('opacity', 10, 100),
    dot: value.dot,
    dynamic: value.dynamic
  }
}
