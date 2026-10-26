/* eslint-disable @typescript-eslint/explicit-function-return-type */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { webHelperReleaseChanges } from './web-helper-release.mjs'

test('web helper release rebuilds for Rust, launch contracts, or native release changes', async () => {
  const root = await mkdtemp(join(tmpdir(), '16c-web-helper-release-'))
  const git = (...args) => execFileSync('git', args, { cwd: root, stdio: 'ignore' })
  const commit = (message) =>
    git('-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-m', message)
  try {
    git('init')
    await mkdir(join(root, 'web-helper'))
    await mkdir(join(root, 'src/shared'), { recursive: true })
    await writeFile(join(root, 'web-helper/main.rs'), 'one')
    await writeFile(join(root, 'src/shared/web-game-launch-pattern.json'), '{}')
    git('add', '.')
    commit('baseline')
    git('tag', 'v1.0.0')
    await writeFile(join(root, 'other.txt'), 'unrelated')
    git('add', '.')
    commit('other')
    assert.deepEqual(webHelperReleaseChanges(root), { changed: false, previousTag: 'v1.0.0' })
    await writeFile(join(root, 'src/shared/web-game-launch-pattern.json'), '{"schema":1}')
    git('add', '.')
    commit('launch pattern')
    assert.deepEqual(webHelperReleaseChanges(root), { changed: true, previousTag: 'v1.0.0' })
    git('tag', 'v1.0.1')
    await writeFile(join(root, 'web-helper/main.rs'), 'two')
    git('add', '.')
    commit('rust helper')
    assert.deepEqual(webHelperReleaseChanges(root), { changed: true, previousTag: 'v1.0.1' })
    git('tag', 'v1.0.2')
    await writeFile(join(root, 'helper-release.json'), '{"version":"0.1.76"}')
    git('add', '.')
    commit('native release')
    assert.deepEqual(webHelperReleaseChanges(root), { changed: true, previousTag: 'v1.0.2' })
    git('tag', 'v1.0.3')
    await writeFile(join(root, 'src/shared/windows-client-exports.json'), '[]')
    git('add', '.')
    commit('shared client exports')
    assert.deepEqual(webHelperReleaseChanges(root), { changed: true, previousTag: 'v1.0.3' })
    git('tag', 'v1.0.4')
    await writeFile(join(root, 'src/shared/windows-goldclient-exports.json'), '{}')
    git('add', '.')
    commit('GoldClient contract')
    assert.deepEqual(webHelperReleaseChanges(root), { changed: true, previousTag: 'v1.0.4' })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
