/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { requestBotMatch } from '../src/shared/bot-match-request.ts'

function fixture(send = async () => {}) {
  const listeners = new Set()
  return {
    listeners,
    emit: (event) => {
      for (const listener of listeners) listener(event)
    },
    api: {
      playWithBots: send,
      onEvent: (listener) => {
        listeners.add(listener)
        return () => listeners.delete(listener)
      }
    }
  }
}

test('socket send and bot opt-in do not claim success before Match Found', async () => {
  const h = fixture()
  let complete = false
  const pending = requestBotMatch(h.api).then(() => {
    complete = true
  })
  await Promise.resolve()
  h.emit({ type: 'queue_status', botFillOptIn: true })
  h.emit({ type: 'match_found', whileQueued: true })
  await Promise.resolve()
  assert.equal(complete, false)
  h.emit({ type: 'match_found', matchId: 'fresh' })
  await pending
  assert.equal(complete, true)
  assert.equal(h.listeners.size, 0)
})

test('server refusals while queued, disconnects, cancellation and timeout reject and release listeners', async () => {
  for (const event of [
    { type: 'error', code: 'BOT_FILL_NOT_AVAILABLE', whileQueued: true },
    { type: 'queue_left' },
    { type: 'connection_state', state: 'disconnected' },
    { type: 'server_restarting' }
  ]) {
    const h = fixture()
    const pending = requestBotMatch(h.api)
    h.emit(event)
    await assert.rejects(pending)
    assert.equal(h.listeners.size, 0)
  }
  const h = fixture()
  await assert.rejects(requestBotMatch(h.api, 5), /BOT_MATCH_TIMEOUT/)
  assert.equal(h.listeners.size, 0)
})

test('a fast invitation is not missed and transport errors reject', async () => {
  const h = fixture(async () => h.emit({ type: 'match_ready_check' }))
  await requestBotMatch(h.api)
  assert.equal(h.listeners.size, 0)
  const failed = fixture(async () => {
    throw Error('offline')
  })
  await assert.rejects(requestBotMatch(failed.api), /offline/)
  assert.equal(failed.listeners.size, 0)
})
