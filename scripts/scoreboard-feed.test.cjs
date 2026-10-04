/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict')
const { test } = require('node:test')
const { parseSnapshot } = require('./scoreboard-feed.cjs')

test('v14 identifies only a living terrorist C4 carrier', () => {
  const header = '#16c-scoreboard-v14\tde_dust2\t1\t0\t\t12\t13\t0\t0\t1\t1400\t1400\t3\t0\t\t1\n'
  const row = '1\t1\t0\t0\t0\t24\t1\t0\t800\t16\t100\t1\t1\tAlpha\n'
  assert.equal(parseSnapshot(header + row)?.players[0].hasBomb, true)
  assert.equal(
    parseSnapshot(header + row.replace('\t1\tAlpha', '\t0\tAlpha'))?.players[0].hasBomb,
    false
  )
  assert.equal(parseSnapshot(header + row.replace('\t1\tAlpha', '\t2\tAlpha')), null)
  assert.equal(parseSnapshot(header + row.replace('1\t1\t0\t', '1\t2\t0\t')), null)
  assert.equal(parseSnapshot(header + row + row.replace(/^1\t/, '2\t')), null)
})

test('renders server-redacted enemy money as hidden', () => {
  const header = '#16c-scoreboard-v14\tde_dust2\t1\t0\t\t12\t13\t0\t0\t1\t1400\t1400\t3\t0\t\t1\n'
  const row = '2\t2\t0\t0\t0\t24\t1\t0\t-1\t0\t0\t0\t0\tBravo\n'
  assert.equal(parseSnapshot(header + row)?.players[0].money, null)
  assert.equal(parseSnapshot(header + row.replace('\t-1\t', '\t-2\t')), null)
})

test('v12 carries per-player buy-zone state alongside health and the overtime header', () => {
  const header = '#16c-scoreboard-v12\tde_dust2\t1\t0\t\t12\t13\t0\t0\t1\t1400\t1400\t3\t0\n'
  const row = '1\t2\t0\t0\t0\t24\t1\t0\t800\t16\t73\t1\tAlpha\n'
  assert.equal(parseSnapshot(header + row).players[0].inBuyZone, true)
  assert.equal(
    parseSnapshot(header + row.replace('\t73\t1\t', '\t73\t0\t')).players[0].inBuyZone,
    false
  )
  assert.equal(parseSnapshot(header + row.replace('\t73\t1\t', '\t73\t2\t')), null)
  assert.equal(parseSnapshot(header + row).players[0].health, 73)
})

test('v13 carries round events through MR12 and MR8 overtime', () => {
  for (const half of [12, 8]) {
    const regulation = 'CT'.repeat(half)
    const events = 'K'.repeat(half * 2) + 'DBCHU'
    const round = half * 2 + 6
    const header = `#16c-scoreboard-v13\tde_dust2\t${round}\t0\t${regulation}CTCTC\t${half}\t${half + 4}\t${half + 3}\t${half + 2}\t0\t1900\t2400\t3\t1\t${events}\n`
    const snapshot = parseSnapshot(header)
    assert.equal(snapshot?.roundEvents, events)
    assert.equal(snapshot?.roundEvents[half * 2], 'D')
    assert.equal(snapshot?.halfRounds, half)
    assert.equal(snapshot?.overtimeHalfRounds, 3)
  }
})

test('v11 preserves health and buytime while providing team loss bonuses and overtime format', () => {
  const row = '1\t2\t5\t1\t2\t31\t1\t0\t16000\t22\t100\tAlpha\n'
  const header =
    '#16c-scoreboard-v11\tde_dust2\t25\t0\t' +
    'CT'.repeat(12) +
    '\t12\t16\t12\t12\t1\t1900\t3400\t3\t0\n'
  const snapshot = parseSnapshot(header + row)
  assert.equal(snapshot.ctLossBonus, 1900)
  assert.equal(snapshot.tLossBonus, 3400)
  assert.equal(snapshot.overtimeHalfRounds, 3)
  assert.equal(snapshot.buytimeActive, true)
  assert.equal(snapshot.players[0].health, 100)
  assert.equal(parseSnapshot(header.replace('1900', 'NaN') + row), null)
  assert.equal(parseSnapshot(header.replace('3400', '16001') + row), null)
  assert.equal(parseSnapshot(header.replace('\t3\t0\n', '\t0\t0\n') + row), null)
})

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
    roundWinners: null,
    halfRounds: 12,
    winTarget: 13,
    ctWins: null,
    tWins: null,
    roundEvents: null,
    ctLossBonus: null,
    tLossBonus: null,
    players: [
      {
        id: 1,
        team: 2,
        name: 'Alpha',
        kills: 8,
        assists: 0,
        deaths: 4,
        ping: 31,
        alive: true,
        bot: false,
        money: null,
        primaryWeapon: null
      },
      {
        id: 2,
        team: 1,
        name: 'Bravo',
        kills: 3,
        assists: 2,
        deaths: 1,
        ping: 42,
        alive: false,
        bot: false,
        money: null,
        primaryWeapon: null
      }
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
  const snapshot = parseSnapshot(
    '#16c-scoreboard-v4\tde_dust2\t0\t1\n1\t1\t2\t0\t1\t42\t1\t1\tAlpha\n'
  )
  assert.equal(snapshot?.players[0]?.bot, true)
  assert.equal(snapshot?.players[0]?.ping, 42)
})

test('reads CT and T round winners while keeping the live round unassigned', () => {
  const snapshot = parseSnapshot(
    '#16c-scoreboard-v5\tde_dust2\t3\t0\tCT\n1\t2\t2\t1\t0\t25\t1\t0\tAlpha\n'
  )
  assert.equal(snapshot?.round, 3)
  assert.equal(snapshot?.roundWinners, 'CT')
  assert.equal(parseSnapshot('#16c-scoreboard-v5\tde_dust2\t2\t0\tCTX\n'), null)
})

test('reads the server supplied MR8 match format', () => {
  const snapshot = parseSnapshot(
    '#16c-scoreboard-v6\tde_dust2\t9\t0\tCTCTCTCT\t8\t9\t5\t3\n1\t2\t2\t1\t0\t25\t1\t0\tAlpha\n'
  )
  assert.equal(snapshot?.halfRounds, 8)
  assert.equal(snapshot?.winTarget, 9)
  assert.equal(snapshot?.roundWinners, 'CTCTCTCT')
  assert.equal(snapshot?.ctWins, 5)
  assert.equal(snapshot?.tWins, 3)
  assert.equal(parseSnapshot('#16c-scoreboard-v6\tde_dust2\t9\t0\tCT\t0\t9\t1\t0\n'), null)
})

test('reads bounded player money from the v7 feed', () => {
  const snapshot = parseSnapshot(
    '#16c-scoreboard-v7\tde_dust2\t1\t0\tC\t8\t9\t1\t0\n' +
      '1\t2\t2\t1\t0\t25\t1\t0\t16000\tAlpha\n'
  )
  assert.equal(snapshot?.players[0]?.money, 16000)
  assert.equal(
    parseSnapshot(
      '#16c-scoreboard-v7\tde_dust2\t1\t0\tC\t8\t9\t1\t0\n' +
        '1\t2\t2\t1\t0\t25\t1\t0\t16001\tAlpha\n'
    ),
    null
  )
})

test('reads a primary weapon id from the v8 feed', () => {
  const snapshot = parseSnapshot(
    '#16c-scoreboard-v8\tde_dust2\t1\t0\tC\t8\t9\t1\t0\n' +
      '1\t2\t2\t1\t0\t25\t1\t0\t16000\t28\tAlpha\n'
  )
  assert.equal(snapshot?.players[0]?.money, 16000)
  assert.equal(snapshot?.players[0]?.primaryWeapon, 28)
  assert.equal(
    parseSnapshot(
      '#16c-scoreboard-v8\tde_dust2\t1\t0\tC\t8\t9\t1\t0\n' +
        '1\t2\t2\t1\t0\t25\t1\t0\t16000\t32\tAlpha\n'
    ),
    null
  )
})

test('reads round event markers and loss bonuses from the v9 feed', () => {
  const snapshot = parseSnapshot(
    '#16c-scoreboard-v9\tde_dust2\t9\t0\tCTCTCTCTC\t8\t9\t5\t4\tDBCKC\t1900\t2900\n' +
      '1\t2\t2\t1\t0\t25\t1\t0\t16000\t28\tAlpha\n'
  )
  assert.equal(snapshot?.roundEvents, 'DBCKC')
  assert.equal(snapshot?.ctLossBonus, 1900)
  assert.equal(snapshot?.tLossBonus, 2900)
  const other = parseSnapshot(
    '#16c-scoreboard-v9\tcs_office\t2\t0\tCC\t8\t9\t2\t0\tHU\t1400\t1900\n'
  )
  assert.equal(other?.roundEvents, 'HU')
  assert.equal(
    parseSnapshot('#16c-scoreboard-v9\tde_dust2\t1\t0\tC\t8\t9\t1\t0\tX\t1400\t1900\n'),
    null
  )
})

test('reads buy period and teammate health from the v10 feed', () => {
  const row = '1\t2\t2\t1\t0\t25\t1\t0\t800\t16\t73\tAlpha\n'
  const during = parseSnapshot('#16c-scoreboard-v10\tde_dust2\t1\t0\tC\t8\t9\t1\t0\t1\n' + row)
  const after = parseSnapshot('#16c-scoreboard-v10\tde_dust2\t1\t0\tC\t8\t9\t1\t0\t0\n' + row)
  assert.equal(during?.buytimeActive, true)
  assert.equal(after?.buytimeActive, false)
  assert.equal(after?.players[0]?.health, 73)
  assert.equal(parseSnapshot('#16c-scoreboard-v10\tde_dust2\t1\t0\tC\t8\t9\t1\t0\t2\n' + row), null)
})

test('rejects malformed and duplicate player rows', () => {
  assert.equal(
    parseSnapshot(
      '#16c-scoreboard-v3\tde_dust2\t1\t1\n1\t2\t0\t0\t0\t0\t1\tA\n1\t1\t0\t0\t0\t0\t1\tB\n'
    ),
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
