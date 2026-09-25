import assert from 'node:assert/strict'
import { test } from 'node:test'
import { nextHelperVersion, bumpCargoFile } from './release-helper.mjs'

test('bumps patch, resumes pending releases, and rejects stale or invalid versions', () => {
  assert.equal(nextHelperVersion('0.1.1', '0.1.1'), '0.1.2')
  assert.equal(nextHelperVersion('0.1.2', '0.1.1'), '0.1.2')
  assert.equal(nextHelperVersion('0.2.0', '0.1.9'), '0.2.0')
  assert.throws(() => nextHelperVersion('0.1.0', '0.1.1'))
  assert.throws(() => nextHelperVersion('bad', '0.1.1'))
})

test('updates only the helper package in Cargo.lock and preserves dependencies', () => {
  const lock =
    'version = 4\n\n[[package]]\nname = "dependency"\nversion = "0.1.1"\n\n[[package]]\nname = "game-inspector"\nversion = "0.1.1"\ndependencies = ["dependency"]\n'
  const result = bumpCargoFile(
    lock,
    /\[\[package\]\][\s\S]*?(?=\n\[\[package\]\]|$)/g,
    'game-inspector',
    '0.1.2'
  )
  assert.equal(
    result,
    lock.replace(
      'name = "game-inspector"\nversion = "0.1.1"',
      'name = "game-inspector"\nversion = "0.1.2"'
    )
  )
  assert.throws(() => bumpCargoFile('', /\[package\][\s\S]*/g, 'game-inspector', '0.1.2'))
})
