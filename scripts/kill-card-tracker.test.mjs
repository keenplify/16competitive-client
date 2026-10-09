/* eslint-disable @typescript-eslint/explicit-function-return-type */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { KillCardTracker } from '../src/main/game/kill-card-tracker.ts'

const snapshot = (mode, round, kills, deaths, opponents = []) => ({
  mode,
  round,
  players: [
    { id: 4, name: 'Player', kills, deaths, team: 1, alive: true },
    ...opponents.map((alive, index) => ({
      id: 10 + index,
      name: `Opponent ${index + 1}`,
      kills: 0,
      deaths: alive ? 0 : 1,
      team: 2,
      alive
    }))
  ]
})

test('competitive cards count kills within a round and reset on a new round', () => {
  const tracker = new KillCardTracker()
  assert.deepEqual(tracker.update(snapshot('competitive', 2, 3, 1), 'Player'), {
    mode: 'C',
    side: 'T',
    count: 0,
    aceAt: null
  })
  assert.deepEqual(tracker.update(snapshot('competitive', 2, 5, 1), 'Player'), {
    mode: 'C',
    side: 'T',
    count: 2,
    aceAt: null
  })
  assert.deepEqual(tracker.update(snapshot('competitive', 3, 5, 1), 'Player'), {
    mode: 'C',
    side: 'T',
    count: 0,
    aceAt: null
  })
  assert.deepEqual(tracker.update(snapshot('competitive', 3, 11, 1), 'Player'), {
    mode: 'C',
    side: 'T',
    count: 6,
    aceAt: null
  })
})

test('hides and resets local cards on death while observing another player', () => {
  const tracker = new KillCardTracker()
  tracker.update(snapshot('competitive', 2, 1, 0), 'Player')
  assert.equal(tracker.update(snapshot('competitive', 2, 3, 0), 'Player')?.count, 2)
  const dead = snapshot('competitive', 2, 3, 1)
  dead.players[0].alive = false
  assert.equal(tracker.update(dead, 'Player'), null)
  assert.equal(tracker.update(dead, 'Player'), null)
  assert.equal(tracker.update(snapshot('competitive', 3, 3, 1), 'Player')?.count, 0)
})

test('third card is ACE after eliminating all three opponents in 3v3', () => {
  const tracker = new KillCardTracker()
  tracker.update(snapshot('competitive', 1, 0, 0, [true, true, true]), 'Player')
  assert.deepEqual(
    tracker.update(snapshot('competitive', 1, 2, 0, [false, false, true]), 'Player'),
    {
      mode: 'C',
      side: 'T',
      count: 2,
      aceAt: null
    }
  )
  assert.deepEqual(
    tracker.update(snapshot('competitive', 1, 3, 0, [false, false, false]), 'Player'),
    {
      mode: 'C',
      side: 'T',
      count: 3,
      aceAt: 3
    }
  )
})

test('CT cards use the blue team side in the live overlay', () => {
  const tracker = new KillCardTracker()
  const ctSnapshot = (kills, alive) => {
    const value = snapshot('competitive', 1, kills, 0, alive)
    value.players[0].team = 2
    for (const opponent of value.players.slice(1)) opponent.team = 1
    return value
  }
  tracker.update(ctSnapshot(0, [true, true, true]), 'Player')
  assert.deepEqual(tracker.update(ctSnapshot(3, [false, false, false]), 'Player'), {
    mode: 'C',
    side: 'CT',
    count: 3,
    aceAt: 3
  })
})

test('fifth card is ACE in 5v5, but a missing opponent does not imply ACE', () => {
  const tracker = new KillCardTracker()
  tracker.update(snapshot('competitive', 1, 0, 0, Array(5).fill(true)), 'Player')
  assert.deepEqual(
    tracker.update(snapshot('competitive', 1, 4, 0, Array(5).fill(false)), 'Player'),
    {
      mode: 'C',
      side: 'T',
      count: 4,
      aceAt: null
    }
  )
  assert.deepEqual(
    tracker.update(snapshot('competitive', 1, 5, 0, Array(4).fill(false)), 'Player'),
    {
      mode: 'C',
      side: 'T',
      count: 5,
      aceAt: null
    }
  )
  assert.deepEqual(
    tracker.update(snapshot('competitive', 1, 5, 0, Array(5).fill(false)), 'Player'),
    {
      mode: 'C',
      side: 'T',
      count: 5,
      aceAt: 5
    }
  )
})

test('round-ending ACE stays visible until respawn, then clears instead of sticking at one', () => {
  const tracker = new KillCardTracker()
  tracker.update(snapshot('competitive', 1, 0, 0, Array(5).fill(true)), 'Player')
  tracker.update(snapshot('competitive', 1, 4, 0, [false, false, false, false, true]), 'Player')
  assert.deepEqual(
    tracker.update(snapshot('competitive', 2, 5, 0, Array(5).fill(false)), 'Player'),
    { mode: 'C', side: 'T', count: 5, aceAt: 5 }
  )
  assert.deepEqual(
    tracker.update(snapshot('competitive', 2, 5, 0, Array(5).fill(false)), 'Player'),
    { mode: 'C', side: 'T', count: 5, aceAt: 5 }
  )
  assert.deepEqual(
    tracker.update(snapshot('competitive', 2, 5, 0, Array(5).fill(true)), 'Player'),
    { mode: 'C', side: 'T', count: 0, aceAt: null }
  )
  assert.deepEqual(
    tracker.update(snapshot('competitive', 2, 6, 0, [false, true, true, true, true]), 'Player'),
    { mode: 'C', side: 'T', count: 1, aceAt: null }
  )
})

test('a non-ACE round-ending kill does not become a stuck first card', () => {
  const tracker = new KillCardTracker()
  tracker.update(snapshot('competitive', 1, 0, 0, Array(5).fill(true)), 'Player')
  tracker.update(snapshot('competitive', 1, 2, 0, [false, false, true, true, true]), 'Player')
  assert.deepEqual(
    tracker.update(snapshot('competitive', 2, 3, 0, [false, false, false, true, true]), 'Player'),
    { mode: 'C', side: 'T', count: 0, aceAt: null }
  )
})

test('competitive cards clear when the player dies before the round ends', () => {
  const tracker = new KillCardTracker()
  tracker.update(snapshot('competitive', 1, 0, 0, [true, true, true]), 'Player')
  assert.equal(tracker.update(snapshot('competitive', 1, 2, 0, [false, false, true]), 'Player')?.count, 2)
  assert.deepEqual(tracker.update(snapshot('competitive', 1, 2, 1, [false, false, true]), 'Player'), {
    mode: 'C', side: 'T', count: 0, aceAt: null
  })
  assert.equal(tracker.update(snapshot('competitive', 1, 2, 1, [false, false, true]), 'Player')?.count, 0)
})

test('FFA cards reset on death, have no ACE, and cap at sixteen', () => {
  const tracker = new KillCardTracker()
  tracker.update(snapshot('ffa', 1, 0, 0), 'Player')
  assert.deepEqual(tracker.update(snapshot('ffa', 1, 3, 0), 'Player'), {
    mode: 'F',
    side: 'F',
    count: 3,
    aceAt: null
  })
  assert.deepEqual(tracker.update(snapshot('ffa', 1, 4, 1), 'Player'), {
    mode: 'F',
    side: 'F',
    count: 0,
    aceAt: null
  })
  assert.deepEqual(tracker.update(snapshot('ffa', 1, 5, 1), 'Player'), {
    mode: 'F',
    side: 'F',
    count: 1,
    aceAt: null
  })
  assert.deepEqual(tracker.update(snapshot('ffa', 1, 15, 1), 'Player'), {
    mode: 'F',
    side: 'F',
    count: 11,
    aceAt: null
  })
  assert.deepEqual(tracker.update(snapshot('ffa', 1, 30, 1), 'Player'), {
    mode: 'F',
    side: 'F',
    count: 16,
    aceAt: null
  })
})
