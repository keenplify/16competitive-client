/* eslint-disable @typescript-eslint/explicit-function-return-type */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import ts from 'typescript'
import { create } from 'zustand'

async function harness() {
  let emit
  const context = vm.createContext({
    window: {
      api: {
        matchmaking: {
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
  return { store, emit: (message) => emit(message) }
}

test('restart notification clears queued state and stale queue timers', async () => {
  const { store, emit } = await harness()
  store.setState({ queueStatus: 'queued', queuedAt: 'fixture', queueStartedAt: 123 })
  emit({ type: 'server_restarting', message: 'Restarting', retryAfterMs: 30000 })
  assert.equal(store.getState().queueStatus, 'idle')
  assert.equal(store.getState().queueStartedAt, null)
  assert.equal(store.getState().serverRestarting.message, 'Restarting')
})

test('a rejected join leaves Joining matchmaking and preserves the error', async () => {
  const { store, emit } = await harness()
  store.setState({ queueStatus: 'joining' })
  emit({ type: 'error', code: 'SERVER_RESTARTING', message: 'Retry shortly' })
  assert.equal(store.getState().queueStatus, 'idle')
  assert.equal(store.getState().error, 'Retry shortly')
})
