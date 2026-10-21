/* eslint-disable @typescript-eslint/explicit-function-return-type */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { loadCustomGameList } from '../src/shared/custom-game-list.ts'

const node = (id, latencyMs, available = true) => ({ id, latencyMs, available })

test('a missing saved server falls back to the nearest responding region', async () => {
  const calls = []
  const rooms = [{ id: 'room' }]
  const result = await loadCustomGameList(
    [node('far', 240), node('nearest', 30), node('unknown', null)],
    'retired-node-id',
    async ({ id }) => {
      calls.push(id)
      return rooms
    }
  )
  assert.deepEqual(calls, ['nearest'])
  assert.equal(result, rooms)
})

test('a reachable selected server keeps its filter even when another region is nearer', async () => {
  const calls = []
  assert.deepEqual(
    await loadCustomGameList(
      [node('nearest', 30), node('selected', 240)],
      'selected',
      async ({ id }) => {
        calls.push(id)
        return []
      }
    ),
    []
  )
  assert.deepEqual(calls, ['selected'])
})

test('a stale discovery entry that fails HTTP falls back through measured regions', async () => {
  const calls = []
  await loadCustomGameList(
    [node('unknown', null), node('far', 240), node('nearest', 30), node('saved', 50)],
    'saved',
    async ({ id }) => {
      calls.push(id)
      if (id !== 'far') throw new Error('offline')
      return []
    }
  )
  assert.deepEqual(calls, ['saved', 'nearest', 'far'])
})

test('match capacity does not prevent browsing existing rooms', async () => {
  const calls = []
  await loadCustomGameList([node('full', 30, false)], 'full', async ({ id }) => {
    calls.push(id)
    return []
  })
  assert.deepEqual(calls, ['full'])
})

test('all-server browsing deduplicates rooms and tolerates partial outages', async () => {
  const room = { id: 'room' }
  assert.deepEqual(
    await loadCustomGameList(
      [node('one', 10), node('two', 20), node('offline', null)],
      null,
      async ({ id }) => {
        if (id === 'offline') throw new Error('offline')
        return [room]
      }
    ),
    [room]
  )
})

test('an empty registry or total outage remains an error rather than an empty success', async () => {
  await assert.rejects(
    loadCustomGameList([], 'retired', async () => []),
    /customGames.listUnavailable/
  )
  for (const selection of [null, 'saved']) {
    await assert.rejects(
      loadCustomGameList([node('saved', null)], selection, async () => {
        throw new Error('offline')
      }),
      /customGames.listUnavailable/
    )
  }
})
