import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  allowsVoiceTransport,
  isLoopbackBackend,
  resolveBackendPolicy
} from '../src/main/backend-policy.ts'

test('localhost voice accepts direct sessions but remote voice remains relay-only', () => {
  assert.equal(allowsVoiceTransport('all', 0, 'ws://localhost:3000/matchmaking/ws'), true)
  assert.equal(allowsVoiceTransport('all', 0, 'ws://127.0.0.1:3000/matchmaking/ws'), true)
  assert.equal(allowsVoiceTransport('all', 0, 'wss://api.example.test/matchmaking/ws'), false)
  assert.equal(allowsVoiceTransport('all', 0, 'wss://localhost.evil.test/ws'), false)
  assert.equal(allowsVoiceTransport('relay', 1, 'wss://api.example.test/ws'), true)
  assert.equal(allowsVoiceTransport('relay', 0, 'wss://api.example.test/ws'), false)
  assert.equal(allowsVoiceTransport('all', 5, 'ws://localhost:3000/ws'), false)
})

test('development defaults to loopback and permits only a local unsigned helper', () => {
  const policy = resolveBackendPolicy({ packaged: false })
  assert.equal(policy.apiUrl, 'http://127.0.0.1:3000')
  assert.equal(policy.websocketUrl, 'ws://127.0.0.1:3000/matchmaking/ws')
  assert.equal(policy.localDevelopment, true)
  assert.equal(policy.requiresSignedHelper, false)
})
test('remote development and packaged releases always require signed helper approval', () => {
  for (const config of [
    { packaged: true },
    { packaged: false, apiUrl: 'https://16competitive.papamo.dev' },
    { packaged: false, websocketUrl: 'wss://16competitive.papamo.dev/matchmaking/ws' },
    { packaged: true, apiUrl: 'http://127.0.0.1:3000' }
  ])
    assert.equal(resolveBackendPolicy(config).requiresSignedHelper, true)
})
test('remote plaintext and fake loopback hosts cannot bypass the policy', () => {
  assert.equal(isLoopbackBackend('https://localhost.attacker.example'), false)
  assert.equal(isLoopbackBackend('https://localhost@attacker.example'), false)
  assert.equal(isLoopbackBackend('http://[::1]:3000'), true)
  assert.throws(() => resolveBackendPolicy({ packaged: false, apiUrl: 'http://api.example.test' }))
  assert.throws(() =>
    resolveBackendPolicy({ packaged: false, websocketUrl: 'ws://api.example.test/ws' })
  )
})
