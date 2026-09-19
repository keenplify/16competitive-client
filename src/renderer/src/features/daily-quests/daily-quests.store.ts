import { create } from 'zustand'
import type {
  DailyQuest,
  DailyQuestMatchProgress,
  DailyQuestSnapshot,
  MatchRewardSummary
} from '../../../../shared/daily-quests'

interface DailyQuestState {
  status: 'idle' | 'loading' | 'ready' | 'error'
  snapshot: DailyQuestSnapshot | null
  error: string | null
  lastMatchId: string | null
  lastMatchRewards: MatchRewardSummary | null
  start: () => void
  stop: () => void
  load: () => Promise<void>
  refresh: () => Promise<void>
}

let removeMatchmakingListener: (() => void) | null = null

const loadSnapshot = async (): Promise<DailyQuestSnapshot> => window.api.dailyQuests.get()

const toDailyQuest = (quest: DailyQuestMatchProgress): DailyQuest => ({
  id: quest.id,
  templateId: quest.templateId,
  metric: quest.metric,
  title: quest.title,
  target: quest.target,
  progress: quest.progress,
  rewardPoints: quest.rewardPoints,
  completed: quest.completed
})

export const useDailyQuestStore = create<DailyQuestState>((set, get) => ({
  status: 'idle',
  snapshot: null,
  error: null,
  lastMatchId: null,
  lastMatchRewards: null,
  start: () => {
    if (removeMatchmakingListener) return
    void get().load()
    removeMatchmakingListener = window.api.matchmaking.onEvent((event) => {
      if (event.type !== 'match_finished' || !event.rewards) return
      const rewards = event.rewards
      set((state) => ({
        lastMatchId: event.matchId,
        lastMatchRewards: rewards,
        snapshot: state.snapshot
          ? {
              ...state.snapshot,
              points: rewards.pointsAfter,
              quests: rewards.quests.map(toDailyQuest)
            }
          : state.snapshot
      }))
      window.setTimeout(() => void get().refresh(), 1_000)
    })
  },
  stop: () => {
    removeMatchmakingListener?.()
    removeMatchmakingListener = null
    set({ status: 'idle' })
  },
  load: async () => {
    if (get().status === 'loading' || get().status === 'ready') return
    set({ status: 'loading', error: null })
    try {
      set({ status: 'ready', snapshot: await loadSnapshot(), error: null })
    } catch (error) {
      set({
        status: 'error',
        error: error instanceof Error ? error.message : 'Could not load daily quests.'
      })
    }
  },
  refresh: async () => {
    set({ status: 'loading', error: null })
    try {
      set({ status: 'ready', snapshot: await loadSnapshot(), error: null })
    } catch (error) {
      set({
        status: 'error',
        error: error instanceof Error ? error.message : 'Could not refresh daily quests.'
      })
    }
  }
}))
