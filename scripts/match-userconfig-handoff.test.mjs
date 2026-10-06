import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { prepareMatchUserConfigHandoff } from '../src/main/game/match-userconfig-handoff.ts'

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
async function withGameDirectory(run) {
  const directory = await mkdtemp(join(tmpdir(), '16c-userconfig-'))
  try {
    await run(directory, join(directory, 'userconfig.cfg'))
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

test('preserves an existing userconfig exactly after the match', async () => {
  await withGameDirectory(async (directory, path) => {
    const original = Buffer.from('bind "x" "+use"\r\n// player note\r\n')
    await writeFile(path, original, { mode: 0o640 })
    const handoff = await prepareMatchUserConfigHandoff(directory, '16competitive_match.cfg')
    assert.deepEqual(handoff.diagnostics, {
      userConfigExisted: true,
      staleManagedBlockFound: false,
      staleIdentityLinesRemoved: 0
    })
    const installed = await readFile(path, 'utf8')
    assert.match(installed, /exec "16competitive_match\.cfg"/)
    assert.match(installed, /bind "x" "\+use"/)
    assert.equal(await handoff.restore(), 'restored')
    assert.deepEqual(await readFile(path), original)
    assert.equal((await stat(path)).mode & 0o777, 0o640)
  })
})

test('removes a userconfig created solely for the match', async () => {
  await withGameDirectory(async (directory, path) => {
    const handoff = await prepareMatchUserConfigHandoff(directory, '16competitive_match.cfg')
    assert.match(await readFile(path, 'utf8'), /exec "16competitive_match\.cfg"/)
    assert.equal(await handoff.restore(), 'removed-created-file')
    await assert.rejects(stat(path), { code: 'ENOENT' })
  })
})

test('preserves player edits made while the game is running', async () => {
  await withGameDirectory(async (directory, path) => {
    await writeFile(path, 'bind "x" "+use"\n')
    const handoff = await prepareMatchUserConfigHandoff(directory, '16competitive_match.cfg')
    await writeFile(path, `${await readFile(path, 'utf8')}bind "y" "+reload"\n`)
    assert.equal(await handoff.restore(), 'preserved-player-edits')
    const result = await readFile(path, 'utf8')
    assert.match(result, /bind "x" "\+use"/)
    assert.match(result, /bind "y" "\+reload"/)
    assert.doesNotMatch(result, /16competitive managed match handoff/)
  })
})

test('replaces a stale handoff left by a previous launcher crash', async () => {
  await withGameDirectory(async (directory, path) => {
    await writeFile(path, 'bind "x" "+use"\n')
    await prepareMatchUserConfigHandoff(directory, 'old_match.cfg')
    const handoff = await prepareMatchUserConfigHandoff(directory, '16competitive_match.cfg')
    assert.equal(handoff.diagnostics.staleManagedBlockFound, true)
    const current = await readFile(path, 'utf8')
    assert.doesNotMatch(current, /old_match\.cfg/)
    assert.equal(current.match(/16competitive managed match handoff begin/g)?.length, 1)
    await handoff.restore()
    assert.equal(await readFile(path, 'utf8'), 'bind "x" "+use"\n')
  })
})

test('removes a stale manual token from userconfig before launch', async () => {
  await withGameDirectory(async (directory, path) => {
    await writeFile(
      path,
      'bind "x" "+use"\nsetinfo "_16c" "m_old_manual_token"\nexec "my_settings.cfg"\n'
    )
    const handoff = await prepareMatchUserConfigHandoff(directory, '16competitive_match.cfg')
    assert.equal(handoff.diagnostics.staleIdentityLinesRemoved, 1)
    const prepared = await readFile(path, 'utf8')
    assert.doesNotMatch(prepared, /m_old_manual_token/)
    assert.match(prepared, /exec "my_settings\.cfg"/)
    await handoff.restore()
    const restored = await readFile(path, 'utf8')
    assert.doesNotMatch(restored, /m_old_manual_token/)
    assert.match(restored, /bind "x" "\+use"/)
  })
})
