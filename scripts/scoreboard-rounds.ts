// Ranked CS 1.6 uses MR3 overtime; winTarget comes from the server feed.
export function scoreboardRounds(
  round: number,
  halfRounds: number,
  winTarget: number,
  overtimeHalf = 3
) {
  const regulationRounds = halfRounds * 2
  const overtime = halfRounds > 0 && winTarget > halfRounds + 1
  const overtimeNumber = overtime
    ? Math.max(1, Math.floor((winTarget - halfRounds - 1) / overtimeHalf))
    : 0
  const start = overtime ? regulationRounds + (overtimeNumber - 1) * overtimeHalf * 2 : 0
  const total = overtime ? overtimeHalf * 2 : regulationRounds
  const current = Math.max(1, Math.min(round - start, total))
  return {
    overtime,
    start,
    total,
    current,
    half: overtime ? overtimeHalf : halfRounds,
    label: overtime
      ? `OVERTIME ${overtimeNumber} · ROUND ${current} / ${total}`
      : round
        ? `ROUND ${round} / ${regulationRounds}`
        : 'WAITING FOR ROUND',
    details: overtime
      ? `WIN ${overtimeHalf + 1} OF ${total} · FIRST TO ${winTarget} · SWAP AFTER ${overtimeHalf} · TIE → NEXT OVERTIME`
      : `HALF ${halfRounds} · FIRST TO ${winTarget}`
  }
}

export function lossBonusSegments(bonus: number | null) {
  return bonus === null ? 0 : Math.max(0, Math.min(5, Math.floor((bonus - 1400) / 500) + 1))
}

export function targetRoundMarkers(
  completedRounds: number,
  winTarget: number,
  ctWins: number | null,
  tWins: number | null
): { ct: number; t: number } {
  const marker = (wins: number | null): number =>
    wins !== null && wins >= winTarget - 2 && wins < winTarget
      ? completedRounds + (winTarget - wins) - 1
      : -1
  return { ct: marker(ctWins), t: marker(tWins) }
}

export function sideAtRound(index: number, half: number, overtimeHalf = 3) {
  if (index < half) return 0
  if (index < half * 2) return 1
  return 1 + Math.floor((index - half * 2 + overtimeHalf) / (overtimeHalf * 2))
}

export function currentSideWinner(
  winner: string,
  historyIndex: number,
  currentIndex: number,
  half: number,
  overtimeHalf = 3,
  sidesSwapped?: boolean
) {
  return (sideAtRound(historyIndex, half, overtimeHalf) -
    (sidesSwapped === undefined
      ? sideAtRound(currentIndex, half, overtimeHalf)
      : Number(sidesSwapped))) %
    2 ===
    0
    ? winner
    : winner === 'C'
      ? 'T'
      : 'C'
}

export function scoreByHalf(
  history: string,
  half: number,
  currentIndex: number,
  overtimeHalf = 3,
  sidesSwapped?: boolean
) {
  return [
    { label: '1st', start: 0, end: half },
    { label: '2nd', start: half, end: half * 2 },
    { label: 'OT', start: half * 2, end: history.length }
  ].map(({ label, start, end }) => {
    let ct = 0,
      t = 0
    for (let index = start; index < Math.min(end, history.length); index++) {
      const winner = currentSideWinner(
        history[index],
        index,
        currentIndex,
        half,
        overtimeHalf,
        sidesSwapped
      )
      if (winner === 'C') ct++
      else if (winner === 'T') t++
    }
    return { label, ct, t }
  })
}
