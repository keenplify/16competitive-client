import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  CS16_RANKED_MODES,
  MATCHMAKING_MODES,
  isCs16RankedMode,
  isRankedBotSessionMode,
  isRankedMatchmakingMode,
  preferredCs16RankedMode
} from '../src/shared/matchmaking.ts'

test('CS 1.6 ranked modes are 5v5 and 3v3, matching the backend helper', () => {
  assert.deepEqual([...CS16_RANKED_MODES], ['5v5', '3v3'])
  assert.deepEqual(
    MATCHMAKING_MODES.filter((mode) => isCs16RankedMode(mode)),
    ['3v3', '5v5']
  )
  for (const mode of ['cs13_3v3', 'cs13_1v1']) {
    assert.equal(isRankedMatchmakingMode(mode), true)
    assert.equal(isCs16RankedMode(mode), false)
  }
  for (const mode of ['unrated', 'legacy', 'legacy_3v3', 'casual', 'ffa', 'arena', null, 5])
    assert.equal(isCs16RankedMode(mode), false)
})

test('the preferred ranked mode is 5v5 when enabled, otherwise 3v3', () => {
  assert.equal(preferredCs16RankedMode(['unrated', '3v3', '5v5']), '5v5')
  assert.equal(preferredCs16RankedMode(['ffa', '3v3']), '3v3')
  assert.equal(preferredCs16RankedMode(['ffa', 'cs13_3v3']), undefined)
})

test('a warmup is the MR8 bot session only in the queued CS 1.6 ranked mode', () => {
  assert.equal(isRankedBotSessionMode('5v5', '5v5'), true)
  assert.equal(isRankedBotSessionMode('3v3', '3v3'), true)
  assert.equal(isRankedBotSessionMode('3v3', '5v5'), false)
  assert.equal(isRankedBotSessionMode('5v5', null), true)
  assert.equal(isRankedBotSessionMode('ffa', 'ffa'), false)
  assert.equal(isRankedBotSessionMode('cs13_3v3', 'cs13_3v3'), false)
})
