/* eslint-disable @typescript-eslint/explicit-function-return-type */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import { readFile } from 'node:fs/promises'
import { matchNotificationCopy, queuedModeLabel } from '../src/shared/match-notification-copy.ts'

async function harness(platform = 'win32', locale = 'en') {
  const trays = [],
    calls = []
  let queued = true
  let mode = '5v5'
  class FakeTray {
    events = new Map()
    constructor() {
      trays.push(this)
    }
    setToolTip(value) {
      this.tooltip = value
    }
    on(type, callback) {
      this.events.set(type, callback)
    }
    popUpContextMenu(menu) {
      assert.notEqual(platform, 'linux', 'Linux hosts must use the registered native menu')
      this.menu = menu
    }
    setContextMenu(menu) {
      this.contextMenu = menu
    }
    destroy() {
      calls.push('destroy')
    }
  }
  const context = vm.createContext({ console, process: { platform } })
  const module = new vm.SourceTextModule(
    ts.transpileModule(
      await readFile(new URL('../src/main/queue-tray.ts', import.meta.url), 'utf8'),
      {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 }
      }
    ).outputText,
    { context }
  )
  await module.link((name) => {
    const exports =
      name === 'electron'
        ? { Tray: FakeTray, Menu: { buildFromTemplate: (items) => items } }
        : { matchNotificationCopy, queuedModeLabel }
    return new vm.SyntheticModule(
      Object.keys(exports),
      function () {
        for (const [key, value] of Object.entries(exports)) this.setExport(key, value)
      },
      { context }
    )
  })
  await module.evaluate()
  const controller = new module.namespace.QueueTrayController({
    icon: 'icon.png',
    getQueuedMode: () => (queued ? mode : null),
    show: () => calls.push('show'),
    quit: () => calls.push('quit'),
    locale: () => locale
  })
  return {
    controller,
    calls,
    trays,
    window: {
      hide: () => {
        if (platform === 'linux') {
          assert.ok(trays.at(-1).contextMenu, 'register the native menu before hiding the window')
        }
        calls.push('hide')
      }
    },
    setMode: (value) => {
      mode = value
    },
    setQueued: (value) => {
      queued = value
    }
  }
}

test('GNOME/KDE native menus provide localized Open/Quit without a right-click event', async () => {
  for (const locale of ['en', 'ru', 'tl', 'th', 'id', 'hi', 'pt', 'ja']) {
    const h = await harness('linux', locale)
    h.controller.hideWhileQueued(h.window)
    const tray = h.trays[0]
    const menu = tray.contextMenu
    const copy = matchNotificationCopy(locale)
    assert.equal(tray.events.has('right-click'), false)
    assert.equal(menu[0].label, copy.open)
    assert.equal(menu[2].label, copy.quit)
    h.setQueued(false)
    menu[0].click()
    menu[2].click()
    assert.deepEqual(h.calls, ['hide', 'show', 'quit'])
    h.controller.destroy()
    assert.equal(h.calls.at(-1), 'destroy')
  }
})

test('Windows right-click opens the menu and click/double-click reopen the app', async () => {
  const h = await harness('win32')
  assert.equal(h.controller.hideWhileQueued(h.window), true)
  assert.equal(h.controller.hideWhileQueued(h.window), true)
  assert.equal(h.trays.length, 1)
  assert.deepEqual(h.calls, ['hide', 'hide'])
  assert.equal(h.trays[0].contextMenu, undefined)
  h.trays[0].events.get('right-click')()
  const menu = h.trays[0].menu
  assert.equal(menu[0].label, 'Open app')
  assert.equal(menu[1].label, 'Queueing · Competitive 5v5')
  assert.equal(menu[1].enabled, false)
  assert.equal(menu[1].click, undefined)
  menu[0].click()
  h.trays[0].events.get('click')()
  h.trays[0].events.get('double-click')()
  assert.deepEqual(h.calls.slice(-3), ['show', 'show', 'show'])
  menu[3].click()
  assert.equal(h.calls.at(-1), 'quit')
  h.controller.destroy()
  assert.equal(h.calls.at(-1), 'destroy')
})

for (const platform of ['linux', 'win32']) {
  test(`${platform}: reuse the tray, clean up, and recreate working Quit actions`, async () => {
    const h = await harness(platform)
    assert.equal(h.controller.hideWhileQueued(null), false)
    h.setQueued(false)
    assert.equal(h.controller.hideWhileQueued(h.window), false)
    assert.equal(h.trays.length, 0)
    h.setQueued(true)
    h.controller.hideWhileQueued(h.window)
    h.controller.hideWhileQueued(h.window)
    assert.equal(h.trays.length, 1)
    h.controller.destroy()
    h.controller.destroy()
    assert.equal(h.calls.filter((call) => call === 'destroy').length, 1)
    h.controller.hideWhileQueued(h.window)
    assert.equal(h.trays.length, 2)
    const tray = h.trays[1]
    if (platform === 'win32') tray.events.get('right-click')()
    const menu = platform === 'linux' ? tray.contextMenu : tray.menu
    menu.find((item) => item.label === matchNotificationCopy('en').quit).click()
    assert.equal(h.calls.at(-1), 'quit')
  })
}

test('idle close follows normal exit and the tray never reports a stale queue', async () => {
  const h = await harness()
  h.setQueued(false)
  assert.equal(h.controller.hideWhileQueued(h.window), false)
  assert.equal(h.trays.length, 0)
  h.setQueued(true)
  h.controller.hideWhileQueued(h.window)
  h.setQueued(false)
  h.trays[0].events.get('right-click')()
  assert.equal(
    h.trays[0].menu.some((item) => item.label?.startsWith('Queueing')),
    false
  )
})

test('tray reads the current mode each time its menu opens', async () => {
  const h = await harness()
  h.controller.hideWhileQueued(h.window)
  for (const [mode, label] of [
    ['3v3', '3v3'],
    ['legacy', 'Legacy 5v5'],
    ['legacy_3v3', 'Legacy 3v3'],
    ['cs13_3v3', 'CS 1.3 · 3v3'],
    ['unrated', 'Unrated 5v5'],
    ['ffa', 'FFA'],
    ['arena', 'Arena']
  ]) {
    h.setMode(mode)
    h.trays[0].events.get('right-click')()
    assert.equal(h.trays[0].menu[1].label, `Queueing · ${label}`)
    assert.equal(h.trays[0].menu[1].enabled, false)
  }
})
