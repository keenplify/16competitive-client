import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ScoreboardWatchdog } from '../src/main/game/scoreboard-watchdog.ts'

const healthy = { feedReady: true, rendererCrashed: false, frameAgeMs: 500, markersPresent: true }

test('idle or hidden boards do not require heartbeat images, but pending frames still recover', async () => {
  let clock = 0
  let health = { ...healthy, frameExpected: false, frameAgeMs: null }
  const repairs = []
  const monitor = new ScoreboardWatchdog(
    async () => health,
    async (reason) => repairs.push(reason),
    60000,
    () => clock
  )
  monitor.start()
  try {
    clock = 20000
    await monitor.check()
    assert.deepEqual(repairs, [])
    health = { ...health, frameExpected: true, frameAgeMs: 9000 }
    await monitor.check()
    assert.deepEqual(repairs, ['scoreboard frame stalled'])
    clock += 20000
    health = { ...health, frameExpected: false, rendererCrashed: true }
    await monitor.check()
    assert.equal(repairs[1], 'renderer crashed')
  } finally {
    await monitor.stop()
  }
})

test('recovers stalled frames, rate limits retries, and tolerates a missing backend feed', async () => {
  let clock = 0
  let health = { ...healthy, frameAgeMs: null }
  const repairs = []
  const monitor = new ScoreboardWatchdog(
    async () => health,
    async (reason) => {
      repairs.push(reason)
    },
    60000,
    () => clock
  )
  monitor.start()
  try {
    await monitor.check()
    assert.deepEqual(repairs, [])
    clock = 8000
    await monitor.check()
    assert.deepEqual(repairs, ['scoreboard frame stalled'])
    clock = 10000
    await monitor.check()
    assert.equal(repairs.length, 1)
    clock = 24000
    health = { ...health, feedReady: false }
    await monitor.check()
    assert.equal(repairs.length, 1)
    health = { ...healthy, rendererCrashed: true }
    await monitor.check()
    assert.equal(repairs[1], 'renderer crashed')
  } finally {
    await monitor.stop()
  }
})

test('repairs missing session markers without requiring a game restart', async () => {
  const repairs = []
  const monitor = new ScoreboardWatchdog(
    async () => ({ ...healthy, markersPresent: false }),
    async (reason) => {
      repairs.push(reason)
    }
  )
  monitor.start()
  await monitor.check()
  await monitor.stop()
  assert.deepEqual(repairs, ['session markers missing'])
})

test('does not overlap checks or recover an old session after stop', async () => {
  let finishHealth
  let checks = 0,
    repairs = 0
  const monitor = new ScoreboardWatchdog(
    () => {
      checks++
      return new Promise((resolve) => {
        finishHealth = resolve
      })
    },
    async () => {
      repairs++
    }
  )
  monitor.start()
  const first = monitor.check()
  const second = monitor.check()
  assert.equal(checks, 1)
  const stopped = monitor.stop()
  finishHealth({ ...healthy, rendererCrashed: true })
  await Promise.all([first, second, stopped])
  assert.equal(repairs, 0)
  await monitor.check()
  assert.equal(checks, 1)
})
