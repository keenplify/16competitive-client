/* eslint-disable @typescript-eslint/explicit-function-return-type */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  KillCardPrediction,
  parseLocalDeathNotices
} from '../src/main/game/kill-card-prediction.ts'

const at = 1_800_000_000_000
const snapshot = (mode, round, kills, deaths, victimAlive = true) => ({
  mode,
  round,
  players: [
    { id: 4, name: 'Player', team: 2, alive: true, deaths },
    { id: 8, name: 'Opponent', team: 1, alive: victimAlive, deaths: victimAlive ? 0 : 1 }
  ],
  kills
})
const cards = (mode, count) => ({ mode, side: mode === 'F' ? 'F' : 'CT', count, aceAt: null })
const notice = (killer = 4, victim = 8) => ({ at, killer, victim, local: 4 })

test('accepts only bounded local death notice records', () => {
  assert.deepEqual(parseLocalDeathNotices(`${at} 4 8 4\ninvalid\n`), [notice()])
  assert.deepEqual(parseLocalDeathNotices(`${at} 0 8 4\n${at} 4 33 4\n`), [])
})

test('shows a provisional card immediately and keeps it when the server confirms', () => {
  const prediction = new KillCardPrediction()
  prediction.updateAuthoritative(cards('C', 0), snapshot('competitive', 1, 0, 0), 'Player', at)
  assert.deepEqual(prediction.predict(notice(), at + 10), cards('C', 1))
  assert.deepEqual(
    prediction.updateAuthoritative(
      cards('C', 0),
      snapshot('competitive', 1, 0, 0),
      'Player',
      at + 50
    ),
    cards('C', 1)
  )
  assert.deepEqual(
    prediction.updateAuthoritative(
      cards('C', 1),
      snapshot('competitive', 1, 1, 0, false),
      'Player',
      at + 100
    ),
    cards('C', 1)
  )
  assert.deepEqual(prediction.view(at + 1600), cards('C', 1))
})

test('unconfirmed death notice expires to the prior server count', () => {
  const prediction = new KillCardPrediction()
  prediction.updateAuthoritative(cards('C', 2), snapshot('competitive', 1, 2, 0), 'Player', at)
  assert.equal(prediction.predict(notice(), at + 10)?.count, 3)
  assert.equal(prediction.view(at + 1499)?.count, 3)
  assert.equal(prediction.view(at + 1501)?.count, 2)
})

test('team kills, stale notices, and notices for another player cannot predict', () => {
  const prediction = new KillCardPrediction()
  prediction.updateAuthoritative(cards('C', 0), snapshot('competitive', 1, 0, 0), 'Player', at)
  assert.equal(prediction.predict({ ...notice(), local: 5 }, at)?.count, 0)
  assert.equal(prediction.predict({ ...notice(), at: at - 2000 }, at)?.count, 0)
  assert.equal(prediction.predict({ ...notice(), victim: 4 }, at)?.count, 0)
  const teammate = snapshot('competitive', 1, 0, 0)
  teammate.players[1].team = 2
  prediction.updateAuthoritative(cards('C', 0), teammate, 'Player', at)
  assert.equal(prediction.predict(notice(), at)?.count, 0)
})

test('competitive death hides cards immediately and stays cleared when confirmed', () => {
  const prediction = new KillCardPrediction()
  prediction.updateAuthoritative(cards('C', 3), snapshot('competitive', 1, 3, 0), 'Player', at)
  assert.equal(prediction.predict(notice(8, 4), at)?.count, 0)
  assert.equal(
    prediction.updateAuthoritative(cards('C', 0), snapshot('competitive', 1, 3, 1), 'Player', at + 100)?.count,
    0
  )
  assert.equal(prediction.view(at + 1600)?.count, 0)
})

test('FFA provisional death clears cards and an unconfirmed death restores them', () => {
  const prediction = new KillCardPrediction()
  prediction.updateAuthoritative(cards('F', 4), snapshot('ffa', 1, 4, 0), 'Player', at)
  assert.equal(prediction.predict(notice(8, 4), at)?.count, 0)
  assert.equal(prediction.view(at + 1501)?.count, 4)
})
