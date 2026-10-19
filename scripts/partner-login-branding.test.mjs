/* eslint-disable @typescript-eslint/explicit-function-return-type */
import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import ts from 'typescript'
import { validateCommunityJoin } from '../src/shared/community-directory.ts'
const source = ts.transpileModule(
  await readFile(new URL('../src/main/partner-branding.ts', import.meta.url), 'utf8'),
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }
).outputText
async function harness({ token = null, branch = null, download = null, onFetch } = {}) {
  const requests = [],
    lookups = []
  const state = { token }
  const context = vm.createContext({
    URL,
    AbortSignal,
    fetch: async (url, options) => {
      requests.push({ path: url.pathname, headers: options.headers })
      onFetch?.(state)
      return Response.json({ branding: null })
    }
  })
  const deps = {
    '../shared/community-directory': { validateCommunityJoin },
    './auth': { getSessionToken: () => state.token },
    './config': { API_BASE_URL: 'https://api.example.test' },
    './icafe-branch': {
      getVerifiedBranchPartnerId: async () => {
        lookups.push('branch')
        return branch
      }
    },
    './partner-attribution': {
      detectDownloadPartner: async () => {
        lookups.push('download')
        return download
      }
    },
    '../shared/partner-branding': { parsePartnerBranding: (body) => body }
  }
  const module = new vm.SourceTextModule(source, { context })
  await module.link((specifier) => {
    const values = deps[specifier]
    return new vm.SyntheticModule(
      Object.keys(values),
      function () {
        for (const [key, value] of Object.entries(values)) this.setExport(key, value)
      },
      { context }
    )
  })
  await module.evaluate()
  return { api: module.namespace, requests, lookups }
}
test('guest branding prefers the verified local branch over the installer referral', async () => {
  const h = await harness({ branch: 'branch-partner', download: 'download-partner' })
  await h.api.getPartnerBranding()
  assert.equal(h.requests[0].path, '/partners/branding/public/branch-partner')
  assert.equal(Object.keys(h.requests[0].headers).length, 0)
  assert.deepEqual(h.lookups, ['branch'])
})
test('guest uses download attribution or stock branding when absent', async () => {
  const h = await harness({ download: 'download-partner' })
  await h.api.getPartnerBranding()
  assert.equal(h.requests[0].path, '/partners/branding/public/download-partner')
  const stock = await harness()
  assert.equal((await stock.api.getPartnerBranding()).branding, null)
  assert.equal(stock.requests.length, 0)
})
test('authenticated branding uses backend affiliation and rejects a changed session', async () => {
  const h = await harness({ token: 'session', branch: 'branch-partner' })
  await h.api.getPartnerBranding()
  assert.equal(h.requests[0].path, '/partners/branding/me')
  assert.equal(h.requests[0].headers.authorization, 'Bearer session')
  assert.equal(h.lookups.length, 0)
  const changed = await harness({
    token: 'session',
    onFetch: (state) => {
      state.token = null
    }
  })
  await assert.rejects(changed.api.getPartnerBranding(), /Session changed/)
})

test('authenticated visitors fetch the requested public community without changing affiliation', async () => {
  const id = '12345678-1234-4123-8123-123456789abc'
  const h = await harness({ token: 'session' })
  await h.api.getPartnerBranding(id)
  assert.equal(h.requests[0].path, `/partners/branding/public/${id}`)
  await h.api.getPartnerBranding()
  assert.equal(h.requests[1].path, '/partners/branding/me')
  await assert.rejects(h.api.getPartnerBranding('../invalid'), /INVALID_COMMUNITY_JOIN/)
  assert.equal(h.requests.length, 2)
})
