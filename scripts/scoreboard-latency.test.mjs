import assert from 'node:assert/strict'
import { test } from 'node:test'
import { scoreboardLatency } from './scoreboard-latency.ts'
import { mergeNativeScores } from '../src/main/game/native-scoreboard.ts'

test('enabled servers replace bot latency with BOT and preserve human latency', () => {
  assert.equal(scoreboardLatency({ bot: true, ping: 42 }, true), 'BOT')
  assert.equal(scoreboardLatency({ bot: false, ping: 42 }, true), 42)
  assert.equal(scoreboardLatency({ bot: true, ping: 42 }, false), 42)
  assert.equal(scoreboardLatency({ bot: false, ping: 0 }, true), 0)
})

test('native score merging preserves the authoritative bot identity and server label policy', () => {
  const snapshot = {
    showBotTags: true,
    players: [
      { id: 1, name: 'Bot', kills: 0, deaths: 0, ping: 42, bot: true },
      { id: 2, name: 'Human', kills: 0, deaths: 0, ping: 99, bot: false }
    ]
  }
  const merged = mergeNativeScores(snapshot, [
    { id: 1, name: 'Bot', kills: 8, deaths: 2, ping: 0 },
    { id: 2, name: 'Human', kills: 2, deaths: 1, ping: 30 }
  ])
  assert.equal(scoreboardLatency(merged.players[0], merged.showBotTags), 'BOT')
  assert.equal(scoreboardLatency(merged.players[1], merged.showBotTags), 30)
})
