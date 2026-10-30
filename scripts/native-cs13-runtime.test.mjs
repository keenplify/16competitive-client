/* eslint-disable @typescript-eslint/explicit-function-return-type */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import vm from 'node:vm'
import { test } from 'node:test'
import ts from 'typescript'

const source = readFileSync(
  new URL('../src/main/native-helper-runtime.ts', import.meta.url),
  'utf8'
)
const parsed = ts.createSourceFile('runtime.ts', source, ts.ScriptTarget.Latest, true)
const functionCode = (name) =>
  ts.transpileModule(
    parsed.statements
      .find((node) => ts.isFunctionDeclaration(node) && node.name?.text === name)
      .getText(parsed),
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }
  ).outputText
const matchId = '12345678-1234-4234-8234-123456789abc'

function launchHarness(mode, options = {}) {
  const calls = []
  let finish
  const done = new Promise((resolve) => {
    finish = resolve
  })
  const context = vm.createContext({
    AbortSignal: { timeout: () => undefined },
    activeGame: 'cs16',
    auxiliaryRuntime: false,
    stopping: false,
    revokeOnExit: false,
    voiceState: {},
    stage: '',
    join,
    dataRoot: '/helper',
    app: { whenReady: async () => undefined, getPath: () => '/helper/runtime-data' },
    mkdir: async () => undefined,
    setNativeHelperApiUrl: () => undefined,
    requestHelperDevice: async () => ({ banned: options.banned ?? false }),
    parseDeviceStatus: (value) => value,
    LOCAL_DEVELOPMENT: false,
    acceptNativeHelperSession: async () => {
      calls.push('auth')
    },
    fetch: async () => ({
      ok: true,
      json: async () => ({
        matchId: options.wrongMatch ? 'wrong' : matchId,
        mode,
        host: '192.0.2.1',
        port: 27015,
        password: 'a'.repeat(24),
        joinToken: 'a'.repeat(32)
      })
    }),
    syncPreferences: async () => {
      calls.push(['preferences', context.activeGame])
    },
    startMatchAssetPreload: async (...args) => {
      calls.push(['assets', args[3]])
      if (options.assetFailure) throw new Error('verification failed')
    },
    launchCs13Match: async (...args) => {
      calls.push(['cs13', ...args])
    },
    launchCounterStrikeForMatch: async (...args) => {
      calls.push(['cs16', ...args])
    },
    getActiveCs13ScoreboardDirectory: () => '/cs13-overlay',
    getActiveScoreboardDirectory: () => '/cs16-overlay',
    setInterval: () => 1,
    setTimeout: () => ({
      unref() {
        return undefined
      }
    }),
    publishVoice: () => undefined,
    stop: async () => {
      calls.push('stop')
    },
    emit: (value) => {
      if (value.event === 'launched') finish(value)
    }
  })
  vm.runInContext(functionCode('run') + '\nglobalThis.run = run', context)
  const pending = context.run({
    protocol: 1,
    action: 'launch',
    apiOrigin: 'https://fixture.test',
    token: 'fixture',
    matchId
  })
  void pending.catch((error) => finish({ error: error.message }))
  return { calls, done, context }
}

test('web CS13 selects the managed legacy adapter and its cosmetic session', async () => {
  const h = launchHarness('cs13_3v3')
  const reply = await h.done
  assert.equal(reply.error, undefined)
  assert.equal(reply.sessionDirectory, '/cs13-overlay')
  assert.deepEqual(h.calls.slice(0, 3), ['auth', ['preferences', 'cs13'], ['assets', 'cs13']])
  const launch = h.calls.find((call) => call[0] === 'cs13')
  assert.equal(launch[1].type, 'match_connect')
  assert.equal(launch[1].matchId, matchId)
  assert.equal(launch[4], 'https://fixture.test')
  assert.equal(launch[3](), true)
  h.context.stopping = true
  assert.equal(launch[3](), false)
  assert.equal(
    h.calls.some((call) => call[0] === 'cs16'),
    false
  )
  await launch[2]()
  assert.equal(h.calls.at(-1), 'stop')
})

test('modern matches retain the CS16 adapter', async () => {
  const h = launchHarness('5v5')
  const reply = await h.done
  assert.equal(reply.error, undefined)
  assert.equal(reply.sessionDirectory, '/cs16-overlay')
  assert.ok(h.calls.some((call) => call[0] === 'cs16'))
  assert.equal(
    h.calls.some((call) => call[0] === 'cs13'),
    false
  )
})

test('device, membership and asset failures cannot launch either adapter', async () => {
  for (const [options, expected] of [
    [{ banned: true }, 'This device cannot join competitive matches'],
    [{ wrongMatch: true }, 'Invalid match connection'],
    [{ assetFailure: true }, 'verification failed']
  ]) {
    const h = launchHarness('cs13_3v3', options)
    assert.equal((await h.done).error, expected)
    assert.equal(
      h.calls.some((call) => ['cs13', 'cs16'].includes(call[0])),
      false
    )
  }
})

test('CS13 preferences use the saved 1.3 folder without requiring a 1.6 installation', async () => {
  const selected = []
  const preferences = JSON.stringify({
    cs13: '/games/cs13',
    settings: { enhancementsEnabled: true }
  })
  const context = vm.createContext({
    activeGame: 'cs13',
    lastPreferences: '',
    dataRoot: '/helper',
    join,
    isAbsolute: (value) => value.startsWith('/'),
    process: { platform: 'win32' },
    app: { getPath: () => '/helper/runtime-data' },
    readFile: async (path) => (path.endsWith('web-helper.json') ? Buffer.from(preferences) : '{}'),
    LegacyGameService: class {
      constructor(deps) {
        this.deps = deps
      }
      async choose() {
        selected.push(await this.deps.chooseFolder())
        return { ok: true, value: { installation: {} } }
      }
    },
    saveGameSettings: async () => {
      throw new Error('must not configure CS16')
    },
    getGameSettings: async () => ({}),
    saveNextClientIntegration: async () => undefined,
    saveFastSwitch: async () => undefined,
    savePlayerPingKey: async () => undefined,
    saveLightweightHud: async () => undefined,
    saveKillCards: async () => undefined,
    saveGameDisplay: async () => undefined,
    updateActiveCrosshair: async () => undefined,
    updateActiveKillCards: async () => undefined,
    writeLiveSessionFile: async () => undefined
  })
  vm.runInContext(functionCode('syncPreferences') + '\nglobalThis.sync = syncPreferences', context)
  await context.sync(true)
  assert.deepEqual(selected, ['/games/cs13'])
})
