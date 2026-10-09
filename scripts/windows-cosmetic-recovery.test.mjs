/* eslint-disable @typescript-eslint/explicit-function-return-type -- JavaScript test helpers. */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { recoverWindowsCosmeticInstallation } from '../src/main/game/windows-cosmetic-recovery.ts'

const hash = (text) => createHash('sha256').update(text).digest('hex')
async function fixture(t, current, backup = 'original', ownsBackup = true) {
  const root = await mkdtemp(join(tmpdir(), 'cosmetic-recovery-test-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  await mkdir(join(root, 'cstrike/cl_dlls'), { recursive: true })
  await mkdir(join(root, '16competitive'))
  await writeFile(join(root, 'cstrike/cl_dlls/client.dll'), current)
  if (backup !== null) await writeFile(join(root, 'client_original.dll'), backup)
  await writeFile(
    join(root, '16competitive/cosmetic-install.json'),
    JSON.stringify({
      originalSha256: hash('original'),
      moduleSha256: hash('proxy'),
      ownsBackup
    })
  )
  return root
}
for (const backup of ['original', 'changed backup', null]) {
  test(`changed client launches without replacement, with backup ${backup}`, async (t) => {
    const root = await fixture(t, 'another legitimate build', backup)
    await recoverWindowsCosmeticInstallation(root)
    assert.equal(
      await readFile(join(root, 'cstrike/cl_dlls/client.dll'), 'utf8'),
      'another legitimate build'
    )
    const [archive] = await readdir(join(root, '16competitive'))
    assert.match(archive, /^cosmetic-recovery-/)
    assert.ok(await readFile(join(root, '16competitive', archive, 'cosmetic-install.json')))
    if (backup !== null)
      assert.equal(
        await readFile(join(root, '16competitive', archive, 'client_original.dll'), 'utf8'),
        backup
      )
    await recoverWindowsCosmeticInstallation(root)
  })
}
test('restores our proxy from its verified original', async (t) => {
  const root = await fixture(t, 'proxy')
  await recoverWindowsCosmeticInstallation(root)
  assert.equal(await readFile(join(root, 'cstrike/cl_dlls/client.dll'), 'utf8'), 'original')
  assert.deepEqual(await readdir(join(root, '16competitive')), [])
})
test('does not copy an unrelated backup over an installed proxy', async (t) => {
  const root = await fixture(t, 'proxy', 'unrelated')
  await assert.rejects(recoverWindowsCosmeticInstallation(root), /backup is unavailable or changed/)
  assert.equal(await readFile(join(root, 'cstrike/cl_dlls/client.dll'), 'utf8'), 'proxy')
})
test('already restored client does not require a missing backup', async (t) => {
  const root = await fixture(t, 'original', null)
  await recoverWindowsCosmeticInstallation(root)
  assert.deepEqual(await readdir(join(root, '16competitive')), [])
})
test('leaves an unowned backup in place', async (t) => {
  const root = await fixture(t, 'updated', 'unowned', false)
  await recoverWindowsCosmeticInstallation(root)
  assert.equal(await readFile(join(root, 'client_original.dll'), 'utf8'), 'unowned')
})
