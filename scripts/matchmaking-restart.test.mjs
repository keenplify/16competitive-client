import { requestBotMatch } from '../src/shared/bot-match-request.ts'
import { gameForMode } from '../src/shared/game-version.ts'
import { readyCheckRemainingMs } from '../src/shared/matchmaking-ready-time.ts'
import { readyResponseFromServer } from '../src/shared/matchmaking-ready-response.ts'
import { MatchmakingDiagnostics } from '../src/shared/matchmaking-diagnostics.ts'
import { matchmakingRegionSelection } from '../src/shared/matchmaking-region-selection.ts'
/* eslint-disable @typescript-eslint/explicit-function-return-type */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import ts from 'typescript'
import { create } from 'zustand'

const found = {
  type: 'match_found',
  matchId: 'recovering',
  mode: 'cs13_3v3',
  mapId: 'de_dust',
  region: 'sea',
  hostApiUrl: 'https://example.test',
  teams: { teamA: [], teamB: [] }
}

test('replayed connection and exit snapshots produce one exit transition until explicit reconnect', async () => {
  const h = await harness()
  const connection = {
    type: 'match_connect',
    matchId: found.matchId,
    host: 'localhost',
    port: 27015,
    password: 'test'
  }
  const exited = { type: 'game_process_exited', matchId: found.matchId, code: null, signal: null }
  h.emit(found)
  h.emit(connection)
  h.emit(exited)
  for (let i = 0; i < 100; i++) {
    h.emit({ type: 'authenticated', player: { id: 'me' } })
    h.emit(connection)
    h.emit(exited)
  }
  assert.equal(h.store.getState().gameExitCount, 1)
  assert.equal(h.store.getState().gameExited, true)
  h.store.setState({ gameExited: false }) // a successful explicit reconnect
  h.emit(exited)
  assert.equal(h.store.getState().gameExitCount, 2)
})

test('a preparing popup can close locally and reopens when an actionable ready check arrives', async () => {
  const h = await harness()
  h.emit(found)
  h.store.getState().dismissPreparingReadyCheck()
  assert.equal(h.store.getState().dismissedReadyMatchId, found.matchId)
  assert.equal(h.store.getState().match.matchId, found.matchId)
  assert.equal(h.readyResponses().length, 0)
  h.emit({
    type: 'match_ready_check',
    matchId: found.matchId,
    deadline: new Date(Date.now() + 120000).toISOString(),
    serverNow: new Date().toISOString(),
    acceptedPlayerIds: [],
    playersRequired: 10
  })
  assert.equal(h.store.getState().dismissedReadyMatchId, null)
  assert.equal(h.store.getState().queueStatus, 'ready_check')
  h.store.getState().dismissPreparingReadyCheck()
  assert.equal(h.store.getState().dismissedReadyMatchId, null)
})

test('a late or duplicate Match Found preserves the recovered deadline and accepted response', async () => {
  const h = await harness()
  h.emit({ ...found, type: 'match_roster', warmupPhase: 'WARMUP' })
  h.emit({
    type: 'match_ready_check',
    matchId: found.matchId,
    deadline: new Date(Date.now() + 120000).toISOString(),
    serverNow: new Date().toISOString(),
    acceptedPlayerIds: [],
    playersRequired: 10
  })
  const deadline = h.store.getState().readyDeadline
  assert.equal(h.store.getState().queueStatus, 'ready_check')
  h.emit(found)
  assert.equal(h.store.getState().queueStatus, 'ready_check')
  assert.equal(h.store.getState().readyDeadline, deadline)
  assert.equal(h.store.getState().match.warmupPhase, 'WARMUP')
  await h.store.getState().respondReady(true)
  assert.equal(h.readyResponses().length, 1)
  h.emit(found)
  assert.equal(h.store.getState().readyResponse, 'accepted')
  assert.equal(h.store.getState().readyDeadline, deadline)
})

test('missing readiness polls the server and closes the modal after an authoritative NOT_QUEUED', async () => {
  const h = await harness()
  h.store.setState({ connectionStatus: 'ready' })
  h.emit(found)
  h.emit({ type: 'error', code: 'NOT_QUEUED', message: 'old status request' })
  assert.equal(h.store.getState().queueStatus, 'match_found')
  h.poll()
  assert.equal(h.statusRequests(), 1)
  h.emit({ type: 'error', code: 'NOT_QUEUED', message: 'Player is not currently queued' })
  assert.equal(h.store.getState().queueStatus, 'idle')
  assert.equal(h.store.getState().match, null)
  assert.equal(h.store.getState().error, 'match.ready.expired')
  h.emit(found)
  assert.equal(h.store.getState().match, null, 'a stale replay cannot reopen the modal')
})

test('a pending recovery response cannot dismiss a newer match or a recovered ready check', async () => {
  const h = await harness()
  h.store.setState({ connectionStatus: 'ready' })
  h.emit(found)
  h.poll()
  h.emit({ ...found, matchId: 'newer' })
  h.emit({ type: 'error', code: 'NOT_QUEUED', message: 'old response' })
  assert.equal(h.store.getState().match.matchId, 'newer')
  h.poll()
  h.emit({
    type: 'match_ready_check',
    matchId: 'newer',
    deadline: new Date(Date.now() + 120000).toISOString(),
    serverNow: new Date().toISOString(),
    acceptedPlayerIds: [],
    playersRequired: 10
  })
  h.emit({ type: 'error', code: 'NOT_QUEUED', message: 'old response' })
  assert.equal(h.store.getState().queueStatus, 'ready_check')
  assert.equal(h.store.getState().match.matchId, 'newer')
})

async function harness() {
  let emit
  let poll
  let statusRequests = 0
  let readyResponses = []
  const context = vm.createContext({
    window: {
      setInterval: (callback) => {
        poll = callback
        return 1
      },
      clearInterval() {
        return undefined
      },
      setTimeout() {
        return undefined
      },
      api: {
        matchmaking: {
          async getQueueStatus() {
            statusRequests += 1
          },
          async respondReady(matchId, accepted) {
            readyResponses.push({ matchId, accepted })
          },
          onEvent(listener) {
            emit = listener
            return () => {}
          },
          async connect() {
            return undefined
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
    {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 }
    }
  ).outputText
  const diagnostics = new MatchmakingDiagnostics()
  const dependencies = {
    '../../../../shared/bot-match-request': { requestBotMatch },
    '../settings/game-availability': { configuredGames: async () => [] },
    '../../../../shared/game-version': { gameForMode },
    './pcash-bets.store': {
      usePCashBetsStore: { getState: () => ({ load: async () => {} }) }
    },
    '../../diagnostic-logs': { rendererMatchmakingDiagnostics: diagnostics },
    './web-helper-prompt.store': {
      useWebHelperPromptStore: { getState: () => ({ competitiveReady: false }) }
    },
    '../../../../shared/matchmaking-region-selection': { matchmakingRegionSelection },
    './queue-warmup.store': {
      useQueueWarmupStore: {
        getState: () => ({
          handleEvent() {
            return undefined
          }
        })
      }
    },
    './friendly-fire-message': { friendlyFireMessage: (text) => text },
    '../../../../shared/matchmaking-ready-time': { readyCheckRemainingMs },
    '../../../../shared/matchmaking-ready-response': { readyResponseFromServer },
    '../../../../shared/server-clock': {
      serverClockNow: () => Date.now(),
      syncServerClock() {
        return undefined
      }
    },
    '../party/party.store': { usePartyStore: { getState: () => ({ party: null }) } },
    '../i18n/i18n': {
      translate: (_lang, key) => key,
      useLanguageStore: { getState: () => ({ language: 'en' }) }
    },
    './matchmaking-preferences': {
      readMatchmakingPreferences: () => ({}),
      saveMatchmakingPreferences() {
        return undefined
      }
    },
    'react-toastify': { toast: { loading: () => 1, update: () => undefined } },
    zustand: { create },
    '../../../../shared/anti-cheat': { ANTI_CHEAT_CANCELLED_MESSAGE: 'fixture' },
    '../../../../shared/matchmaking': { allowsManualMatchConnection: () => false },
    '../auth/auth.store': { useAuthStore: { getState: () => ({}), subscribe: () => () => {} } },
    '../../web-runtime': { isWebRuntime: () => false }
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
  return {
    store,
    diagnostics,
    emit: (message) => emit(message),
    poll: () => poll(),
    statusRequests: () => statusRequests,
    readyResponses: () => readyResponses
  }
}

test('issue snapshot separates catalog completion from a missing match ready check', async () => {
  const { store, diagnostics } = await harness()
  store.setState({
    connectionStatus: 'reconnecting',
    queueStatus: 'ready_check',
    match: { matchId: 'stuck-match' },
    readyDeadline: null,
    readyResponse: 'pending',
    assetPreparation: { status: 'checking', completedFiles: 0, totalFiles: 0 },
    connectionDetails: { matchId: 'stuck-match', password: 'never-report-this' }
  })
  const report = diagnostics.report()
  const { snapshot } = JSON.parse(report)
  assert.equal(snapshot.matchId, 'stuck-match')
  assert.equal(snapshot.readyDeadline, null)
  assert.equal(snapshot.connectionStatus, 'reconnecting')
  assert.equal(snapshot.status, 'checking')
  assert.equal(snapshot.hasConnection, true)
  assert.ok(!report.includes('never-report-this'))
})

test('accepted player can decline only after the server unlock time', async () => {
  const { store, readyResponses } = await harness()
  store.setState({
    queueStatus: 'ready_check',
    match: { matchId: 'waiting-match' },
    readyResponse: 'accepted',
    readyDeclineAvailableAt: new Date(Date.now() + 30_000).toISOString()
  })
  await store.getState().respondReady(false)
  assert.equal(readyResponses().length, 0)
  store.setState({ readyDeclineAvailableAt: new Date(Date.now() - 1).toISOString() })
  await store.getState().respondReady(false)
  assert.deepEqual(readyResponses(), [{ matchId: 'waiting-match', accepted: false }])
})

test('expired ready check asks the server and clears only after NOT_QUEUED', async () => {
  const { store, emit, poll, statusRequests } = await harness()
  const match = { matchId: 'expired-match', mode: '5v5' }
  store.setState({
    connectionStatus: 'ready',
    queueStatus: 'ready_check',
    match,
    readyDeadline: new Date(Date.now() - 3_000).toISOString(),
    readyResponse: 'accepted',
    acceptedPlayerIds: ['player-1']
  })
  poll()
  assert.equal(statusRequests(), 1)
  assert.equal(store.getState().match?.matchId, match.matchId)
  emit({ type: 'error', code: 'NOT_QUEUED', message: 'Player is not currently queued' })
  assert.equal(store.getState().queueStatus, 'idle')
  assert.equal(store.getState().match, null)
  assert.equal(store.getState().readyDeadline, null)
  assert.equal(store.getState().readyResponse, 'pending')
  assert.equal(store.getState().error, 'match.ready.expired')
})

test('stale NOT_QUEUED response cannot dismiss an active ready check', async () => {
  const { store, emit, poll, statusRequests } = await harness()
  store.setState({
    connectionStatus: 'ready',
    queueStatus: 'ready_check',
    match: { matchId: 'active-match', mode: '5v5' },
    readyDeadline: new Date(Date.now() + 60_000).toISOString()
  })
  poll()
  assert.equal(statusRequests(), 0)
  emit({ type: 'error', code: 'NOT_QUEUED', message: 'Player is not currently queued' })
  assert.equal(store.getState().queueStatus, 'ready_check')
  assert.equal(store.getState().match.matchId, 'active-match')
})

test('restart notification preserves queued state and original wait time', async () => {
  const { store, emit } = await harness()
  store.setState({ queueStatus: 'queued', queuedAt: 'fixture', queueStartedAt: 123 })
  emit({ type: 'server_restarting', message: 'Restarting', retryAfterMs: 30000 })
  assert.equal(store.getState().queueStatus, 'queued')
  assert.equal(store.getState().queuedAt, 'fixture')
  assert.equal(store.getState().queueStartedAt, 123)
  assert.equal(store.getState().serverRestarting.message, 'Restarting')
})

test('a rejected join leaves Joining matchmaking and preserves the error', async () => {
  const { store, emit } = await harness()
  store.setState({ queueStatus: 'joining' })
  emit({ type: 'error', code: 'SERVER_RESTARTING', message: 'Retry shortly' })
  assert.equal(store.getState().queueStatus, 'idle')
  assert.equal(store.getState().error, 'Retry shortly')
})

test('restart notice retains a live match and its connection state', async () => {
  const { store, emit } = await harness()
  const match = { matchId: 'live-game', mode: '5v5' }
  store.setState({ queueStatus: 'in_match', match })
  emit({ type: 'server_restarting', message: 'Restarting', retryAfterMs: 5000 })
  assert.equal(store.getState().queueStatus, 'in_match')
  assert.equal(store.getState().match.matchId, 'live-game')
})

for (const code of ['MATCH_ASSET_PRELOAD_FAILED', 'MATCH_PREPARATION_FAILED']) {
  test(`${code} dismisses pending asset progress while preserving reconnect details`, async () => {
    const { store, emit } = await harness()
    const connectionDetails = { matchId: 'failed-launch' }
    store.setState({
      assetPreparation: { status: 'checking', completedFiles: 0, totalFiles: 0 },
      connectionDetails
    })
    emit({ type: 'error', code, message: 'match.assets.storageDenied' })
    assert.equal(store.getState().assetPreparation.status, 'idle')
    assert.equal(store.getState().connectionDetails, connectionDetails)
    assert.equal(store.getState().gameExited, true)
    assert.equal(store.getState().error, 'match.assets.storageDenied')
  })
}
