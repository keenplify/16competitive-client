/* eslint-disable @typescript-eslint/explicit-function-return-type */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { create } from 'zustand'

function harness(web, api) {
  const exports = {}
  const source = ts.transpileModule(
    readFileSync(
      new URL('../src/renderer/src/features/settings/game-settings.store.ts', import.meta.url),
      'utf8'
    ),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }
  ).outputText
  new Function('require', 'exports', 'window', 'performance', 'console', source)(
    (name) => {
      if (name === 'zustand') return { create }
      if (name.endsWith('web-runtime')) return { isWebRuntime: () => web }
      return { DEFAULT_CROSSHAIR: {}, DEFAULT_PLAYER_PING_KEY: 'G' }
    },
    exports,
    { api: { gameSettings: api } },
    performance,
    { info: () => undefined, warn: () => undefined }
  )
  return exports.useGameSettingsStore
}
const settings = (folder = null) => ({
  cs16FolderPath: folder,
  cs16ExecutablePath: folder,
  setupCompleted: true,
  display: {},
  currentDisplayResolution: {},
  platform: 'linux'
})

test('web settings stay dismissible when helper has no installation', async () => {
  const store = harness(true, { get: async () => settings() })
  await store.getState().load()
  assert.equal(store.getState().requiresGameSetup, false)
  store.getState().promptToConfigureForMatch()
  assert.equal(store.getState().requiresGameSetup, false)
})

test('desktop still requires an installation', async () => {
  const store = harness(false, { get: async () => settings() })
  await store.getState().load()
  assert.equal(store.getState().requiresGameSetup, true)
})

test('a stale settings read cannot erase a newly selected folder', async () => {
  let finishLoad
  const store = harness(true, {
    get: () =>
      new Promise((resolve) => {
        finishLoad = resolve
      }),
    chooseFolder: async () => '/games/cs16',
    save: async (folder) => settings(folder)
  })
  const loading = store.getState().load()
  await store.getState().choose()
  finishLoad(settings())
  await loading
  assert.equal(store.getState().folderPath, '/games/cs16')
  assert.equal(store.getState().savedPath, '/games/cs16')
  assert.equal(store.getState().status, 'idle')
})

test('focus refresh cannot start another read during a picker or save', async () => {
  let reads = 0
  const store = harness(true, {
    get: async () => {
      reads++
      return settings()
    }
  })
  for (const status of ['loading', 'choosing', 'saving']) {
    store.setState({ status })
    await store.getState().load()
  }
  assert.equal(reads, 0)
})
