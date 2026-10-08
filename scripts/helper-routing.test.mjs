/* eslint-disable @typescript-eslint/explicit-function-return-type */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import ts from 'typescript'

async function harness() {
  const calls = []
  let response = 'approved'
  const manifest = { version: '0.1.42', platform: 'linux', arch: 'x64' }
  const source = ts.transpileModule(
    await readFile(new URL('../src/main/anticheat/helper-integrity.ts', import.meta.url), 'utf8'),
    {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 }
    }
  ).outputText
  const context = vm.createContext({
    URL,
    AbortSignal,
    Date,
    process: { platform: 'linux', arch: 'x64' },
    fetch: async (url, options) => {
      calls.push({ url: String(url), options })
      if (response === 'offline') throw new Error('unreachable')
      return {
        ok: response !== 'revoked' && typeof response !== 'number',
        status: typeof response === 'number' ? response : response === 'revoked' ? 404 : 200,
        json: async () =>
          response === 'mismatch' ? { ...manifest, sha256: 'different' } : manifest
      }
    }
  })
  const dependencies = {
    'node:fs/promises': { readFile: async () => JSON.stringify(manifest) },
    'node:path': { dirname: () => '/helper', join: (...parts) => parts.join('/') },
    '../../../helper-release.json': {
      default: { version: manifest.version, publicKeyPem: 'fixture' }
    },
    './helper-release-verifier': {
      verifyHelperRelease: (envelope) => envelope,
      verifyHelperBinary: () => {}
    },
    '../matchmaking-regions': { resolveServiceApiUrl: async () => 'https://preferred.example' }
  }
  const module = new vm.SourceTextModule(source, { context })
  await module.link((name) => {
    const exports = dependencies[name]
    assert.ok(exports, name)
    return new vm.SyntheticModule(
      Object.keys(exports),
      function () {
        for (const [key, value] of Object.entries(exports)) this.setExport(key, value)
      },
      { context }
    )
  })
  await module.evaluate()
  return {
    calls,
    verify: module.namespace.verifyPackagedHelper,
    setResponse: (value) => {
      response = value
    }
  }
}

test('approval uses preferred region before login and scopes its cache to match origin', async () => {
  const h = await harness()
  await h.verify('/helper/binary')
  await h.verify('/helper/binary')
  assert.equal(h.calls.length, 1)
  assert.equal(h.calls[0].url, 'https://preferred.example/helper-releases/0.1.42/linux/x64')
  await h.verify('/helper/binary', 'https://match.example')
  assert.equal(h.calls.length, 2)
  assert.equal(h.calls[1].options.redirect, 'error')
  assert.equal(h.calls[1].options.cache, 'no-store')
  await assert.rejects(
    h.verify('/helper/binary', 'https://user:password@match.example'),
    /Invalid helper registry/
  )
  await assert.rejects(
    h.verify('/helper/binary', 'http://match.example'),
    /Invalid helper registry/
  )
})

test('explicit rejection and mismatched approval cannot fall back to another node', async () => {
  for (const response of ['revoked', 'mismatch']) {
    const h = await harness()
    h.setResponse(response)
    await assert.rejects(
      h.verify('/helper/binary', 'https://match.example'),
      /not currently approved|differs/
    )
    assert.equal(h.calls.length, 1)
  }
})

test('connection failure identifies the regional endpoint and is not cached as approved', async () => {
  const h = await harness()
  h.setResponse('offline')
  await assert.rejects(
    h.verify('/helper/binary'),
    (error) =>
      error.name === 'HelperApprovalConnectionError' &&
      error.apiOrigin === 'https://preferred.example'
  )
  h.setResponse('approved')
  await h.verify('/helper/binary')
  assert.equal(h.calls.length, 2)
})

test('only temporary gateway/service errors are retryable, never authorization rejections', async () => {
  for (const status of [502, 503, 504, 401, 403, 404, 500]) {
    const h = await harness()
    h.setResponse(status)
    await assert.rejects(h.verify('/helper/binary'), (error) =>
      [502, 503, 504].includes(status)
        ? error.name === 'HelperApprovalConnectionError'
        : error.name !== 'HelperApprovalConnectionError'
    )
    h.setResponse('approved')
    await h.verify('/helper/binary')
    assert.equal(h.calls.length, 2, 'service errors never count as cached approval')
  }
})
