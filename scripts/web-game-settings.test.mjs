import { createEarlyAssetSync } from '../src/shared/early-asset-sync.ts'
/* eslint-disable @typescript-eslint/explicit-function-return-type */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

function harness() {
  let token = 'account-a'
  const syncs = []
  let available = true
  let folder = '/games/cs16'
  const window = {}
  const source = ts.transpileModule(
    readFileSync(new URL('../src/web/browser-api.ts', import.meta.url), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }
  ).outputText
  new Function('require', 'exports', 'window', 'localStorage', source)(
    (name) => {
      if (name === './diagnostic-reports') return { createWebDiagnosticReports: () => ({}) }
      if (name === '../shared/early-asset-sync') return { createEarlyAssetSync }
      if (name === './local-play')
        return {
          syncNativeAssets: async (mode, game) => { syncs.push({ mode, game }) },
          nativeHelperSettings: async () => {
            if (!available) throw new Error('Helper stopped')
            return { cs16FolderPath: folder, cs13FolderPath: '/games/cs13', platform: 'linux', voicePttKeys: ['K', 'V'] }
          }
        }
      if (name === './browser-matchmaking')
        return { browserPartyRealtime: {}, browserMatchmakingApi: {} }
      if (name === './browser-session')
        return {
          getWebSessionToken: () => token,
          requestJson: async () => ({ profile: null })
        }
      return {}
    },
    {},
    window,
    { getItem: () => null }
  )
  return {
    api: window.api.gameSettings,
    helperSettings: window.api.matchmaking.nativeHelperSettings,
    syncs,
    stop: () => {
      available = false
    },
    clearFolder: () => {
      folder = null
    },
    switchAccount: () => {
      token = 'account-b'
    }
  }
}

test('temporary helper failure preserves the selected folder for the current account', async () => {
  const h = harness()
  assert.equal((await h.api.get()).cs16FolderPath, '/games/cs16')
  h.stop()
  assert.equal((await h.api.get()).cs16FolderPath, '/games/cs16')
})

test('another account cannot inherit cached installation state', async () => {
  const h = harness()
  await h.api.get()
  h.stop()
  h.switchAccount()
  assert.equal((await h.api.get()).cs16FolderPath, null)
})

test('an available helper remains authoritative when its installation is cleared', async () => {
  const h = harness()
  await h.api.get()
  h.clearFolder()
  assert.equal((await h.api.get()).cs16FolderPath, null)
})

test('reopening the web client with a configured installation does not start a catalog sync', async () => {
  for (const h of [harness(), harness()]) {
    await h.api.get()
    await h.helperSettings({ action: 'get' })
    assert.deepEqual(h.syncs, [])
  }
})

test('folder setup prepares the selected game once, while manual repair stays available', async () => {
  const h = harness()
  await h.api.chooseFolder()
  await h.api.save('/games/cs16')
  await h.helperSettings({ action: 'choose', game: 'cs13' })
  await new Promise((resolve) => setImmediate(resolve))
  await h.api.syncAssets('repair')
  assert.deepEqual(h.syncs, [
    { mode: 'download', game: 'cs16' },
    { mode: 'download', game: 'cs13' },
    { mode: 'repair', game: undefined }
  ])
})
