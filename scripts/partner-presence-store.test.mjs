/* eslint-disable @typescript-eslint/explicit-function-return-type */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { create } from 'zustand'

function harness() {
  let accountId = 'player'
  let current = {
    connectionId: 'first',
    seenAt: new Date().toISOString(),
    server: { id: 'server' },
    communityId: 'community'
  }
  let rejectPresence = false
  let rejectLaunch = false
  const calls = []
  const exports = {}
  const source = ts.transpileModule(
    readFileSync(
      new URL(
        '../src/renderer/src/features/partner-branding/partner-presence.store.ts',
        import.meta.url
      ),
      'utf8'
    ),
    {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
    }
  ).outputText
  new Function('require', 'exports', 'window', source)(
    (name) => {
      if (name === 'zustand') return { create }
      return {
        useAuthStore: {
          getState: () => ({ session: accountId ? { player: { id: accountId } } : null })
        }
      }
    },
    exports,
    {
      api: {
        partnerServers: {
          presence: async () => {
            if (rejectPresence) throw new Error('offline')
            return current
          },
          connect: async (...args) => {
            calls.push(args)
            if (rejectLaunch) throw new Error('launch')
          }
        }
      }
    }
  )
  return {
    store: exports.usePartnerPresenceStore,
    calls,
    presence: (value) => {
      current = value
    },
    account: (value) => {
      accountId = value
    },
    failPresence: () => {
      rejectPresence = true
    },
    failLaunch: () => {
      rejectLaunch = true
    }
  }
}

test('server confirmation, dismissal and a new session are kept separate', async () => {
  const h = harness()
  assert.equal(h.store.getState().presence, null)
  await h.store.getState().refresh()
  h.store.getState().dismissSession()
  await h.store.getState().refresh()
  assert.equal(h.store.getState().dismissedConnectionId, 'first')
  h.presence({ connectionId: 'second', seenAt: new Date().toISOString(), server: { id: 'server' } })
  await h.store.getState().refresh()
  assert.equal(h.store.getState().dismissedConnectionId, null)
  h.presence(null)
  await h.store.getState().refresh()
  assert.equal(h.store.getState().presence, null)
})

test('reconnect uses a fresh server launch and surfaces failure without discarding presence', async () => {
  const h = harness()
  await h.store.getState().refresh()
  h.failLaunch()
  await h.store.getState().reconnect()
  assert.deepEqual(h.calls, [['server', undefined, 'community']])
  assert.equal(h.store.getState().launchError, true)
  assert.equal(h.store.getState().launching, false)
  assert.equal(h.store.getState().presence.connectionId, 'first')
})

test('stale confirmation expires during outages and logout clears session state', async () => {
  const h = harness()
  h.presence({
    connectionId: 'old',
    seenAt: new Date(Date.now() - 40_000).toISOString(),
    server: { id: 'server' }
  })
  await h.store.getState().refresh()
  h.failPresence()
  await h.store.getState().refresh()
  assert.equal(h.store.getState().presence, null)
  h.account(null)
  await h.store.getState().refresh()
  assert.equal(h.store.getState().accountId, null)
})
