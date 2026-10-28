/* eslint-disable @typescript-eslint/explicit-function-return-type */
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { test } from 'node:test'

const root = new URL('../', import.meta.url)

async function inputs() {
  const vite = await readFile(new URL('vite.webapp.config.ts', root), 'utf8')
  const rust = await readFile(new URL('web-helper/src/main.rs', root), 'utf8')
  const web = [
    ...vite
      .split('for (const source of [')[1]
      .split('])')[0]
      .matchAll(/'([^']+)'/g)
  ].map((match) => match[1])
  const native = [
    ...rust
      .split('fn helper_fingerprint()')[1]
      .split('fn user_config_dir()')[0]
      .matchAll(/include_bytes!\("([^"]+)"\)/g)
  ].map((match) => new URL(match[1], new URL('web-helper/src/', root)).href)
  return { web, native }
}

test('web and native helper fingerprint exactly the same ordered sources', async () => {
  const { web, native } = await inputs()
  assert.deepEqual(
    web.map((path) => new URL(path, root).href),
    native
  )
  assert.ok(web.includes('helper-release.json'), 'native runtime release remains pinned')
  assert.ok(web.includes('src/shared/web-game-launch-pattern.json'))
  assert.ok(!web.includes('package.json'), 'launcher metadata cannot invalidate a reused helper')
})

test('launcher-only version and script changes preserve helper compatibility', async () => {
  const { web } = await inputs()
  const files = new Map(
    await Promise.all(web.map(async (path) => [path, await readFile(new URL(path, root))]))
  )
  files.set('package.json', Buffer.from('{"version":"2026.1028.9"}'))
  const fingerprint = () => {
    const hash = createHash('sha256')
    for (const path of web) hash.update(files.get(path))
    return hash.digest('hex')
  }
  const before = fingerprint()
  files.set(
    'package.json',
    Buffer.from('{"version":"2026.1028.11","scripts":{"test:web":"updated"}}')
  )
  assert.equal(fingerprint(), before)
  files.set('helper-release.json', Buffer.from('{"version":"new-runtime"}'))
  assert.notEqual(fingerprint(), before, 'runtime updates still invalidate old helpers')
})
