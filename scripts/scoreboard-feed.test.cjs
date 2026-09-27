/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict')
const { test } = require('node:test')
const { parseSnapshot } = require('./scoreboard-feed.cjs')

test('parses a unified leaderboard with assists and sorts by score', () => {
  const snapshot = parseSnapshot(
    '#16c-scoreboard-v2\tde_dust2\t0\t1\n' +
      '2\t1\t3\t2\t1\t42\tBravo\n' +
      '1\t2\t8\t0\t4\t31\tAlpha\n'
  )
  assert.deepEqual(snapshot, {
    map: 'de_dust2',
    round: 0,
    mode: 'ffa',
    players: [
      { id: 1, team: 2, name: 'Alpha', kills: 8, assists: 0, deaths: 4, ping: 31 },
      { id: 2, team: 1, name: 'Bravo', kills: 3, assists: 2, deaths: 1, ping: 42 }
    ]
  })
})

test('parses competitive mode and team assignments', () => {
  const snapshot = parseSnapshot(
    '#16c-scoreboard-v2\tde_inferno\t13\t0\n' +
      '1\t2\t8\t1\t4\t31\tAlpha\n' +
      '2\t1\t3\t2\t1\t42\tBravo\n'
  )
  assert.equal(snapshot?.mode, 'competitive')
  assert.deepEqual(
    snapshot?.players.map((player) => player.team),
    [2, 1]
  )
})

test('rejects malformed and duplicate player rows', () => {
  assert.equal(
    parseSnapshot('#16c-scoreboard-v2\tde_dust2\t1\t1\n1\t2\t0\t0\t0\t0\tA\n1\t1\t0\t0\t0\t0\tB\n'),
    null
  )
  assert.equal(
    parseSnapshot('#16c-scoreboard-v2\tde_dust2\t1\t1\n1\t2\t0\t0\t0\t0\tBad\tname\n'),
    null
  )
  assert.equal(parseSnapshot('#16c-scoreboard-v2\t../evil\t1\t1\n'), null)
  assert.equal(parseSnapshot('#16c-scoreboard-v2\tde_dust2\t1\t2\n'), null)
})
