export const PROFILE_RANK_TITLES = [
  'Private',
  'Private',
  'Private First Class',
  'Specialist',
  'Corporal',
  'Sergeant',
  'Sergeant',
  'Staff Sergeant',
  'Staff Sergeant',
  'Sergeant First Class',
  'Master Sergeant',
  'First Sergeant',
  'Sergeant Major',
  'Command Sergeant Major',
  'Sergeant Major of the Army',
  'Warrant Officer 1',
  'Chief Warrant Officer 2',
  'Chief Warrant Officer 3',
  'Chief Warrant Officer 4',
  'Chief Warrant Officer 5',
  'Second Lieutenant',
  'First Lieutenant',
  'Captain',
  'Major',
  'Lieutenant Colonel',
  'Colonel',
  'Colonel',
  'Colonel',
  'Colonel',
  'Colonel',
  'Brigadier General',
  'Major General',
  'Lieutenant General',
  'General',
  'General of the Army',
  'General of the Army',
  'General of the Army',
  'General of the Army',
  'General of the Army',
  'General of the Army'
] as const

export const profileRankTitle = (level: number): string =>
  PROFILE_RANK_TITLES[Number.isFinite(level) ? Math.max(1, Math.min(40, Math.floor(level))) - 1 : 0]

export const profileXpForNextLevel = (level: number): number =>
  1_300 + Math.round(((Math.min(39, Math.max(1, Math.floor(level))) - 1) * 5_400) / 38)

export const PROFILE_LEVEL_THRESHOLDS = Array.from({ length: 40 }, (_, index) =>
  index === 0
    ? 0
    : Array.from({ length: index }, (_, offset) => profileXpForNextLevel(offset + 1)).reduce(
        (total, required) => total + required,
        0
      )
)

export const PROFILE_MAX_XP = PROFILE_LEVEL_THRESHOLDS[39]

export const profileRankProgress = (
  totalXp: number
): {
  level: number
  title: string
  xpIntoLevel: number
  xpForNextLevel: number
} => {
  const xp = Math.max(0, Math.min(PROFILE_MAX_XP, Math.floor(totalXp)))
  let level = 1
  while (level < 40 && xp >= PROFILE_LEVEL_THRESHOLDS[level]) level += 1
  const xpForNextLevel = profileXpForNextLevel(level)
  return {
    level,
    title: profileRankTitle(level),
    xpIntoLevel: level === 40 ? xpForNextLevel : xp - PROFILE_LEVEL_THRESHOLDS[level - 1],
    xpForNextLevel
  }
}
