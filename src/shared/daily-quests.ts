export const DAILY_QUEST_CHANNELS = {
  get: 'daily-quests:get'
} as const

export type DailyQuestMetric =
  'HEADSHOTS' | 'ASSISTS' | 'GRENADE_KILLS' | 'KILLS' | 'MATCHES_PLAYED' | 'MATCHES_WON'

export type DailyQuestReward =
  | { type: 'POINTS' | 'P_CASH'; amount: number }
  | {
      type: 'SKIN'
      amount: 1
      skinId: string
      name: string
      weaponKey: string
      previewRotation: [number, number, number]
      previewHiddenTextures: string[]
    }
  | { type: 'STICKER'; amount: number; stickerId: string; name: string; imagePath: string }

export function isDailyQuestReward(value: unknown): value is DailyQuestReward {
  if (!value || typeof value !== 'object') return false
  const row = value as Record<string, unknown>
  if (!Number.isInteger(row.amount) || Number(row.amount) < 1 || Number(row.amount) > 1000000)
    return false
  if (row.type === 'POINTS' || row.type === 'P_CASH') return true
  if (typeof row.name !== 'string' || row.name.length > 200) return false
  if (row.type === 'SKIN')
    return (
      row.amount === 1 &&
      typeof row.skinId === 'string' &&
      /^[0-9a-f-]{36}$/i.test(row.skinId) &&
      typeof row.weaponKey === 'string' &&
      /^[a-z0-9_]+$/.test(row.weaponKey) &&
      Array.isArray(row.previewRotation) &&
      row.previewRotation.length === 3 &&
      row.previewRotation.every(
        (v) => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= 360
      ) &&
      Array.isArray(row.previewHiddenTextures) &&
      row.previewHiddenTextures.length <= 64 &&
      row.previewHiddenTextures.every((v) => typeof v === 'string' && v.length <= 128)
    )
  return (
    row.type === 'STICKER' &&
    Number(row.amount) <= 100 &&
    typeof row.stickerId === 'string' &&
    typeof row.imagePath === 'string' &&
    /^media\/16competitive\/stickers\/[a-f0-9]{64}\/image\.png$/.test(row.imagePath)
  )
}

export interface DailyQuest {
  id: string
  templateId: string
  metric: DailyQuestMetric
  title: string
  target: number
  progress: number
  rewardPoints: number
  endsAt?: string
  reward?: DailyQuestReward
  completed: boolean
}

export interface DailyQuestSnapshot {
  date: string
  resetsAt: string
  points: number
  quests: DailyQuest[]
}

export interface DailyQuestMatchProgress extends DailyQuest {
  progressBefore: number
  progressAfter: number
  completedThisMatch: boolean
}

export interface PointChange {
  source: 'MATCH_WIN' | 'MATCH_LOSS' | 'DAILY_QUEST' | 'PLAY_WINDOW'
  label: string
  amount: number
}

export interface MatchRewardSummary {
  pointsBefore: number
  pointsAfter: number
  pointChanges: PointChange[]
  quests: DailyQuestMatchProgress[]
}

export interface DailyQuestsApi {
  get(): Promise<DailyQuestSnapshot>
}
