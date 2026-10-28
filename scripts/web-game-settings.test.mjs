/* eslint-disable @typescript-eslint/explicit-function-return-type */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

function harness() {
  let token = 'account-a'
  let available = true
  let folder = '/games/cs16'
  const window = {}
  const source = ts.transpileModule(
    readFileSync(new URL('../src/web/browser-api.ts', import.meta.url), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }
  ).outputText
  new Function('require', 'exports', 'window', 'localStorage', source)(
    (name) => {
      if (name === './local-play')
        return {
          nativeHelperSettings: async () => {
            if (!available) throw new Error('Helper stopped')
            return { cs16FolderPath: folder, platform: 'linux', voicePttKeys: ['K', 'V'] }
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
