import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  scoreboardRounds,
  lossBonusSegments,
  currentSideWinner,
  scoreByHalf,
  targetRoundMarkers
} from './scoreboard-rounds.ts'

test('keeps regulation separate from overtime', () => {
  const state = scoreboardRounds(24, 12, 13)
  assert.equal(state.overtime, false)
  assert.equal(state.total, 24)
  assert.equal(state.label, 'ROUND 24 / 24')
})

test('shows overtime immediately at the tied regulation transition', () => {
  const state = scoreboardRounds(24, 12, 16)
  assert.equal(state.label, 'OVERTIME 1 · ROUND 1 / 6')
  assert.equal(state.start, 24)
  assert.equal(state.half, 3)
  assert.match(state.details, /WIN 4 OF 6.*FIRST TO 16.*SWAP AFTER 3/)
})

test('shows the last overtime round and starts a fresh block after another tie', () => {
  assert.equal(scoreboardRounds(30, 12, 16).label, 'OVERTIME 1 · ROUND 6 / 6')
  const second = scoreboardRounds(31, 12, 19)
  assert.equal(second.label, 'OVERTIME 2 · ROUND 1 / 6')
  assert.equal(second.start, 30)
  assert.match(second.details, /FIRST TO 19/)
  assert.equal(scoreboardRounds(38, 12, 22).current, 2)
})

test('supports shorter regulation formats and excludes deathmatch', () => {
  assert.equal(scoreboardRounds(17, 8, 12).label, 'OVERTIME 1 · ROUND 1 / 6')
  assert.equal(scoreboardRounds(30, 0, 90).overtime, false)
})

test('loss bonus bars cover all five tiers and unknown older feeds', () => {
  assert.deepEqual([null, 1400, 1900, 2400, 2900, 3400].map(lossBonusSegments), [0, 1, 2, 3, 4, 5])
})

test('marks the future target round when either side is two wins away', () => {
  assert.deepEqual(targetRoundMarkers(20, 13, 11, 9), { ct: 21, t: -1 })
  assert.deepEqual(targetRoundMarkers(21, 13, 11, 11), { ct: 22, t: 22 })
  assert.deepEqual(targetRoundMarkers(22, 13, 12, 11), { ct: 22, t: 23 })
  assert.deepEqual(targetRoundMarkers(23, 13, 13, 10), { ct: -1, t: -1 })
})

test('round winners follow their team across regulation and overtime side swaps', () => {
  assert.equal(currentSideWinner('C', 0, 12, 12), 'T')
  assert.equal(currentSideWinner('C', 24, 27, 12), 'T')
  assert.equal(currentSideWinner('C', 24, 30, 12), 'T')
  assert.equal(currentSideWinner('T', 27, 30, 12), 'T')
})

test('half breakdown counts current teams rather than historical physical sides', () => {
  assert.deepEqual(scoreByHalf('C'.repeat(12) + 'T'.repeat(12) + 'CCT', 12, 26), [
    { label: '1st', ct: 0, t: 12 },
    { label: '2nd', ct: 0, t: 12 },
    { label: 'OT', ct: 2, t: 1 }
  ])
})
