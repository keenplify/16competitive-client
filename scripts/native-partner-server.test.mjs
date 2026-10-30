/* eslint-disable @typescript-eslint/explicit-function-return-type */
import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import * as path from 'node:path'
import ts from 'typescript'

const id = '583704ab-6fc5-4b58-8fc2-d91cf1d7c051'
const source = ts.transpileModule(
  readFileSync(new URL('../src/main/native-partner-server.ts', import.meta.url), 'utf8'),
  {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }
).outputText
function harness(prefs = { cs13: '/games/cs13' }, valid = true) {
  const calls = []
  const dependencies = {
    electron: { app: { getPath: () => '/runtime-data' } },
    'node:path': path,
    'node:fs/promises': {
      readFile: async (file) => {
        calls.push(['read', file])
        return Buffer.from(JSON.stringify(prefs))
      }
    },
    './game/legacy-game-service': {
      LegacyGameService: class {
        constructor(deps) {
          this.deps = deps
        }
        async choose() {
          calls.push(['validate', await this.deps.chooseFolder(), this.deps.settingsPath])
          return valid ? { ok: true, value: { installation: {} } } : { ok: false }
        }
      }
    },
    './partner-servers': {
      connectPartnerServer: async (...args) => calls.push(['connect', ...args])
    }
  }
  const exports = {}
  new Function('require', 'exports', source)((name) => dependencies[name], exports)
  return { launch: (request) => exports.launchNativePartnerServer('/helper', request), calls }
}
test('native community launch validates the saved CS13 install and delegates only IDs to authenticated launch', async () => {
  const h = harness()
  await h.launch({ serverId: id, groupId: id, communityId: id })
  assert.equal(h.calls[1][0], 'validate')
  assert.deepEqual(h.calls.at(-1), ['connect', id, id, id])
})
test('native community launch rejects browser paths, endpoints, commands, and invalid IDs before filesystem access', async () => {
  for (const request of [
    null,
    [],
    {},
    { serverId: 'invalid' },
    { serverId: id, groupId: 'bad' },
    { serverId: id, communityId: 'bad' },
    { serverId: id, host: '127.0.0.1' },
    { serverId: id, executable: '/bin/sh' },
    { serverId: id, args: ['+exec', 'bad'] }
  ]) {
    const h = harness()
    await assert.rejects(h.launch(request), /Invalid partner launch/)
    assert.equal(h.calls.length, 0)
  }
})
test('missing or invalid CS13 installation cannot launch a community server', async () => {
  for (const h of [
    harness({}),
    harness({ cs13: 'relative' }),
    harness({ cs13: '/games/cs13' }, false)
  ]) {
    await assert.rejects(h.launch({ serverId: id }), /INSTALLATION_REQUIRED/)
    assert.equal(
      h.calls.some((call) => call[0] === 'connect'),
      false
    )
  }
})

const browserSource = readFileSync(new URL('../src/web/local-play.ts', import.meta.url), 'utf8')
const browserCode = ts.transpileModule(
  browserSource.slice(
    browserSource.indexOf('export async function launchPartnerWithNativeHelper('),
    browserSource.indexOf('export async function launchWithLocalLauncher(')
  ),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }
).outputText
function browserHarness({ ready = true, folder = '/games/cs13', switched = false } = {}) {
  const requests = []
  let reads = 0
  const exports = {}
  new Function(
    'exports',
    'preferredLocalLauncher',
    'getWebSessionToken',
    'nativeHelperSettings',
    'currentApiOrigin',
    'localRequest',
    browserCode
  )(
    exports,
    () => (ready ? 'rust' : null),
    () => (switched && reads++ > 0 ? 'different-account' : 'fixture-session'),
    async () => ({ cs13FolderPath: folder }),
    () => 'https://example.test',
    async (request) => {
      requests.push(request)
      return { ok: true }
    }
  )
  return { launch: exports.launchPartnerWithNativeHelper, requests }
}
test('browser community launch sends IDs through the authenticated helper bridge, never executable paths', async () => {
  const h = browserHarness()
  await h.launch(id, undefined, id)
  assert.deepEqual(h.requests, [
    {
      action: 'partnerLaunch',
      apiOrigin: 'https://example.test',
      token: 'fixture-session',
      serverId: id,
      groupId: undefined,
      communityId: id
    }
  ])
})
test('browser community launch requires helper and selected installation, and rejects an account switch', async () => {
  for (const [options, error] of [
    [{ ready: false }, /NATIVE_HELPER_REQUIRED/],
    [{ folder: null }, /INSTALLATION_REQUIRED/],
    [{ switched: true }, /SESSION_CHANGED/]
  ]) {
    const h = browserHarness(options)
    await assert.rejects(h.launch(id), error)
    assert.equal(h.requests.length, 0)
  }
})
