import { create } from 'zustand'
import type { Operation, OperationSnapshot } from '../../../../shared/operations'

type LoadStatus = 'idle' | 'loading' | 'ready' | 'error'

interface OperationState {
  activeOperation: Operation | null
  activeStatus: LoadStatus
  snapshot: OperationSnapshot | null
  mineStatus: LoadStatus
  error: string | null
  loadActive: () => Promise<void>
  loadMine: () => Promise<void>
  acknowledge: (operationId: string, viewedPoints: number) => Promise<void>
}

let activeRequest = 0
let mineRequest = 0

export const useOperationStore = create<OperationState>((set, get) => ({
  activeOperation: null,
  activeStatus: 'idle',
  snapshot: null,
  mineStatus: 'idle',
  error: null,

  loadActive: async () => {
    const request = ++activeRequest
    set({ activeStatus: 'loading' })
    try {
      const activeOperation = await window.api.operations.getActive()
      if (request === activeRequest) {
        set({ activeOperation, activeStatus: 'ready' })
      }
    } catch (error) {
      console.error('[Operations] failed to load active Operation', error)
      if (request === activeRequest) set({ activeStatus: 'error' })
    }
  },

  loadMine: async () => {
    const request = ++mineRequest
    set({ mineStatus: 'loading', error: null })
    try {
      const snapshot = await window.api.operations.getMine()
      if (request === mineRequest) {
        set({
          snapshot,
          activeOperation: snapshot.operation,
          activeStatus: 'ready',
          mineStatus: 'ready'
        })
      }
    } catch (error) {
      console.error('[Operations] failed to load player Operation', error)
      if (request === mineRequest) {
        set({
          mineStatus: 'error',
          error: error instanceof Error ? error.message : 'Could not load Operation progress.'
        })
      }
    }
  },

  acknowledge: async (operationId, viewedPoints) => {
    try {
      const progress = await window.api.operations.markViewed(operationId, viewedPoints)
      const snapshot = get().snapshot
      if (!snapshot?.operation || snapshot.operation.id !== operationId || !snapshot.progress)
        return
      set({
        snapshot: {
          ...snapshot,
          progress: {
            ...snapshot.progress,
            points: progress.points,
            lastViewedPoints: progress.lastViewedPoints
          }
        }
      })
    } catch (error) {
      console.warn('[Operations] could not acknowledge viewed progress', error)
    }
  }
}))
