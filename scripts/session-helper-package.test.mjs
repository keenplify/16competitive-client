import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { stageSessionHelper } from './stage-session-helper.mjs'

test('packaging requires a real helper for the selected architecture and records its hash', async () => {
  const root = await mkdtemp(join(tmpdir(), '16c-session-package-'))
  try {
    await assert.rejects(stageSessionHelper(root, 'linux', 'x64'), /Build or stage/)
    const directory = join(root, 'resources/session-binaries')
    await mkdir(directory, { recursive: true })
    const bytes = Buffer.alloc(64)
    bytes.write('\x7fELF')
    bytes[4] = 2
    bytes.writeUInt16LE(62, 18)
    await writeFile(join(directory, 'competitive16-web-helper-linux'), bytes)
    await stageSessionHelper(root, 'linux', 'x64')
    const target = join(root, 'resources/session-helper/linux-x64')
    assert.deepEqual(await readFile(join(target, 'competitive16-web-helper')), bytes)
    assert.equal(
      JSON.parse(await readFile(join(target, 'manifest.json'), 'utf8')).sha256,
      createHash('sha256').update(bytes).digest('hex')
    )
    await writeFile(join(directory, 'competitive16-web-helper-linux-arm64'), bytes)
    await assert.rejects(stageSessionHelper(root, 'linux', 'arm64'), /architecture/)
    const arm = Buffer.from(bytes)
    arm.writeUInt16LE(183, 18)
    await writeFile(join(directory, 'competitive16-web-helper-linux-arm64'), arm)
    await stageSessionHelper(root, 'linux', 'arm64')
    const armTarget = join(root, 'resources/session-helper/linux-arm64')
    assert.deepEqual(await readFile(join(armTarget, 'competitive16-web-helper')), arm)
    assert.equal(
      JSON.parse(await readFile(join(armTarget, 'manifest.json'), 'utf8')).sha256,
      createHash('sha256').update(arm).digest('hex')
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
