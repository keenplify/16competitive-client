/* eslint-disable react-refresh/only-export-components */
import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Bomb, Clock8, Scissors, Skull, Trophy } from 'lucide-react'

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
  money: number | null
  primaryWeapon: number | null
}
type Snapshot = {
  map: string
  round: number
  roundWinners: string | null
  halfRounds: number
  winTarget: number
  ctWins: number | null
  tWins: number | null
  roundEvents: string | null
  ctLossBonus: number | null
  tLossBonus: number | null
  mode: 'ffa' | 'competitive'
  players: Player[]
} | null

const weaponAssets: Record<number, { name: string; src: string }> = {
  1: { name: 'P228', src: 'weapon-icons/14-sig-p228-category-icon.png' },
  3: { name: 'Scout', src: 'weapon-icons/25-scout-category-icon.png' },
  5: { name: 'XM1014', src: 'weapon-icons/28-xm1014-category-icon.png' },
  7: { name: 'MAC-10', src: 'weapon-icons/35-mac-10-category-icon.png' },
  8: { name: 'AUG', src: 'weapon-icons/20-aug-category-icon.png' },
  10: { name: 'Dual Elites', src: 'weapon-icons/12-dual-elites-category-icon.png' },
  11: { name: 'Five-Seven', src: 'weapon-icons/13-five-seven-category-icon.png' },
  16: { name: 'USP', src: 'weapon-icons/10-usp-category-icon.png' },
  17: { name: 'Glock', src: 'weapon-icons/11-glock-category-icon.png' },
  13: { name: 'SG 550', src: 'weapon-icons/26-sig-550-category-icon.png' },
  14: { name: 'Galil', src: 'weapon-icons/21-galil-category-icon.png' },
  15: { name: 'FAMAS', src: 'weapon-icons/24-famas-category-icon.png' },
  18: { name: 'AWP', src: 'weapon-icons/17-awp-category-icon.png' },
  19: { name: 'MP5', src: 'weapon-icons/31-mp5-category-icon.png' },
  20: { name: 'M249', src: 'weapon-icons/04-m249-category-icon.png' },
  21: { name: 'M3', src: 'weapon-icons/29-m3-category-icon.png' },
  22: { name: 'M4A1', src: 'weapon-icons/19-m4a1-category-icon.png' },
  23: { name: 'TMP', src: 'weapon-icons/33-tmp-category-icon.png' },
  24: { name: 'G3SG1', src: 'weapon-icons/22-g3-sg-1-category-icon.png' },
  26: { name: 'Desert Eagle', src: 'weapon-icons/09-desert-eagle-category-icon.png' },
  27: { name: 'SG 552', src: 'weapon-icons/23-sig-552-category-icon.png' },
  28: { name: 'AK-47', src: 'weapon-icons/18-ak-47-category-icon.png' },
  30: { name: 'P90', src: 'weapon-icons/32-p90-category-icon.png' },
  12: { name: 'UMP-45', src: 'weapon-icons/34-ump45-category-icon.png' },
  29: { name: 'Knife', src: 'weapon-icons/03-knife-category-icon.png' }
}

declare global {
  interface Window {
    scoreboardProbe?: {
      onSnapshot(listener: (snapshot: Snapshot) => void): () => void
      onSelf(listener: (username: string) => void): () => void
    }
  }
}

function getWinningRound(
  roundWinners: string,
  ctWins: number | null,
  tWins: number | null,
  winTarget: number
) {
  const winner =
    ctWins !== null && ctWins >= winTarget ? 'C' : tWins !== null && tWins >= winTarget ? 'T' : null
  if (!winner) return -1

  let wins = 0
  for (let index = 0; index < roundWinners.length; index++) {
    if (roundWinners[index] === winner) wins++
    if (wins === winTarget) return index
  }
  return -1
}

function RoundTrack({
  round,
  roundWinners,
  halfRounds,
  winTarget,
  ctWins,
  tWins,
  roundEvents,
  ctLossBonus,
  tLossBonus
}: {
  round: number
  roundWinners: string | null
  halfRounds: number
  winTarget: number
  ctWins: number | null
  tWins: number | null
  roundEvents: string | null
  ctLossBonus: number | null
  tLossBonus: number | null
}) {
  const regulationRounds = halfRounds * 2
  const current = Math.min(round, regulationRounds)
  const winningRound = roundWinners ? getWinningRound(roundWinners, ctWins, tWins, winTarget) : -1
  return (
    <div className="round-area">
      <div className="round-label">
        <strong>
          {round
            ? `ROUND ${round}${round <= regulationRounds ? ` / ${regulationRounds}` : ' · OVERTIME'}`
            : 'WAITING FOR ROUND'}
        </strong>
        <span>
          HALF {halfRounds} · FIRST TO {winTarget} · LOSS BONUS CT ${ctLossBonus ?? '—'} / T $
          {tLossBonus ?? '—'}
        </span>
      </div>
      {roundWinners !== null && (
        <div className="round-track" aria-label={`Round ${round} of ${regulationRounds}`}>
          {Array.from({ length: regulationRounds }, (_, index) => {
            const roundWinner = roundWinners[index]
            const roundEvent = roundEvents?.[index]
            const markerWinner =
              index >= halfRounds && roundWinner ? (roundWinner === 'C' ? 'T' : 'C') : roundWinner
            return (
              <span
                key={index}
                className={`round-tick ${markerWinner === 'C' ? 'ct-win' : markerWinner === 'T' ? 't-win' : ''} ${roundEvent ? 'has-event' : ''} ${index === winningRound ? 'match-winner' : ''} ${index + 1 === current && !roundWinner ? 'current' : ''} ${index === halfRounds ? 'halftime' : ''}`}
                title={
                  index === winningRound
                    ? `Round ${index + 1}: match won`
                    : roundEvent === 'D'
                      ? `Round ${index + 1}: bomb defused`
                      : roundEvent === 'B'
                        ? `Round ${index + 1}: bomb exploded`
                        : roundEvent === 'C'
                          ? `Round ${index + 1}: timer expired`
                          : roundEvent === 'K'
                            ? `Round ${index + 1}: enemies eliminated`
                            : roundWinner === 'C'
                              ? `Round ${index + 1}: CT won`
                              : roundWinner === 'T'
                                ? `Round ${index + 1}: T won`
                                : `Round ${index + 1}: ongoing or unplayed`
                }
              >
                {index === winningRound ? (
                  <Trophy className="round-trophy" aria-label="Match winner" />
                ) : roundEvent === 'D' ? (
                  <Scissors className="round-event-icon" aria-label="Bomb defused" />
                ) : roundEvent === 'B' ? (
                  <Bomb className="round-event-icon" aria-label="Bomb exploded" />
                ) : roundEvent === 'C' ? (
                  <Clock8 className="round-event-icon" aria-label="Timer expired" />
                ) : roundEvent === 'K' ? (
                  <Skull className="round-event-icon" aria-label="Enemies eliminated" />
                ) : null}
              </span>
            )
          })}
        </div>
      )}
    </div>
  )
}

function PlayerRow({
  player,
  rank,
  selfName,
  showWeapon,
  canSeeWeapon
}: {
  player: Player
  rank: number
  selfName: string
  showWeapon: boolean
  canSeeWeapon: boolean
}) {
  const weapon = player.primaryWeapon === null ? null : weaponAssets[player.primaryWeapon]
  return (
    <div
      className={`player-row${showWeapon ? ' has-weapon' : ''}${player.alive ? '' : ' dead'}${player.name === selfName ? ' self' : ''}`}
    >
      <span className="rank">{String(rank).padStart(2, '0')}</span>
      <span className="player-name" title={player.name}>
        {player.name}
        {!player.alive && <small>DEAD</small>}
      </span>
      <span>{player.kills}</span>
      <span>{player.assists}</span>
      <span>{player.deaths}</span>
      {showWeapon && (
        <span
          className="primary-weapon"
          title={canSeeWeapon ? (weapon?.name ?? 'No primary weapon') : 'Hidden'}
        >
          {canSeeWeapon && weapon ? (
            <img src={weapon.src} alt={weapon.name} />
          ) : canSeeWeapon ? (
            '—'
          ) : (
            ''
          )}
        </span>
      )}
      <span>{player.money === null ? '—' : `$${player.money.toLocaleString('en-US')}`}</span>
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
  const selfTeam = competitive ? players.find((player) => player.name === selfName)?.team : null

  return (
    <main className="scoreboard">
      <header className="board-header">
        <div>
          <span> {snapshot ? (competitive ? 'MATCH SCOREBOARD' : 'FFA') : 'SCOREBOARD'}</span>
        </div>
        <div className="map-name">{snapshot?.map ?? 'WAITING FOR AMXX DATA'}</div>
      </header>
      <section
        className="board-table"
        aria-label={competitive ? 'Team scoreboard' : 'Single ranked leaderboard'}
      >
        <div className={`column-head${competitive ? ' has-weapon' : ''}`}>
          <span>#</span>
          <span>PLAYER</span>
          <span>SCORE</span>
          <span>ASSISTS</span>
          <span>DEATHS</span>
          {competitive && <span>WPN</span>}
          <span>MONEY</span>
          <span>LATENCY</span>
        </div>
        {players.length ? (
          competitive ? (
            [
              {
                team: 2,
                label: 'COUNTER-TERRORISTS',
                className: 'counter-terrorists',
                wins: snapshot?.ctWins
              },
              { team: 1, label: 'TERRORISTS', className: 'terrorists', wins: snapshot?.tWins }
            ].map((group, groupIndex) => {
              const members = players.filter((player) => player.team === group.team)
              return members.length ? (
                <div key={group.team}>
                  <div className={`team-section ${group.className}`}>
                    <div className="team-heading">
                      {group.label} · {group.wins === null ? members.length : `${group.wins} WINS`}
                    </div>
                    {members.map((player, index) => (
                      <PlayerRow
                        key={player.id}
                        player={player}
                        rank={index + 1}
                        selfName={selfName}
                        showWeapon={competitive}
                        canSeeWeapon={player.team === selfTeam}
                      />
                    ))}
                  </div>
                  {groupIndex === 0 && (
                    <RoundTrack
                      round={snapshot?.round ?? 0}
                      roundWinners={snapshot?.roundWinners ?? null}
                      halfRounds={snapshot?.halfRounds ?? 12}
                      winTarget={snapshot?.winTarget ?? 13}
                      ctWins={snapshot?.ctWins ?? null}
                      tWins={snapshot?.tWins ?? null}
                      roundEvents={snapshot?.roundEvents ?? null}
                      ctLossBonus={snapshot?.ctLossBonus ?? null}
                      tLossBonus={snapshot?.tLossBonus ?? null}
                    />
                  )}
                </div>
              ) : null
            })
          ) : (
            players.map((player, index) => (
              <PlayerRow
                key={player.id}
                player={player}
                rank={index + 1}
                selfName={selfName}
                showWeapon={false}
                canSeeWeapon={false}
              />
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
    </main>
  )
}

createRoot(document.getElementById('root')!).render(<Scoreboard />)
