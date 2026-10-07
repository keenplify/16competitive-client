import type { MatchmakingNode } from './matchmaking'

export type NodePlayWindow = NonNullable<MatchmakingNode['playWindow']>

/** Evaluate the published node clock, never the player's machine time zone. */
export const isPlayWindowActive = (window: NodePlayWindow, at: Date): boolean | null => {
  if (
    !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(window.startsAt) ||
    !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(window.endsAt) ||
    window.startsAt === window.endsAt
  )
    return null
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: window.timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23'
    }).formatToParts(at)
    const hour = Number(parts.find((part) => part.type === 'hour')?.value)
    const minute = Number(parts.find((part) => part.type === 'minute')?.value)
    const current = hour * 60 + minute
    const start = Number(window.startsAt.slice(0, 2)) * 60 + Number(window.startsAt.slice(3))
    const end = Number(window.endsAt.slice(0, 2)) * 60 + Number(window.endsAt.slice(3))
    return start < end ? current >= start && current < end : current >= start || current < end
  } catch {
    return null
  }
}
