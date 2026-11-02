import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { test } from 'node:test'
import {
  installLauncherDisplayScale,
  launcherZoomFactor
} from '../src/main/launcher-display-scale.ts'

test('OS scaling preserves the original logical layout and physical element sizes', () => {
  for (const scale of [1, 1.25, 1.5, 1.75, 2, 2.5, 3]) {
    const zoom = launcherZoomFactor(scale)
    for (const [width, height] of [
      [1920, 1080],
      [1366, 768],
      [2560, 1440]
    ]) {
      assert.ok(Math.abs(width / scale / zoom - width) < 0.001)
      assert.ok(Math.abs(height / scale / zoom - height) < 0.001)
      assert.ok(Math.abs(400 * zoom * scale - 400) < 0.001)
    }
  }
  for (const scale of [NaN, Infinity, 0, -1]) assert.equal(launcherZoomFactor(scale), 1)
})

test('follows monitor/DPI changes and reloads without leaking screen listeners', () => {
  const window = new EventEmitter()
  const displays = new EventEmitter()
  const contents = new EventEmitter()
  let scale = 1.5
  let zoom = 1
  let destroyed = false
  const calls = []
  const bounds = { x: 1920, y: 0, width: 1280, height: 720 }
  Object.defineProperty(window, 'webContents', {
    get() {
      if (destroyed) throw new Error('Object has been destroyed')
      return contents
    }
  })
  window.getBounds = () => bounds
  window.isDestroyed = contents.isDestroyed = () => destroyed
  contents.getZoomFactor = () => zoom
  contents.setZoomFactor = (value) => {
    zoom = value
    calls.push(value)
  }
  displays.getDisplayMatching = (actual) => {
    assert.equal(actual, bounds)
    return { scaleFactor: scale }
  }

  installLauncherDisplayScale(window, displays)
  assert.equal(zoom, 2 / 3)
  window.emit('resize')
  assert.equal(calls.length, 1)
  scale = 2
  displays.emit('display-metrics-changed')
  assert.equal(zoom, 0.5)
  scale = 1
  window.emit('move')
  assert.equal(zoom, 1)
  scale = 1.25
  displays.emit('display-removed')
  assert.equal(zoom, 0.8)
  zoom = 1
  contents.emit('did-finish-load')
  assert.equal(zoom, 0.8)
  destroyed = true
  displays.emit('display-metrics-changed')
  window.emit('closed')
  assert.equal(displays.listenerCount('display-metrics-changed'), 0)
  assert.equal(displays.listenerCount('display-removed'), 0)
  assert.equal(contents.listenerCount('did-finish-load'), 0)
  assert.equal(window.listenerCount('resize'), 0)
  assert.equal(window.listenerCount('move'), 0)
})
