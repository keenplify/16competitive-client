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
  'mvp',
  'bombplanted',
  'bombtenseccount',
  'bombtenseccountx',
  'chooseteam',
  'deathcam',
  'endofmatch',
  'legacy_cs_stinger',
  'legacy_deathcam_gg_01',
  'legacy_deathcam_gg_02',
  'legacy_deathcam_gg_03',
  'legacy_deathcam_stinger',
  'legacy_dominating',
  'legacy_finalfight',
  'legacy_kill_01',
  'legacy_kill_02',
  'legacy_kill_03',
  'legacy_kill_bonus',
  'legacy_nemesis',
  'legacy_point_captured_ct',
  'legacy_point_captured_t',
  'legacy_revenge',
  'legacy_survival_review_victory',
  'loading',
  'lostround',
  'mainmenu',
  'mainmenu_02',
  'mainmenu_03',
  'roundmvpanthem_02',
  'roundmvpanthem_03',
  'roundtenseccount',
  'startaction_01',
  'startaction_02',
  'startaction_03',
  'startofmatch',
  'startround_01',
  'startround_02',
  'startround_03',
  'wonround'
] as const
export type MusicTeam = 'ct' | 't'
export type MusicEvent = (typeof MUSIC_EVENTS)[number]
export interface MusicKit {
  id: string
  name: string
  artistName?: string | null
  artistUrl?: string | null
  pricePoints: number
  pointsEnabled?: boolean
  pricePCash?: number | null
  enabled: boolean
  logoPath: string | null
  logoUrl?: string
  bgmPath?: string | null
  bgmUrl?: string
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
const hasControlCharacter = (value: string): boolean =>
  [...value].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)

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
    const artistUrl = parseMusicArtistUrl(k.artistUrl)
    if (
      k.artistName != null &&
      (typeof k.artistName !== 'string' ||
        !k.artistName.trim() ||
        k.artistName.length > 128 ||
        hasControlCharacter(k.artistName))
    )
      throw new Error('INVALID_MUSIC_ARTIST')
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
    if (
      (k.pointsEnabled !== undefined && typeof k.pointsEnabled !== 'boolean') ||
      (k.pricePCash != null &&
        (typeof k.pricePCash !== 'number' ||
          !Number.isSafeInteger(k.pricePCash) ||
          k.pricePCash < 1 ||
          k.pricePCash > 1_000_000))
    )
      throw new Error('INVALID_MUSIC_PRICING')
    const sounds: MusicKit['sounds'] = {}
    for (const [event, path] of Object.entries(k.sounds)) {
      if (
        typeof path !== 'string' ||
        !/^sound\/16competitive\/music\/[a-f0-9]{32}\/audio\.(?:wav|mp3)$/.test(path)
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
    if (
      k.bgmPath != null &&
      (typeof k.bgmPath !== 'string' ||
        ! /^(?:media\/16competitive\/music\/[a-f0-9]{64}\/bgm\.(?:mp3|wav)|sound\/16competitive\/music\/[a-f0-9]{32}\/audio\.wav)$/.test(k.bgmPath))
    )
      throw new Error('INVALID_MUSIC_BGM')
    return {
      id,
      name: k.name,
      artistName: typeof k.artistName === 'string' ? k.artistName : null,
      artistUrl,
      pricePoints: k.pricePoints,
      pointsEnabled: k.pointsEnabled !== false,
      pricePCash: typeof k.pricePCash === 'number' ? k.pricePCash : null,
      enabled: k.enabled,
      sounds,
      logoPath: k.logoPath,
      bgmPath: typeof k.bgmPath === 'string' ? k.bgmPath : null
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

export function parseMusicArtistUrl(value: unknown): string | null {
  if (value == null) return null
  if (typeof value !== 'string' || value.length > 2048 || hasControlCharacter(value))
    throw new Error('INVALID_MUSIC_ARTIST_URL')
  try {
    const url = new URL(value)
    if (
      !['https:', 'http:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.href.length > 2048
    )
      throw new Error()
    return url.href
  } catch {
    throw new Error('INVALID_MUSIC_ARTIST_URL')
  }
}
export function musicKitLogoUrls(snapshot: MusicKitSnapshot, apiUrl: string): MusicKitSnapshot {
  return {
    ...snapshot,
    kits: snapshot.kits.map((kit) => ({
      ...kit,
      logoUrl: kit.logoPath ? new URL(`/fastdl/${kit.logoPath}`, apiUrl).toString() : undefined,
      bgmUrl: kit.bgmPath ? new URL(`/fastdl/${kit.bgmPath}`, apiUrl).toString() : undefined
    }))
  }
}

export function validateMusicTeam(team: unknown): MusicTeam {
  if (team !== 'ct' && team !== 't') throw new Error('INVALID_MUSIC_TEAM')
  return team
}

export type MusicCurrency = 'POINTS' | 'P_CASH'
export function validateMusicBuy(
  expectedPrice: unknown,
  currency: unknown = 'POINTS'
): { expectedPrice: number; currency: MusicCurrency } {
  if (
    typeof expectedPrice !== 'number' ||
    !Number.isSafeInteger(expectedPrice) ||
    expectedPrice < 0 ||
    expectedPrice > 1_000_000
  )
    throw new Error('INVALID_MUSIC_PRICE')
  if (currency !== 'POINTS' && currency !== 'P_CASH') throw new Error('INVALID_MUSIC_CURRENCY')
  return { expectedPrice, currency }
}
export function parseMusicPurchase(result: unknown): { points: number; pCash?: number } {
  if (typeof result !== 'object' || !result) throw new Error('INVALID_MUSIC_BALANCE')
  const value = result as Record<string, unknown>
  if (
    typeof value.points !== 'number' ||
    !Number.isSafeInteger(value.points) ||
    value.points < 0 ||
    (value.pCash !== undefined &&
      (typeof value.pCash !== 'number' || !Number.isSafeInteger(value.pCash)))
  )
    throw new Error('INVALID_MUSIC_BALANCE')
  return {
    points: value.points,
    ...(typeof value.pCash === 'number' ? { pCash: value.pCash } : {})
  }
}

/** A preview lists only files present in the selected kit. */
export function musicKitEvents(kit: MusicKit): MusicEvent[] {
  return MUSIC_EVENTS.filter((event) => Boolean(kit.sounds[event]))
}
export function musicKitPreviewEvent(kit: MusicKit, requested: MusicEvent): MusicEvent | undefined {
  const available = musicKitEvents(kit)
  return available.includes(requested)
    ? requested
    : available.includes('mvp')
      ? 'mvp'
      : available[0]
}
