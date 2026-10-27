import { matchmakingRegionSelection } from '../src/shared/matchmaking-region-selection.ts'
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
  udpProbeState = { fails: false },
  storedUdpPings = '{}',
  probeFails = false,
  bootstrapFails = false,
  serviceFails = [],
  requests = []
} = {}) {
  let saved = JSON.stringify({ selectedNodeId, allowRegionExpansion: true })
  let udpPings = storedUdpPings
  const source = ts.transpileModule(
    await readFile(new URL('../src/main/matchmaking-regions.ts', import.meta.url), 'utf8'),
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }
  ).outputText
  const dependencies = {
    electron: { app: { getPath: () => '/tmp' } },
    'node:crypto': { randomBytes: () => Buffer.alloc(16) },
    'node:dgram': {
      createSocket: () => {
        let onMessage = () => {}
        return {
          once: () => {},
          on: (event, callback) => {
            if (event === 'message') onMessage = callback
          },
          send: (nonce, _port, _host, callback) => {
            if (udpProbeState.fails) callback(new Error('UDP unavailable'))
            else {
              callback(null)
              queueMicrotask(() => onMessage(nonce))
            }
          },
          close: () => {}
        }
      }
    },
    'node:fs/promises': {
      mkdir: async () => {},
      readFile: async (path) => (path.includes('udp-pings') ? udpPings : saved),
      rename: async () => {},
      writeFile: async (path, value) => {
        if (path.includes('udp-pings')) udpPings = value
        else saved = value
      }
    },
    'node:path': { dirname: () => '/tmp', join: (_dir, name) => `/tmp/${name}` },
    '../shared/matchmaking-activity': { parseMatchmakingActivity },
    './auth': { getSessionToken: () => token },
    './config': {
      API_BASE_URL: 'https://bootstrap.example',
      LOCAL_DEVELOPMENT: false,
      nativeHelperApiUrl: null
    },
    './backend-policy': { isLoopbackBackend: () => false }
  }
  const context = vm.createContext({
    console,
    URL,
    AbortSignal,
    setTimeout,
    clearTimeout,
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
      if (url.includes('/stats/matchmaking-activity'))
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
  return { ...module.namespace, saved: () => JSON.parse(saved), udpPings: () => udpPings }
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
const udpNode = (id, latencyMs, available = true) => ({
  ...node(id, latencyMs, available),
  latencyProbe: { host: `${id}.example`, port: 27014 }
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
    nodes: [udpNode('saved', null)],
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

test('launcher pings use UDP and reuse the last successful UDP result', async () => {
  const udpProbeState = { fails: false }
  const regions = await loadRegionsModule({
    nodes: [udpNode('sea', null)],
    probeLatencyMs: 45,
    udpProbeState
  })
  const first = await regions.getMatchmakingNodes()
  assert.equal(first[0]?.latencyMs, 45)
  udpProbeState.fails = true
  assert.equal(
    await regions.selectMatchmakingApiUrl([udpNode('sea', null)], null),
    'https://sea.example'
  )

  const afterRestart = await loadRegionsModule({
    nodes: [udpNode('sea', null)],
    udpProbeState: { fails: true },
    storedUdpPings: regions.udpPings()
  })
  assert.equal((await afterRestart.getMatchmakingNodes())[0]?.latencyMs, 45)

  const withoutHistory = await loadRegionsModule({
    nodes: [udpNode('sea', null)],
    udpProbeState: { fails: true }
  })
  const unmeasured = await withoutHistory.getMatchmakingNodes()
  assert.equal(unmeasured[0]?.latencyMs, null)
  assert.equal(matchmakingRegionSelection(unmeasured, null, true).preferredNode, undefined)
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
    nodes: [udpNode('warsaw', 42)],
    probeLatencyMs: 42,
    requests
  })
  const activity = await regions.getMatchmakingActivity()
  assert.equal(activity.inGamePlayers, 3)
  assert.equal(activity.queuedPlayers, 2)
  assert.ok(requests.includes('https://warsaw.example/stats/matchmaking-activity'))
  assert.ok(!requests.includes('https://bootstrap.example/stats/matchmaking-activity'))
})

test('automatic searches only nearby regions while manual selection stays fixed', () => {
  const nodes = [
    node('euw', 240),
    node('sea', 55),
    node('na', 300),
    node('sa', 299.9),
    node('offline', 40, false),
    node('unknown', null),
    node('invalid', -1)
  ]
  const result = matchmakingRegionSelection(nodes, null, false)
  assert.equal(result.preferredNode.id, 'sea')
  assert.deepEqual(result.eligibleRegions, ['sea'])
  assert.equal(result.nearby, true)
  assert.deepEqual(matchmakingRegionSelection(nodes, 'euw', false).eligibleRegions, ['euw'])
  assert.equal(matchmakingRegionSelection(nodes, 'offline', true).preferredNode, undefined)
  assert.equal(matchmakingRegionSelection([node('na', 300)], null, true).preferredNode, undefined)
})

test('nearest SEA replaces an earlier European recovery endpoint', async () => {
  const nodes = []
  const regions = await loadRegionsModule({ nodes, probeLatencyMs: 55 })
  assert.equal(
    await regions.resolvePreferredMatchmakingApiUrl(),
    'https://euw.16competitive.papamo.dev'
  )
  nodes.push(
    { ...udpNode('sea', 55), publicApiUrl: 'https://bootstrap.example' },
    udpNode('euw', 240)
  )
  assert.equal(await regions.resolvePreferredMatchmakingApiUrl(), 'https://bootstrap.example')
})

test('nearby activity requests all selected regions in one query and validates IPC arguments', async () => {
  const requests = []
  const regions = await loadRegionsModule({
    nodes: [udpNode('sea', 55)],
    probeLatencyMs: 55,
    requests
  })
  await regions.getMatchmakingActivity(['sea', 'euw', 'sea'])
  assert.ok(requests.includes('https://sea.example/stats/matchmaking-activity?regions=sea%2Ceuw'))
  await assert.rejects(
    regions.getMatchmakingActivity(['sea&other=bad']),
    /Invalid activity regions/
  )
})
