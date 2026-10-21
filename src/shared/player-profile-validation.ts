import type { MatchHistoryEntry, PlayerProfile } from './match-history'
const isNullableInteger = (value: unknown): boolean => value === null || Number.isInteger(value)
const counterKeys = ['kills', 'deaths', 'assists', 'wins', 'losses'] as const
const isCounter = (value: unknown): value is number =>
  Number.isSafeInteger(value) && Number(value) >= 0
const isStatKey = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-z][a-z0-9_]{0,31}$/.test(value)
const isStatLabel = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.trim().length > 0 &&
  new TextEncoder().encode(value).length <= 64 &&
  !Array.from(value).some(
    (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127
  )

const isCustomStats = (value: unknown): boolean => {
  if (typeof value !== 'object' || value === null) return false
  const custom = value as Record<string, unknown>
  if (
    !Array.isArray(custom.categories) ||
    typeof custom.merged !== 'object' ||
    custom.merged === null
  )
    return false
  const totals = { kills: 0, deaths: 0, assists: 0, wins: 0, losses: 0 }
  const categories = new Set<string>()
  for (const raw of custom.categories) {
    if (typeof raw !== 'object' || raw === null) return false
    const category = raw as Record<string, unknown>
    if (
      typeof category.serverId !== 'string' ||
      !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(category.serverId) ||
      !isStatKey(category.key) ||
      !isStatLabel(category.name) ||
      typeof category.mix !== 'boolean' ||
      !(
        category.communityName === null ||
        (typeof category.communityName === 'string' && category.communityName.length <= 64)
      ) ||
      !Array.isArray(category.stats) ||
      category.stats.length < 1 ||
      category.stats.length > 16
    )
      return false
    const id = category.serverId + '/' + category.key
    if (categories.has(id)) return false
    categories.add(id)
    const stats = new Set<string>()
    for (const rawStat of category.stats) {
      if (typeof rawStat !== 'object' || rawStat === null) return false
      const stat = rawStat as Record<string, unknown>
      if (
        !isStatKey(stat.key) ||
        !isStatLabel(stat.label) ||
        !isCounter(stat.value) ||
        stats.has(stat.key)
      )
        return false
      stats.add(stat.key)
      if (category.mix && counterKeys.includes(stat.key as (typeof counterKeys)[number])) {
        const key = stat.key as (typeof counterKeys)[number]
        totals[key] = Math.min(Number.MAX_SAFE_INTEGER, totals[key] + stat.value)
      }
    }
  }
  const merged = custom.merged as Record<string, unknown>
  return counterKeys.every((key) => isCounter(merged[key]) && merged[key] === totals[key])
}
const isEntry = (value: unknown): value is MatchHistoryEntry => {
  if (typeof value !== 'object' || value === null) return false
  const entry = value as Record<string, unknown>
  return (
    typeof entry.id === 'string' &&
    typeof entry.mapId === 'string' &&
    typeof entry.mode === 'string' &&
    typeof entry.winner === 'string' &&
    typeof entry.score === 'string' &&
    typeof entry.completedAt === 'string' &&
    typeof entry.team === 'string' &&
    (entry.result === 'win' || entry.result === 'loss') &&
    typeof entry.kills === 'number' &&
    typeof entry.deaths === 'number' &&
    typeof entry.assists === 'number' &&
    typeof entry.headshots === 'number' &&
    typeof entry.damage === 'number' &&
    typeof entry.headshotPercent === 'number' &&
    typeof entry.adr === 'number' &&
    isNullableInteger(entry.mmrBefore) &&
    isNullableInteger(entry.mmrAfter) &&
    isNullableInteger(entry.mmrChange)
  )
}

const isLoadoutSkin = (value: unknown): boolean => {
  if (typeof value !== 'object' || value === null) return false
  const skin = value as Record<string, unknown>
  return (
    (skin.equipped === undefined || typeof skin.equipped === 'boolean') &&
    ['id', 'name', 'weaponKey', 'gameVersion'].every(
      (key) => typeof skin[key] === 'string' && (skin[key] as string).length <= 256
    )
  )
}

const isActivity = (value: unknown): boolean => {
  if (typeof value !== 'object' || value === null) return false
  const activity = value as Record<string, unknown>
  if (
    !Number.isSafeInteger(activity.total) ||
    Number(activity.total) < 0 ||
    typeof activity.refreshedAt !== 'string' ||
    !Number.isFinite(Date.parse(activity.refreshedAt))
  )
    return false
  return [activity.maps, activity.modes].every((groups) => {
    if (!Array.isArray(groups)) return false
    const ids = new Set<string>()
    let total = 0
    for (const value of groups) {
      if (typeof value !== 'object' || value === null) return false
      const group = value as Record<string, unknown>
      if (
        typeof group.id !== 'string' ||
        group.id.length > 256 ||
        ids.has(group.id) ||
        !Number.isSafeInteger(group.matches) ||
        Number(group.matches) <= 0 ||
        !Number.isSafeInteger(group.wins) ||
        Number(group.wins) < 0 ||
        Number(group.wins) > Number(group.matches)
      )
        return false
      ids.add(group.id)
      total += Number(group.matches)
    }
    return total === activity.total
  })
}

const isPartnerLevel = (value: unknown): boolean => {
  if (typeof value !== 'object' || value === null) return false
  const level = value as Record<string, unknown>
  return (
    typeof level.partnerId === 'string' &&
    level.partnerId.length <= 36 &&
    (level.communityName === null ||
      (typeof level.communityName === 'string' && level.communityName.length <= 64)) &&
    typeof level.sourceName === 'string' &&
    level.sourceName.length <= 64 &&
    typeof level.rank === 'string' &&
    level.rank.length <= 64 &&
    ['level', 'xp', 'prestige', 'playtimeMinutes', 'kills', 'deaths'].every(
      (key) => Number.isSafeInteger(level[key]) && Number(level[key]) >= 0
    ) &&
    typeof level.importedAt === 'string' &&
    Number.isFinite(Date.parse(level.importedAt))
  )
}

export const isPlayerProfile = (value: unknown): value is PlayerProfile => {
  if (typeof value !== 'object' || value === null) return false
  const player = value as Record<string, unknown>
  return (
    (player.customStats === undefined || isCustomStats(player.customStats)) &&
    (player.activity === undefined || isActivity(player.activity)) &&
    (player.partnerStats === undefined ||
      (typeof player.partnerStats === 'object' &&
        player.partnerStats !== null &&
        ['sessions', 'kills', 'deaths', 'seconds'].every((key) => {
          const number = (player.partnerStats as Record<string, unknown>)[key]
          return Number.isSafeInteger(number) && Number(number) >= 0
        }))) &&
    (player.partnerLevels === undefined ||
      (Array.isArray(player.partnerLevels) &&
        player.partnerLevels.length <= 20 &&
        player.partnerLevels.every(isPartnerLevel))) &&
    (player.recentMatches === undefined ||
      (Array.isArray(player.recentMatches) &&
        player.recentMatches.length <= 10 &&
        player.recentMatches.every(isEntry))) &&
    (player.loadout === undefined ||
      (Array.isArray(player.loadout) && player.loadout.every(isLoadoutSkin))) &&
    typeof player.id === 'string' &&
    typeof player.username === 'string' &&
    typeof player.mmr === 'number' &&
    (player.level === undefined ||
      (Number.isInteger(player.level) &&
        Number(player.level) >= 1 &&
        Number(player.level) <= 40)) &&
    (player.levelTitle === undefined ||
      (typeof player.levelTitle === 'string' && player.levelTitle.length <= 80)) &&
    (player.flagCountryCode === null ||
      (typeof player.flagCountryCode === 'string' && /^[A-Z]{2}$/.test(player.flagCountryCode))) &&
    typeof player.wins === 'number' &&
    typeof player.losses === 'number' &&
    typeof player.kills === 'number' &&
    typeof player.deaths === 'number' &&
    typeof player.assists === 'number' &&
    typeof player.createdAt === 'string'
  )
}
