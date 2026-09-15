export const DAILY_QUEST_CHANNELS = {
  get: 'daily-quests:get'
} as const

export type DailyQuestMetric =
  | 'HEADSHOTS'
  | 'ASSISTS'
  | 'GRENADE_KILLS'
  | 'KILLS'
  | 'MATCHES_PLAYED'
  | 'MATCHES_WON'

export interface DailyQuest {
  id: string
  templateId: string
  metric: DailyQuestMetric
  title: string
  target: number
  progress: number
  rewardPoints: number
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
  source: 'MATCH_WIN' | 'MATCH_LOSS' | 'DAILY_QUEST'
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
