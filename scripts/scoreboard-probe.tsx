/* eslint-disable react-refresh/only-export-components */
import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'

type Player = {
  id: number
  team: number
  name: string
  kills: number
  assists: number
  deaths: number
  ping: number
}
type Snapshot = {
  map: string
  round: number
  mode: 'ffa' | 'competitive'
  players: Player[]
} | null

declare global {
  interface Window {
    scoreboardProbe?: { onSnapshot(listener: (snapshot: Snapshot) => void): () => void }
  }
}

function RoundTrack({ round }: { round: number }) {
  const current = Math.min(round, 24)
  return (
    <div className="round-area">
      <div className="round-label">
        <span>MR12</span>
        <strong>
          {round ? `ROUND ${round}${round <= 24 ? ' / 24' : ' · OVERTIME'}` : 'WAITING FOR ROUND'}
        </strong>
        <span>HALF 12</span>
      </div>
      <div className="round-track" aria-label={`Round ${round} of 24`}>
        {Array.from({ length: 24 }, (_, index) => (
          <span
            key={index}
            className={`round-tick ${index + 1 < current ? 'past' : ''} ${index + 1 === current ? 'current' : ''} ${index === 12 ? 'halftime' : ''}`}
          />
        ))}
      </div>
    </div>
  )
}

function PlayerRow({ player, rank }: { player: Player; rank: number }) {
  return (
    <div className="player-row">
      <span className="rank">{String(rank).padStart(2, '0')}</span>
      <span className="player-name" title={player.name}>
        {player.name}
      </span>
      <span>{player.kills}</span>
      <span>{player.assists}</span>
      <span>{player.deaths}</span>
      <span>{player.ping}</span>
    </div>
  )
}

function Scoreboard() {
  const [snapshot, setSnapshot] = useState<Snapshot>(null)
  useEffect(() => window.scoreboardProbe?.onSnapshot(setSnapshot), [])
  const players = snapshot?.players ?? []
  const competitive = snapshot?.mode === 'competitive'

  return (
    <main className="scoreboard">
      <header className="board-header">
        <div>
          <b>16C</b>
          <span>
            {' '}
            {snapshot ? (competitive ? 'MATCH SCOREBOARD' : 'FFA SCOREBOARD') : 'SCOREBOARD'}
          </span>
        </div>
        <div className="map-name">{snapshot?.map ?? 'WAITING FOR AMXX DATA'}</div>
        <div className="player-count">
          {players.length} PLAYER{players.length === 1 ? '' : 'S'}
        </div>
      </header>
      <section
        className="board-table"
        aria-label={competitive ? 'Team scoreboard' : 'Single ranked leaderboard'}
      >
        <div className="column-head">
          <span>#</span>
          <span>PLAYER</span>
          <span>SCORE</span>
          <span>ASSISTS</span>
          <span>DEATHS</span>
          <span>LATENCY</span>
        </div>
        {players.length ? (
          competitive ? (
            [
              { team: 2, label: 'COUNTER-TERRORISTS', className: 'counter-terrorists' },
              { team: 1, label: 'TERRORISTS', className: 'terrorists' },
              { team: 3, label: 'SPECTATORS', className: 'spectators' },
              { team: 0, label: 'UNASSIGNED', className: 'spectators' }
            ].map((group) => {
              const members = players.filter((player) => player.team === group.team)
              return members.length ? (
                <div className={`team-section ${group.className}`} key={group.team}>
                  <div className="team-heading">
                    {group.label} · {members.length}
                  </div>
                  {members.map((player, index) => (
                    <PlayerRow key={player.id} player={player} rank={index + 1} />
                  ))}
                </div>
              ) : null
            })
          ) : (
            players.map((player, index) => (
              <PlayerRow key={player.id} player={player} rank={index + 1} />
            ))
          )
        ) : (
          <div className="empty">
            {snapshot ? 'No players connected' : 'Waiting for the local AMXX scoreboard feed'}
          </div>
        )}
      </section>
      {competitive && <RoundTrack round={snapshot?.round ?? 0} />}
    </main>
  )
}

createRoot(document.getElementById('root')!).render(<Scoreboard />)
