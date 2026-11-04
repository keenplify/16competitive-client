/* eslint-disable @typescript-eslint/explicit-function-return-type */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'

const source = ts.transpileModule(
  await readFile(new URL('../src/main/anticheat/startup-partner-logo.ts', import.meta.url), 'utf8'),
  {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }
).outputText
function harness({
  saved = 'saved-token',
  active = null,
  logo = true,
  oversized = false,
  invalid = false,
  changed = false
} = {}) {
  const requests = []
  const branding = {
    logoUrl: logo ? 'https://api.test/approved-logo' : null,
    communityName: 'Community'
  }
  let downloaded = false
  const exports = {}
  const dependencies = {
    electron: {
      nativeImage: {
        createFromBuffer: () => ({
          isEmpty: () => invalid,
          getSize: () => ({ width: 256, height: 128 }),
          resize: () => ({ toDataURL: () => 'data:image/png;base64,cG5n' })
        })
      }
    },
    '../auth': {
      getSessionToken: () => (changed && downloaded ? 'different-account' : active),
      readStoredSessionToken: async () => saved
    },
    '../config': { API_BASE_URL: 'https://api.test' },
    '../partner-branding': { getPartnerBranding: async () => ({ branding }) },
    '../../shared/partner-branding': { parsePartnerBranding: (value) => value }
  }
  const fetch = async (url, options) => {
    requests.push({ url: String(url), options })
    if (String(url).endsWith('/me')) return { ok: true, json: async () => ({ branding }) }
    downloaded = true
    return new Response(new Uint8Array(oversized ? 4 * 1024 * 1024 + 1 : 10))
  }
  new Function('require', 'exports', 'fetch', source)((name) => dependencies[name], exports, fetch)
  return { load: exports.loadStartupPartnerLogo, requests }
}
test('startup resolves the saved account community before session restoration', async () => {
  const h = harness()
  assert.equal((await h.load()).name, 'Community')
  assert.equal(h.requests[0].options.headers.authorization, 'Bearer saved-token')
  assert.equal(h.requests[1].options.headers, undefined)
  assert.equal(h.requests[1].options.redirect, 'error')
})
test('an active account takes precedence over a persisted account', async () => {
  const h = harness({ active: 'current-token' })
  await h.load()
  assert.equal(h.requests[0].options.headers.authorization, 'Bearer current-token')
})
test('anonymous partner installations use existing public attribution', async () => {
  const h = harness({ saved: null })
  assert.ok(await h.load())
  assert.equal(h.requests.length, 1)
  assert.equal(h.requests[0].options.headers, undefined)
})
test('missing community artwork keeps the default logo', async () => {
  const h = harness({ logo: false })
  assert.equal(await h.load(), null)
  assert.equal(h.requests.length, 1)
})
test('account changes discard pending community artwork', async () => {
  assert.equal(await harness({ changed: true }).load(), null)
})
test('oversized or undecodable community artwork is rejected', async () => {
  await assert.rejects(harness({ oversized: true }).load(), /too large/)
  await assert.rejects(harness({ invalid: true }).load(), /Invalid community logo/)
})
