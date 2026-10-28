/* eslint-disable @typescript-eslint/explicit-function-return-type */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { create } from 'zustand'
import { requestNativeHelperSettings } from '../src/renderer/src/features/settings/native-helper-request.ts'

function harness() {
  let chooseCount = 0
  let reads = 0
  const exports = {}
  const settings = { cs16FolderPath: '/games/valid' }
  const source = ts.transpileModule(
    readFileSync(
      new URL(
        '../src/renderer/src/features/settings/native-helper-settings.store.ts',
        import.meta.url
      ),
      'utf8'
    ),
    { compilerOptions: { module: ts.ModuleKind.CommonJS } }
  ).outputText
  new Function('require', 'exports', 'window', source)(
    (name) => {
      if (name === 'zustand') return { create }
      if (name.endsWith('native-helper-request')) return { requestNativeHelperSettings }
      if (name.endsWith('game-settings.store'))
        return { useGameSettingsStore: { getState: () => ({ load: async () => undefined }) } }
      return {
        useWebHelperPromptStore: {
          getState: () => ({
            refreshReadiness: async () => undefined,
            checkNative: async () => 'rust'
          })
        }
      }
    },
    exports,
    {
      api: {
        matchmaking: {
          nativeHelperSettings: async (request) => {
            if (request.action === 'get') {
              reads++
              return settings
            }
            if (++chooseCount === 1)
              throw Object.assign(new Error('Invalid installation'), {
                code: 'invalidInstallation'
              })
            return { cs16FolderPath: '/games/selected' }
          }
        }
      }
    }
  )
  return { store: exports.useNativeHelperSettingsStore, reads: () => reads }
}

test('invalid folders retain the last valid path and allow the next picker to succeed', async () => {
  const { store } = harness()
  await store.getState().load('account')
  await store.getState().choose('cs16')
  assert.equal(store.getState().status, 'error')
  assert.equal(store.getState().errorCode, 'invalidInstallation')
  assert.equal(store.getState().settings.cs16FolderPath, '/games/valid')
  await store.getState().choose('cs16')
  assert.equal(store.getState().status, 'idle')
  assert.equal(store.getState().errorCode, null)
  assert.equal(store.getState().settings.cs16FolderPath, '/games/selected')
})

test('focus refreshes are ignored while a folder picker is open', async () => {
  const { store, reads } = harness()
  await store.getState().load('account')
  store.setState({ status: 'choosing-cs16' })
  await store.getState().load('account')
  assert.equal(reads(), 1)
})
