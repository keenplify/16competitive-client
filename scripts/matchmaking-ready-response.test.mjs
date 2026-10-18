import assert from 'node:assert/strict'
import test from 'node:test'
import { readyResponseFromServer } from '../src/shared/matchmaking-ready-response.ts'

test('in-game acceptance marks the launcher ready', () => {
  assert.equal(readyResponseFromServer('pending', ['other', 'self'], 'self'), 'accepted')
})

test('another player accepting does not change the local response', () => {
  assert.equal(readyResponseFromServer('pending', ['other'], 'self'), 'pending')
  assert.equal(readyResponseFromServer('sending', ['other'], 'self'), 'sending')
})

test('an unrelated session cannot claim an accepted response', () => {
  assert.equal(readyResponseFromServer('pending', ['other'], undefined), 'pending')
})
