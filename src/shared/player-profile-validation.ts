import type { MatchHistoryEntry, PlayerProfile } from './match-history'
const isNullableInteger = (value: unknown): boolean => value === null || Number.isInteger(value)
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

export const isPlayerProfile = (value: unknown): value is PlayerProfile => {
  if (typeof value !== 'object' || value === null) return false
  const player = value as Record<string, unknown>
  return (
    (player.activity === undefined || isActivity(player.activity)) &&
    (player.partnerStats === undefined || (
      typeof player.partnerStats === 'object' && player.partnerStats !== null &&
      ['sessions', 'kills', 'deaths', 'seconds'].every((key) => {
        const number = (player.partnerStats as Record<string, unknown>)[key]
        return Number.isSafeInteger(number) && Number(number) >= 0
      })
    )) &&
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
