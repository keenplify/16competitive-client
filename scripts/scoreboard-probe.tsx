/* eslint-disable react-refresh/only-export-components */
import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'

type Player = {
  id: number
  name: string
  kills: number
  assists: number
  deaths: number
  ping: number
}
type Snapshot = { map: string; round: number; players: Player[] } | null

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

function Scoreboard() {
  const [snapshot, setSnapshot] = useState<Snapshot>(null)
  useEffect(() => window.scoreboardProbe?.onSnapshot(setSnapshot), [])
  const players = snapshot?.players ?? []

  return (
    <main className="scoreboard">
      <header className="board-header">
        <div>
          <b>16C</b>
          <span> SCOREBOARD</span>
        </div>
        <div className="map-name">{snapshot?.map ?? 'WAITING FOR AMXX DATA'}</div>
        <div className="player-count">
          {players.length} PLAYER{players.length === 1 ? '' : 'S'}
        </div>
      </header>
      <section className="board-table" aria-label="Single ranked leaderboard">
        <div className="column-head">
          <span>#</span>
          <span>PLAYER</span>
          <span>SCORE</span>
          <span>ASSISTS</span>
          <span>DEATHS</span>
          <span>LATENCY</span>
        </div>
        {players.length ? (
          players.map((player, index) => (
            <div className="player-row" key={player.id}>
              <span className="rank">{String(index + 1).padStart(2, '0')}</span>
              <span className="player-name" title={player.name}>
                {player.name}
              </span>
              <span>{player.kills}</span>
              <span>{player.assists}</span>
              <span>{player.deaths}</span>
              <span>{player.ping}</span>
            </div>
          ))
        ) : (
          <div className="empty">
            {snapshot ? 'No players connected' : 'Waiting for the local AMXX scoreboard feed'}
          </div>
        )}
      </section>
      <RoundTrack round={snapshot?.round ?? 0} />
    </main>
  )
}

createRoot(document.getElementById('root')!).render(<Scoreboard />)
