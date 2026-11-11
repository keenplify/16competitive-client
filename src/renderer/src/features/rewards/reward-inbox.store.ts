import { create } from 'zustand'
import { parseRewardInbox, type RewardReceipt } from '../../../../shared/reward-inbox'

interface RewardState {
  owner: string | null
  receipts: RewardReceipt[]
  loading: boolean
  consuming: boolean
  setOwner: (owner: string | null) => void
  load: () => Promise<void>
  consume: () => Promise<void>
}
let generation = 0
export const useRewardInbox = create<RewardState>((set, get) => ({
  owner: null,
  receipts: [],
  loading: false,
  consuming: false,
  setOwner: (owner) => {
    if (owner === get().owner) return
    generation++
    set({ owner, receipts: [], loading: false, consuming: false })
  },
  load: async () => {
    if (!get().owner || get().loading || get().receipts.length || get().consuming) return
    const request = generation
    set({ loading: true })
    try {
      const snapshot = parseRewardInbox(await window.api.rewards.pending())
      if (request === generation) set({ receipts: snapshot.rewards })
    } finally {
      if (request === generation) set({ loading: false })
    }
  },
  consume: async () => {
    if (get().consuming || !get().owner || !get().receipts.length) return
    const request = generation
    const ids = get().receipts.map((reward) => reward.id)
    set({ consuming: true })
    try {
      await window.api.rewards.consume(ids)
      if (request === generation) set({ receipts: [] })
    } finally {
      if (request === generation) set({ consuming: false })
    }
  }
}))
