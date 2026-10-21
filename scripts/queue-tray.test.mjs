/* eslint-disable @typescript-eslint/explicit-function-return-type */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import { readFile } from 'node:fs/promises'
import { matchNotificationCopy, queuedModeLabel } from '../src/shared/match-notification-copy.ts'

async function harness() {
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
      this.menu = menu
    }
    destroy() {
      calls.push('destroy')
    }
  }
  const context = vm.createContext({ console })
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
    locale: () => 'en'
  })
  return {
    controller,
    calls,
    trays,
    window: { hide: () => calls.push('hide') },
    setMode: (value) => {
      mode = value
    },
    setQueued: (value) => {
      queued = value
    }
  }
}

test('closing a queued window retains one tray and connection-independent reopen/quit actions', async () => {
  const h = await harness()
  assert.equal(h.controller.hideWhileQueued(h.window), true)
  assert.equal(h.controller.hideWhileQueued(h.window), true)
  assert.equal(h.trays.length, 1)
  assert.deepEqual(h.calls, ['hide', 'hide'])
  h.trays[0].events.get('right-click')()
  const menu = h.trays[0].menu
  assert.equal(menu[0].label, 'Open app')
  assert.equal(menu[1].label, 'Queueing · Competitive 5v5')
  assert.equal(menu[1].enabled, false)
  assert.equal(menu[1].click, undefined)
  menu[0].click()
  h.trays[0].events.get('click')()
  assert.deepEqual(h.calls.slice(-2), ['show', 'show'])
  menu[3].click()
  assert.equal(h.calls.at(-1), 'quit')
  h.controller.destroy()
  assert.equal(h.calls.at(-1), 'destroy')
})

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
