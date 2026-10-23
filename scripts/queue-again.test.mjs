import { matchmakingRegionSelection } from '../src/shared/matchmaking-region-selection.ts'
/* eslint-disable @typescript-eslint/explicit-function-return-type */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import ts from 'typescript'
import { create } from 'zustand'
import { readyResponseFromServer } from '../src/shared/matchmaking-ready-response.ts'

async function harness({ party = null, fail = false, settings, savedMaps, web = false } = {}) {
  const requests = []
  const mmrUpdates = []
  let emit
  const completed = {
    matchId: 'finished-fy',
    mode: 'arena',
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
          async leaveFfa(matchId) {
            requests.push(['leave_ffa', matchId])
          },
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
    '../../../../shared/matchmaking-region-selection': { matchmakingRegionSelection },
    './queue-warmup.store': {
      useQueueWarmupStore: {
        getState: () => ({
          reset() {
            return undefined
          },
          handleEvent() {
            return undefined
          }
        })
      }
    },
    zustand: { create },
    './friendly-fire-message': { friendlyFireMessage: (text) => text },
    '../../../../shared/anti-cheat': { ANTI_CHEAT_CANCELLED_MESSAGE: 'cancelled' },
    '../../../../shared/matchmaking': { allowsManualMatchConnection: () => false },
    '../../../../shared/matchmaking-ready-time': { readyCheckRemainingMs: () => 0 },
    '../../../../shared/matchmaking-ready-response': { readyResponseFromServer },
    '../../../../shared/server-clock': {
      serverClockNow: () => Date.now(),
      syncServerClock() {
        return undefined
      }
    },
    '../auth/auth.store': {
      useAuthStore: {
        getState: () => ({
          session: { player: { id: 'me' } },
          setMmr: (mmr) => mmrUpdates.push(mmr),
          refreshSession: async () => {}
        })
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
        mapIdsByMode: savedMaps ? { arena: savedMaps } : {}
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
    selectedMode: 'arena',
    selectedMapIds: ['fy_pool_day'],
    mapsStatus: 'ready',
    maps: ['fy_pool_day', 'fy_iceworld'].map((id) => ({
      id,
      supportedModes: ['arena'],
      webModes: ['arena']
    })),
    nodes: [{ id: 'node', region: 'asia', available: true, latencyMs: 40 }],
    selectedNodeId: 'node',
    allowRegionExpansion: false
  })
  return { store, completed, requests, mmrUpdates, emit: (message) => emit(message) }
}

test('FFA can leave after game exit, updates its roster, and rejoin the same public round', async () => {
  const h = await harness()
  const found = {
    type: 'match_found',
    matchId: 'public-round',
    mode: 'ffa',
    mapId: 'de_dust2',
    region: 'sea',
    hostApiUrl: 'https://sea.invalid',
    teams: { teamA: [{ id: 'self', username: 'Player' }], teamB: [] }
  }
  h.emit(found)
  h.emit({
    ...found,
    teams: { teamA: [{ id: 'bot', username: 'Bot' }], teamB: [] },
    type: 'match_roster'
  })
  assert.equal(h.store.getState().match.teams.teamA[0].id, 'bot')
  h.emit({
    type: 'match_connect',
    matchId: found.matchId,
    host: '192.0.2.1',
    port: 27020,
    password: ''
  })
  h.emit({ type: 'game_process_exited', matchId: found.matchId, code: 0, signal: null })
  await h.store.getState().leaveFfa()
  assert.equal(h.requests[0][0], 'leave_ffa')
  h.emit({
    type: 'match_cancelled',
    matchId: found.matchId,
    reason: 'PLAYER_DECLINED',
    message: 'Left FFA.'
  })
  assert.equal(h.store.getState().match, null)
  assert.equal(h.store.getState().queueStatus, 'idle')
  assert.equal(h.store.getState().error, null)
  h.store.setState({ queueStatus: 'joining' })
  h.emit(found)
  assert.equal(h.store.getState().match.matchId, found.matchId)
  h.store.setState({ match: { ...found, mode: '5v5' } })
  await h.store.getState().leaveFfa()
  assert.equal(h.requests.length, 1)
})

test('Arena queue again uses the saved pool and region only after consent', async () => {
  const h = await harness({ savedMaps: ['fy_pool_day', 'fy_iceworld'] })
  h.emit({ type: 'match_finished', ...h.completed })
  assert.equal(h.requests.length, 0)
  assert.equal(await h.store.getState().queueAgain(), true)
  assert.deepEqual(JSON.parse(JSON.stringify(h.requests[0])), [
    'arena',
    ['fy_pool_day', 'fy_iceworld'],
    true,
    'asia',
    ['asia']
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

test('FFA and disconnected clients do not requeue through the Arena prompt', async () => {
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
    mode: 'arena',
    mapIds: ['fy_pool_day'],
    region: 'asia',
    allowRegionExpansion: false
  })
  assert.equal(h.store.getState().completedMatch, null)
  assert.equal(h.store.getState().queueStatus, 'queued')
})

test('decline requeue restores original wait and clears the ready check without client-side join', async () => {
  for (const replayFirst of [false, true]) {
    const h = await harness()
    const oldMatch = {
      matchId: 'declined',
      mode: '5v5',
      mapId: 'de_dust2',
      teams: { teamA: [], teamB: [] }
    }
    h.store.setState({
      queueStatus: 'ready_check',
      match: oldMatch,
      readyResponse: 'accepted',
      readyDeadline: '2026-10-20T00:15:00Z'
    })
    const cancelled = {
      type: 'match_cancelled',
      matchId: oldMatch.matchId,
      reason: 'PLAYER_DECLINED',
      message: 'A player declined.'
    }
    const joined = {
      type: 'queue_joined',
      requeuedFromMatchId: oldMatch.matchId,
      mode: '5v5',
      mapIds: ['de_dust2', 'de_inferno'],
      region: 'sg',
      allowRegionExpansion: true,
      botFillOptIn: true,
      queuedAt: '2026-10-20T00:00:00Z'
    }
    if (!replayFirst) h.emit(cancelled)
    h.emit(joined)
    h.emit(cancelled)
    h.emit(joined)
    assert.equal(h.store.getState().queueStatus, 'queued')
    assert.equal(h.store.getState().queueStartedAt, Date.parse(joined.queuedAt))
    assert.equal(h.store.getState().match, null)
    assert.equal(h.store.getState().readyDeadline, null)
    assert.equal(h.store.getState().readyResponse, 'pending')
    assert.equal(h.store.getState().botFillOptIn, true)
    assert.equal(h.store.getState().error, null)
    assert.equal(h.requests.length, 0)
  }
})

test('late cancellation and requeue events cannot replace a newer ready check', async () => {
  const h = await harness()
  const match = {
    matchId: 'new-match',
    mode: '5v5',
    mapId: 'de_dust2',
    teams: { teamA: [], teamB: [] }
  }
  h.store.setState({ queueStatus: 'ready_check', match })
  h.emit({
    type: 'queue_joined',
    requeuedFromMatchId: 'old-match',
    mode: '5v5',
    mapIds: ['de_inferno'],
    region: 'sg',
    allowRegionExpansion: false
  })
  h.emit({
    type: 'match_cancelled',
    matchId: 'old-match',
    reason: 'PLAYER_DECLINED',
    message: 'Old cancellation'
  })
  assert.equal(h.store.getState().queueStatus, 'ready_check')
  assert.equal(h.store.getState().match, match)
})

test('warmup lifecycle events leave ranked queue time, position and ready check unchanged', async () => {
  const h = await harness()
  h.store.setState({
    queueStatus: 'queued',
    selectedMode: '5v5',
    queueStartedAt: 123456,
    queuePosition: 4
  })
  for (const event of [
    {
      type: 'match_found',
      matchId: 'warmup',
      mode: 'arena',
      mapId: 'fy_pool_day',
      teams: { teamA: [], teamB: [] }
    },
    { type: 'match_connect', matchId: 'warmup', host: '127.0.0.1', port: 27015, password: 'test' },
    { type: 'match_cancelled', matchId: 'warmup', reason: 'PLAYER_DECLINED' },
    { type: 'game_process_exited', matchId: 'warmup', code: 0, signal: null },
    { type: 'error', code: 'WARMUP_FAILED', message: 'failed' }
  ])
    h.emit({ ...event, whileQueued: true })
  assert.equal(h.store.getState().queueStatus, 'queued')
  assert.equal(h.store.getState().queueStartedAt, 123456)
  assert.equal(h.store.getState().queuePosition, 4)
  const ranked = {
    matchId: 'ranked',
    mode: '5v5',
    mapId: 'de_dust2',
    teams: { teamA: [], teamB: [] }
  }
  h.store.setState({ queueStatus: 'ready_check', match: ranked })
  h.emit({ type: 'match_finished', matchId: 'warmup', whileQueued: true, players: [] })
  assert.equal(h.store.getState().queueStatus, 'ready_check')
  assert.equal(h.store.getState().match.matchId, 'ranked')
})

test('automatic queue starts across SG and EUW even with an old expansion opt-out', async () => {
  const h = await harness()
  h.store.setState({
    selectedNodeId: null,
    allowRegionExpansion: false,
    nodes: [
      { id: 'sg', region: 'sea', available: true, latencyMs: 55 },
      { id: 'euw', region: 'europe-east', available: true, latencyMs: 240 },
      { id: 'na', region: 'north-america', available: true, latencyMs: 300 }
    ]
  })
  assert.equal(await h.store.getState().queueAgain(), true)
  assert.deepEqual(JSON.parse(JSON.stringify(h.requests[0])).slice(2), [
    true,
    'sea',
    ['sea', 'europe-east']
  ])
})

test('MR8 settlement updates authoritative MMR once without resetting ranked search', async () => {
  const { store, emit, mmrUpdates } = await harness()
  store.setState({ queueStatus: 'queued', queuedAt: '2026-10-23T10:00:00Z', completedMatch: null })
  const result = {
    type: 'match_finished',
    whileQueued: true,
    mode: '5v5',
    matchId: 'mr8',
    players: [{ id: 'me', mmrAfter: 813 }]
  }
  emit(result)
  emit(result)
  assert.deepEqual(mmrUpdates, [813])
  assert.equal(store.getState().queueStatus, 'queued')
  assert.equal(store.getState().queuedAt, '2026-10-23T10:00:00Z')
  assert.equal(store.getState().completedMatch, null)
})
