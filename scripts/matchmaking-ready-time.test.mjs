import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readyCheckRemainingMs } from '../src/shared/matchmaking-ready-time.ts'
import { serverClockNow, syncServerClock } from '../src/shared/server-clock.ts'

test('ready check uses the server clock when the Windows clock is ahead', () => {
  const serverNow = '2026-10-08T09:51:00.000Z'
  const deadline = '2026-10-08T09:53:00.000Z'
  const windowsNow = Date.parse('2026-10-09T00:51:00.000Z')
  assert.equal(readyCheckRemainingMs(deadline, serverNow, windowsNow), 120_000)
})

test('ready check rejects an expired server deadline', () => {
  assert.equal(
    readyCheckRemainingMs('2026-10-08T09:50:00.000Z', '2026-10-08T09:51:00.000Z'),
    -60_000
  )
})

test('shared server clock advances from server time independent of the PC date', () => {
  const serverNow = '2026-10-08T09:51:00.000Z'
  assert.equal(syncServerClock(serverNow), true)
  assert.ok(Math.abs(serverClockNow() - Date.parse(serverNow)) < 1_000)
  assert.equal(syncServerClock('invalid'), false)
  assert.ok(Math.abs(serverClockNow() - Date.parse(serverNow)) < 1_000)
})
