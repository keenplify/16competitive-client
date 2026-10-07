import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, basename } from 'node:path'
import { disableConflictingGtProtector } from '../src/main/game/gtprotector-compatibility.ts'

const eligible = { platform: 'win32', distribution: 'standalone', nextClient: false }

test('backs up only GTProtector modules, preserves bytes and handles reinstallation', async () => {
  const root = await mkdtemp(join(tmpdir(), '16c-gt-'))
  try {
    await writeFile(join(root, 'GTlib.asi'), 'original module')
    await writeFile(join(root, 'GTProtector.asi'), 'other module')
    await writeFile(join(root, 'unrelated.asi'), 'keep')
    const backups = await disableConflictingGtProtector(root, eligible)
    assert.equal(backups.length, 2)
    for (const backup of backups) {
      const expected =
        basename(backup) === 'GTlib.asi.disabled' ? 'original module' : 'other module'
      assert.equal(await readFile(backup, 'utf8'), expected)
    }
    assert.deepEqual((await readdir(root)).sort(), ['16competitive', 'unrelated.asi'])
    assert.equal(await readFile(join(root, 'unrelated.asi'), 'utf8'), 'keep')
    assert.deepEqual(await disableConflictingGtProtector(root, eligible), [])
    await writeFile(join(root, 'GTlib.asi'), 'updated module')
    const updated = await disableConflictingGtProtector(root, eligible)
    assert.equal(await readFile(updated[0], 'utf8'), 'updated module')
    assert.ok(!backups.includes(updated[0]))
    assert.equal(
      await readFile(
        backups.find((p) => basename(p) === 'GTlib.asi.disabled'),
        'utf8'
      ),
      'original module'
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('Steam, NextClient and non-Windows launches leave modules alone', async () => {
  const root = await mkdtemp(join(tmpdir(), '16c-gt-skip-'))
  try {
    await writeFile(join(root, 'GTLib.asi'), 'keep')
    for (const options of [
      { ...eligible, platform: 'linux' },
      { ...eligible, distribution: 'steam' },
      { ...eligible, nextClient: true }
    ])
      assert.deepEqual(await disableConflictingGtProtector(root, options), [])
    assert.deepEqual(await readdir(root), ['GTLib.asi'])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test(
  'refuses linked modules and backup directories',
  { skip: process.platform === 'win32' },
  async () => {
    const root = await mkdtemp(join(tmpdir(), '16c-gt-links-'))
    const outside = await mkdtemp(join(tmpdir(), '16c-gt-outside-'))
    try {
      await writeFile(join(outside, 'module'), 'keep')
      await symlink(join(outside, 'module'), join(root, 'GTLib.asi'))
      await assert.rejects(disableConflictingGtProtector(root, eligible), /regular file/)
      await rm(join(root, 'GTLib.asi'))
      await writeFile(join(root, 'GTLib.asi'), 'keep')
      await symlink(outside, join(root, '16competitive'))
      await assert.rejects(disableConflictingGtProtector(root, eligible), /regular directory/)
      assert.equal(await readFile(join(root, 'GTLib.asi'), 'utf8'), 'keep')
      assert.deepEqual(await readdir(outside), ['module'])
    } finally {
      await rm(root, { recursive: true, force: true })
      await rm(outside, { recursive: true, force: true })
    }
  }
)
