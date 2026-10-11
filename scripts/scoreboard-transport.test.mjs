/* eslint-disable @typescript-eslint/explicit-function-return-type */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createHash } from 'node:crypto'
import { decodeScoreboardDelta } from '../src/main/game/scoreboard-transport.ts'
import { parseNativeScores, mergeNativeScores } from '../src/main/game/native-scoreboard.ts'
const hash = (value) => createHash('sha256').update(value).digest('hex')
const before = 'header\n1\t0\tAlpha\n2\t1\tBravo\n'
const after = 'header\n1\t2\tAlpha\n'
const fields = after.split(/(\t|\n)/)
const old = before.split(/(\t|\n)/)
const delta = {
  base: hash(before),
  revision: hash(after),
  length: fields.length,
  changes: fields.flatMap((value, index) => (value === old[index] ? [] : [[index, value]]))
}

test('field deltas reconstruct changes and roster removal exactly', () => {
  assert.equal(decodeScoreboardDelta(before, hash(before), JSON.stringify(delta)), after)
})
test('rejects wrong baseline, corrupt content, duplicate fields and missing fields', () => {
  assert.throws(() => decodeScoreboardDelta(before, 'wrong', JSON.stringify(delta)))
  assert.throws(() =>
    decodeScoreboardDelta(
      before,
      hash(before),
      JSON.stringify({ ...delta, revision: hash(before) })
    )
  )
  assert.throws(() =>
    decodeScoreboardDelta(
      before,
      hash(before),
      JSON.stringify({ ...delta, changes: [...delta.changes, ...delta.changes] })
    )
  )
  assert.throws(() =>
    decodeScoreboardDelta(
      before,
      hash(before),
      JSON.stringify({ ...delta, length: old.length + 4, changes: [] })
    )
  )
})
test('native rows are bounded and cannot merge across slot reuse', () => {
  const native = parseNativeScores('#16c-native-scoreboard-v1\n1\t8\t2\t30\tAlpha\n')
  assert.equal(native[0].kills, 8)
  const snapshot = {
    players: [
      { id: 1, name: 'Alpha', kills: 1, deaths: 1, ping: 1, assists: 4 },
      { id: 1, name: 'Replacement', kills: 3, deaths: 3, ping: 3, assists: 0 }
    ]
  }
  const merged = mergeNativeScores(snapshot, native)
  assert.equal(merged.players[0].kills, 8)
  assert.equal(merged.players[0].assists, 4)
  assert.deepEqual(merged.players[1], snapshot.players[1])
  assert.equal(snapshot.players[0].kills, 1)
  for (const text of [
    '#16c-native-scoreboard-v1\n33\t8\t2\t30\tAlpha\n',
    '#16c-native-scoreboard-v1\n1\t8\t2\t30\tAlpha\n1\t8\t2\t30\tAlpha\n',
    '#16c-native-scoreboard-v1\n1\t8\t-2\t30\tAlpha\n'
  ])
    assert.equal(parseNativeScores(text), null)
})

test('native scores rank highest first after placeholder feeds and live score changes', () => {
  const snapshot = {
    mode: 'ffa',
    players: [
      { id: 1, name: 'Alpha', kills: 0, deaths: 0, ping: 0, assists: 4, team: 1 },
      { id: 2, name: 'Bravo', kills: 0, deaths: 0, ping: 0, assists: 2, team: 2 },
      { id: 3, name: 'Charlie', kills: 0, deaths: 0, ping: 0, assists: 1, team: 1 },
      { id: 4, name: 'Delta', kills: 0, deaths: 0, ping: 0, assists: 0, team: 2 }
    ]
  }
  const native = parseNativeScores(
    '#16c-native-scoreboard-v1\n1\t3\t2\t30\tAlpha\n2\t8\t4\t31\tBravo\n3\t8\t2\t32\tCharlie\n4\t8\t2\t33\tDelta\n'
  )
  const merged = mergeNativeScores(snapshot, native)
  assert.deepEqual(
    merged.players.map((player) => player.id),
    [3, 4, 2, 1]
  )
  assert.equal(merged.players.find((player) => player.id === 1).assists, 4)
  assert.deepEqual(
    snapshot.players.map((player) => player.id),
    [1, 2, 3, 4]
  )
  assert.ok(snapshot.players.every((player) => player.kills === 0))

  const updated = mergeNativeScores(merged, [
    { id: 1, name: 'Alpha', kills: 9, deaths: 2, ping: 30 }
  ])
  assert.deepEqual(
    updated.players.map((player) => player.id),
    [1, 3, 4, 2]
  )
  // Competitive team sections preserve the same score ordering when filtered.
  assert.deepEqual(
    updated.players.filter((player) => player.team === 1).map((player) => player.id),
    [1, 3]
  )
  assert.deepEqual(
    updated.players.filter((player) => player.team === 2).map((player) => player.id),
    [4, 2]
  )
  assert.equal(updated.mode, 'ffa')
})

test('preload replays data that arrived before React subscribed', async () => {
  const { EventEmitter } = await import('node:events')
  const { readFile } = await import('node:fs/promises')
  const { runInNewContext } = await import('node:vm')
  const ipcRenderer = new EventEmitter()
  let api
  runInNewContext(await readFile(new URL('./scoreboard-preload.cjs', import.meta.url), 'utf8'), {
    require: () => ({
      ipcRenderer,
      contextBridge: {
        exposeInMainWorld: (_name, value) => {
          api = value
        }
      }
    })
  })
  const snapshot = { players: [{ name: 'Alpha' }] }
  ipcRenderer.emit('scoreboard-snapshot', null, snapshot)
  const received = []
  const unsubscribe = api.onSnapshot((value) => received.push(value))
  assert.deepEqual(received, [snapshot])
  unsubscribe()
  ipcRenderer.emit('scoreboard-snapshot', null, null)
  assert.equal(received.length, 1)
  api.onSnapshot((value) => received.push(value))
  assert.equal(received.at(-1), null)
})

test('native files expire and reject links or malformed content', async () => {
  const { mkdtemp, writeFile, utimes, symlink, rm } = await import('node:fs/promises')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const { readNativeScores } = await import('../src/main/game/native-scoreboard.ts')
  const directory = await mkdtemp(join(tmpdir(), '16c-native-scores-'))
  const file = join(directory, 'native-scoreboard.tsv')
  try {
    await writeFile(file, '#16c-native-scoreboard-v1\n1\t5\t2\t30\tAlpha\n')
    assert.equal((await readNativeScores(file))[0].kills, 5)
    await symlink(file, join(directory, 'linked.tsv'))
    assert.equal(await readNativeScores(join(directory, 'linked.tsv')), null)
    const old = new Date(Date.now() - 60_000)
    await utimes(file, old, old)
    assert.equal(await readNativeScores(file), null)
    await writeFile(file, 'invalid')
    assert.equal(await readNativeScores(file), null)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
