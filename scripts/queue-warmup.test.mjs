/* eslint-disable @typescript-eslint/explicit-function-return-type */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import ts from 'typescript'

async function harness() {
  const calls = [],
    events = [],
    sent = []
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
      this.listeners.get('close')?.()
    }
  }
  let activeMatch = null
  let finishAssets
  const assets = new Promise((resolve) => {
    finishAssets = resolve
  })
  const context = vm.createContext({
    console,
    process: { platform: 'linux' },
    URL,
    Map,
    Set,
    Date,
    Promise,
    setTimeout,
    clearTimeout,
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
    isMatchmakingMode: (value) => ['5v5', 'arena', 'ffa', '3v3'].includes(value),
    MATCHMAKING_CHANNELS: { event: 'event' },
    API_BASE_URL: 'https://fallback.invalid',
    LOCAL_DEVELOPMENT: false,
    activateIcafeBranch: async () => {},
    toMatchmakingWsUrl: (url) => url.replace('https:', 'wss:') + '/matchmaking',
    createAutomaticMatchReporter: () => async () => {},
    startMatchAssetPreload: async () => {},
    waitForMatchAssetPreload: () => assets,
    launchCounterStrikeForMatch: async (input) => {
      activeMatch = input.matchId
      calls.push(['launch', input.matchId, input.apiUrl])
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
    BrowserWindow: { fromWebContents: () => null },
    discordPresence: { setInGame: () => {}, setQueue: () => {} }
  }
  const module = new vm.SourceTextModule(source, { context })
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
    desiredMode: '5v5',
    desiredMapIds: ['de_dust2'],
    freshProcess: false,
    activeApiUrl: 'https://eu.invalid',
    renderer: { isDestroyed: () => false, send: (_channel, event) => events.push(event) }
  })
  return { connection, socket, sockets, calls, events, sent, finishAssets }
}
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
    assert.equal(h.connection.desiredPreferHumans, true)
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

test('rejects ranked modes and invalid map IDs at IPC boundary', async () => {
  const h = await harness()
  assert.throws(() => h.connection.joinWarmup('5v5', 'de_dust2'))
  assert.throws(() => h.connection.joinWarmup('arena', '../map'))
  h.connection.desiredMode = '3v3'
  assert.throws(() => h.connection.joinWarmup('arena', 'fy_pool_day'))
  assert.equal(h.sent.length, 0)
})

async function warmupStoreHarness() {
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
      api: {
        matchmaking: {
          leaveWarmup: async () => {},
          joinWarmup: async (mode, mapId) => calls.push(['join', mode, mapId]),
          reconnectGame: async (matchId) => calls.push(['launch', matchId])
        }
      }
    }
  })
  return {
    store: exports.useQueueWarmupStore,
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

test('tab starts only a non-competitive session and blocks duplicate joins', async () => {
  const { store, calls } = await warmupStoreHarness()
  store.getState().select('5v5', 'de_dust2')
  await store.getState().join()
  assert.equal(calls.length, 0)
  store.getState().select('arena', '')
  await store.getState().join()
  assert.equal(calls.length, 0)
  store.getState().select('arena', 'fy_snow')
  await store.getState().join()
  await store.getState().join()
  assert.deepEqual(calls, [['join', 'arena', 'fy_snow']])
  assert.equal(store.getState().status, 'starting')
})
