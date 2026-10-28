import assert from 'node:assert/strict'
import { test } from 'node:test'
import { LocalBridge } from '../src/web/local-bridge.ts'

test('background helper reads cannot request device access before a handoff', async () => {
  const bridge = new LocalBridge()
  let calls = 0
  const original = globalThis.fetch
  globalThis.fetch = async () => {
    calls++
    return new Response('{}')
  }
  try {
    await assert.rejects(bridge.request('http://127.0.0.1:51000/settings', {}), /unavailable/)
    assert.equal(calls, 0)
    bridge.authorize()
    assert.equal((await bridge.request('http://127.0.0.1:51000/settings', {})).status, 200)
    assert.equal(calls, 1)
  } finally {
    globalThis.fetch = original
  }
})

test('blocked or dismissed device access stops background retries until reconnect', async () => {
  const bridge = new LocalBridge()
  let calls = 0
  const original = globalThis.fetch
  globalThis.fetch = async () => {
    calls++
    throw new TypeError('Failed to fetch')
  }
  try {
    bridge.authorize()
    await assert.rejects(bridge.request('http://127.0.0.1:51000/settings', {}), /Failed to fetch/)
    await assert.rejects(bridge.request('http://127.0.0.1:51000/settings', {}), /unavailable/)
    assert.equal(calls, 1)
    bridge.authorize()
    await assert.rejects(bridge.request('http://127.0.0.1:51000/settings', {}), /Failed to fetch/)
    assert.equal(calls, 2)
  } finally {
    globalThis.fetch = original
  }
})

test('closing the voice stream does not disable the shared settings bridge', async () => {
  const bridge = new LocalBridge()
  const controller = new AbortController()
  const original = globalThis.fetch
  globalThis.fetch = async (_url, init) => {
    if (init.signal) {
      controller.abort()
      throw new Error('Aborted')
    }
    return new Response('{}')
  }
  try {
    bridge.authorize()
    await assert.rejects(
      bridge.request('http://127.0.0.1:51000/settings', { signal: controller.signal })
    )
    assert.equal((await bridge.request('http://127.0.0.1:51000/settings', {})).status, 200)
  } finally {
    globalThis.fetch = original
  }
})
