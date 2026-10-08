/* eslint-disable @typescript-eslint/explicit-function-return-type */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { EventEmitter } from 'node:events'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import ts from 'typescript'

const source = ts.transpileModule(
  await readFile(new URL('../src/main/updater.ts', import.meta.url), 'utf8'),
  {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 }
  }
).outputText

async function harness() {
  let clock = 1_000_000
  let checks = 0
  const actions = []
  const timers = new Set()
  const updater = new EventEmitter()
  updater.checkForUpdates = async () => {
    checks++
    updater.emit('checking-for-update')
    const action = actions.shift() ?? 'success'
    if (action === 'pending') return new Promise(() => {})
    if (action === 'available') {
      updater.emit('update-available', { version: '2026.1005.1' })
      return
    }
    if (action === 'fail') {
      const error = new Error('network unavailable')
      updater.emit('error', error)
      throw error
    }
    updater.emit('update-not-available')
  }
  const context = vm.createContext({
    process: { platform: 'linux', env: { APPIMAGE: '/apps/client.AppImage' } },
    console: {
      warn() {
        return undefined
      }
    },
    Date: class extends Date {
      static now() {
        return clock
      }
    },
    setTimeout(callback) {
      timers.add(callback)
      return callback
    },
    clearTimeout(callback) {
      timers.delete(callback)
    }
  })
  const dependencies = {
    electron: {
      app: {
        isPackaged: true,
        once() {
          return undefined
        }
      },
      BrowserWindow: { getAllWindows: () => [] }
    },
    'electron-updater': { autoUpdater: updater },
    '../shared/updater': { UPDATE_CHANNELS: { status: 'status' } }
  }
  const module = new vm.SourceTextModule(source, { context })
  await module.link(async (name) => {
    const exports = dependencies[name]
    if (!exports) throw new Error(`Unexpected dependency ${name}`)
    return new vm.SyntheticModule(
      Object.keys(exports),
      function () {
        for (const [key, value] of Object.entries(exports)) this.setExport(key, value)
      },
      { context }
    )
  })
  await module.evaluate()
  return {
    ensure: module.namespace.ensureLatestClientForMatchmaking,
    markPostGame: module.namespace.markPostGameUpdateCheckPending,
    checkAtLobby: module.namespace.checkForPostGameUpdateAtLobby,
    actions,
    get checks() {
      return checks
    },
    advance(ms) {
      clock += ms
    },
    timeout() {
      for (const callback of [...timers]) callback()
    }
  }
}

test('post-game update checks wait until the lobby and run once', async () => {
  const client = await harness()
  client.markPostGame()
  assert.equal(client.checks, 0)
  client.checkAtLobby()
  assert.equal(client.checks, 1)
  client.checkAtLobby()
  assert.equal(client.checks, 1)
})

test('a first network failure retries before blocking matchmaking', async () => {
  const client = await harness()
  client.actions.push('fail', 'success')
  await client.ensure()
  assert.equal(client.checks, 2)
  await client.ensure()
  assert.equal(client.checks, 2)
})

test('recent successful checks allow temporary outages but expire after 24 hours', async () => {
  const client = await harness()
  await client.ensure()
  client.advance(6 * 60_000)
  client.actions.push('fail', 'fail')
  await client.ensure()
  client.advance(24 * 60 * 60_000)
  client.actions.push('fail', 'fail')
  await assert.rejects(client.ensure(), /Could not verify/)
})

test('known required updates always override cached success and later failures', async () => {
  const client = await harness()
  await client.ensure()
  client.advance(6 * 60_000)
  client.actions.push('available')
  await assert.rejects(client.ensure(), /update v2026.1005.1 is required/)
  await assert.rejects(client.ensure(), /update v2026.1005.1 is required/)
  assert.equal(client.checks, 2)
})

test('an unverified first launch cannot bypass a failed or hanging update check', async () => {
  const client = await harness()
  client.actions.push('fail', 'fail')
  await assert.rejects(client.ensure(), /Could not verify/)
  client.actions.push('pending')
  const pending = client.ensure()
  const result = assert.rejects(pending, /Could not verify/)
  client.timeout()
  await result
})
