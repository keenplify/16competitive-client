import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { customGameInstallationHeaders } from '../src/web/custom-game-installation.ts'

test('custom rooms report a helper-selected 1.3 folder without uploading its path', async () => {
  assert.deepEqual(
    await customGameInstallationHeaders(async () => ({ cs13FolderPath: 'C:/private/game' })),
    { 'x-cs13-installed': 'true' }
  )
  assert.deepEqual(await customGameInstallationHeaders(async () => ({ cs13FolderPath: null })), {
    'x-cs13-installed': 'false'
  })
  assert.deepEqual(
    await customGameInstallationHeaders(async () => {
      throw new Error('offline')
    }),
    { 'x-cs13-installed': 'false' }
  )
})

test('browser create, join, update and polling send fresh installation readiness', async () => {
  let folder = 'C:/private/game'
  const calls = []
  const window = { location: { origin: 'https://fixture.test' } }
  const source = ts.transpileModule(
    readFileSync(new URL('../src/web/browser-api.ts', import.meta.url), 'utf8'),
    {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
    }
  ).outputText
  new Function('require', 'exports', 'window', 'localStorage', source)(
    (name) => {
      if (name === './custom-game-installation') return { customGameInstallationHeaders }
      if (name === './local-play')
        return { nativeHelperSettings: async () => ({ cs13FolderPath: folder }) }
      if (name === './browser-session')
        return {
          getWebSessionToken: () => 'fixture-account',
          requestJson: async (path, options) => {
            calls.push({ path, options })
            return { room: { id: 'room' } }
          }
        }
      if (name === './browser-matchmaking')
        return {
          browserMatchmakingApi: {
            getNodes: async () => [
              { id: 'node', available: true, publicApiUrl: window.location.origin }
            ],
            getPreferences: async () => ({ selectedNodeId: 'node' })
          },
          browserPartyRealtime: {}
        }
      return {}
    },
    {},
    window,
    { getItem: () => null }
  )
  const api = window.api.customGames
  await api.create({ mode: 'cs13_3v3', mapId: 'de_dust2' })
  await api.join('room')
  await api.update('room', { mode: 'cs13_3v3' })
  await api.mine()
  for (const call of calls) {
    assert.equal(call.options.init.headers.get('x-cs13-installed'), 'true')
    assert.equal(JSON.stringify(call).includes('C:/private/game'), false)
  }
  folder = null
  await api.mine()
  assert.equal(calls.at(-1).options.init.headers.get('x-cs13-installed'), 'false')
})
