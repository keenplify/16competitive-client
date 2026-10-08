/* eslint-disable @typescript-eslint/explicit-function-return-type */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { SourceTextModule, SyntheticModule } from 'node:vm'
import test from 'node:test'

test('helper builds reuse only successful, unchanged commits and complete outputs', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'helper-build-test-'))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  const client = join(directory, 'client')
  const helper = join(directory, '16competitive-helper')
  const script = join(client, 'scripts', 'build-game-inspector.mjs')
  mkdirSync(dirname(script), { recursive: true })
  mkdirSync(helper)
  const source = readFileSync(new URL('./build-game-inspector.mjs', import.meta.url), 'utf8')
  writeFileSync(script, source)
  const git = (...args) => {
    const result = spawnSync('git', ['-C', helper, ...args], { encoding: 'utf8' })
    assert.equal(result.status, 0, result.stderr)
  }
  git('init')
  git('config', 'user.email', 'test@example.invalid')
  git('config', 'user.name', 'Build Test')
  writeFileSync(join(helper, '.gitignore'), 'target/\n')
  writeFileSync(join(helper, 'Cargo.toml'), '# fixture\n')
  git('add', '.')
  git('commit', '-m', 'Initial helper')
  let builds = 0
  let fail = false
  const module = new SourceTextModule(source, {
    initializeImportMeta(meta) {
      meta.url = pathToFileURL(script).href
    }
  })
  await module.link(async (specifier) => {
    const exports = { ...(await import(specifier)) }
    if (specifier === 'node:child_process') {
      exports.spawnSync = (command, args, options) => {
        if (command !== 'cargo') return spawnSync(command, args, options)
        builds++
        if (fail) return { status: 1 }
        const target = args[args.indexOf('--target') + 1]
        const output = join(helper, 'target', target, 'release')
        mkdirSync(output, { recursive: true })
        writeFileSync(
          join(output, args.includes('-p') ? 'libpapamo_cosmetic_module.so' : 'game-inspector'),
          `build ${builds}`
        )
        return { status: 0 }
      }
    }
    if (specifier === 'node:path') {
      // Keep the test isolated even when the caller overrides HELPER_SOURCE_DIR.
      const resolve = exports.resolve
      exports.resolve = (...args) =>
        args.length === 1 && args[0] === process.env.HELPER_SOURCE_DIR ? helper : resolve(...args)
    }
    return new SyntheticModule(Object.keys(exports), function () {
      for (const [key, value] of Object.entries(exports)) this.setExport(key, value)
    })
  })
  await module.evaluate()
  const build = (options) => module.namespace.buildGameInspector('linux', 'x64', options)
  build()
  assert.equal(builds, 2)
  build()
  assert.equal(builds, 2, 'same commit skips Cargo')
  build({ force: true })
  assert.equal(builds, 4)
  const output = join(client, 'resources', 'native', 'linux-x64')
  rmSync(join(output, 'papamo-cosmetic-module-linux-x86.so'))
  build()
  assert.equal(builds, 6, 'missing cosmetic output rebuilds')
  writeFileSync(join(output, 'game-inspector'), 'replaced binary')
  build()
  assert.equal(builds, 8, 'replaced output rebuilds')
  writeFileSync(join(helper, 'Cargo.toml'), '# changed\n')
  build()
  build()
  assert.equal(builds, 12, 'dirty source never skips Cargo')
  git('add', '.')
  git('commit', '-m', 'Updated helper')
  build()
  build()
  assert.equal(builds, 14, 'new commit builds once')
  writeFileSync(join(helper, 'untracked.rs'), '// new source\n')
  build()
  assert.equal(builds, 16, 'untracked source invalidates cache')
  rmSync(join(helper, 'untracked.rs'))
  build()
  fail = true
  assert.throws(() => build({ force: true }), /Rust helper build failed/)
  fail = false
  build()
  assert.equal(builds, 21, 'failed forced build invalidates the previous success')
  writeFileSync(join(output, '.helper-build.json'), 'invalid JSON')
  build()
  assert.equal(builds, 23, 'corrupt stamp rebuilds')
  writeFileSync(script, `${source}\n// changed build recipe\n`)
  build()
  assert.equal(builds, 25, 'changed build script rebuilds')
})
