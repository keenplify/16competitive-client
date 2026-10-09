/** Cosmetic progress derived from the authenticated live scoreboard feed. */
export interface KillCardView {
  mode: 'F' | 'C'
  side: 'F' | 'CT' | 'T'
  count: number
  aceAt: number | null
  kinds?: ('skull' | 'grenade')[]
}

export class KillCardTracker {
  private round: number | null = null
  private mode: 'F' | 'C' | null = null
  private playerId: number | null = null
  private username: string | null = null
  private kills = 0
  private deaths = 0
  private cards = 0
  private maxOpponents = 0
  private awaitingRespawn = false
  private deadOpponents = new Set<number>()

  update(
    snapshot: {
      round: number
      mode: 'ffa' | 'competitive'
      players: {
        id: number
        name: string
        kills: number
        deaths: number
        team: number
        alive: boolean
      }[]
    } | null,
    username: string | null
  ): KillCardView | null {
    const player = snapshot?.players.find((entry) => entry.name === username)
    if (!snapshot || !player) return null

    const mode = snapshot.mode === 'ffa' ? 'F' : 'C'
    if (mode === 'C' && player.team !== 1 && player.team !== 2) return null
    const side = mode === 'F' ? 'F' : player.team === 2 ? 'CT' : 'T'
    const newRound = snapshot.round !== this.round
    const newPlayer =
      this.playerId !== player.id || this.username !== username || this.mode !== mode
    const opponents =
      mode === 'C'
        ? snapshot.players.filter(
            (entry) => (entry.team === 1 || entry.team === 2) && entry.team !== player.team
          )
        : []
    const gained = Math.max(0, player.kills - this.kills)
    if (newPlayer || this.round === null || this.mode !== mode || player.kills < this.kills) {
      this.cards = 0
      this.awaitingRespawn = false
    } else if (player.deaths > this.deaths) {
      // A death and kill in one feed interval have unknown order. Reset conservatively.
      this.cards = 0
      this.awaitingRespawn = false
    } else if (mode === 'C' && (newRound || this.awaitingRespawn)) {
      // Round numbers advance at round end, potentially before the final kill
      // count/alive flags arrive. Keep that round's progress until a previously
      // dead opponent respawns; only expose it after the server confirms ACE.
      const respawned = opponents.some((entry) => entry.alive && this.deadOpponents.has(entry.id))
      const noProgress = this.cards + gained === 0 && opponents.every((entry) => entry.alive)
      if (respawned || noProgress || opponents.length === 0) {
        this.cards = gained
        this.awaitingRespawn = false
      } else {
        this.cards += gained
        this.awaitingRespawn = true
      }
    } else {
      this.cards += gained
    }

    this.deadOpponents = new Set(opponents.filter((entry) => !entry.alive).map((entry) => entry.id))
    this.round = snapshot.round
    this.mode = mode
    this.playerId = player.id
    this.username = username
    this.kills = player.kills
    this.deaths = player.deaths
    this.cards = Math.min(9999, this.cards)
    this.maxOpponents =
      (newRound && !this.awaitingRespawn) || newPlayer
        ? opponents.length
        : Math.max(this.maxOpponents, opponents.length)
    if (!player.alive) {
      this.cards = 0
      this.awaitingRespawn = false
      return null
    }
    const aceAt =
      mode === 'C' &&
      this.maxOpponents > 0 &&
      this.cards >= this.maxOpponents &&
      opponents.length === this.maxOpponents &&
      opponents.every((entry) => !entry.alive)
        ? this.maxOpponents
        : null
    const count = this.awaitingRespawn && aceAt === null ? 0 : this.cards
    return { mode, side, count: mode === 'F' ? Math.min(count, 16) : count, aceAt }
  }
}
