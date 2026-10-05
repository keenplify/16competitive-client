import type { KillCardView } from './kill-card-tracker'

export interface LocalDeathNotice {
  at: number
  killer: number
  victim: number
  local: number
  kind?: 'skull' | 'grenade'
}

interface Snapshot {
  round: number
  mode: 'ffa' | 'competitive'
  players: {
    id: number
    name: string
    team: number
    alive: boolean
    deaths: number
  }[]
}

interface PendingKill {
  victim: number
  at: number
  kind: 'skull' | 'grenade'
}

const CONFIRMATION_MS = 1500

export function parseLocalDeathNotices(text: string): LocalDeathNotice[] {
  return text
    .split('\n')
    .filter(Boolean)
    .flatMap((line) => {
      const match =
        /^(\d{13}) ([1-9]|[12]\d|3[0-2]) ([1-9]|[12]\d|3[0-2]) ([1-9]|[12]\d|3[0-2])(?: (grenade|skull))?$/.exec(
          line
        )
      if (!match) return []
      return [
        {
          at: Number(match[1]),
          killer: Number(match[2]),
          victim: Number(match[3]),
          local: Number(match[4]),
          kind: match[5] === 'grenade' ? 'grenade' : 'skull'
        }
      ]
    })
}

/** Reconcile fast local death notices with the server's authenticated kill count. */
export class KillCardPrediction {
  private authoritative: KillCardView | null = null
  private snapshot: Snapshot | null = null
  private username: string | null = null
  private pending: PendingKill[] = []
  private confirmedKinds: ('skull' | 'grenade')[] = []
  private pendingDeathAt: number | null = null
  private lastRound: number | null = null
  private lastPlayerId: number | null = null
  private lastDeaths = 0

  updateAuthoritative(
    cards: KillCardView | null,
    snapshot: Snapshot | null,
    username: string | null,
    now: number
  ): KillCardView | null {
    const player = snapshot?.players.find((entry) => entry.name === username)
    if (!cards || !snapshot || !player) {
      this.clear()
      return null
    }
    const changed =
      this.lastRound !== null &&
      (this.lastRound !== snapshot.round ||
        this.lastPlayerId !== player.id ||
        this.authoritative?.mode !== cards.mode)
    if (changed || (this.authoritative && cards.count < this.authoritative.count)) {
      this.pending = []
      this.confirmedKinds = Array(cards.count).fill('skull')
      this.pendingDeathAt = null
    } else if (this.authoritative) {
      const confirmed = Math.max(0, cards.count - this.authoritative.count)
      this.confirmedKinds.push(...this.pending.splice(0, confirmed).map((event) => event.kind))
      while (this.confirmedKinds.length < cards.count) this.confirmedKinds.push('skull')
    } else {
      this.confirmedKinds = Array(cards.count).fill('skull')
    }
    if (player.deaths > this.lastDeaths) {
      this.pendingDeathAt = null
      this.pending = []
      this.confirmedKinds = Array(cards.count).fill('skull')
    }
    this.authoritative = cards
    this.snapshot = snapshot
    this.username = username
    this.lastRound = snapshot.round
    this.lastPlayerId = player.id
    this.lastDeaths = player.deaths
    return this.view(now)
  }

  predict(notice: LocalDeathNotice, now: number): KillCardView | null {
    const cards = this.authoritative
    const snapshot = this.snapshot
    const player = snapshot?.players.find((entry) => entry.name === this.username)
    if (
      !cards ||
      !snapshot ||
      !player ||
      notice.local !== player.id ||
      now - notice.at < -1000 ||
      now - notice.at > CONFIRMATION_MS
    )
      return this.view(now)
    if (notice.victim === player.id) {
      this.pending = []
      this.pendingDeathAt = notice.at
      return this.view(now)
    }
    if (notice.killer !== player.id || notice.victim === player.id || this.pendingDeathAt !== null)
      return this.view(now)
    const victim = snapshot.players.find((entry) => entry.id === notice.victim)
    if (
      !victim ||
      (cards.mode === 'C' && !victim.alive) ||
      (cards.mode === 'C' &&
        (victim.team === player.team || (victim.team !== 1 && victim.team !== 2))) ||
      this.pending.some((event) => event.victim === notice.victim && notice.at - event.at < 1000)
    )
      return this.view(now)
    this.pending.push({ victim: notice.victim, at: notice.at, kind: notice.kind ?? 'skull' })
    return this.view(now)
  }

  view(now: number): KillCardView | null {
    if (!this.authoritative) return null
    this.pending = this.pending.filter((event) => now - event.at < CONFIRMATION_MS)
    if (this.pendingDeathAt !== null) {
      if (now - this.pendingDeathAt < CONFIRMATION_MS)
        return { ...this.authoritative, count: 0, aceAt: null, kinds: [] }
      this.pendingDeathAt = null
    }
    const maximum = this.authoritative.mode === 'F' ? 16 : 5
    return {
      ...this.authoritative,
      count: Math.min(maximum, this.authoritative.count + this.pending.length),
      aceAt: this.authoritative.aceAt,
      kinds: [...this.confirmedKinds, ...this.pending.map((event) => event.kind)].slice(0, maximum)
    }
  }

  clear(): void {
    this.authoritative = null
    this.snapshot = null
    this.username = null
    this.pending = []
    this.confirmedKinds = []
    this.pendingDeathAt = null
    this.lastRound = null
    this.lastPlayerId = null
    this.lastDeaths = 0
  }
}
