/* eslint-disable @typescript-eslint/explicit-function-return-type */
import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
const compile = (path) =>
  ts.transpile(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022
  })
const source = compile('../src/web/browser-auth.ts')
const cacheKey = '16competitive.web.auth-session'
function harness({ incoming = false, returnUrl = null, failure = false } = {}) {
  let token = 'previous-token'
  const previous = { expiresAt: '2099-01-01T00:00:00Z', player: { id: 'previous-player' } }
  const cache = new Map([[cacheKey, JSON.stringify(previous)]])
  const calls = [],
    redirects = []
  const deps = {
    './partner-login-capture': { hasIncomingPartnerLogin: () => incoming },
    './partner-return': { partnerReturnUrl: () => returnUrl },
    './partner-attribution': { linkBrowserPartner: async () => {} },
    './local-play': { logoutNativeHelper: async () => {} },
    '../shared/auth': {},
    './browser-session': {
      webHandoffReady: Promise.resolve(),
      getWebSessionToken: () => token,
      getWebPartnerLogin: () => undefined,
      clearWebSessionToken: () => {
        token = null
      },
      requestJson: async (path) => {
        calls.push(path)
        if (failure) throw new Error('offline')
        return previous
      }
    }
  }
  const exports = {}
  new Function('require', 'exports', 'localStorage', 'window', source)(
    (name) => deps[name],
    exports,
    {
      getItem: (key) => cache.get(key) ?? null,
      removeItem: (key) => cache.delete(key),
      setItem: (key, value) => cache.set(key, value)
    },
    { location: { replace: (url) => redirects.push(url) } }
  )
  return {
    api: exports.browserAuthApi,
    token: () => token,
    cache,
    calls,
    redirects,
    setToken: (value) => {
      token = value
    }
  }
}
test('fresh partner handoff discards previous account even when the network is down', async () => {
  const h = harness({ incoming: true, failure: true })
  assert.equal(await h.api.restore(), null)
  assert.equal(h.token(), null)
  assert.equal(h.cache.has(cacheKey), false)
  assert.deepEqual(h.calls, [])
})
test('ordinary PWA reopen retains its offline session fallback', async () => {
  const h = harness({ failure: true })
  assert.equal((await h.api.restore()).player.id, 'previous-player')
  assert.equal(h.token(), 'previous-token')
})
test('partner logout clears local authentication and returns even if logout request fails', async () => {
  const returnUrl = 'https://www.olaguergeyming.com/gamehub/'
  const h = harness({ returnUrl, failure: true })
  await assert.rejects(h.api.logout())
  assert.equal(h.token(), null)
  assert.equal(h.cache.has(cacheKey), false)
  assert.deepEqual(h.redirects, [returnUrl])
})
test('ordinary logout does not redirect', async () => {
  const h = harness()
  await h.api.logout()
  assert.equal(h.token(), null)
  assert.deepEqual(h.redirects, [])
})
test('return destinations are restricted to the approved partner', () => {
  const source = compile('../src/web/partner-return.ts')
  for (const [id, expected] of [
    ['583704ab-6fc5-4b58-8fc2-d91cf1d7c051', 'https://www.olaguergeyming.com/gamehub/'],
    [null, null],
    ['unknown', null],
    ['https://evil.example/', null]
  ]) {
    const exports = {}
    const shared = {}
    new Function('exports', compile('../src/shared/partner-return.ts'))(shared)
    new Function('require', 'exports', source)(
      (name) =>
        name === '../shared/partner-return'
          ? shared
          : {
              getWebPartnerLogin: () => (id ? { partnerId: id, partnerName: 'Partner' } : undefined)
            },
      exports
    )
    assert.equal(exports.partnerReturnUrl(), expected)
  }
})

test('later session refresh does not discard the newly accepted partner session', async () => {
  const h = harness({ incoming: true, failure: true })
  await h.api.restore()
  h.setToken('new-partner-token')
  h.cache.set(
    cacheKey,
    JSON.stringify({ expiresAt: '2099-01-01T00:00:00Z', player: { id: 'new-player' } })
  )
  assert.equal((await h.api.restore()).player.id, 'new-player')
  assert.equal(h.token(), 'new-partner-token')
})

function sessionHarness(cache = new Map()) {
  const exports = {}
  const storage = {
    getItem: (key) => cache.get(key) ?? null,
    setItem: (key, value) => cache.set(key, value),
    removeItem: (key) => cache.delete(key)
  }
  new Function(
    'require',
    'exports',
    'localStorage',
    'window',
    compile('../src/web/browser-session.ts')
  )(() => ({ partnerApiOrigin: () => 'https://example.com' }), exports, storage, {
    location: { href: 'https://example.com/pwa?partnerId=583704ab-6fc5-4b58-8fc2-d91cf1d7c051' }
  })
  return { api: exports, cache }
}
test('partner return context survives reload but clears on normal login and logout', () => {
  const { api, cache } = sessionHarness()
  const partner = {
    partnerId: '583704ab-6fc5-4b58-8fc2-d91cf1d7c051',
    partnerName: 'Olaguer Geyming'
  }
  api.setWebSessionToken('partner-session', partner)
  assert.deepEqual(api.getWebPartnerLogin(), partner)
  assert.deepEqual(sessionHarness(cache).api.getWebPartnerLogin(), partner)
  api.setWebSessionToken('ordinary-session')
  assert.equal(api.getWebPartnerLogin(), undefined)
  api.setWebSessionToken('partner-session', partner)
  api.clearWebSessionToken()
  assert.equal(sessionHarness(cache).api.getWebPartnerLogin(), undefined)
})
test('partner branding URL alone does not make an ordinary login a partner session', () => {
  const { api } = sessionHarness()
  api.setWebSessionToken('ordinary-session')
  assert.equal(api.getWebPartnerLogin(), undefined)
})
