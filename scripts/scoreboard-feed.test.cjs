/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict')
const { test } = require('node:test')
const { parseSnapshot } = require('./scoreboard-feed.cjs')

test('parses a unified leaderboard with assists and sorts by score', () => {
  const snapshot = parseSnapshot(
    '#16c-scoreboard-v1\tde_dust2\t13\n' + '2\t3\t2\t1\t42\tBravo\n' + '1\t8\t0\t4\t31\tAlpha\n'
  )
  assert.deepEqual(snapshot, {
    map: 'de_dust2',
    round: 13,
    players: [
      { id: 1, name: 'Alpha', kills: 8, assists: 0, deaths: 4, ping: 31 },
      { id: 2, name: 'Bravo', kills: 3, assists: 2, deaths: 1, ping: 42 }
    ]
  })
})

test('rejects malformed and duplicate player rows', () => {
  assert.equal(
    parseSnapshot('#16c-scoreboard-v1\tde_dust2\t1\n1\t0\t0\t0\t0\tA\n1\t0\t0\t0\t0\tB\n'),
    null
  )
  assert.equal(parseSnapshot('#16c-scoreboard-v1\tde_dust2\t1\n1\t0\t0\t0\t0\tBad\tname\n'), null)
  assert.equal(parseSnapshot('#16c-scoreboard-v1\t../evil\t1\n'), null)
})
