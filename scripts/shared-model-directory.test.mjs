import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  realpath,
  rm,
  symlink,
  writeFile
} from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  ensureSharedModelDirectory,
  managedAssetDestination
} from '../src/main/game/shared-model-directory.ts'

test('both game versions share models, preserve migration originals and reuse the same target', async () => {
  const root = await mkdtemp(join(tmpdir(), '16c-shared-models-'))
  try {
    const a = join(root, 'cstrike'),
      b = join(root, 'cstrk13'),
      shared = join(root, 'shared')
    await mkdir(join(a, 'models/16competitive/knife/hash'), { recursive: true })
    await mkdir(b)
    await writeFile(join(a, 'models/16competitive/knife/hash/v.mdl'), 'original-model')
    await ensureSharedModelDirectory(a, shared)
    await ensureSharedModelDirectory(b, shared)
    await ensureSharedModelDirectory(a, shared)
    assert.equal(await realpath(join(a, 'models/16competitive')), shared)
    assert.equal(await realpath(join(b, 'models/16competitive')), shared)
    const destination = await managedAssetDestination(shared, 'knife/hash/p.mdl')
    await writeFile(destination, 'held-model')
    assert.equal(
      await readFile(join(b, 'models/16competitive/knife/hash/p.mdl'), 'utf8'),
      'held-model'
    )
    assert.equal(
      await readFile(join(a, 'models/16competitive/knife/hash/v.mdl'), 'utf8'),
      'original-model'
    )
    assert.equal(
      (await readdir(join(a, 'models'))).filter((name) => name.includes('.before-shared-')).length,
      1
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('conflicts, unknown entries and unexpected links preserve the original directories', async () => {
  const root = await mkdtemp(join(tmpdir(), '16c-model-conflicts-'))
  try {
    const game = join(root, 'game'),
      shared = join(root, 'shared')
    await mkdir(join(game, 'models/16competitive'), { recursive: true })
    await mkdir(shared)
    await writeFile(join(game, 'models/16competitive/v.mdl'), 'player-change')
    await writeFile(join(shared, 'v.mdl'), 'different')
    await assert.rejects(ensureSharedModelDirectory(game, shared), /Conflicting/)
    assert.equal(await readFile(join(game, 'models/16competitive/v.mdl'), 'utf8'), 'player-change')
    await symlink(root, join(shared, 'escape'), 'dir')
    await assert.rejects(managedAssetDestination(shared, 'escape/file.mdl'), /Unexpected link/)
    await symlink(join(shared, 'v.mdl'), join(shared, 'linked.mdl'))
    await assert.rejects(managedAssetDestination(shared, 'linked.mdl'), /Unexpected managed/)
    for (const path of ['../outside.mdl', '/absolute.mdl', 'safe/../../outside.mdl', 'a\\b.mdl'])
      await assert.rejects(managedAssetDestination(shared, path), /Unsafe|escapes/)
    const other = join(root, 'other')
    await mkdir(join(other, 'models'), { recursive: true })
    await symlink(root, join(other, 'models/16competitive'), 'dir')
    await assert.rejects(ensureSharedModelDirectory(other, shared), /unexpected target/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
