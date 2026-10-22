/* eslint-disable @typescript-eslint/explicit-function-return-type */
import assert from 'node:assert/strict'
import test from 'node:test'
import { createLocalSnapshotCache } from '../src/shared/local-snapshot-cache.ts'
const fixture = () => {
  const data = new Map()
  const storage = {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value)
  }
  const parse = (value) => {
    if (!value || typeof value.ping !== 'number') throw Error('invalid')
    return value
  }
  return { data, storage, cache: createLocalSnapshotCache('servers', parse, () => storage) }
}
test('persisted public snapshots are scoped by account and community, survive a fresh cache instance', () => {
  const { cache, storage } = fixture()
  cache.write('alice', 'sg', { ping: 30, players: 4, map: 'de_inferno' })
  assert.deepEqual(cache.read('alice', 'sg'), { ping: 30, players: 4, map: 'de_inferno' })
  assert.equal(cache.read('bob', 'sg'), null)
  assert.equal(cache.read('alice', 'eu'), null)
  assert.equal(
    createLocalSnapshotCache(
      'servers',
      (v) => v,
      () => storage
    ).read('alice', 'sg').map,
    'de_inferno'
  )
  cache.write('alice', 'sg', { ping: 40, players: 5, map: 'de_nuke' })
  assert.equal(cache.read('alice', 'sg').players, 5)
  cache.invalidate('alice')
  assert.equal(cache.read('alice', 'sg'), null)
})
test('corrupt, expired and malformed snapshots are ignored; cache stays bounded', () => {
  const { cache, data } = fixture()
  for (let i = 0; i < 30; i++) cache.write('alice', String(i), { ping: i })
  assert.equal(cache.read('alice', '0'), null)
  const [key] = data.keys()
  const rows = JSON.parse(data.get(key))
  assert.equal(rows.length, 24)
  rows[0].savedAt = Date.now() - 25 * 3600 * 1000
  data.set(key, JSON.stringify(rows))
  assert.equal(cache.read('alice', '29'), null)
  rows[1].value = { ping: 'bad' }
  data.set(key, JSON.stringify(rows))
  assert.equal(cache.read('alice', '28'), null)
  data.set(key, 'broken JSON')
  assert.equal(cache.read('alice', 'x'), null)
})
test('storage failures never block normal requests', () => {
  const cache = createLocalSnapshotCache(
    'disabled',
    (v) => v,
    () => {
      throw Error('disabled')
    }
  )
  assert.equal(cache.read('alice', 'sg'), null)
  assert.doesNotThrow(() => cache.write('alice', 'sg', { ping: 20 }))
})
