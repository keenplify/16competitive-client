import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  prepareMatchStartupBridge,
  removeStaleMatchStartupBridge
} from '../src/main/game/match-startup-bridge.ts'

const classic = { distribution: 'standalone', nextClient: false }

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
async function withInstallation(run) {
  const root = await mkdtemp(join(tmpdir(), '16c-startup-'))
  const directory = join(root, 'cstrike')
  await mkdir(directory)
  try {
    await run(root, directory, join(directory, 'valve.rc'))
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

test('missing startup bridge processes launch args and is removed on cleanup', async () => {
  await withInstallation(async (_root, directory, path) => {
    const bridge = await prepareMatchStartupBridge(directory, classic)
    assert.equal(bridge.installed, true)
    assert.equal(
      await readFile(path, 'utf8'),
      '// 16competitive temporary startup bridge v1\nstuffcmds\n'
    )
    assert.deepEqual(await readdir(directory), ['valve.rc'])
    await bridge.restore()
    await assert.rejects(stat(path), { code: 'ENOENT' })
    await bridge.restore()
  })
})

test('preserves existing startup scripts and packed game content', async () => {
  for (const location of [
    'cstrike/valve.rc',
    'valve/valve.rc',
    'cstrike/pak0.pak',
    'valve/pak0.pak'
  ]) {
    await withInstallation(async (root, directory, path) => {
      const existingPath = join(root, location)
      await mkdir(join(root, location.split('/')[0]), { recursive: true })
      await writeFile(existingPath, 'player-owned content')
      const bridge = await prepareMatchStartupBridge(directory, classic)
      assert.equal(bridge.installed, false)
      await bridge.restore()
      assert.equal(await readFile(existingPath, 'utf8'), 'player-owned content')
      if (location !== 'cstrike/valve.rc') await assert.rejects(stat(path), { code: 'ENOENT' })
    })
  }
})

test('leaves Steam and NextClient startup alone when disabled', async () => {
  for (const installation of [
    { distribution: 'steam', nextClient: false },
    { distribution: 'standalone', nextClient: true },
    { distribution: 'steam', nextClient: true }
  ]) {
    await withInstallation(async (_root, directory, path) => {
      assert.equal((await prepareMatchStartupBridge(directory, installation)).installed, false)
      await assert.rejects(stat(path), { code: 'ENOENT' })
    })
  }
})

test('cleanup and crash recovery preserve player replacement files', async () => {
  await withInstallation(async (_root, directory, path) => {
    const bridge = await prepareMatchStartupBridge(directory, classic)
    await writeFile(path, 'player replacement')
    await bridge.restore()
    assert.equal(await removeStaleMatchStartupBridge(directory), false)
    assert.equal(await readFile(path, 'utf8'), 'player replacement')
  })
})

test('a crash-left bridge is recovered and its replacement is cleaned', async () => {
  await withInstallation(async (_root, directory, path) => {
    await prepareMatchStartupBridge(directory, classic)
    assert.equal(await removeStaleMatchStartupBridge(directory), true)
    const replacement = await prepareMatchStartupBridge(directory, classic)
    assert.equal(replacement.installed, true)
    await replacement.restore()
    await assert.rejects(stat(path), { code: 'ENOENT' })
  })
})
