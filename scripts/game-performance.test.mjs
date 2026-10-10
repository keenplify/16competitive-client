import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  parseGameFps,
  beginGamePerformance,
  captureGamePerformance,
  gamePerformanceReport
} from '../src/main/game/game-performance.ts'

test('native FPS samples reject malformed, impossible, future and stale input', () => {
  const now = Date.now()
  const good = '#16c-fps-v1\n500 5000000 10000\n'
  assert.equal(parseGameFps(good, now, now).frames, 500)
  for (const bad of [
    good + 'extra',
    '#16c-fps-v1\n0 5000000 10000\n',
    '#16c-fps-v1\n500 5000000 1\n',
    '#16c-fps-v1\n500 5000000 1000001\n'
  ])
    assert.equal(parseGameFps(bad, now, now), null)
  assert.equal(parseGameFps(good, now + 1, now), null)
  assert.equal(parseGameFps(good, now - 16000, now), null)
})

test('reports retain the final FPS sample after cleanup but isolate account, match and age', async () => {
  const directory = await mkdtemp(join(tmpdir(), '16c-fps-'))
  try {
    beginGamePerformance(directory, 'match-one', 'player-one', true)
    assert.match(gamePerformanceReport('player-one'), /FPS: unavailable/)
    await writeFile(join(directory, 'game-fps.state'), '#16c-fps-v1\n500 5000000 10000\n')
    await captureGamePerformance(directory, true)
    await rm(directory, { recursive: true, force: true })
    const report = gamePerformanceReport('player-one', 'match-one')
    assert.match(report, /Average FPS: 100.0/)
    assert.match(report, /Slowest frame: 10.00 ms/)
    assert.match(report, /HUD mode: lightweight/)
    assert.match(report, /game session ended/)
    assert.match(gamePerformanceReport('another-player'), /FPS: unavailable/)
    assert.match(gamePerformanceReport('player-one', 'another-match'), /FPS: unavailable/)
    assert.match(
      gamePerformanceReport('player-one', 'match-one', Date.now() + 601000),
      /FPS: unavailable/
    )
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
