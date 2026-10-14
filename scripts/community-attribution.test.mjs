import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import vm from 'node:vm'
import ts from 'typescript'
import { isPartnerId, partnerIdFromDownloadName } from '../src/shared/partner-attribution.ts'
const a = '12345678-1234-4123-8123-123456789abc',
  b = '22345678-1234-4123-8123-123456789abc',
  player = '32345678-1234-4123-8123-123456789abc'
// JavaScript fixture helpers return dynamically evaluated module values.
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
const compile = (source) =>
  ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext }
  }).outputText
const desktopSource = compile(
  await readFile(new URL('../src/main/partner-attribution.ts', import.meta.url), 'utf8')
)
const browserSource = compile(
  await readFile(new URL('../src/web/partner-attribution.ts', import.meta.url), 'utf8')
)
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
async function moduleFor(source, context, dependencies) {
  const mod = new vm.SourceTextModule(source, { context })
  await mod.link(async (name) => {
    const exports = dependencies[name]
    assert.ok(exports, name)
    const mock = new vm.SyntheticModule(
      Object.keys(exports),
      function () {
        for (const [key, value] of Object.entries(exports)) this.setExport(key, value)
      },
      { context }
    )
    return mock
  })
  await mod.evaluate()
  return mod.namespace
}
test('a newly installed community overrides stale desktop attribution, with account-scoped prompts and retry on failure', async () => {
  const files = new Map([
      ['/fixture/user/partner-attribution.json', JSON.stringify({ partnerId: a })],
      ['/fixture/resources/partner-attribution.json', JSON.stringify({ partnerId: b })]
    ]),
    requests = []
  let okay = false
  const context = vm.createContext({
    Buffer,
    AbortSignal,
    process: { resourcesPath: '/fixture/resources', execPath: '/fixture/client', env: {} },
    console: {
      warn() {
        /* Expected fixture failures stay quiet. */
      }
    },
    fetch: async (url, init) => {
      requests.push(JSON.parse(init.body))
      return { ok: okay, status: okay ? 200 : 503 }
    }
  })
  const api = await moduleFor(desktopSource, context, {
    electron: { app: { isPackaged: true, getPath: () => '/fixture/user' } },
    'node:fs/promises': {
      readFile: async (p) => {
        if (!files.has(p)) throw new Error('missing')
        return Buffer.from(files.get(p))
      },
      writeFile: async (p, data) => files.set(p, data),
      mkdir: async () => {}
    },
    'node:path': path,
    './config': { API_BASE_URL: 'https://example.test' },
    '../shared/partner-attribution': { isPartnerId, partnerIdFromDownloadName }
  })
  assert.equal(await api.detectDownloadPartner(), b)
  await api.linkDownloadPartner('test-token', player)
  okay = true
  await api.linkDownloadPartner('test-token', player)
  await api.linkDownloadPartner('test-token', player)
  assert.equal(requests.length, 2)
  assert.equal(requests[1].partnerId, b)
  await api.linkDownloadPartner('other-test-token', a)
  assert.equal(requests.length, 3)
  files.set('/fixture/resources/partner-attribution.json', JSON.stringify({ partnerId: a }))
  await api.linkDownloadPartner('test-token', player)
  assert.equal(requests.length, 4)
  assert.equal(requests[3].partnerId, a)
})
test('Web Play uses the new community URL without requiring local storage', async () => {
  const requests = []
  const context = vm.createContext({
    URL,
    Date,
    location: { href: `https://play.example.test/?partnerId=${b}` },
    localStorage: {
      setItem() {
        throw new Error('disabled')
      },
      getItem() {
        throw new Error('disabled')
      },
      removeItem() {
        throw new Error('disabled')
      }
    },
    console: {
      warn() {
        /* Expected fixture failures stay quiet. */
      }
    }
  })
  const api = await moduleFor(browserSource, context, {
    '../shared/partner-attribution': { isPartnerId },
    './browser-session': {
      requestJson: async (path, options) =>
        requests.push({ path, body: JSON.parse(options.init.body) })
    }
  })
  assert.equal(api.getBrowserPartnerId(), b)
  await api.linkBrowserPartner(player)
  assert.equal(requests.length, 1)
  assert.equal(requests[0].body.partnerId, b)
})
test('Web Play remembers considered attribution separately for each account', async () => {
  const files = new Map(),
    requests = []
  const location = { href: `https://play.example.test/?partnerId=${b}` }
  const context = vm.createContext({
    URL,
    Date,
    location,
    localStorage: {
      setItem: (k, v) => files.set(k, v),
      getItem: (k) => files.get(k) ?? null,
      removeItem: (k) => files.delete(k)
    },
    console: {
      warn() {
        /* Expected fixture failures stay quiet. */
      }
    }
  })
  const api = await moduleFor(browserSource, context, {
    '../shared/partner-attribution': { isPartnerId },
    './browser-session': {
      requestJson: async (path, options) =>
        requests.push({ path, body: JSON.parse(options.init.body) })
    }
  })
  await api.linkBrowserPartner(player)
  await api.linkBrowserPartner(player)
  assert.equal(requests.length, 1)
  await api.linkBrowserPartner(a)
  assert.equal(requests.length, 2)
  location.href = `https://play.example.test/?partnerId=${a}`
  await api.linkBrowserPartner(player)
  assert.equal(requests.length, 3)
  assert.equal(requests[2].body.partnerId, a)
})
