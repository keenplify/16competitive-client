export const OPERATION_CHANNELS = {
  getActive: 'operations:get-active',
  getMine: 'operations:get-mine',
  markViewed: 'operations:mark-viewed'
} as const

export type OperationRewardType = 'SKIN' | 'POINTS' | 'P_CASH' | 'SHOWCASE'
export type OperationPhase = 'SCHEDULED' | 'RUNNING' | 'ENDED'
export type OperationAccessType = 'FREE' | 'PREMIUM'

export interface OperationTier {
  id: string
  tier: number
  requiredPoints: number
  isMajor: boolean
  rewardType: OperationRewardType
  skinId: string | null
  amount: number | null
  showcaseKey: string | null
  showcaseName: string | null
  skin: {
    id: string
    name: string | null
    weaponKey: string | null
    description: string | null
  } | null
}

export interface Operation {
  id: string
  title: string
  description: string | null
  startsAt: string
  endsAt: string
  isActive: boolean
  accessType: OperationAccessType
  pricePCash: number | null
  logoUrl: string | null
  heroUrl: string | null
  durationDays: number
  phase: OperationPhase
  tiers: OperationTier[]
}

export interface OperationProgress {
  points: number
  lastViewedPoints: number
  updatedAt: string | null
}

export interface OperationSnapshot {
  operation: Operation | null
  progress: OperationProgress | null
}

export interface OperationViewedResult {
  points: number
  lastViewedPoints: number
}

export interface OperationsApi {
  getActive(): Promise<Operation | null>
  getMine(): Promise<OperationSnapshot>
  markViewed(operationId: string, viewedPoints: number): Promise<OperationViewedResult>
}
