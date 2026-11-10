/* eslint-disable @typescript-eslint/explicit-function-return-type */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import { MatchmakingDiagnostics } from '../src/shared/matchmaking-diagnostics.ts'
import ts from 'typescript'
import * as React from 'react'
import * as jsx from 'react/jsx-runtime'
import { renderToStaticMarkup } from 'react-dom/server'

async function harness({
  platform = 'linux',
  window = null,
  timers = null,
  launchError = null
} = {}) {
  const calls = [],
    events = [],
    sent = []
  const assetStarts = []
  const sockets = []
  class TestSocket {
    static OPEN = 1
    static CLOSED = 3
    readyState = 1
    listeners = new Map()
    constructor() {
      sockets.push(this)
    }
    addEventListener(type, listener) {
      this.listeners.set(type, listener)
    }
    send(body) {
      sent.push(JSON.parse(body))
    }
    close() {
      this.readyState = 3
      this.listeners.get('close')?.({ code: 1000, wasClean: true })
    }
  }
  let activeMatch = null
  let finishAssets
  let failAssets
  const assets = new Promise((resolve, reject) => {
    finishAssets = resolve
    failAssets = reject
  })
  const context = vm.createContext({
    console,
    process: { platform },
    URL,
    Map,
    Set,
    Date,
    Promise,
    Error,
    setTimeout: timers?.setTimeout ?? setTimeout,
    clearTimeout: timers?.clearTimeout ?? clearTimeout,
    setInterval,
    clearInterval,
    WebSocket: TestSocket
  })
  const source = ts.transpileModule(
    await readFile(new URL('../src/main/matchmaking.ts', import.meta.url), 'utf8'),
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }
  ).outputText
  const file = ts.createSourceFile(
    'module.js',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS
  )
  const imports = new Map()
  for (const node of file.statements)
    if (ts.isImportDeclaration(node)) {
      const names =
        node.importClause?.namedBindings?.elements?.map(
          (item) => (item.propertyName ?? item.name).text
        ) ?? []
      imports.set(node.moduleSpecifier.text, [
        ...(imports.get(node.moduleSpecifier.text) ?? []),
        ...names
      ])
    }
  const mock = {
    Notification: {
      isSupported: () => {
        calls.push(['notification-support'])
        return false
      }
    },
    readyCheckRemainingMs: (deadline) => Date.parse(deadline) - Date.now(),
    serverClockNow: () => Date.now(),
    matchmakingDiagnostics: new MatchmakingDiagnostics(),
    getSessionUsername: () => 'fixture-player',
    isMatchmakingMode: (value) => ['5v5', 'arena', 'ffa', '3v3'].includes(value),
    MATCHMAKING_CHANNELS: { event: 'event' },
    API_BASE_URL: 'https://fallback.invalid',
    LOCAL_DEVELOPMENT: false,
    activateIcafeBranch: async () => {},
    toMatchmakingWsUrl: (url) => url.replace('https:', 'wss:') + '/matchmaking',
    createAutomaticMatchReporter: () => async () => {},
    createAutomaticStorageReporter: () => async () => {},
    startMatchAssetPreload: (matchId) => {
      assetStarts.push(matchId)
      return assets
    },
    startSkinAssetSync: async () => {},
    waitForMatchAssetPreload: () => assets,
    launchCounterStrikeForMatch: async (input) => {
      calls.push(['launch', input.matchId, input.apiUrl])
      if (launchError) throw launchError
      activeMatch = input.matchId
    },
    isCounterStrikeActiveForMatch: (id) => activeMatch === id,
    shutdownManagedGame: async () => {
      calls.push(['shutdown', activeMatch])
      activeMatch = null
    },
    closeCounterStrikeForMatch: (id) => {
      calls.push(['close', id])
      if (activeMatch === id) activeMatch = null
    },
    BrowserWindow: { fromWebContents: () => window },
    app: { focus: (options) => calls.push(['app-focus', options]) },
    discordPresence: {
      setMatch: () => {},
      finishMatch: () => {},
      setInGame: () => {},
      setQueue: () => {},
      setAuthenticated: () => {},
      setParty: () => {}
    }
  }
  const module = new vm.SourceTextModule(source + '\nexport { isServerMessage };', { context })
  await module.link(
    (name) =>
      new vm.SyntheticModule(
        imports.get(name),
        function () {
          for (const key of imports.get(name)) this.setExport(key, mock[key] ?? (() => {}))
        },
        { context }
      )
  )
  await module.evaluate()
  const connection = module.namespace.matchmakingConnection
  const socket = {
    readyState: 1,
    send: (body) => sent.push(JSON.parse(body)),
    close: () => calls.push(['socket-close'])
  }
  Object.assign(connection, {
    socket,
    authenticated: true,
    refreshDiscordPartyPresence: () => {},
    desiredMode: '5v5',
    desiredMapIds: ['de_dust2'],
    freshProcess: false,
    activeApiUrl: 'https://eu.invalid',
    renderer: { isDestroyed: () => false, send: (_channel, event) => events.push(event) }
  })
  return {
    connection,
    socket,
    sockets,
    calls,
    assetStarts,
    events,
    sent,
    finishAssets,
    failAssets,
    setActiveMatch: (matchId) => {
      activeMatch = matchId
    },
    validate: module.namespace.isServerMessage
  }
}

for (const mode of ['ffa', 'arena'])
  test(`${mode} leave validates the session and cannot leave ranked matchmaking`, async () => {
    const h = await harness()
    const matchId = '37bd42ae-5741-4ac9-911c-135e19a8f0ce'
    try {
      await assert.rejects(() => h.connection.leaveFfa('invalid'), /Invalid FFA/)
      h.connection.desiredMode = '5v5'
      h.connection.lastConnection = { matchId }
      await assert.rejects(() => h.connection.leaveFfa(matchId), /No active FFA/)
      await h.connection.createSocket('test-token', 'https://eu.invalid')
      h.sockets[0].listeners.get('message')({
        data: JSON.stringify({
          type: 'match_found',
          matchId,
          mode,
          mapId: 'de_dust2',
          region: 'eu',
          hostApiUrl: 'https://eu.invalid',
          teams: { teamA: [], teamB: [] }
        })
      })
      assert.equal(h.connection.ffaMatchIds.has(matchId), true)
      h.connection.desiredMode = null // match_found clears queue intent before play
      await assert.rejects(
        () => h.connection.leaveFfa('6c563edf-6908-48d8-bffc-b12001ef99b6'),
        /No active FFA/
      )
      await h.connection.leaveFfa(matchId)
      assert.ok(
        h.sent.some((message) => message.type === 'leave_ffa' && message.matchId === matchId)
      )
      assert.ok(!h.sent.some((message) => message.type === 'leave_queue'))
      assert.equal(h.connection.desiredMode, null)
      assert.ok(
        h.events.some((event) => event.type === 'match_cancelled' && event.matchId === matchId)
      )
      h.connection.cancelledMatchIds.add(matchId)
      h.connection.seenMatchEvents.add(`match_found:${matchId}`)
      h.connection.joinQueue(mode, ['de_dust2'], false, 'eu', ['eu'])
      assert.equal(h.connection.cancelledMatchIds.has(matchId), false)
      assert.equal(h.connection.seenMatchEvents.has(`match_found:${matchId}`), false)
    } finally {
      h.connection.shutdown()
    }
  })
const found = {
  type: 'match_found',
  matchId: 'warmup',
  mode: 'arena',
  mapId: 'fy_pool_day',
  hostApiUrl: 'https://eu.invalid',
  whileQueued: true
}
const connect = {
  type: 'match_connect',
  matchId: 'warmup',
  host: '127.0.0.1',
  port: 27015,
  password: 'test',
  joinToken: 'test',
  whileQueued: true
}

for (const freshProcess of [true, false]) {
  test(`match restoration waits for explicit reconnect (fresh=${freshProcess})`, async () => {
    const h = await harness()
    const connection = { ...connect, whileQueued: false, joinToken: 'a'.repeat(32) }
    h.connection.freshProcess = freshProcess
    if (!freshProcess) h.connection.lastConnection = connection
    try {
      await h.connection.createSocket('test-token', 'https://eu.invalid')
      const emit = (message) =>
        h.sockets[0].listeners.get('message')({ data: JSON.stringify(message) })
      emit({ type: 'authenticated', player: { id: 'me', username: 'Me', mmr: 1000 } })
      emit(connection)
      emit(connection)
      h.finishAssets()
      await new Promise((resolve) => setImmediate(resolve))
      assert.equal(h.calls.filter(([type]) => type === 'launch').length, 0)
      assert.equal(h.connection.lastConnection.matchId, connection.matchId)
      assert.ok(h.events.some((event) => event.type === 'game_process_exited'))
      await h.connection.reconnectGame()
      assert.equal(h.calls.filter(([type]) => type === 'launch').length, 1)
    } finally {
      h.connection.shutdown()
    }
  })
}

test('a newly accepted match launches once, including duplicate connection events', async () => {
  const h = await harness()
  try {
    await h.connection.createSocket('test-token', 'https://eu.invalid')
    const emit = (message) =>
      h.sockets[0].listeners.get('message')({ data: JSON.stringify(message) })
    emit({ type: 'authenticated', player: { id: 'me', username: 'Me', mmr: 1000 } })
    const connection = { ...connect, whileQueued: false, joinToken: 'a'.repeat(32) }
    emit(connection)
    emit(connection)
    h.finishAssets()
    await new Promise((resolve) => setImmediate(resolve))
    assert.equal(h.calls.filter(([type]) => type === 'launch').length, 1)
  } finally {
    h.connection.shutdown()
  }
})

test('reopening the launcher restores a server queue without sending leave_queue', async () => {
  const h = await harness()
  h.connection.freshProcess = true
  try {
    await h.connection.createSocket('test-token', 'https://eu.invalid')
    const status = {
      type: 'queue_status',
      mode: '5v5',
      mapIds: ['de_dust2'],
      region: 'eu',
      allowRegionExpansion: true,
      queuedPlayers: 2,
      playersRequired: 10,
      position: 1,
      preferHumans: true,
      queuedAt: '2026-10-20T00:00:00Z'
    }
    h.sockets[0].listeners.get('message')({ data: JSON.stringify(status) })
    assert.ok(!h.sent.some((message) => message.type === 'leave_queue'))
    assert.ok(
      h.events.some((event) => event.type === 'queue_status' && event.queuedAt === status.queuedAt)
    )
    assert.equal(h.connection.desiredMode, '5v5')
    assert.equal(h.connection.isQueued(), true)
    assert.equal(h.connection.desiredPreferredRegion, 'eu')
    assert.equal(h.connection.freshProcess, false)
  } finally {
    h.connection.shutdown()
  }
})

test('warmup uses its original region, preserves ranked search, and awaits cleanup on handoff', async () => {
  const h = await harness()
  await h.connection.joinWarmup('arena', 'fy_pool_day')
  h.connection.handleWarmup(found, h.socket)
  h.connection.activeApiUrl = 'https://ranked-region.invalid'
  h.connection.handleWarmup(connect, h.socket)
  h.connection.handleWarmup(connect, h.socket)
  h.finishAssets()
  await h.connection.warmupLaunch
  h.connection.handleWarmup(connect, h.socket)
  await h.connection.warmupLaunch
  assert.equal(h.calls.filter((call) => call[0] === 'launch').length, 1)
  assert.deepEqual(h.calls[0], ['launch', 'warmup', 'https://eu.invalid'])
  assert.equal(h.connection.desiredMode, '5v5')
  assert.deepEqual(h.connection.desiredMapIds, ['de_dust2'])
  await h.connection.leaveWarmup()
  assert.ok(h.calls.some((call) => call[0] === 'shutdown'))
  assert.equal(h.connection.desiredMode, '5v5')
  assert.ok(h.events.every((event) => event.whileQueued))
  assert.ok(!h.events.some((event) => event.type === 'error'))
  assert.ok(h.sent.some((message) => message.type === 'leave_warmup'))
  assert.ok(!h.sent.some((message) => message.type === 'leave_queue'))
})

test('failed preparation leaves warmup once and ignores repeated server launch messages', async () => {
  const h = await harness({ launchError: new Error('Standalone game preparation failed') })
  await h.connection.joinWarmup('5v5', 'de_dust2')
  h.connection.handleWarmup({ ...found, mode: '5v5' }, h.socket)
  h.connection.handleWarmup(connect, h.socket)
  h.finishAssets()
  await h.connection.warmupLaunch
  await h.connection.warmupCleanup
  for (let i = 0; i < 3; i++) h.connection.handleWarmup(connect, h.socket)
  await h.connection.warmupLaunch
  assert.equal(h.calls.filter(([type]) => type === 'launch').length, 1)
  assert.equal(h.events.filter((event) => event.code === 'WARMUP_FAILED').length, 1)
  assert.equal(h.sent.filter((event) => event.type === 'leave_warmup').length, 1)
  assert.equal(h.connection.warmupMatchId, null)
  assert.equal(h.connection.desiredMode, '5v5')
  await h.connection.joinWarmup('5v5', 'de_dust2')
  assert.equal(h.connection.warmupSuppressed, false)
  assert.equal(h.connection.cancelledMatchIds.has(connect.matchId), false)
})

for (const key of [
  'match.launch.closeFailed',
  'match.launch.alreadyRunning',
  'match.launch.adminRequired',
  'match.launch.adminCancelled',
  'match.launch.adminFailed',
  'match.launch.adminRestarting'
]) {
  test(`warmup preserves actionable launch failure ${key}`, async () => {
    const h = await harness({ launchError: new Error(key) })
    await h.connection.joinWarmup('5v5', 'de_dust2')
    h.connection.handleWarmup({ ...found, mode: '5v5' }, h.socket)
    h.connection.handleWarmup(connect, h.socket)
    h.finishAssets()
    await h.connection.warmupLaunch
    await h.connection.warmupCleanup
    assert.equal(h.events.find((event) => event.code === 'WARMUP_FAILED').message, key)
  })
}

test('an explicit MR8 retry accepts the reserved session after process-exit cleanup', async () => {
  const h = await harness()
  await h.connection.createSocket('test-token', 'https://eu.invalid')
  const socket = h.sockets[0]
  const emit = (message) => socket.listeners.get('message')({ data: JSON.stringify(message) })
  const roster = { ...found, mode: '5v5', region: 'eu', teams: { teamA: [], teamB: [] } }
  const connection = { ...connect, joinToken: 'a'.repeat(32) }
  try {
    emit({ type: 'authenticated', player: { id: 'me', username: 'Me', mmr: 1000 } })
    await h.connection.joinWarmup('5v5', ['de_dust2'])
    emit(roster)
    emit(connection)
    h.finishAssets()
    await h.connection.warmupLaunch
    h.connection.handleGameProcessExit('warmup', 0, null)
    await h.connection.warmupCleanup
    assert.equal(h.connection.cancelledMatchIds.has('warmup'), true)
    await h.connection.joinWarmup('5v5', ['de_dust2'])
    emit(roster)
    emit(connection)
    await h.connection.warmupLaunch
    assert.equal(h.connection.warmupMatchId, 'warmup')
    assert.equal(h.calls.filter(([type]) => type === 'launch').length, 2)
    assert.equal(h.connection.cancelledMatchIds.has('warmup'), false)
    assert.equal(h.connection.desiredMode, '5v5')
    assert.deepEqual(h.connection.desiredMapIds, ['de_dust2'])
  } finally {
    h.connection.shutdown()
    socket.close()
  }
})

test('leaving during asset preparation suppresses a delayed warmup launch and stale recovery', async () => {
  const h = await harness()
  await h.connection.joinWarmup('arena', 'fy_pool_day')
  h.connection.handleWarmup(found, h.socket)
  h.connection.handleWarmup(connect, h.socket)
  const leave = h.connection.leaveWarmup()
  const repeatedLeave = h.connection.leaveWarmup()
  assert.equal(leave, repeatedLeave)
  h.finishAssets()
  await leave
  h.connection.handleWarmup(found, h.socket)
  h.connection.handleWarmup(connect, h.socket)
  await h.connection.warmupLaunch
  assert.ok(!h.calls.some((call) => call[0] === 'launch'))
  assert.equal(h.connection.warmupMatchId, null)
})

test('cancelled warmup asset downloads do not show an error after leaving', async () => {
  const h = await harness()
  try {
    await h.connection.joinWarmup('arena', 'fy_pool_day')
    h.connection.handleWarmup(found, h.socket)
    h.connection.handleWarmup(connect, h.socket)
    const leaving = h.connection.leaveWarmup()
    h.failAssets(new Error('Match asset download was cancelled.'))
    await leaving
    await h.connection.warmupLaunch
    assert.ok(!h.events.some((event) => event.type === 'error' && event.code === 'WARMUP_FAILED'))
  } finally {
    h.connection.shutdown()
  }
})

test('asset failures in the current warmup still show an error', async () => {
  const h = await harness()
  try {
    await h.connection.joinWarmup('arena', 'fy_pool_day')
    h.connection.handleWarmup(found, h.socket)
    h.connection.handleWarmup(found, h.socket)
    h.connection.handleWarmup(connect, h.socket)
    h.failAssets(new Error('Asset hash did not match.'))
    await h.connection.warmupLaunch
    assert.equal(h.assetStarts.length, 1)
    assert.equal(
      h.events.filter((event) => event.type === 'error' && event.code === 'WARMUP_FAILED').length,
      1
    )
  } finally {
    h.connection.shutdown()
  }
})

test('rejects invalid map IDs and warmups outside ranked queue at IPC boundary', async () => {
  const h = await harness()
  assert.throws(() => h.connection.joinWarmup('5v5', '../map'))
  assert.throws(() => h.connection.joinWarmup('arena', '../map'))
  h.connection.desiredMode = '3v3'
  assert.throws(() => h.connection.joinWarmup('arena', 'fy_pool_day'))
  assert.equal(h.sent.length, 0)
})

async function warmupStoreHarness() {
  const timers = new Map()
  let timerId = 0
  const { create } = await import('zustand')
  const calls = []
  const exports = {}
  const source = ts.transpileModule(
    await readFile(
      new URL('../src/renderer/src/features/matchmaking/queue-warmup.store.ts', import.meta.url),
      'utf8'
    ),
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }
  ).outputText
  vm.runInNewContext(source, {
    exports,
    require: (name) => {
      if (name === '../../web-runtime') return { isWebRuntime: () => false }
      assert.equal(name, 'zustand')
      return { create }
    },
    window: {
      setTimeout: (callback) => {
        timers.set(++timerId, callback)
        return timerId
      },
      clearTimeout: (id) => timers.delete(id),
      api: {
        matchmaking: {
          leaveWarmup: async () => {
            calls.push(['leave'])
          },
          joinWarmup: async (mode, mapId) => calls.push(['join', mode, structuredClone(mapId)]),
          reconnectGame: async (matchId) => calls.push(['launch', matchId])
        }
      }
    }
  })
  return {
    store: exports.useQueueWarmupStore,
    timers,
    calls
  }
}

test('non-competitive browsing opens only on player action and queue replay preserves the tab', async () => {
  const { store } = await warmupStoreHarness()
  store.getState().handleEvent({ type: 'queue_joined', mode: '5v5' })
  assert.equal(store.getState().browsing, false)
  store.getState().open()
  assert.equal(store.getState().browsing, true)
  store.getState().handleEvent({ type: 'queue_joined', mode: '5v5' })
  assert.equal(store.getState().browsing, true)
  store.getState().dismiss()
  assert.equal(store.getState().browsing, false)
})

test('warmup connection stays in the tab and a competitive match ends browsing', async () => {
  const { store } = await warmupStoreHarness()
  const emit = (event) => store.getState().handleEvent(event)
  store.getState().open()
  emit({
    type: 'match_found',
    whileQueued: true,
    matchId: 'warmup',
    mode: 'arena',
    mapId: 'fy_snow'
  })
  emit({ type: 'match_connect', whileQueued: true, matchId: 'warmup' })
  assert.equal(store.getState().status, 'playing')
  assert.equal(store.getState().browsing, true)
  emit({ type: 'game_process_exited', whileQueued: true, matchId: 'warmup' })
  assert.equal(store.getState().matchId, null)
  assert.equal(store.getState().status, 'idle')
  assert.equal(store.getState().browsing, true)
  emit({ type: 'match_found', matchId: 'competitive', mode: '5v5' })
  assert.equal(store.getState().browsing, false)
})

for (const [mode, mapId] of [
  ['5v5', 'de_dust2'],
  ['ffa', 'de_dust2'],
  ['arena', 'fy_snow']
]) {
  test(`play-while-waiting starts ${mode} independently and blocks duplicate joins`, async () => {
    const { store, calls } = await warmupStoreHarness()
    store.getState().select(mode, '')
    await store.getState().join()
    assert.equal(calls.length, 0)
    store.getState().select(mode, mapId)
    await store.getState().join()
    await store.getState().join()
    assert.deepEqual(calls, [['join', mode, [mapId]]])
    assert.equal(store.getState().status, 'starting')
  })
}

test('public FFA post-match remains visible after game exit and clears for a ranked ready check', async () => {
  const { store } = await warmupStoreHarness()
  const emit = (event) => store.getState().handleEvent(event)
  emit({ ...found, mode: 'ffa' })
  emit(connect)
  const result = {
    type: 'match_finished',
    publicFfa: true,
    whileQueued: true,
    matchId: 'warmup',
    mode: 'ffa',
    mapId: 'de_dust2',
    players: []
  }
  emit(result)
  emit({ type: 'game_process_exited', whileQueued: true, matchId: 'warmup' })
  assert.equal(store.getState().status, 'idle')
  assert.equal(store.getState().completedMatch, result)
  emit({ type: 'match_ready_check', matchId: 'ranked' })
  assert.equal(store.getState().completedMatch, null)
})

test('public FFA completion closes the warmup game while retaining the ranked queue', async () => {
  const h = await harness()
  try {
    await h.connection.joinWarmup('ffa', 'de_dust2')
    h.connection.handleWarmup({ ...found, mode: 'ffa' }, h.socket)
    h.connection.handleWarmup(connect, h.socket)
    h.finishAssets()
    await h.connection.warmupLaunch
    h.connection.handleWarmup(
      {
        type: 'match_finished',
        publicFfa: true,
        whileQueued: true,
        matchId: 'warmup',
        mode: 'ffa'
      },
      h.socket
    )
    await h.connection.warmupCleanup
    assert.ok(h.calls.some(([action]) => action === 'shutdown'))
    assert.equal(h.connection.isQueued(), true)
    assert.ok(!h.sent.some((event) => event.type === 'leave_queue'))
    assert.ok(
      h.events.some(
        (event) => event.type === 'match_finished' && event.publicFfa && event.whileQueued
      )
    )
  } finally {
    h.connection.shutdown()
  }
})

for (const secondary of [false, true]) {
  test(`API restart preserves warmup and search on ${secondary ? 'secondary' : 'primary'} socket`, async () => {
    const h = await harness()
    await h.connection.createSocket('test-token', 'https://eu.invalid')
    const socket = h.sockets[0]
    const emit = (value) => socket.listeners.get('message')({ data: JSON.stringify(value) })
    try {
      emit({ type: 'authenticated', player: { id: 'me', username: 'Me', mmr: 1000 } })
      h.connection.handleWarmup(found, socket)
      h.connection.warmupConnectingMatchId = 'warmup'
      if (secondary) h.connection.socket = h.socket
      const before = h.sent.length
      emit({ type: 'server_restarting', message: 'Update', restartInMs: 1000, retryAfterMs: 5000 })
      assert.equal(h.connection.warmupMatchId, 'warmup')
      assert.equal(h.connection.desiredMode, '5v5')
      assert.deepEqual(h.connection.desiredMapIds, ['de_dust2'])
      assert.ok(
        !h.sent
          .slice(before)
          .some((message) => ['leave_warmup', 'leave_queue'].includes(message.type))
      )
      assert.ok(!h.calls.some((call) => ['shutdown', 'close'].includes(call[0])))
    } finally {
      h.connection.shutdown()
      socket.close()
    }
  })
}

test('warmup defaults to all maps and preserves multiple choices across catalog refreshes', async () => {
  const { store, calls } = await warmupStoreHarness()
  store.getState().syncMaps('ffa', ['de_dust', 'de_dust2', 'de_inferno'])
  assert.deepEqual(store.getState().selectedMapIds, ['de_dust', 'de_dust2', 'de_inferno'])
  store.getState().toggleMap('de_dust2')
  store.getState().syncMaps('ffa', ['de_dust', 'de_dust2', 'de_inferno'])
  assert.deepEqual(store.getState().selectedMapIds, ['de_dust', 'de_inferno'])
  await store.getState().join()
  assert.deepEqual(calls, [['join', 'ffa', ['de_dust', 'de_inferno']]])
  store.getState().toggleMap('de_dust')
  assert.deepEqual(store.getState().selectedMapIds, ['de_dust', 'de_inferno'])
})

test('catalog changes keep deselections and select newly available maps by default', async () => {
  const { store } = await warmupStoreHarness()
  store.getState().syncMaps('ffa', ['de_dust', 'de_dust2'])
  store.getState().toggleMap('de_dust2')
  store.getState().syncMaps('ffa', ['de_dust2', 'de_inferno'])
  assert.deepEqual(store.getState().selectedMapIds, ['de_inferno'])
  store.getState().syncMaps('arena', ['fy_snow', 'fy_pool_day'])
  assert.deepEqual(store.getState().selectedMapIds, ['fy_snow', 'fy_pool_day'])
  store.getState().toggleMap('fy_snow')
  store.getState().toggleMap('fy_pool_day')
  await store.getState().join()
  assert.equal(store.getState().status, 'idle')
})

test('IPC validates the complete pool and sends every selected warmup map', async () => {
  const h = await harness()
  await h.connection.joinWarmup('ffa', ['de_dust2', 'de_inferno'])
  assert.ok(
    h.sent.some(
      (message) =>
        message.type === 'join_warmup' &&
        JSON.stringify(message.mapIds) === JSON.stringify(['de_dust2', 'de_inferno'])
    )
  )
  for (const selection of [
    [],
    ['de_dust2', '../map'],
    ['de_dust2', 'de_dust2'],
    Array(33).fill('de_dust2')
  ]) {
    assert.throws(() => h.connection.joinWarmup('ffa', selection), /Invalid warmup selection/)
  }
})

test('Play with Bots launches a ranked MR8 session without consuming the ranked queue', async () => {
  const h = await harness()
  try {
    h.connection.warmupSuppressed = true
    await h.connection.playWithBots()
    assert.equal(h.connection.warmupSuppressed, false)
    assert.ok(h.sent.some((event) => event.type === 'play_with_bots'))
    h.connection.handleWarmup({ ...found, mode: '5v5' }, h.socket)
    h.connection.handleWarmup(connect, h.socket)
    h.finishAssets()
    await h.connection.warmupLaunch
    assert.equal(h.connection.isQueued(), true)
    assert.equal(h.connection.desiredMode, '5v5')
    assert.ok(h.calls.some(([action, id]) => action === 'launch' && id === 'warmup'))
    assert.ok(!h.sent.some((event) => event.type === 'leave_queue'))
  } finally {
    h.connection.shutdown()
  }
})

test('a departed ranked bot session can still display its settled MMR without clearing search', async () => {
  const { store } = await warmupStoreHarness()
  store.getState().handleEvent({ ...found, mode: '5v5' })
  store
    .getState()
    .handleEvent({ type: 'game_process_exited', whileQueued: true, matchId: 'warmup' })
  const result = {
    type: 'match_finished',
    whileQueued: true,
    matchId: 'warmup',
    mode: '5v5',
    players: []
  }
  store.getState().handleEvent(result)
  assert.equal(store.getState().completedMatch, result)
  assert.equal(store.getState().matchId, null)
})

test('MR8 map selection uses the warmup API and preserves the original ranked map pool', async () => {
  const h = await harness()
  try {
    await h.connection.joinWarmup('5v5', ['de_inferno'])
    assert.ok(
      h.sent.some(
        (event) =>
          event.type === 'join_warmup' && event.mode === '5v5' && event.mapIds[0] === 'de_inferno'
      )
    )
    assert.deepEqual(h.connection.desiredMapIds, ['de_dust2'])
    assert.equal(h.connection.isQueued(), true)
    assert.ok(!h.sent.some((event) => event.type === 'leave_queue'))
  } finally {
    h.connection.shutdown()
  }
})

test('MR8 results survive cleanup, authentication replay and queue updates until dismissed', async () => {
  const { store } = await warmupStoreHarness()
  const emit = (event) => store.getState().handleEvent(event)
  emit({ ...found, mode: '5v5' })
  const result = {
    type: 'match_finished',
    whileQueued: true,
    matchId: 'warmup',
    mode: '5v5',
    teamAScore: 4,
    teamBScore: 9,
    winner: 2,
    players: []
  }
  emit(result)
  emit({ type: 'game_process_exited', whileQueued: true, matchId: 'warmup' })
  emit({ type: 'authenticated', player: { id: 'me', username: 'Me', mmr: 813 } })
  emit({ type: 'queue_joined', mode: '5v5' })
  assert.equal(store.getState().completedMatch, result)
  emit({ type: 'match_ready_check', matchId: 'ranked' })
  assert.equal(store.getState().completedMatch, null)
  emit(result)
  store.getState().reset()
  assert.equal(store.getState().completedMatch, null)
})

test('MR8 completion validates and focuses the launcher without leaving the queue', async () => {
  const h = await harness()
  const focused = []
  h.connection.focusLauncher = (...args) => focused.push(args)
  const result = {
    type: 'match_finished',
    whileQueued: true,
    matchId: 'mr8',
    mode: '5v5',
    mapId: 'de_downtown_csneo',
    teams: { teamA: [], teamB: [] },
    winner: 2,
    teamAScore: 4,
    teamBScore: 9,
    players: [
      {
        id: 'me',
        username: 'Me',
        kills: 1,
        deaths: 7,
        assists: 0,
        mmrBefore: 823,
        mmrAfter: 813,
        mmrChange: -10
      }
    ]
  }
  try {
    assert.equal(h.validate(result), true)
    h.connection.handleWarmup(result, h.socket)
    assert.equal(h.events.at(-1).matchId, result.matchId)
    assert.equal(focused.length, 1)
    assert.equal(h.connection.isQueued(), true)
    assert.ok(!h.sent.some((event) => event.type === 'leave_queue'))
  } finally {
    h.connection.shutdown()
  }
})

/* eslint-disable react/prop-types -- Props in these fixtures come from the typed lobby. */
test('MR8 results share the lobby with friends and dismiss without changing the MR12 queue', async () => {
  const { create } = await import('zustand')
  const { store: warmup } = await warmupStoreHarness()
  const result = { matchId: 'mr8-result', mode: '5v5' }
  warmup.setState({ completedMatch: result })
  const warmupHook = (select) => select(warmup.getState())
  warmupHook.getState = warmup.getState
  const queue = create((set) => ({
    queueStatus: 'queued',
    queuedAt: '2026-10-24T06:00:00Z',
    selectedMode: '5v5',
    selectedMapIds: ['de_inferno'],
    completedMatch: null,
    dismissCompletedMatch: () => set({ completedMatch: null })
  }))
  const before = queue.getState()
  const navigation = [],
    windows = []
  let onNavigate
  const dummyStore = (select) => select({})
  dummyStore.getState = () => ({})
  const auth = (select) =>
    select({ session: { player: { id: 'me', username: 'Player', mmr: 813 } } })
  const dependencies = {
    react: React,
    'react/jsx-runtime': jsx,
    './matchmaking.store': { useMatchmakingStore: queue },
    './queue-warmup.store': { useQueueWarmupStore: warmupHook },
    '../auth/auth.store': { useAuthStore: auth },
    '../navigation/navigation.store': {
      useNavigationStore: (select) =>
        select({ page: 'lobby', navigate: (page) => navigation.push(page) })
    },
    '../i18n/i18n': { useTranslation: () => ({ t: (key) => key }) },
    '../../components/ui/LauncherWindow': {
      LauncherWindow: (props) => {
        windows.push(props)
        return React.createElement('section', { 'data-launcher-window': true }, props.children)
      }
    },
    '../../components/ui/lobby/Navigation': {
      LobbyNavigation: ({ onNavigate: handler }) => {
        onNavigate = handler
        return React.createElement('nav', null, 'Lobby navigation')
      }
    },
    '../party/LobbySocialSidebar': {
      LobbySocialSidebar: ({ collapsed }) =>
        React.createElement('aside', { 'data-collapsed': collapsed }, 'Friends and MR12 queue')
    },
    './MatchResultsPage': {
      MatchResultsPage: ({ match }) =>
        React.createElement('article', { 'data-results': match.matchId }, 'MR8 result')
    },
    './match-survey-session': {
      isMatchSurveyDeferredForSession: () => false,
      deferMatchSurveyForSession: () => {},
      reopenMatchSurveyForSession: () => {}
    },
    '../navigation/page-icons': { pageIcons: {} }
  }
  const source = await readFile(
    new URL('../src/renderer/src/features/matchmaking/LobbyPage.tsx', import.meta.url),
    'utf8'
  )
  // Stub unrelated children while rendering the real lobby composition and handlers.
  const syntax = ts.createSourceFile(
    'LobbyPage.tsx',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  )
  for (const statement of syntax.statements) {
    if (!ts.isImportDeclaration(statement)) continue
    const name = statement.moduleSpecifier.text
    if (dependencies[name]) continue
    const values = {}
    if (statement.importClause?.name) values.default = ''
    for (const specifier of statement.importClause?.namedBindings?.elements ?? []) {
      const exported = specifier.propertyName?.text ?? specifier.name.text
      values[exported] = exported.startsWith('use') ? dummyStore : () => null
    }
    dependencies[name] = values
  }
  const context = vm.createContext({})
  const module = new vm.SourceTextModule(
    ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
        target: ts.ScriptTarget.ES2022
      }
    }).outputText,
    { context }
  )
  await module.link((name) => {
    const values = dependencies[name]
    assert.ok(values, `Unexpected import: ${name}`)
    return new vm.SyntheticModule(
      Object.keys(values),
      function () {
        for (const [key, value] of Object.entries(values)) this.setExport(key, value)
      },
      { context }
    )
  })
  await module.evaluate()
  const html = renderToStaticMarkup(React.createElement(module.namespace.LobbyPage))
  assert.match(html, /data-results="mr8-result"/)
  assert.match(html, /data-collapsed="false"/)
  assert.match(html, /Friends and MR12 queue/)
  assert.doesNotMatch(html, /<dialog|aria-modal="true"/)
  assert.equal(windows.at(-1).fitContent, true)
  onNavigate('lobby')
  assert.equal(warmup.getState().completedMatch, null)
  assert.deepEqual(navigation, ['lobby'])
  assert.equal(queue.getState().queueStatus, before.queueStatus)
  assert.equal(queue.getState().queuedAt, before.queuedAt)
  assert.equal(queue.getState().selectedMode, before.selectedMode)
  assert.equal(queue.getState().selectedMapIds, before.selectedMapIds)
})

for (const outcome of ['timeout', 'decline', 'all-ready']) {
  test(`MR8 game survives individual acceptance and ${outcome === 'all-ready' ? 'closes only when everyone is ready' : outcome}`, async () => {
    const h = await harness()
    await h.connection.createSocket('test-token', 'https://eu.invalid')
    const socket = h.sockets[0]
    const emit = (value) => socket.listeners.get('message')({ data: JSON.stringify(value) })
    try {
      emit({ type: 'authenticated', player: { id: 'me', username: 'Me', mmr: 1000 } })
      h.connection.handleWarmup(found, socket)
      h.connection.handleWarmup(connect, socket)
      h.finishAssets()
      await h.connection.warmupLaunch
      emit({
        type: 'match_ready_updated',
        matchId: 'ranked',
        acceptedPlayerIds: ['me'],
        playersRequired: 2
      })
      await Promise.resolve()
      assert.equal(h.connection.warmupMatchId, 'warmup')
      assert.ok(
        !h.calls.some(([type, id]) => type === 'shutdown' || (type === 'close' && id === 'warmup'))
      )
      assert.ok(!h.sent.some(({ type }) => type === 'leave_warmup'))
      if (outcome === 'all-ready') {
        emit({ type: 'match_server_starting', matchId: 'ranked' })
        await h.connection.warmupCleanup
        assert.equal(h.connection.warmupMatchId, null)
        assert.ok(h.calls.some(([type]) => type === 'shutdown'))
      } else {
        emit({
          type: 'match_cancelled',
          matchId: 'ranked',
          reason: outcome === 'timeout' ? 'READY_TIMEOUT' : 'PLAYER_DECLINED',
          message: 'Ready check cancelled'
        })
        await Promise.resolve()
        assert.equal(h.connection.warmupMatchId, 'warmup')
        assert.ok(
          !h.calls.some(
            ([type, id]) => type === 'shutdown' || (type === 'close' && id === 'warmup')
          )
        )
        assert.ok(!h.sent.some(({ type }) => type === 'leave_warmup'))
      }
    } finally {
      h.connection.shutdown()
      socket.close()
    }
  })
}

test('unacknowledged warmup admission stops loading and leaves before retry', async () => {
  const { store, timers, calls } = await warmupStoreHarness()
  store.getState().select('5v5', ['de_dust2'])
  await store.getState().join()
  assert.equal(store.getState().status, 'starting')
  assert.equal(timers.size, 1)
  for (const callback of timers.values()) callback()
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(store.getState().status, 'error')
  assert.equal(timers.size, 0)
  assert.equal(calls.at(-1)[0], 'leave')
  await store.getState().join()
  assert.equal(store.getState().status, 'starting')
  store.getState().reset()
})

test('warmup admission timer does not cancel an admitted session preparing assets', async () => {
  const { store, timers } = await warmupStoreHarness()
  store.getState().select('5v5', ['de_dust2'])
  await store.getState().join()
  const timeout = [...timers.values()][0]
  store.getState().handleEvent({
    type: 'match_found',
    whileQueued: true,
    matchId: 'warmup',
    mode: '5v5',
    mapId: 'de_dust2'
  })
  assert.equal(timers.size, 0)
  timeout()
  assert.equal(store.getState().status, 'starting')
  assert.equal(store.getState().matchId, 'warmup')
})

test('legacy untagged warmup failures release the pending state', async () => {
  const { store, timers } = await warmupStoreHarness()
  store.getState().select('5v5', ['de_dust2'])
  await store.getState().join()
  store.getState().handleEvent({ type: 'error', code: 'WARMUP_FAILED', message: 'Unavailable' })
  assert.equal(store.getState().status, 'error')
  assert.equal(timers.size, 0)
})

function launcherWindow() {
  const calls = []
  let minimized = false,
    topmost = false,
    visible = true
  const window = {
    isDestroyed: () => false,
    isMinimized: () => minimized,
    isVisible: () => visible && !minimized,
    isFocused: () => false,
    showInactive: () => {
      visible = true
      calls.push('showInactive')
    },
    hide: () => {
      visible = false
      calls.push('hide')
    },
    flashFrame: (value) => calls.push(['flash', value]),
    isAlwaysOnTop: () => topmost,
    restore: () => {
      minimized = false
      calls.push('restore')
    },
    show: () => calls.push('show'),
    focus: () => calls.push('focus'),
    moveTop: () => calls.push('moveTop'),
    setAlwaysOnTop: (value) => {
      topmost = value
      calls.push(['topmost', value])
    },
    minimize: () => {
      minimized = true
      calls.push('minimize')
    }
  }
  return { window, calls }
}
for (const platform of ['linux', 'win32']) {
  test(`${platform} game handoff clears ready-check attention and releases the fullscreen launcher`, async () => {
    const { window, calls } = launcherWindow()
    const h = await harness({ platform, window })
    try {
      h.connection.focusLauncher(true)
      assert.equal(window.isAlwaysOnTop(), platform === 'win32')
      assert.equal(Boolean(h.connection.matchAttentionTimer), platform === 'win32')
      calls.length = 0
      h.calls.length = 0
      h.connection.yieldLauncherToGame()
      assert.deepEqual(
        calls,
        platform === 'win32' ? [['topmost', false], 'minimize'] : [['flash', false], 'hide']
      )
      assert.equal(h.connection.matchAttentionTimer, null)
      assert.equal(h.connection.matchAttentionWindow, null)
      assert.equal(h.connection.restoreMatchWindowTopmost, false)
      assert.equal(window.isAlwaysOnTop(), false)
      assert.equal(h.calls.length, 0, 'Handoff must not focus the app')
      calls.length = 0
      h.connection.yieldLauncherToGame()
      assert.deepEqual(
        calls,
        platform === 'linux' ? [['flash', false]] : [],
        'Repeated handoffs must not raise the app'
      )
      h.connection.focusLauncher(true)
      assert.equal(
        window.isMinimized(),
        false,
        'A later ready check must still restore the launcher'
      )
      assert.ok(calls.includes('focus'))
      assert.equal(window.isVisible(), true, 'Ready checks show the hidden launcher')
    } finally {
      h.connection.yieldLauncherToGame()
      h.connection.shutdown()
    }
  })
}
test('Linux bot warmup releases the launcher only after a successful game launch', async () => {
  const { window, calls } = launcherWindow()
  const h = await harness({ window })
  try {
    h.connection.handleWarmup(found, h.socket)
    h.connection.handleWarmup(connect, h.socket)
    assert.deepEqual(calls, [])
    h.finishAssets()
    await h.connection.warmupLaunch
    assert.ok(h.calls.some(([type]) => type === 'launch'))
    assert.deepEqual(calls, [['flash', false], 'hide'])
    assert.equal(window.isVisible(), false)
    assert.equal(h.connection.desiredMode, '5v5')
  } finally {
    h.connection.shutdown()
  }
})

test('Linux returns to the launcher after warmup exits, but ignores an old warmup exit during a new game', async () => {
  const { window, calls } = launcherWindow()
  const h = await harness({ window })
  try {
    h.connection.warmupMatchIds.add('warmup')
    h.connection.warmupMatchId = 'warmup'
    h.connection.yieldLauncherToGame()
    h.connection.handleGameProcessExit('warmup', 0, null)
    assert.equal(window.isMinimized(), false)
    assert.equal(window.isVisible(), true)
    assert.ok(calls.includes('showInactive'))
    assert.ok(calls.includes('focus'))
    await h.connection.warmupCleanup
    calls.length = 0
    h.connection.warmupMatchId = 'new-game'
    h.connection.handleGameProcessExit('warmup', 0, null)
    assert.deepEqual(calls, [])
  } finally {
    h.connection.shutdown()
  }
})

for (const focused of [true, false]) {
  test(`Linux ready attention avoids forced fullscreen stacking (focused=${focused})`, async () => {
    const { window, calls } = launcherWindow()
    window.isFocused = () => focused
    for (const method of ['show', 'moveTop', 'setAlwaysOnTop']) {
      window[method] = () => {
        throw new Error(`Unsafe Linux attention: ${method}`)
      }
    }
    const h = await harness({ platform: 'linux', window })
    try {
      h.connection.focusLauncher(true)
      h.connection.focusLauncher(true)
      assert.deepEqual(calls, focused ? [] : [['flash', true], 'focus', ['flash', true], 'focus'])
      assert.equal(
        h.calls.some(([type]) => type === 'app-focus'),
        false
      )
      assert.equal(h.connection.matchAttentionTimer, null)
    } finally {
      h.connection.shutdown()
    }
  })
}

for (const superseded of [false, true]) {
  test(`post-match view lasts ten seconds without raising the launcher (superseded=${superseded})`, async () => {
    const pending = []
    const timers = {
      setTimeout: (callback, ms) => {
        const timer = {
          callback,
          ms,
          unref() {
            return this
          }
        }
        pending.push(timer)
        return timer
      },
      clearTimeout: () => undefined
    }
    const { window, calls } = launcherWindow()
    const h = await harness({ window, timers })
    try {
      await h.connection.createSocket('test-token', 'https://eu.invalid')
      h.setActiveMatch('finished')
      const emit = (message) =>
        h.sockets[0].listeners.get('message')({ data: JSON.stringify(message) })
      emit({
        type: 'match_finished',
        matchId: 'finished',
        mode: 'arena',
        mapId: 'fy_contact',
        teams: { teamA: [], teamB: [] },
        winner: 1,
        teamAScore: 7,
        teamBScore: 9,
        players: []
      })
      assert.equal(h.connection.finishedMatchIds.has('finished'), true)
      assert.deepEqual(calls, [], 'Results must stay in the game, without launcher activation')
      assert.equal(
        h.calls.some(([type]) => type === 'close'),
        false
      )
      const timer = pending.find((timer) => timer.ms === 10_000)
      assert.ok(timer, 'The game must receive a ten-second result window')
      if (superseded) {
        h.connection.lastConnection = { matchId: 'new-game' }
        h.setActiveMatch('new-game')
      }
      timer.callback()
      assert.equal(calls.includes('focus'), !superseded)
      assert.equal(
        h.calls.some(([type, id]) => type === 'close' && id === 'new-game'),
        false
      )
    } finally {
      h.connection.shutdown()
    }
  })
}

for (const platform of ['linux', 'win32']) {
  test(`${platform} delivers ready checks before native attention and keeps accept responsive`, async () => {
    const h = await harness({ platform })
    try {
      await h.connection.createSocket('test-token', 'https://eu.invalid')
      const emit = (message) =>
        h.sockets[0].listeners.get('message')({ data: JSON.stringify(message) })
      emit({ type: 'authenticated', player: { id: 'me', username: 'Me', mmr: 1000 } })
      const ready = {
        type: 'match_ready_check',
        matchId: '37bd42ae-5741-4ac9-911c-135e19a8f0ce',
        deadline: new Date(Date.now() + 120_000).toISOString(),
        acceptedPlayerIds: [],
        playersRequired: 1
      }
      h.connection.focusLauncher = () => {
        assert.equal(h.events.filter((event) => event.type === 'match_ready_check').length, 1)
      }
      emit(ready)
      assert.equal(h.events.filter((event) => event.type === 'match_ready_check').length, 1)
      assert.equal(
        h.calls.filter(([type]) => type === 'notification-support').length,
        platform === 'linux' ? 0 : 1
      )
      assert.equal(h.connection.recoveryStatusPending, false)
      h.connection.respondReady(ready.matchId, true)
      assert.ok(
        h.sent.some(
          (message) =>
            message.type === 'match_ready_response' &&
            message.matchId === ready.matchId &&
            message.accepted === true
        )
      )
    } finally {
      h.connection.shutdown()
    }
  })
}
