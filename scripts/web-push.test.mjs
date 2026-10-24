/* eslint-disable @typescript-eslint/explicit-function-return-type */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import vm from 'node:vm'
import { readFile } from 'node:fs/promises'

async function worker(base = '/pwa/', cacheKeys = []) {
  const listeners = new Map(),
    notices = [],
    opened = [],
    deleted = []
  let pages = []
  const self = {
    location: { origin: 'https://region.example' },
    addEventListener: (event, callback) => listeners.set(event, callback),
    registration: {
      scope: `https://region.example${base}`,
      showNotification: async (title, options) => notices.push({ title, options })
    },
    clients: {
      claim: () => undefined,
      matchAll: async () => pages,
      openWindow: async (url) => opened.push(url)
    }
  }
  vm.runInNewContext(await readFile(new URL('../src/web/sw.js', import.meta.url), 'utf8'), {
    self,
    caches: { keys: async () => cacheKeys, delete: async (key) => deleted.push(key) },
    URL,
    Date
  })
  return {
    notices,
    opened,
    deleted,
    setPages: (value) => {
      pages = value
    },
    dispatch: async (type, extra) => {
      let pending
      listeners.get(type)({
        ...extra,
        waitUntil: (promise) => {
          pending = promise
        }
      })
      await pending
    }
  }
}
const matchId = '11111111-1111-4111-8111-111111111111'
const payload = () => ({
  title: 'Match found',
  body: 'Accept your match',
  matchId,
  deadline: new Date(Date.now() + 600_000).toISOString()
})

test('a push wakes the worker without an open tab and shows one tagged match notification', async () => {
  const h = await worker()
  await h.dispatch('push', { data: { json: payload } })
  assert.equal(h.notices.length, 1)
  assert.equal(h.notices[0].options.tag, `match-ready-${matchId}`)
  assert.equal(h.notices[0].options.requireInteraction, true)
  assert.equal(h.notices[0].options.data.token, undefined)
})

test('expired, malformed and invalid-id pushes never prompt acceptance', async () => {
  const h = await worker()
  for (const data of [
    { ...payload(), deadline: 'invalid' },
    { ...payload(), deadline: new Date(0).toISOString() },
    { ...payload(), matchId: '<script>' },
    null
  ]) {
    await h.dispatch('push', { data: { json: () => data } })
  }
  await h.dispatch('push', {
    data: {
      json: () => {
        throw new Error('bad json')
      }
    }
  })
  assert.equal(h.notices.length, 0)
})

test('clicking push opens the local app; payloads cannot navigate to an external URL or accept a match', async () => {
  const h = await worker()
  let closed = false
  await h.dispatch('notificationclick', {
    notification: {
      data: { url: 'https://attacker.example' },
      close: () => {
        closed = true
      }
    }
  })
  assert.equal(closed, true)
  assert.deepEqual(h.opened, ['/pwa/'])
})

test('notification click focuses an existing same-origin app tab', async () => {
  const h = await worker()
  let focused = 0
  h.setPages([
    {
      url: 'https://attacker.example/pwa/',
      focus: () => {
        throw new Error('wrong origin')
      }
    },
    {
      url: 'https://region.example/pwa/',
      focus: () => {
        focused++
      }
    }
  ])
  await h.dispatch('notificationclick', {
    notification: {
      close() {
        return undefined
      }
    }
  })
  assert.equal(focused, 1)
  assert.equal(h.opened.length, 0)
})

test('partner notification navigation and icons respect an arbitrary nested mount', async () => {
  const h = await worker('/community/arena/')
  await h.dispatch('push', { data: { json: payload } })
  assert.equal(h.notices[0].options.icon, '/community/arena/web-app-manifest-192x192.png')
  await h.dispatch('notificationclick', {
    notification: {
      close() {
        return undefined
      }
    }
  })
  assert.deepEqual(h.opened, ['/community/arena/'])
})

test('activating a partner worker preserves website and other mount caches', async () => {
  const h = await worker('/community/', [
    'partner-website-cache',
    '16competitive-web:/other/:v2',
    '16competitive-web:/community/arena/:v2',
    '16competitive-web:/community/:v2',
    '16competitive-web:/community/:v3'
  ])
  await h.dispatch('activate', {})
  assert.deepEqual(h.deleted, ['16competitive-web:/community/:v2'])
})
