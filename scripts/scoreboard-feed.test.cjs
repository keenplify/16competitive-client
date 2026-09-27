/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict')
const { test } = require('node:test')
const { parseSnapshot } = require('./scoreboard-feed.cjs')

test('parses a unified leaderboard with assists and sorts by score', () => {
  const snapshot = parseSnapshot(
    '#16c-scoreboard-v3\tde_dust2\t0\t1\n' +
      '2\t1\t3\t2\t1\t42\t0\tBravo\n' +
      '1\t2\t8\t0\t4\t31\t1\tAlpha\n'
  )
  assert.deepEqual(snapshot, {
    map: 'de_dust2',
    round: 0,
    mode: 'ffa',
    roundWinners: '',
    players: [
      { id: 1, team: 2, name: 'Alpha', kills: 8, assists: 0, deaths: 4, ping: 31, alive: true, bot: false },
      { id: 2, team: 1, name: 'Bravo', kills: 3, assists: 2, deaths: 1, ping: 42, alive: false, bot: false }
    ]
  })
})

test('parses competitive mode and team assignments', () => {
  const snapshot = parseSnapshot(
    '#16c-scoreboard-v3\tde_inferno\t13\t0\n' +
      '1\t2\t8\t1\t4\t31\t1\tAlpha\n' +
      '2\t1\t3\t2\t1\t42\t0\tBravo\n'
  )
  assert.equal(snapshot?.mode, 'competitive')
  assert.deepEqual(
    snapshot?.players.map((player) => player.team),
    [2, 1]
  )
})

test('keeps an existing live v2 match visible during the feed upgrade', () => {
  const snapshot = parseSnapshot('#16c-scoreboard-v2\tde_dust2\t0\t1\n1\t1\t2\t0\t1\t35\tAlpha\n')
  assert.equal(snapshot?.players[0]?.alive, true)
})

test('identifies bots in the live feed', () => {
  const snapshot = parseSnapshot('#16c-scoreboard-v4\tde_dust2\t0\t1\n1\t1\t2\t0\t1\t42\t1\t1\tAlpha\n')
  assert.equal(snapshot?.players[0]?.bot, true)
  assert.equal(snapshot?.players[0]?.ping, 42)
})

test('reads CT and T round winners while keeping the live round unassigned', () => {
  const snapshot = parseSnapshot('#16c-scoreboard-v5\tde_dust2\t3\t0\tCT\n1\t2\t2\t1\t0\t25\t1\t0\tAlpha\n')
  assert.equal(snapshot?.round, 3)
  assert.equal(snapshot?.roundWinners, 'CT')
  assert.equal(parseSnapshot('#16c-scoreboard-v5\tde_dust2\t2\t0\tCTX\n'), null)
})

test('rejects malformed and duplicate player rows', () => {
  assert.equal(
    parseSnapshot('#16c-scoreboard-v3\tde_dust2\t1\t1\n1\t2\t0\t0\t0\t0\t1\tA\n1\t1\t0\t0\t0\t0\t1\tB\n'),
    null
  )
  assert.equal(
    parseSnapshot('#16c-scoreboard-v3\tde_dust2\t1\t1\n1\t2\t0\t0\t0\t0\t1\tBad\tname\n'),
    null
  )
  assert.equal(parseSnapshot('#16c-scoreboard-v3\t../evil\t1\t1\n'), null)
  assert.equal(parseSnapshot('#16c-scoreboard-v3\tde_dust2\t1\t2\n'), null)
  assert.equal(parseSnapshot('#16c-scoreboard-v3\tde_dust2\t1\t1\n1\t2\t0\t0\t0\t0\t2\tA\n'), null)
})
