/* eslint-disable @typescript-eslint/explicit-function-return-type */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { upgradeRecoveryHelper } from '../src/main/game/recovery-helper-upgrade.ts'

const hash = (text) => createHash('sha256').update(text).digest('hex')

async function fixture(run) {
  const root = await mkdtemp(join(tmpdir(), '16c-recovery-upgrade-'))
  try {
    const helper = join(root, 'game-inspector.exe')
    const path = join(root, 'recovery.json')
    const descriptor = {
      helperPath: helper,
      helperSha256: hash('previous release'),
      sessionId: '5fd4a7bf-ec44-4084-9e29-87bb00f536f7'
    }
    const contents = JSON.stringify(descriptor)
    await writeFile(helper, 'current signed release')
    await writeFile(path, contents)
    await run({ root, helper, path, descriptor, contents })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

test('an in-place app update adopts the verified helper without changing recovery ownership', async () => {
  await fixture(async ({ root, helper, path, descriptor, contents }) => {
    const verified = []
    const updated = await upgradeRecoveryHelper(
      path,
      contents,
      descriptor,
      helper,
      async (binary) => {
        verified.push(binary)
      }
    )
    assert.deepEqual(verified, [helper])
    assert.equal(updated.sessionId, descriptor.sessionId)
    assert.equal(updated.helperSha256, hash('current signed release'))
    assert.deepEqual(JSON.parse(await readFile(path, 'utf8')), updated)
    assert.deepEqual((await readdir(root)).sort(), ['game-inspector.exe', 'recovery.json'])
  })
})

test('a moved installation uses the current trusted path, not the obsolete journal path', async () => {
  await fixture(async ({ helper, path, descriptor }) => {
    descriptor.helperPath = join(tmpdir(), 'missing-old-install', 'game-inspector.exe')
    const contents = JSON.stringify(descriptor)
    await writeFile(path, contents)
    const updated = await upgradeRecoveryHelper(
      path,
      contents,
      descriptor,
      helper,
      async (binary) => {
        assert.equal(binary, helper)
      }
    )
    assert.equal(updated.helperPath, helper)
    assert.equal(updated.sessionId, descriptor.sessionId)
  })
})

test('failed verification preserves the old recovery evidence', async () => {
  await fixture(async ({ helper, path, descriptor, contents }) => {
    await assert.rejects(
      upgradeRecoveryHelper(path, contents, descriptor, helper, async () => {
        throw new Error('signature rejected')
      }),
      /signature rejected/
    )
    assert.equal(await readFile(path, 'utf8'), contents)
  })
})

test('an older recovery request cannot replace a newer session descriptor', async () => {
  await fixture(async ({ helper, path, descriptor, contents }) => {
    const newer = JSON.stringify({ ...descriptor, sessionId: 'another-session' })
    await assert.rejects(
      upgradeRecoveryHelper(path, contents, descriptor, helper, async () => {
        await writeFile(path, newer)
      }),
      /session changed/
    )
    assert.equal(await readFile(path, 'utf8'), newer)
  })
})
