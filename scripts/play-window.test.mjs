import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isPlayWindowActive } from '../src/shared/play-window.ts'

const window = {
  startsAt: '20:00',
  endsAt: '02:00',
  timeZone: 'Asia/Singapore',
  bonusPoints: 150
}

test('overnight node window includes its start and excludes its end', () => {
  assert.equal(isPlayWindowActive(window, new Date('2026-10-07T11:59:00Z')), false)
  assert.equal(isPlayWindowActive(window, new Date('2026-10-07T12:00:00Z')), true)
  assert.equal(isPlayWindowActive(window, new Date('2026-10-07T17:59:00Z')), true)
  assert.equal(isPlayWindowActive(window, new Date('2026-10-07T18:00:00Z')), false)
})

test('node time zone controls the result, including daylight saving changes', () => {
  const chicago = { ...window, timeZone: 'America/Chicago' }
  assert.equal(isPlayWindowActive(chicago, new Date('2026-01-07T01:59:00Z')), false)
  assert.equal(isPlayWindowActive(chicago, new Date('2026-01-07T02:00:00Z')), true)
  assert.equal(isPlayWindowActive(chicago, new Date('2026-07-07T00:59:00Z')), false)
  assert.equal(isPlayWindowActive(chicago, new Date('2026-07-07T01:00:00Z')), true)
})

test('invalid published hours cannot be shown as active', () => {
  assert.equal(isPlayWindowActive({ ...window, timeZone: 'Unknown/Zone' }, new Date()), null)
  assert.equal(isPlayWindowActive({ ...window, startsAt: '02:00' }, new Date()), null)
})
