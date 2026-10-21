import { parseMatchmakingActivity } from '../src/shared/matchmaking-activity.ts'
/* eslint-disable @typescript-eslint/explicit-function-return-type */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import ts from 'typescript'

async function loadRegionsModule({
  token = 'test-token',
  selectedNodeId = null,
  nodes = [],
  probeLatencyMs = 0,
  probeFails = false,
  bootstrapFails = false,
  serviceFails = [],
  requests = []
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
    '../shared/matchmaking-activity': { parseMatchmakingActivity },
    './auth': { getSessionToken: () => token },
    './config': { API_BASE_URL: 'https://bootstrap.example', LOCAL_DEVELOPMENT: false },
    './backend-policy': { isLoopbackBackend: () => false }
  }
  const context = vm.createContext({
    console,
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
      requests.push(url)
      if (serviceFails.some((origin) => url.startsWith(origin))) throw new Error('Unavailable')
      if (url === 'https://bootstrap.example/nodes') {
        if (bootstrapFails) throw new Error('Primary node discovery unavailable')
        return { ok: true, json: async () => ({ nodes }) }
      }
      if (url.endsWith('/stats/matchmaking-activity'))
        return {
          ok: true,
          json: async () => ({ region: 'euw', inGamePlayers: 3, queuedPlayers: 2 })
        }
      if (url.endsWith('/nodes')) return { ok: true, json: async () => ({ nodes }) }
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

test('launch probes preserve a saved server that is temporarily unreachable', async () => {
  const regions = await loadRegionsModule({
    selectedNodeId: 'saved',
    nodes: [node('saved', null)],
    probeFails: true
  })
  await regions.getMatchmakingNodes()
  assert.equal(regions.saved().selectedNodeId, 'saved')
})

test('node discovery falls back to a bundled regional HTTPS endpoint', async () => {
  const regions = await loadRegionsModule({
    nodes: [node('regional', null)],
    bootstrapFails: true
  })
  const discovered = await regions.getMatchmakingNodes(false)
  assert.equal(discovered[0]?.id, 'regional')
})

test('public regional discovery works before sign-in', async () => {
  const h = await loadRegionsModule({ token: null })
  assert.deepEqual(Array.from(await h.getMatchmakingNodes()), [])
})

test('failed latency probes recover through regional HTTPS before SEA', async () => {
  const requests = []
  const regions = await loadRegionsModule({ probeFails: true, requests })
  assert.equal(
    await regions.resolvePreferredMatchmakingApiUrl(),
    'https://euw.16competitive.papamo.dev'
  )
  assert.ok(!requests.includes('https://bootstrap.example/nodes'))
})

test('SEA fallback requires two failed rounds for every bundled region', async () => {
  const requests = []
  const origins = [
    'https://euw.16competitive.papamo.dev',
    'https://na.16competitive.papamo.dev',
    'https://sa.16competitive.papamo.dev'
  ]
  const regions = await loadRegionsModule({ serviceFails: origins, requests })
  assert.equal(await regions.resolvePreferredMatchmakingApiUrl(), 'https://bootstrap.example')
  for (const origin of origins)
    assert.equal(requests.filter((url) => url === origin + '/nodes').length, 3)
})

test('total outage fails instead of returning an unchecked SEA endpoint', async () => {
  const regions = await loadRegionsModule({ serviceFails: ['https://'] })
  await assert.rejects(regions.resolveServiceApiUrl(), /Could not reach/)
})

test('activity counts use the selected regional service instead of bootstrap', async () => {
  const requests = []
  const regions = await loadRegionsModule({
    selectedNodeId: 'warsaw',
    nodes: [node('warsaw', 42)],
    requests
  })
  const activity = await regions.getMatchmakingActivity()
  assert.equal(activity.inGamePlayers, 3)
  assert.equal(activity.queuedPlayers, 2)
  assert.ok(requests.includes('https://warsaw.example/stats/matchmaking-activity'))
  assert.ok(!requests.includes('https://bootstrap.example/stats/matchmaking-activity'))
})
