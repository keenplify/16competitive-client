/* eslint-disable @typescript-eslint/explicit-function-return-type */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import ts from 'typescript'

async function loadRegionsModule({
  selectedNodeId = null,
  nodes = [],
  probeLatencyMs = 0,
  probeFails = false
} = {}) {
  let saved = JSON.stringify({ selectedNodeId, allowRegionExpansion: true })
  const source = ts.transpileModule(
    await readFile(new URL('../src/main/matchmaking-regions.ts', import.meta.url), 'utf8'),
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }
  ).outputText
  const dependencies = {
    electron: { app: { getPath: () => '/tmp' } },
    'node:crypto': { randomBytes: () => Buffer.alloc(16) },
    'node:dgram': {
      createSocket: () => {
        throw new Error('Unexpected probe')
      }
    },
    'node:fs/promises': {
      mkdir: async () => {},
      readFile: async () => saved,
      rename: async () => {},
      writeFile: async (_path, value) => {
        saved = value
      }
    },
    'node:path': { dirname: () => '/tmp', join: () => '/tmp/matchmaking-preferences.json' },
    './auth': { getSessionToken: () => 'test-token' },
    './config': { API_BASE_URL: 'https://bootstrap.example', LOCAL_DEVELOPMENT: false },
    './backend-policy': { isLoopbackBackend: () => false }
  }
  const context = vm.createContext({
    URL,
    AbortSignal,
    Buffer,
    performance: {
      now: (() => {
        let calls = 0
        return () => (calls++ % 2 === 0 ? 0 : probeLatencyMs)
      })()
    },
    fetch: async (url) => {
      if (url === 'https://bootstrap.example/nodes') {
        return { ok: true, json: async () => ({ nodes }) }
      }
      if (probeFails) throw new Error('Node unreachable')
      return { ok: true }
    }
  })
  const module = new vm.SourceTextModule(source, { context })
  await module.link((name) => {
    const exports = dependencies[name]
    assert.ok(exports, `Unexpected import: ${name}`)
    return new vm.SyntheticModule(
      Object.keys(exports),
      function () {
        for (const [key, value] of Object.entries(exports)) this.setExport(key, value)
      },
      { context }
    )
  })
  await module.evaluate()
  return { ...module.namespace, saved: () => JSON.parse(saved) }
}

const node = (id, latencyMs, available = true) => ({
  id,
  region: id,
  publicApiUrl: `https://${id}.example`,
  capacity: 10,
  activeConnections: 0,
  activeMatches: 0,
  available,
  latencyMs
})

test('a saved server in the orange ping range remains preferred', async () => {
  const { selectMatchmakingApiUrl } = await loadRegionsModule()
  const result = await selectMatchmakingApiUrl([node('saved', 240), node('better', 42)], 'saved')
  assert.equal(result, 'https://saved.example')
})

test('an unavailable saved server is never selected', async () => {
  const { selectMatchmakingApiUrl } = await loadRegionsModule()
  const result = await selectMatchmakingApiUrl(
    [node('saved', null, false), node('healthy', 80)],
    'saved'
  )
  assert.equal(result, 'https://healthy.example')
})

test('launch probes keep a saved server in the orange ping range', async () => {
  const regions = await loadRegionsModule({
    selectedNodeId: 'saved',
    nodes: [node('saved', null)],
    probeLatencyMs: 240
  })
  await regions.getMatchmakingNodes()
  assert.equal(regions.saved().selectedNodeId, 'saved')
})

test('a saved server at 300 ms gives way to a lower latency server', async () => {
  const { selectMatchmakingApiUrl } = await loadRegionsModule()
  const result = await selectMatchmakingApiUrl([node('saved', 300), node('better', 42)], 'saved')
  assert.equal(result, 'https://better.example')
})

test('launch probes clear a saved server that is unreachable', async () => {
  const regions = await loadRegionsModule({
    selectedNodeId: 'saved',
    nodes: [node('saved', null)],
    probeFails: true
  })
  await regions.getMatchmakingNodes()
  assert.equal(regions.saved().selectedNodeId, null)
})
