import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { captureCrosshairConfig } from '../src/main/game/crosshair-config.ts'

test('restores the stock crosshair after a match', async () => {
  const directory = await mkdtemp(join(tmpdir(), '16c-crosshair-'))
  const path = join(directory, 'config.cfg')
  try {
    await writeFile(path, 'name "Player"\ncrosshair "1"\n')
    const restore = await captureCrosshairConfig(path)
    await writeFile(path, 'name "Player"\ncrosshair "0"\n')
    await restore()
    assert.match(await readFile(path, 'utf8'), /crosshair "1"/)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('removes the temporary override when no stock setting existed', async () => {
  const directory = await mkdtemp(join(tmpdir(), '16c-crosshair-'))
  const path = join(directory, 'config.cfg')
  try {
    const restore = await captureCrosshairConfig(path)
    await writeFile(path, 'crosshair "0"\n')
    await restore()
    assert.doesNotMatch(await readFile(path, 'utf8'), /crosshair/)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
