import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { stageMatchJoinToken } from '../src/main/game/match-join-config.ts'

test('replaces stale manual join identity while preserving other GoldSrc settings', async () => {
  const directory = await mkdtemp(join(tmpdir(), '16c-join-config-'))
  const config = join(directory, 'config.cfg')
  const token = 'a'.repeat(48)
  try {
    await writeFile(config, `name "Player"\r\nsetinfo "_16c" "m_${'b'.repeat(48)}"\r\nvolume "0.5"\r\n`)
    await stageMatchJoinToken(config, token)
    const result = await readFile(config, 'utf8')
    assert.match(result, /name "Player"\r\n/)
    assert.match(result, /volume "0\.5"\r\n/)
    assert.equal(result.match(/setinfo "_16c"/g)?.length, 1)
    assert.match(result, new RegExp(`setinfo "_16c" "${token}"`))
    assert.doesNotMatch(result, /m_[b]{48}/)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
