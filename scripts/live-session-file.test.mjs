import assert from 'node:assert/strict'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { replaceLiveSessionFile, writeLiveSessionFile } from '../src/main/game/live-session-file.ts'

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
const fileError = (code) => Object.assign(new Error(code), { code })

test('replaces a live session file and removes its temporary file', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'live-session-file-'))
  const destination = join(directory, '16c_scoreboard.tsv')
  try {
    await writeFile(destination, 'old feed')
    await writeLiveSessionFile(destination, 'new feed')
    assert.equal(await readFile(destination, 'utf8'), 'new feed')
    assert.deepEqual(await readdir(directory), ['16c_scoreboard.tsv'])
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('retries a transient Windows file lock before replacing the file', async () => {
  let attempts = 0
  const delays = []
  await replaceLiveSessionFile(
    'pending',
    'live',
    async () => {
      attempts++
      if (attempts < 3) throw fileError('EPERM')
    },
    'win32',
    async (delay) => {
      delays.push(delay)
    }
  )
  assert.equal(attempts, 3)
  assert.deepEqual(delays, [20, 40])
})

test('does not retry permanent errors or non-Windows errors', async () => {
  for (const [platform, code] of [
    ['win32', 'ENOENT'],
    ['linux', 'EPERM']
  ]) {
    let attempts = 0
    await assert.rejects(
      replaceLiveSessionFile(
        'pending',
        'live',
        async () => {
          attempts++
          throw fileError(code)
        },
        platform,
        async () => {}
      ),
      { code }
    )
    assert.equal(attempts, 1)
  }
})

test('stops after bounded retries when a Windows file remains locked', async () => {
  let attempts = 0
  await assert.rejects(
    replaceLiveSessionFile(
      'pending',
      'live',
      async () => {
        attempts++
        throw fileError('EACCES')
      },
      'win32',
      async () => {}
    ),
    { code: 'EACCES' }
  )
  assert.equal(attempts, 6)
})
