/* eslint-disable @typescript-eslint/explicit-function-return-type */
import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { create } from 'zustand'
import ts from 'typescript'
import { parsePartnerLoginPreview } from '../src/shared/partner-login.ts'
import { isPartnerId } from '../src/shared/partner-attribution.ts'
const id = '12345678-1234-4123-8123-123456789abc'
const raw = 'a'.repeat(43)
const proof = 'b'.repeat(43)
const compile = (path) =>
  ts.transpile(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022
  })
const captureSource = compile('../src/web/partner-login-capture.ts')
const storeSource = compile('../src/web/partner-login.store.ts')
function capture(query) {
  const changes = []
  const exports = {}
  new Function('require', 'exports', 'window', 'history', captureSource)(
    () => ({ isPartnerId }),
    exports,
    { location: { href: `https://example.test/pwa/?${query}` } },
    { replaceState: (...args) => changes.push(args[2]) }
  )
  return { take: exports.takePartnerLogin, changes }
}
test('captures partner token once and removes credentials before app startup', () => {
  const h = capture(`partnerId=${id}&token=${raw}&validate-url=https%3A%2F%2Fevil.test`)
  assert.equal(h.changes.length, 1)
  assert.equal(h.changes[0], `/pwa/?partnerId=${id}`)
  assert.deepEqual(h.take(), { partnerId: id, token: raw })
  assert.equal(h.take(), null)
  for (const query of [
    `partnerId=${id}&token=bad`,
    `partnerId=${id}&token=${raw}&token=${raw}`,
    `partnerId=bad&token=${raw}`,
    `partnerId=${id}&token=${raw}&handoff=${raw}`
  ]) {
    const invalid = capture(query)
    assert.equal(invalid.take(), 'invalid')
    assert.ok(!invalid.changes[0].includes(raw))
  }
  assert.equal(capture(`partnerId=${id}`).take(), null)
})
const preview = () => ({
  proof,
  partnerId: id,
  partnerName: 'Partner',
  username: 'External player',
  email: null,
  expiresAt: new Date(Date.now() + 100_000).toISOString()
})
test('confirmation previews reject malformed, expired and mismatched identities', () => {
  assert.equal(parsePartnerLoginPreview(preview(), id).proof, proof)
  for (const patch of [
    { proof: raw + 'x' },
    { expiresAt: 'bad' },
    { expiresAt: new Date(0).toISOString() },
    { partnerId: 'other' },
    { username: '' },
    { email: 42 }
  ])
    assert.throws(() => parsePartnerLoginPreview({ ...preview(), ...patch }, id))
})
function harness({ existing = false, collision = false } = {}) {
  const calls = []
  const accepted = []
  let token = existing ? 'c'.repeat(43) : null
  let auth = {
    status: existing ? 'authenticated' : 'idle',
    session: existing ? { player: { id } } : null
  }
  const session = {
    token: 'd'.repeat(43),
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    player: {
      id,
      username: 'Player',
      email: null,
      mmr: 1000,
      points: 0,
      hasPassword: false,
      requiresUsernameSetup: true
    }
  }
  const deps = {
    zustand: { create },
    '../shared/partner-login': { parsePartnerLoginPreview },
    './partner-login-capture': { takePartnerLogin: () => ({ partnerId: id, token: raw }) },
    './browser-session': {
      getWebSessionToken: () => token,
      requestJson: async (path, options) => {
        calls.push({ path, options })
        if (path.endsWith('/begin')) return preview()
        if (collision) {
          collision = false
          throw Object.assign(new Error(), { code: 'PARTNER_ACCOUNT_LINK_REQUIRED' })
        }
        return session
      }
    },
    './browser-auth': {
      acceptAuth: async (body) => {
        accepted.push(body)
        token = body.token
        return body
      }
    },
    '../renderer/src/features/auth/auth.store': {
      useAuthStore: {
        getState: () => auth,
        setState: (patch) => {
          auth = { ...auth, ...patch }
        }
      }
    }
  }
  const exports = {}
  new Function('require', 'exports', storeSource)((name) => deps[name], exports)
  return {
    store: exports.usePartnerLoginStore,
    calls,
    accepted,
    signIn: () => {
      auth = { status: 'authenticated', session: { player: { id } } }
      token = 'c'.repeat(43)
    }
  }
}
test('partner token validation never authenticates without confirmation; cancellation discards proof', async () => {
  const h = harness()
  await Promise.all([h.store.getState().initialize(), h.store.getState().initialize()])
  assert.equal(h.calls.length, 1)
  assert.equal(h.accepted.length, 0)
  assert.equal(h.store.getState().phase, 'ready')
  h.store.getState().cancel()
  await h.store.getState().complete('sign_in')
  assert.equal(h.store.getState().preview, null)
  assert.equal(h.accepted.length, 0)
})
test('explicit confirmation sends only the one-time proof and accepts a normal session', async () => {
  const h = harness()
  await h.store.getState().initialize()
  await h.store.getState().complete('sign_in')
  assert.equal(h.store.getState().phase, 'done')
  assert.equal(h.store.getState().preview, null)
  assert.equal(h.accepted.length, 1)
  assert.deepEqual(JSON.parse(h.calls[1].options.init.body), { proof, action: 'sign_in' })
  assert.ok(!h.calls[1].options.init.body.includes(raw))
})
test('existing-account linking requires a signed-in session and explicit link action', async () => {
  const h = harness()
  await h.store.getState().initialize()
  await h.store.getState().complete('link')
  assert.equal(h.calls.length, 1)
  h.signIn()
  await h.store.getState().complete('link')
  assert.equal(h.calls[1].options.authenticated, true)
  assert.equal(JSON.parse(h.calls[1].options.init.body).action, 'link')
})
test('email collision preserves confirmation so the player can sign in and explicitly link', async () => {
  const h = harness({ collision: true })
  await h.store.getState().initialize()
  await h.store.getState().complete('sign_in')
  assert.equal(h.store.getState().phase, 'waiting_login')
  assert.equal(h.accepted.length, 0)
  h.signIn()
  h.store.getState().resume()
  await h.store.getState().complete('link')
  assert.equal(h.store.getState().phase, 'done')
  assert.equal(h.calls.filter((c) => c.path.endsWith('/begin')).length, 1)
})
