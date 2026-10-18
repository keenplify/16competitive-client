/* eslint-disable @typescript-eslint/explicit-function-return-type */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import ts from 'typescript'
import { create } from 'zustand'

async function harness({ party = null, fail = false, settings, savedMaps, web = false } = {}) {
  const requests = []
  let emit
  const completed = {
    matchId: 'finished-fy',
    mode: 'fight_yard',
    mapId: 'fy_pool_day',
    teams: { teamA: [], teamB: [] },
    winner: 1,
    teamAScore: 9,
    teamBScore: 7,
    players: []
  }
  const context = vm.createContext({
    window: {
      setInterval: () => 1,
      clearInterval() {
        return undefined
      },
      setTimeout() {
        return undefined
      },
      api: {
        gameSettings: { get: settings ?? (async () => ({ cs16ExecutablePath: '/games/hl' })) },
        matchmaking: {
          onEvent(listener) {
            emit = listener
            return () => {}
          },
          async connect() {
            return undefined
          },
          async joinQueue(...args) {
            requests.push(args)
            if (fail) throw new Error('offline')
          }
        }
      }
    },
    console,
    Date,
    Set
  })
  const source = ts.transpileModule(
    await readFile(
      new URL('../src/renderer/src/features/matchmaking/matchmaking.store.ts', import.meta.url),
      'utf8'
    ),
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }
  ).outputText
  const dependencies = {
    zustand: { create },
    './friendly-fire-message': { friendlyFireMessage: (text) => text },
    '../../../../shared/anti-cheat': { ANTI_CHEAT_CANCELLED_MESSAGE: 'cancelled' },
    '../../../../shared/matchmaking': { allowsManualMatchConnection: () => false },
    '../../../../shared/matchmaking-ready-time': { readyCheckRemainingMs: () => 0 },
    '../../../../shared/server-clock': {
      serverClockNow: () => Date.now(),
      syncServerClock() {
        return undefined
      }
    },
    '../auth/auth.store': {
      useAuthStore: {
        getState: () => ({ session: { player: { id: 'me' } }, refreshSession: async () => {} })
      }
    },
    '../party/party.store': { usePartyStore: { getState: () => ({ party }) } },
    '../i18n/i18n': {
      translate: (_lang, key) => key,
      useLanguageStore: { getState: () => ({ language: 'en' }) }
    },
    '../../web-runtime': { isWebRuntime: () => web },
    './matchmaking-preferences': {
      readMatchmakingPreferences: () => ({
        mapIdsByMode: savedMaps ? { fight_yard: savedMaps } : {}
      }),
      saveMatchmakingPreferences() {
        return undefined
      }
    }
  }
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
  const store = module.namespace.useMatchmakingStore
  await store.getState().connect()
  store.setState({
    connectionStatus: 'ready',
    queueStatus: 'idle',
    completedMatch: completed,
    selectedMode: 'fight_yard',
    selectedMapIds: ['fy_pool_day'],
    mapsStatus: 'ready',
    maps: ['fy_pool_day', 'fy_iceworld'].map((id) => ({
      id,
      supportedModes: ['fight_yard'],
      webModes: ['fight_yard']
    })),
    nodes: [{ id: 'node', region: 'asia', available: true, latencyMs: 40 }],
    selectedNodeId: 'node',
    allowRegionExpansion: false,
    preferHumans: true
  })
  return { store, completed, requests, emit: (message) => emit(message) }
}

test('FY queue again uses the saved pool, region and human preference only after consent', async () => {
  const h = await harness({ savedMaps: ['fy_pool_day', 'fy_iceworld'] })
  h.emit({ type: 'match_finished', ...h.completed })
  assert.equal(h.requests.length, 0)
  assert.equal(await h.store.getState().queueAgain(), true)
  assert.deepEqual(JSON.parse(JSON.stringify(h.requests[0])), [
    'fight_yard',
    ['fy_pool_day', 'fy_iceworld'],
    false,
    'asia',
    ['asia'],
    true
  ])
  assert.equal(h.store.getState().completedMatch, null)
})

test('failure preserves results and allows retry', async () => {
  const h = await harness({ fail: true })
  assert.equal(await h.store.getState().queueAgain(), false)
  assert.equal(h.store.getState().completedMatch, h.completed)
  assert.equal(h.store.getState().queueAgainStatus, 'error')
  assert.equal(await h.store.getState().queueAgain(), false)
  assert.equal(h.requests.length, 2)
})

test('rapid double clicks issue one request and keep results visible during preparation', async () => {
  let release
  const h = await harness({
    settings: () =>
      new Promise((resolve) => {
        release = resolve
      })
  })
  const pending = h.store.getState().queueAgain()
  assert.equal(h.store.getState().queueAgainStatus, 'joining')
  assert.equal(h.store.getState().completedMatch, h.completed)
  assert.equal(await h.store.getState().queueAgain(), false)
  release({ cs16ExecutablePath: '/games/hl' })
  assert.equal(await pending, true)
  assert.equal(h.requests.length, 1)
})

test('party members cannot queue for their leader', async () => {
  const h = await harness({ party: { leaderId: 'leader', members: [] } })
  assert.equal(await h.store.getState().queueAgain(), false)
  assert.equal(h.requests.length, 0)
})

test('unavailable maps and missing installation keep results for review', async () => {
  for (const options of [{ savedMaps: ['removed_map'] }, { settings: async () => ({}) }]) {
    const h = await harness(options)
    assert.equal(await h.store.getState().queueAgain(), false)
    assert.equal(h.requests.length, 0)
    assert.equal(h.store.getState().completedMatch, h.completed)
    assert.equal(h.store.getState().queueAgainStatus, 'error')
  }
})

test('FFA and disconnected clients do not requeue through the FY prompt', async () => {
  const h = await harness()
  h.store.setState({ completedMatch: { ...h.completed, mode: 'ffa' } })
  assert.equal(await h.store.getState().queueAgain(), false)
  h.store.setState({ completedMatch: h.completed, connectionStatus: 'disconnected' })
  assert.equal(await h.store.getState().queueAgain(), false)
  assert.equal(h.requests.length, 0)
})

test('server-confirmed party queue clears stale match results for every member', async () => {
  const h = await harness()
  h.emit({
    type: 'queue_joined',
    mode: 'fight_yard',
    mapIds: ['fy_pool_day'],
    region: 'asia',
    allowRegionExpansion: false
  })
  assert.equal(h.store.getState().completedMatch, null)
  assert.equal(h.store.getState().queueStatus, 'queued')
})
