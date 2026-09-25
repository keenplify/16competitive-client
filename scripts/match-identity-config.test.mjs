import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { prepareMatchIdentityConfig } from '../src/main/game/match-identity-config.ts'

test('startup replay uses fresh identity and cleanup preserves changed settings', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'match-identity-test-'))
  const path = join(directory, 'config.cfg')
  const token = 'a'.repeat(32)
  try {
    await writeFile(path, 'sensitivity "2"\nsetinfo "_16c" "m_old_manual_token"\n')
    const restore = await prepareMatchIdentityConfig(path, token)
    assert.ok((await readFile(path, 'utf8')).includes(`setinfo "_16c" "${token}"`))
    assert.ok(!(await readFile(path, 'utf8')).includes('m_old_manual_token'))
    await writeFile(
      path,
      (await readFile(path, 'utf8')).replace('sensitivity "2"', 'sensitivity "3"')
    )
    await restore()
    const result = await readFile(path, 'utf8')
    assert.ok(result.includes('m_old_manual_token'))
    assert.ok(result.includes('sensitivity "3"'))
    assert.ok(!result.includes(token))
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('old cleanup cannot replace a newer connection identity', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'match-identity-test-'))
  const path = join(directory, 'config.cfg')
  try {
    await writeFile(path, 'sensitivity "2"\n')
    const restore = await prepareMatchIdentityConfig(path, 'a'.repeat(32))
    await writeFile(path, `setinfo "_16c" "${'b'.repeat(32)}"\n`)
    await restore()
    assert.ok((await readFile(path, 'utf8')).includes('b'.repeat(32)))
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
