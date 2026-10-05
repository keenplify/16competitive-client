import {
  decodeCrosshairShareCode,
  encodeCrosshair,
  type Crosshair,
  type CrosshairV1
} from 'csgo-sharecode'

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
  /** A current CS2 crosshair code. When present it owns the exact native settings. */
  shareCode?: string
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

const bounded = (value: number, minimum: number, maximum: number): number =>
  Math.max(minimum, Math.min(maximum, Math.round(value)))

const hexColor = (red: number, green: number, blue: number): string =>
  `#${[red, green, blue].map((value) => bounded(value, 0, 255).toString(16).padStart(2, '0')).join('')}`.toUpperCase()

const CURRENT_CS2_DEFAULT: CrosshairV1 = {
  format: 'cs2-v1',
  style: 4,
  followRecoil: false,
  centerDotEnabled: false,
  tStyleEnabled: false,
  outlineMode: 0,
  red: 50,
  green: 250,
  blue: 50,
  alpha: 255,
  outlineRed: 0,
  outlineGreen: 0,
  outlineBlue: 0,
  outlineAlpha: 255,
  gap: 0,
  length: 4,
  thickness: 1,
  dynamicSpreadLimit: 255,
  splitDistance: 3,
  innerSplitAlpha: 1,
  outerSplitAlpha: 0.5,
  splitSizeRatio: 0.35,
  screenHeight: 1080,
  scopeDotScale: 1,
  scopeDotUseCrosshairColor: false
}

function toCurrentCs2(value: Crosshair): CrosshairV1 {
  if (value.format === 'cs2-v1') return value
  if (value.format === 'legacy-v1') {
    // CS:GO's palette selection overrides the RGB fields unless "Custom" (5)
    // is selected. Preset codes commonly carry 255/255/255 in those fields.
    const preset = [
      [255, 0, 0],
      [0, 255, 0],
      [255, 255, 0],
      [0, 0, 255],
      [0, 255, 255]
    ][value.color]
    const [red, green, blue] = preset ?? [value.red, value.green, value.blue]
    return {
      ...CURRENT_CS2_DEFAULT,
      style: bounded(value.style, 0, 5),
      followRecoil: value.followRecoil,
      centerDotEnabled: value.centerDotEnabled,
      tStyleEnabled: value.tStyleEnabled,
      outlineMode: value.outlineEnabled ? 1 : 0,
      red,
      green,
      blue,
      alpha: value.alphaEnabled ? value.alpha : 255,
      gap: bounded(value.gap, -128, 127),
      length: bounded(value.length, 0, 255),
      thickness: bounded(value.thickness, 0, 255),
      splitDistance: value.splitDistance,
      innerSplitAlpha: value.innerSplitAlpha,
      outerSplitAlpha: value.outerSplitAlpha,
      splitSizeRatio: value.splitSizeRatio
    }
  }
  return {
    ...CURRENT_CS2_DEFAULT,
    ...value,
    format: 'cs2-v1',
    outlineMode: value.format === 'legacy-v3' ? Number(value.outlineEnabled) : value.outlineMode,
    outlineRed: 0,
    outlineGreen: 0,
    outlineBlue: 0,
    outlineAlpha: 255
  }
}

function fromCs2(value: CrosshairV1): CrosshairProfile {
  return {
    version: 1,
    color: hexColor(value.red, value.green, value.blue),
    size: bounded(value.length, 1, 24),
    gap: bounded(value.gap, 0, 24),
    thickness: bounded(value.thickness, 1, 8),
    outline: value.outlineMode ? 1 : 0,
    opacity: bounded((value.alpha * 100) / 255, 10, 100),
    dot: value.centerDotEnabled,
    dynamic: [0, 1, 2, 7].includes(value.style),
    shareCode: encodeCrosshair(value)
  }
}

export function importCrosshairShareCode(input: string): CrosshairProfile {
  const code = input.trim()
  if (
    code.length > 64 ||
    !/^(?:CS[A-Za-z0-9]{44}|CSGO-(?:[A-Za-z0-9]{5}-){4}[A-Za-z0-9]{5})$/.test(code)
  ) {
    throw new Error('Enter a CS2 crosshair code or a CSGO five-group code.')
  }
  try {
    return fromCs2(toCurrentCs2(decodeCrosshairShareCode(code)))
  } catch {
    throw new Error('This crosshair code is invalid or uses an unsupported version.')
  }
}

export function getCs2Crosshair(profile: CrosshairProfile): CrosshairV1 | null {
  if (!profile.shareCode) return null
  const decoded = decodeCrosshairShareCode(profile.shareCode)
  return decoded.format === 'cs2-v1' ? decoded : null
}

export function updateCs2Crosshair(
  profile: CrosshairProfile,
  patch: Partial<CrosshairV1>
): CrosshairProfile {
  const current = getCs2Crosshair(profile)
  if (!current) throw new Error('Import a CS2 code first.')
  return importCrosshairShareCode(encodeCrosshair({ ...current, ...patch, format: 'cs2-v1' }))
}

export function upgradeCrosshairToCs2(profile: CrosshairProfile): CrosshairProfile {
  if (profile.shareCode) return profile
  const parsed = parseCrosshairProfile(profile)
  const [red, green, blue] = [1, 3, 5].map((index) =>
    parseInt(parsed.color.slice(index, index + 2), 16)
  )
  return fromCs2({
    ...CURRENT_CS2_DEFAULT,
    style: parsed.dynamic ? 0 : 4,
    red,
    green,
    blue,
    alpha: Math.round((parsed.opacity * 255) / 100),
    length: parsed.size * 2,
    gap: parsed.gap * 2,
    thickness: parsed.thickness * 2,
    outlineMode: parsed.outline > 0 ? 1 : 0,
    centerDotEnabled: parsed.dot,
    screenHeight: 768
  })
}

export function serializeCrosshairConfig(profile: CrosshairProfile): string {
  const cs2 = getCs2Crosshair(profile)
  if (cs2) {
    return (
      [
        'cs2',
        cs2.red,
        cs2.green,
        cs2.blue,
        cs2.alpha,
        cs2.outlineRed,
        cs2.outlineGreen,
        cs2.outlineBlue,
        cs2.outlineAlpha,
        cs2.style,
        cs2.length,
        cs2.gap,
        cs2.thickness,
        cs2.outlineMode,
        Number(cs2.centerDotEnabled),
        Number(cs2.tStyleEnabled),
        Number(cs2.followRecoil),
        cs2.screenHeight,
        cs2.dynamicSpreadLimit,
        cs2.splitDistance,
        Math.round(cs2.innerSplitAlpha * 100),
        Math.round(cs2.outerSplitAlpha * 100),
        Math.round(cs2.splitSizeRatio * 100),
        Math.round(cs2.scopeDotScale * 100),
        Number(cs2.scopeDotUseCrosshairColor)
      ].join(' ') + '\n'
    )
  }
  const color = [1, 3, 5].map((index) => parseInt(profile.color.slice(index, index + 2), 16))
  return (
    [
      ...color,
      profile.size,
      profile.gap,
      profile.thickness,
      profile.outline,
      profile.opacity,
      Number(profile.dot),
      Number(profile.dynamic)
    ].join(' ') + '\n'
  )
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
  if (value.shareCode !== undefined) {
    if (typeof value.shareCode !== 'string') throw new Error('Crosshair share code must be text.')
    return importCrosshairShareCode(value.shareCode)
  }
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
