/** Personalized, server-authoritative progression from a completed match. */
export interface ProfileXpAward {
  xpBefore: number
  xpAfter: number
  xpEarned: number
  levelBefore: number
  levelAfter: number
  titleBefore: string
  titleAfter: string
  xpIntoLevelBefore: number
  xpIntoLevelAfter: number
  xpForNextLevel: number
}
