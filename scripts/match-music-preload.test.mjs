/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, writeFile, readdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { matchMusicAssets, preloadMatchMusic } from '../src/main/game/match-music-preload.ts'

const bytes = Buffer.from('ID3' + 'test audio'.repeat(8))
const sha256 = createHash('sha256').update(bytes).digest('hex')
const asset = { path: `sound/16competitive/music/${sha256.slice(0, 32)}/audio.mp3`, sha256 }

test('optional music manifest accepts only exact backend content-addressed audio paths', () => {
  assert.deepEqual(matchMusicAssets([asset]), [asset])
  assert.deepEqual(matchMusicAssets(undefined), [])
  assert.deepEqual(matchMusicAssets([{ ...asset, path: asset.path.replace('.mp3', '.wav') }]), [])
  for (const value of [
    null,
    {},
    [asset, asset],
    [{ ...asset, path: '../audio.mp3' }],
    [{ ...asset, sha256: 'a'.repeat(64) }],
    [{ ...asset, path: asset.path + ';quit' }]
  ])
    assert.throws(() => matchMusicAssets(value))
})

test('early MP3 download uses regional authorization, verifies hashes and reuses only intact files', async () => {
  const dir = await mkdtemp(join(tmpdir(), '16c-match-music-'))
  const path = join(dir, 'audio.mp3')
  const original = globalThis.fetch
  let requests = 0
  let corrupt = false
  globalThis.fetch = async (url, options) => {
    requests++
    assert.equal(url.origin, 'https://regional.test')
    assert.equal(url.pathname, '/matches/match-id/assets/file')
    assert.equal(url.searchParams.get('path'), asset.path)
    assert.equal(options.headers.authorization, 'Bearer token')
    assert.equal(options.redirect, 'error')
    return new Response(corrupt ? Buffer.alloc(bytes.length) : bytes)
  }
  const run = (signal) =>
    preloadMatchMusic(
      asset,
      async () => path,
      new URL('https://regional.test'),
      'match-id',
      'token',
      signal ?? new AbortController().signal
    )
  try {
    await run()
    assert.deepEqual(await readFile(path), bytes)
    await run()
    assert.equal(requests, 1)
    await writeFile(path, 'modified')
    corrupt = true
    await assert.rejects(run(), /MUSIC_HASH_MISMATCH/)
    assert.deepEqual(await readdir(dir), ['audio.mp3'])
    const controller = new AbortController()
    controller.abort()
    await assert.rejects(run(controller.signal), { name: 'AbortError' })
    assert.equal(requests, 2)
  } finally {
    globalThis.fetch = original
    await rm(dir, { recursive: true, force: true })
  }
})
