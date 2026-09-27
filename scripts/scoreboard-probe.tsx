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
  alive: boolean
  bot: boolean
}
type Snapshot = {
  map: string
  round: number
  roundWinners: string | null
  mode: 'ffa' | 'competitive'
  players: Player[]
} | null

declare global {
  interface Window {
    scoreboardProbe?: {
      onSnapshot(listener: (snapshot: Snapshot) => void): () => void
      onSelf(listener: (username: string) => void): () => void
    }
  }
}

function RoundTrack({ round, roundWinners }: { round: number; roundWinners: string | null }) {
  const current = Math.min(round, 24)
  return (
    <div className="round-area">
      <div className="round-label">
        <strong>
          {round ? `ROUND ${round}${round <= 24 ? ' / 24' : ' · OVERTIME'}` : 'WAITING FOR ROUND'}
        </strong>
        <span>HALF 12</span>
      </div>
      {roundWinners !== null && (
        <div className="round-track" aria-label={`Round ${round} of 24`}>
          {Array.from({ length: 24 }, (_, index) => (
            <span
              key={index}
              className={`round-tick ${roundWinners[index] === 'C' ? 'ct-win' : roundWinners[index] === 'T' ? 't-win' : ''} ${index + 1 === current && !roundWinners[index] ? 'current' : ''} ${index === 12 ? 'halftime' : ''}`}
              title={
                roundWinners[index] === 'C'
                  ? `Round ${index + 1}: CT won`
                  : roundWinners[index] === 'T'
                    ? `Round ${index + 1}: T won`
                    : `Round ${index + 1}: ongoing or unplayed`
              }
            />
          ))}
        </div>
      )}
    </div>
  )
}

function PlayerRow({ player, rank, selfName }: { player: Player; rank: number; selfName: string }) {
  return (
    <div
      className={`player-row${player.alive ? '' : ' dead'}${player.name === selfName ? ' self' : ''}`}
    >
      <span className="rank">{String(rank).padStart(2, '0')}</span>
      <span className="player-name" title={player.name}>
        {player.name}
        {!player.alive && <small>DEAD</small>}
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
  const [selfName, setSelfName] = useState('')
  useEffect(() => window.scoreboardProbe?.onSnapshot(setSnapshot), [])
  useEffect(() => window.scoreboardProbe?.onSelf(setSelfName), [])
  const players = snapshot?.players.filter((player) => player.team === 1 || player.team === 2) ?? []
  const spectators =
    snapshot?.players.filter((player) => player.team !== 1 && player.team !== 2) ?? []
  const competitive = snapshot?.mode === 'competitive'

  return (
    <main className="scoreboard">
      <header className="board-header">
        <div>
          <span>
            {' '}
            {snapshot ? (competitive ? 'MATCH SCOREBOARD' : 'FFA SCOREBOARD') : 'SCOREBOARD'}
          </span>
        </div>
        <div className="map-name">{snapshot?.map ?? 'WAITING FOR AMXX DATA'}</div>
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
              { team: 1, label: 'TERRORISTS', className: 'terrorists' }
            ].map((group) => {
              const members = players.filter((player) => player.team === group.team)
              return members.length ? (
                <div className={`team-section ${group.className}`} key={group.team}>
                  <div className="team-heading">
                    {group.label} · {members.length}
                  </div>
                  {members.map((player, index) => (
                    <PlayerRow
                      key={player.id}
                      player={player}
                      rank={index + 1}
                      selfName={selfName}
                    />
                  ))}
                </div>
              ) : null
            })
          ) : (
            players.map((player, index) => (
              <PlayerRow key={player.id} player={player} rank={index + 1} selfName={selfName} />
            ))
          )
        ) : (
          <div className="empty">
            {snapshot ? 'No players connected' : 'Waiting for the local AMXX scoreboard feed'}
          </div>
        )}
      </section>
      {spectators.length > 0 && (
        <div className="spectator-footer">
          <strong>SPECTATORS · {spectators.length}</strong>
          <span>{spectators.map((player) => player.name).join(' · ')}</span>
        </div>
      )}
      {competitive && (
        <RoundTrack round={snapshot?.round ?? 0} roundWinners={snapshot?.roundWinners ?? null} />
      )}
    </main>
  )
}

createRoot(document.getElementById('root')!).render(<Scoreboard />)
