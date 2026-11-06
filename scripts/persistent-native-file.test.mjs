import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  nativeFileHash,
  replacePersistentNativeFile
} from '../src/main/game/persistent-native-file.ts'

test('persistent DLL updates reuse approved bytes and preserve unknown player changes', async () => {
  const root = await mkdtemp(join(tmpdir(), '16c-persistent-native-'))
  const path = join(root, 'client.dll')
  const original = Buffer.from('approved old module')
  const replacement = Buffer.from('approved new module')
  try {
    await writeFile(path, original)
    await replacePersistentNativeFile(path, nativeFileHash(original), replacement)
    assert.deepEqual(await readFile(path), replacement)
    // Retry after a DLL update that preceded journal commit.
    await replacePersistentNativeFile(path, nativeFileHash(original), replacement)
    await writeFile(path, 'player changed this')
    await assert.rejects(
      replacePersistentNativeFile(path, nativeFileHash(original), replacement),
      /changed outside/
    )
    assert.equal(await readFile(path, 'utf8'), 'player changed this')
    if (process.platform !== 'win32') {
      const link = join(root, 'linked.dll')
      await symlink(path, link)
      await assert.rejects(
        replacePersistentNativeFile(link, nativeFileHash(original), replacement),
        /Invalid managed/
      )
    }
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
