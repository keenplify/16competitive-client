import { matchmakingRegionSelection } from '../src/shared/matchmaking-region-selection.ts'
/* eslint-disable @typescript-eslint/explicit-function-return-type */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import ts from 'typescript'
import { create } from 'zustand'

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
  const dependencies = {
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
    '../../../../shared/matchmaking-ready-time': { readyCheckRemainingMs: () => 0 },
    '../../../../shared/matchmaking-ready-response': { readyResponseFromServer: () => null },
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
    zustand: { create },
    '../../../../shared/anti-cheat': { ANTI_CHEAT_CANCELLED_MESSAGE: 'fixture' },
    '../../../../shared/matchmaking': { allowsManualMatchConnection: () => false },
    '../auth/auth.store': { useAuthStore: { getState: () => ({}) } },
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
    emit: (message) => emit(message),
    poll: () => poll(),
    statusRequests: () => statusRequests,
    readyResponses: () => readyResponses
  }
}

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
