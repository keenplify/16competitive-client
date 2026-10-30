export const MUSIC_EVENTS = [
  'firstblood',
  'headshot',
  'humiliation',
  'doublekill',
  'triplekill',
  'quadrakill',
  'pentakill',
  'killingspree',
  'rampage',
  'dominating',
  'unstoppable',
  'godlike',
  'mvp'
] as const
export type MusicTeam = 'ct' | 't'
export type MusicEvent = (typeof MUSIC_EVENTS)[number]
export interface MusicKit {
  id: string
  name: string
  pricePoints: number
  enabled: boolean
  logoPath: string | null
  logoUrl?: string
  sounds: Partial<Record<MusicEvent, string>>
}
export interface MusicKitSnapshot {
  kits: MusicKit[]
  ownedIds: string[]
  equipped: Record<MusicTeam, string | null>
}
export function validateMusicKitId(id: unknown): string {
  if (typeof id !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,47}$/.test(id))
    throw new Error('INVALID_MUSIC_KIT')
  return id
}
export function validateMusicEvent(event: unknown): MusicEvent {
  if (typeof event !== 'string' || !(MUSIC_EVENTS as readonly string[]).includes(event))
    throw new Error('INVALID_MUSIC_EVENT')
  return event as MusicEvent
}
export function parseMusicKits(value: unknown): MusicKitSnapshot {
  if (typeof value !== 'object' || !value) throw new Error('INVALID_MUSIC_KITS')
  const s = value as Record<string, unknown>
  if (
    !Array.isArray(s.kits) ||
    s.kits.length > 1000 ||
    !Array.isArray(s.ownedIds) ||
    s.ownedIds.length > 1000
  )
    throw new Error('INVALID_MUSIC_KITS')
  const kits = s.kits.map((value: unknown): MusicKit => {
    if (typeof value !== 'object' || !value) throw new Error('INVALID_MUSIC_KITS')
    const k = value as Record<string, unknown>
    const id = validateMusicKitId(k.id)
    if (
      typeof k.name !== 'string' ||
      !k.name.trim() ||
      k.name.length > 128 ||
      typeof k.pricePoints !== 'number' ||
      !Number.isSafeInteger(k.pricePoints) ||
      k.pricePoints < 0 ||
      k.pricePoints > 1_000_000 ||
      typeof k.enabled !== 'boolean' ||
      typeof k.sounds !== 'object' ||
      !k.sounds ||
      Array.isArray(k.sounds)
    )
      throw new Error('INVALID_MUSIC_KITS')
    const sounds: MusicKit['sounds'] = {}
    for (const [event, path] of Object.entries(k.sounds)) {
      if (
        typeof path !== 'string' ||
        !/^sound\/16competitive\/music\/[a-f0-9]{32}\/audio\.wav$/.test(path)
      )
        throw new Error('INVALID_MUSIC_SOUND')
      sounds[validateMusicEvent(event)] = path
    }
    if (
      k.logoPath !== null &&
      (typeof k.logoPath !== 'string' ||
        !/^media\/16competitive\/music\/[a-f0-9]{64}\/logo\.png$/.test(k.logoPath))
    )
      throw new Error('INVALID_MUSIC_LOGO')
    return {
      id,
      name: k.name,
      pricePoints: k.pricePoints,
      enabled: k.enabled,
      sounds,
      logoPath: k.logoPath
    }
  })
  const ownedIds = s.ownedIds.map(validateMusicKitId)
  if (typeof s.equipped !== 'object' || !s.equipped) throw new Error('INVALID_MUSIC_KITS')
  const raw = s.equipped as Record<string, unknown>
  const equipped = {
    ct: raw.ct === null ? null : validateMusicKitId(raw.ct),
    t: raw.t === null ? null : validateMusicKitId(raw.t)
  }
  if (
    new Set(kits.map((k) => k.id)).size !== kits.length ||
    Object.values(equipped).some(
      (id) => id !== null && (!ownedIds.includes(id) || !kits.some((k) => k.id === id))
    )
  )
    throw new Error('INVALID_MUSIC_KITS')
  return { kits, equipped, ownedIds }
}
export function musicKitLogoUrls(snapshot: MusicKitSnapshot, apiUrl: string): MusicKitSnapshot {
  return {
    ...snapshot,
    kits: snapshot.kits.map((kit) => ({
      ...kit,
      logoUrl: kit.logoPath ? new URL(`/fastdl/${kit.logoPath}`, apiUrl).toString() : undefined
    }))
  }
}

export function validateMusicTeam(team: unknown): MusicTeam {
  if (team !== 'ct' && team !== 't') throw new Error('INVALID_MUSIC_TEAM')
  return team
}
