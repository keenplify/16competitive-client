/* eslint-disable @typescript-eslint/explicit-function-return-type */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { EventEmitter } from 'node:events'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import ts from 'typescript'
import { formatUpdateTransfer } from '../src/shared/updater.ts'

const source = ts.transpileModule(
  await readFile(new URL('../src/main/anticheat/update-banner.ts', import.meta.url), 'utf8'),
  {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 }
  }
).outputText
const tick = () => new Promise((resolve) => setImmediate(resolve))

async function harness({ initial = true, launcher = false } = {}) {
  const app = new EventEmitter()
  app.getPreferredSystemLanguages = () => ['en-US']
  app.quit = () => {
    app.quits = (app.quits ?? 0) + 1
  }
  const windows = []
  const makeWindow = () => {
    const window = {
      destroyed: false,
      visible: true,
      scripts: [],
      interactive: false,
      isDestroyed() {
        return this.destroyed
      },
      isVisible() {
        return this.visible
      },
      destroy() {
        this.destroyed = true
      },
      hide() {
        this.visible = false
      },
      show() {
        this.visible = true
      },
      showInactive() {
        this.visible = true
      },
      setIgnoreMouseEvents(value) {
        this.interactive = !value
      },
      setFocusable(value) {
        this.focusable = value
      }
    }
    window.webContents = new EventEmitter()
    window.webContents.executeJavaScript = async (code) => {
      window.scripts.push(code)
      return null
    }
    windows.push(window)
    return window
  }
  const splash = initial ? makeWindow() : null
  const main = launcher ? makeWindow() : undefined
  const listeners = new Set()
  let status = { state: 'idle' }
  let checks = 0
  const emit = (next) => {
    status = next
    for (const listener of [...listeners]) listener(next)
  }
  const timers = new Set()
  const copy = {
    checking: 'Checking',
    restarting: 'Restarting',
    downloading: 'Downloading',
    failed: 'Failed',
    anticheat: 'Anti-cheat',
    retry: 'Retry',
    exit: 'Exit'
  }
  const dependencies = {
    electron: {
      app,
      dialog: { showMessageBox: async () => ({ response: 0 }) },
      shell: { openExternal: async () => {} }
    },
    '../../shared/language-detection': { detectLanguage: () => 'en' },
    '../../shared/guard-update-translations': { guardUpdateTranslations: { en: copy } },
    '../../shared/update-recovery-translations': {
      updateRecoveryTranslations: {
        en: {
          title: 'Update',
          help: 'Update help',
          details: 'Recovery steps',
          download: 'Downloads',
          installFailed: 'Install failed'
        }
      }
    },
    '../../shared/updater': { formatUpdateTransfer },
    '../updater': {
      checkForAppUpdates: () => {
        checks++
        emit({ state: 'checking' })
      },
      getAppUpdateStatus: () => status,
      onAppUpdateStatus: (listener) => {
        listeners.add(listener)
        return () => listeners.delete(listener)
      }
    },
    './startup-splash': { showAntiCheatStartupSplash: async () => makeWindow() }
  }
  const context = vm.createContext({
    console,
    setTimeout: (callback) => {
      timers.add(callback)
      return callback
    },
    clearTimeout: (callback) => timers.delete(callback)
  })
  const module = new vm.SourceTextModule(source, { context })
  await module.link(async (name) => {
    const exports = dependencies[name]
    return new vm.SyntheticModule(
      Object.keys(exports),
      function () {
        for (const [key, value] of Object.entries(exports)) this.setExport(key, value)
      },
      { context }
    )
  })
  await module.evaluate()
  const banner = new module.namespace.AntiCheatUpdateBanner(splash, () => main)
  return {
    banner,
    splash,
    main,
    windows,
    emit,
    app,
    timers,
    get checks() {
      return checks
    }
  }
}

test('startup stays in the banner for downloads and required failures, and retry stays gated', async () => {
  const client = await harness()
  let ready = false
  const startup = client.banner.checkBeforeStartup().then(() => {
    ready = true
  })
  client.emit({
    state: 'downloading',
    version: '2',
    percent: 45,
    downloadedBytes: 45_000_000,
    totalBytes: 100_000_000,
    bytesPerSecond: 2_500_000
  })
  await tick()
  assert.equal(ready, false)
  assert.match(client.splash.scripts.at(-1), /45%/)
  assert.match(client.splash.scripts.at(-1), /45\.0 \/ 100\.0 MB · 2\.5 MB\/s/)
  client.emit({ state: 'error', message: 'offline', requiredVersion: '2' })
  await tick()
  assert.equal(client.splash.interactive, true)
  assert.equal(ready, false)
  client.splash.webContents.emit(
    'will-navigate',
    {
      preventDefault() {
        return undefined
      }
    },
    'papamo-guard://retry'
  )
  assert.equal(client.checks, 2)
  client.emit({ state: 'idle' })
  await startup
  assert.equal(client.splash.destroyed, false) // Only close after the launcher exists.
  client.banner.finishStartup()
  assert.equal(client.splash.destroyed, true)
})

test('unreachable checks allow startup, while a known update cannot timeout into the launcher', async () => {
  const client = await harness()
  const startup = client.banner.checkBeforeStartup()
  for (const timer of [...client.timers]) timer()
  await startup
  const required = await harness()
  let ready = false
  void required.banner.checkBeforeStartup().then(() => {
    ready = true
  })
  required.emit({ state: 'downloaded', version: '2' })
  for (const timer of [...required.timers]) timer()
  await tick()
  assert.equal(ready, false)
  assert.match(required.splash.scripts.at(-1), /Restarting/)
})

test('post-startup updates hide the launcher and restore it when no update is needed', async () => {
  const client = await harness({ launcher: true })
  client.banner.finishStartup()
  client.emit({ state: 'downloading', version: '2', percent: 60 })
  await tick()
  assert.equal(client.main.visible, false)
  assert.equal(client.banner.isPresenting(), true)
  client.emit({ state: 'idle' })
  await tick()
  assert.equal(client.main.visible, true)
  assert.equal(client.banner.isPresenting(), false)
})

test('non-required failures do not block startup and unknown navigation cannot trigger actions', async () => {
  const client = await harness()
  const startup = client.banner.checkBeforeStartup()
  client.splash.webContents.emit(
    'will-navigate',
    {
      preventDefault() {
        return undefined
      }
    },
    'papamo-guard://exit'
  )
  assert.equal(client.app.quits, undefined)
  client.emit({ state: 'error', message: 'offline' })
  await startup
})
