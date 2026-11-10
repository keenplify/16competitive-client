/* eslint-disable @typescript-eslint/explicit-function-return-type */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

const source = readFileSync('src/main/game/standalone-session.ts', 'utf8')
const parsed = ts.createSourceFile('session.ts', source, ts.ScriptTarget.Latest, true)
const declaration = parsed.statements.find(
  (node) => ts.isFunctionDeclaration(node) && node.name?.text === 'withGameStorageApproval'
)
const code = ts.transpileModule(declaration.getText(parsed).replace(/^export /, ''), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText

function harness(options = {}) {
  const calls = []
  const context = vm.createContext({
    Error,
    storageAdminRestart: null,
    process: {
      platform: options.platform ?? 'win32',
      argv: options.argv ?? [],
      execPath: 'verified-launcher.exe'
    },
    app: { isPackaged: options.packaged ?? true },
    helperExecutable: async () => {
      calls.push('verify-helper')
      if (options.invalidHelper) throw new Error('helper integrity failed')
      return 'verified-helper.exe'
    },
    hashFile: async (executable) => {
      calls.push(['hash', executable])
      return 'launcher-sha256'
    },
    stopStandaloneSession: async () => {
      calls.push('cleanup')
    },
    requestAdminRestart: async (...args) => {
      calls.push(['approval', ...args])
      if (options.declined) throw new Error('match.launch.adminCancelled')
    }
  })
  vm.runInContext(code + '\nglobalThis.run = withGameStorageApproval', context)
  return { run: context.run, calls }
}

test('protected storage requests the verified launcher restart once and never reruns writes', async () => {
  const h = harness()
  let attempts = 0
  const action = async () => {
    attempts++
    throw new Error('match.assets.storageDenied')
  }
  await Promise.all([
    assert.rejects(h.run(action), /match.launch.adminRestarting/),
    assert.rejects(h.run(action), /match.launch.adminRestarting/)
  ])
  assert.equal(attempts, 2)
  assert.deepEqual(h.calls, [
    'verify-helper',
    'cleanup',
    ['hash', 'verified-launcher.exe'],
    ['approval', 'verified-helper.exe', 'verified-launcher.exe', 'launcher-sha256']
  ])
})

test('declined administrator approval preserves an actionable cancellation', async () => {
  const h = harness({ declined: true })
  await assert.rejects(
    h.run(async () => {
      throw new Error('match.assets.storageDenied')
    }),
    /match.launch.adminCancelled/
  )
})

test('helper verification failures cannot request administrator access', async () => {
  const h = harness({ invalidHelper: true })
  await assert.rejects(
    h.run(async () => {
      throw new Error('match.assets.storageDenied')
    }),
    /match.launch.adminFailed/
  )
  assert.deepEqual(h.calls, ['verify-helper'])
})

test('Linux, development, background runtimes and elevated retries do not request UAC', async () => {
  for (const options of [
    { platform: 'linux' },
    { packaged: false },
    { argv: ['--native-helper-runtime'] },
    { argv: ['--admin-game-retry'] }
  ]) {
    const h = harness(options)
    const original = new Error('match.assets.storageDenied')
    await assert.rejects(
      h.run(async () => {
        throw original
      }),
      (error) => error === original
    )
    assert.deepEqual(h.calls, [])
  }
})

test('successful writes and unrelated errors do not elevate', async () => {
  const h = harness()
  assert.equal(await h.run(async () => 'ready'), 'ready')
  await assert.rejects(
    h.run(async () => {
      throw new Error('Unrecognized model link')
    }),
    /Unrecognized model link/
  )
  assert.deepEqual(h.calls, [])
})

const renderer = ts.createSourceFile(
  'store.ts',
  readFileSync('src/renderer/src/features/matchmaking/matchmaking.store.ts', 'utf8'),
  ts.ScriptTarget.Latest,
  true
)
let reconnect
function visit(node) {
  if (ts.isPropertyAssignment(node) && node.name.getText(renderer) === 'reconnectGame')
    reconnect = node.initializer.getText(renderer)
  ts.forEachChild(node, visit)
}
visit(renderer)
const reconnectCode = ts.transpileModule(`globalThis.reconnect = ${reconnect}`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 }
}).outputText

test('reconnect resolves one pending toast for success and declined approval', async () => {
  for (const declined of [false, true]) {
    const state = { reconnectingGame: false }
    const feedback = []
    let settle
    const pending = new Promise((resolve, reject) => {
      settle = () => (declined ? reject(new Error('match.launch.adminCancelled')) : resolve())
    })
    const context = vm.createContext({
      get: () => state,
      set: (update) => Object.assign(state, update),
      useLanguageStore: { getState: () => ({ language: 'en' }) },
      translate: (_language, key) => key,
      readableError: (error) => error.message,
      toast: {
        loading: (value) => {
          feedback.push(['pending', value])
          return 1
        },
        update: (id, value) => feedback.push([id, value])
      },
      window: { api: { matchmaking: { reconnectGame: () => pending } } }
    })
    vm.runInContext(reconnectCode, context)
    const task = context.reconnect()
    assert.equal(state.reconnectingGame, true)
    await context.reconnect()
    assert.equal(feedback.length, 1)
    settle()
    await task
    assert.equal(state.reconnectingGame, false)
    assert.equal(feedback.length, 2)
    assert.equal(feedback[1][1].isLoading, false)
    assert.equal(feedback[1][1].type, declined ? 'error' : 'success')
  }
})
